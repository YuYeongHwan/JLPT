import Dexie, { type EntityTable } from 'dexie'
import { createEmptyCard, type Card, type ReviewLog } from 'ts-fsrs'

// public/data/n1_vocab.json 한 항목
export interface VocabEntry {
  word: string
  reading: string
  meaning_ko: string
  example_ja: string
  example_ko: string
  example_target?: string // 예문 속 활용형 (예: 潔く). 없으면 word로 매칭
  kanji: string[]
}
export interface Word extends VocabEntry {
  id: string // `${word}|${reading}` — JSON 순서가 바뀌어도 고정
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

export const SCHEMA_VERSION = 2 // 올리면 기존 로컬 데이터 초기화 + 이전 백업 거부

export const db = new Dexie('jlpt-n1') as Dexie & {
  words: EntityTable<Word, 'id'>
  cards: EntityTable<StoredCard, 'id'>
  logs: EntityTable<StoredLog, 'id'>
  meta: EntityTable<Meta, 'key'>
}
db.version(SCHEMA_VERSION)
  .stores({
    words: 'id',
    cards: 'id, wordId, due, state',
    logs: '++id, cardId, review',
    meta: 'key',
  })
  // v1은 순번 id라 호환 불가 → 전부 비움
  .upgrade((tx) => Promise.all(['words', 'cards', 'logs', 'meta'].map((t) => tx.table(t).clear())))

export const wordId = (w: VocabEntry) => `${w.word}|${w.reading}`

// 매 실행마다 JSON → Dexie 동기화. 전체 데이터로 바꿀 땐 public/data/n1_vocab.json 만 교체.
// 단어는 덮어쓰고, 카드는 없는 것만 추가, JSON에서 빠진 카드는 suspended (진행도 보존).
export async function syncVocab(entries?: VocabEntry[]) {
  entries ??= await (await fetch('/data/n1_vocab.json')).json()
  const words: Word[] = entries!.map((e, order) => ({ ...e, id: wordId(e), order }))
  const unmatched = words.filter((w) => !blankTarget(w)).map((w) => w.word)
  if (unmatched.length) console.warn('예문에서 빈칸 매칭 실패 → 문맥 카드 생략:', unmatched)

  const expected = new Set(
    words.flatMap((w) => (blankTarget(w) ? ['reading', 'context'] : ['reading']).map((t) => `${w.id}:${t}`)),
  )
  await db.transaction('rw', db.words, db.cards, async () => {
    await db.words.bulkPut(words)
    const existing = await db.cards.toArray()
    const have = new Set(existing.map((c) => c.id))
    const toggled = existing
      .filter((c) => !!c.suspended === expected.has(c.id))
      .map((c) => ({ ...c, suspended: !expected.has(c.id) }))
    const now = new Date()
    const fresh = [...expected]
      .filter((id) => !have.has(id))
      .map((id) => {
        const [wid, type] = id.split(':') as [string, CardType]
        return { ...createEmptyCard(now), id, wordId: wid, type }
      })
    await db.cards.bulkPut([...toggled, ...fresh])
  })
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  return ((await db.meta.get(key))?.value as T) ?? fallback
}
export const setSetting = (key: string, value: unknown) => db.meta.put({ key, value })

// 백업: 학습 상태(cards, logs, meta)만. 단어는 JSON 파일이 원본.
export async function exportBackup() {
  return JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    cards: await db.cards.toArray(),
    logs: await db.logs.toArray(),
    meta: await db.meta.toArray(),
  })
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
export async function importBackup(text: string) {
  const data = JSON.parse(text, (_, v) => (typeof v === 'string' && ISO.test(v) ? new Date(v) : v))
  if (data?.schemaVersion !== SCHEMA_VERSION) throw new Error('호환되지 않는 백업입니다')
  if (!Array.isArray(data.cards) || !Array.isArray(data.logs) || !Array.isArray(data.meta))
    throw new Error('올바른 백업 파일이 아닙니다')
  await db.transaction('rw', db.cards, db.logs, db.meta, async () => {
    await Promise.all([db.cards.clear(), db.logs.clear(), db.meta.clear()])
    await db.cards.bulkPut(data.cards)
    await db.logs.bulkPut(data.logs)
    await db.meta.bulkPut(data.meta)
  })
}
