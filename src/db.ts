import Dexie, { type EntityTable } from 'dexie'
import { createEmptyCard, State, type Card, type ReviewLog } from 'ts-fsrs'

// public/data/n1_vocab.json 한 항목
export interface VocabEntry {
  word: string
  reading: string
  meaning_ko: string
  example_ja: string
  example_ko: string
  example_target?: string // 예문 속 활용형 (예: 潔く). 없으면 word로 매칭
  pos?: '명사' | '동사' | 'い형용사' | 'な형용사' | '부사' | '기타'
}
export interface Word extends VocabEntry {
  id: string // `${word}|${reading}`. JSON 순서가 바뀌어도 고정
  order: number // JSON 내 순서 = 신규 카드 출제 순서
}

// 문맥 카드 빈칸에 들어갈 예문 속 문자열. 매칭 실패면 null → 문맥 카드 없음
export function blankTarget(w: VocabEntry): string | null {
  return [w.example_target, w.word].find((t) => t && w.example_ja.includes(t)) ?? null
}
export type CardType = 'reading' | 'context'
export interface StoredCard extends Card {
  id: string // `${wordId}:${type}`
  wordId: string
  type: CardType
  suspended?: boolean // JSON에서 사라진 단어 등. 기록은 보존, 출제만 제외
}
export interface StoredLog extends ReviewLog {
  id?: number
  cardId: string
}
export interface Meta {
  key: string
  value: unknown
}
// 복습 중 '이상함' 표시한 단어 (데이터 일괄 수정용)
export interface Flag {
  wordId: string
  at: Date
}

// 단어 분류 결과. known이면 카드 전부 suspended
export interface Triage {
  wordId: string
  value: 'known' | 'unknown'
  at: Date
}

// Dexie 버전 = 백업 schemaVersion. 올릴 때 importBackup에 이전 버전 마이그레이션 추가
export const SCHEMA_VERSION = 4

export const db = new Dexie('jlpt-n1') as Dexie & {
  words: EntityTable<Word, 'id'>
  cards: EntityTable<StoredCard, 'id'>
  logs: EntityTable<StoredLog, 'id'>
  meta: EntityTable<Meta, 'key'>
  flags: EntityTable<Flag, 'wordId'>
  triage: EntityTable<Triage, 'wordId'>
}
db.version(2)
  .stores({
    words: 'id',
    cards: 'id, wordId, due, state',
    logs: '++id, cardId, review',
    meta: 'key',
  })
  // v1은 순번 id라 호환 불가 → 전부 비움
  .upgrade((tx) => Promise.all(['words', 'cards', 'logs', 'meta'].map((t) => tx.table(t).clear())))
db.version(3).stores({ flags: 'wordId' })
db.version(4).stores({ triage: 'wordId, value' })

export const wordId = (w: VocabEntry) => `${w.word}|${w.reading}`

export const toggleFlag = async (id: string) =>
  (await db.flags.get(id)) ? db.flags.delete(id) : db.flags.put({ wordId: id, at: new Date() })

// 분류 대상: 아직 분류 안 했고, 카드가 전부 신규(한 번도 복습 안 함)인 단어. JSON 순서대로
export async function triageCandidates(): Promise<Word[]> {
  const triaged = new Set(await db.triage.toCollection().primaryKeys())
  const touched = new Set((await db.cards.filter((c) => c.state !== State.New || !!c.suspended).toArray()).map((c) => c.wordId))
  return (await db.words.toArray())
    .filter((w) => !triaged.has(w.id) && !touched.has(w.id))
    .sort((a, b) => a.order - b.order)
}

export const setTriage = (id: string, value: Triage['value']) =>
  db.transaction('rw', db.triage, db.cards, async () => {
    await db.triage.put({ wordId: id, value, at: new Date() })
    if (value === 'known') await db.cards.where('wordId').equals(id).modify({ suspended: true })
  })

// known 복구. ponytail: JSON에서 빠진 단어도 일단 풀림 → 다음 실행의 syncVocab이 다시 suspended 처리
export const restoreKnown = (id: string) =>
  db.transaction('rw', db.triage, db.cards, async () => {
    await db.triage.delete(id)
    await db.cards.where('wordId').equals(id).modify({ suspended: false })
  })

export async function knownWords(): Promise<Word[]> {
  const ids = await db.triage.where('value').equals('known').primaryKeys()
  return (await db.words.bulkGet(ids)).filter((w) => w !== undefined)
}

// 플래그된 단어를 n1_vocab.json 형식 그대로 (id/order 제외)
export async function flaggedEntries(): Promise<VocabEntry[]> {
  const flags = await db.flags.orderBy('wordId').toArray()
  const words = await db.words.bulkGet(flags.map((f) => f.wordId))
  return words.filter((w) => w !== undefined).map(({ id: _id, order: _order, ...entry }) => entry)
}

// 매 실행마다 JSON → Dexie 동기화. 전체 데이터로 바꿀 땐 public/data/n1_vocab.json 만 교체.
// 단어는 덮어쓰고, 카드는 없는 것만 추가, JSON에서 빠졌거나 known 분류된 카드는 suspended (진행도 보존).
export async function syncVocab(entries?: VocabEntry[]) {
  entries ??= await (await fetch('/data/n1_vocab.json')).json()
  const words: Word[] = entries!.map((e, order) => ({ ...e, id: wordId(e), order }))
  const unmatched = words.filter((w) => !blankTarget(w)).map((w) => w.word)
  if (unmatched.length) console.warn('예문에서 빈칸 매칭 실패 → 문맥 카드 생략:', unmatched)

  const expected = new Set(
    words.flatMap((w) => (blankTarget(w) ? ['reading', 'context'] : ['reading']).map((t) => `${w.id}:${t}`)),
  )
  await db.transaction('rw', db.words, db.cards, db.triage, async () => {
    await db.words.bulkPut(words)
    const known = new Set(await db.triage.where('value').equals('known').primaryKeys())
    const off = (id: string, wid: string) => !expected.has(id) || known.has(wid)
    const existing = await db.cards.toArray()
    const have = new Set(existing.map((c) => c.id))
    const toggled = existing
      .filter((c) => !!c.suspended !== off(c.id, c.wordId))
      .map((c) => ({ ...c, suspended: off(c.id, c.wordId) }))
    const now = new Date()
    const fresh = [...expected]
      .filter((id) => !have.has(id))
      .map((id) => {
        const [wid, type] = id.split(':') as [string, CardType]
        return { ...createEmptyCard(now), id, wordId: wid, type, suspended: known.has(wid) }
      })
    await db.cards.bulkPut([...toggled, ...fresh])
  })
  if (!(await db.meta.get('installedAt'))) await setSetting('installedAt', new Date())
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  return ((await db.meta.get(key))?.value as T) ?? fallback
}
export const setSetting = (key: string, value: unknown) => db.meta.put({ key, value })

// 마지막 백업(없으면 설치 시각)부터 7일 이상 지났나
export async function backupStale(now = new Date()) {
  const since = (await getSetting<Date | null>('lastBackup', null)) ?? (await getSetting<Date | null>('installedAt', null))
  return !!since && +now - +since >= 7 * 86_400_000
}

// 백업: 학습 상태(cards, logs, meta, flags, triage)만. 단어는 JSON 파일이 원본.
export async function exportBackup() {
  await setSetting('lastBackup', new Date())
  return JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    cards: await db.cards.toArray(),
    logs: await db.logs.toArray(),
    meta: await db.meta.toArray(),
    flags: await db.flags.toArray(),
    triage: await db.triage.toArray(),
  })
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
export async function importBackup(text: string) {
  const data = JSON.parse(text, (_, v) => (typeof v === 'string' && ISO.test(v) ? new Date(v) : v))
  // 이전 버전은 추가된 테이블만 빈 값으로 채워 순서대로 올림
  if (data?.schemaVersion === 2) Object.assign(data, { schemaVersion: 3, flags: [] })
  if (data?.schemaVersion === 3) Object.assign(data, { schemaVersion: 4, triage: [] })
  if (data?.schemaVersion !== SCHEMA_VERSION) throw new Error('호환되지 않는 백업입니다')
  if (![data.cards, data.logs, data.meta, data.flags, data.triage].every(Array.isArray)) throw new Error('올바른 백업 파일이 아닙니다')
  await db.transaction('rw', [db.cards, db.logs, db.meta, db.flags, db.triage], async () => {
    await Promise.all([db.cards.clear(), db.logs.clear(), db.meta.clear(), db.flags.clear(), db.triage.clear()])
    await db.cards.bulkPut(data.cards)
    await db.logs.bulkPut(data.logs)
    await db.meta.bulkPut(data.meta)
    await db.flags.bulkPut(data.flags)
    await db.triage.bulkPut(data.triage)
  })
}
