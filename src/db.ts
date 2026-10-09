import Dexie, { type EntityTable } from 'dexie'
import { createEmptyCard, type Card, type ReviewLog } from 'ts-fsrs'

export interface Word {
  id: number
  word: string
  reading: string
  meaning_ko: string
  example_ja: string
  example_ko: string
  kanji: string[]
}
export type CardType = 'reading' | 'context'
export interface StoredCard extends Card {
  id: string // `${wordId}:${type}`
  wordId: number
  type: CardType
}
export interface StoredLog extends ReviewLog {
  id?: number
  cardId: string
}
export interface Meta {
  key: string
  value: unknown
}

export const db = new Dexie('jlpt-n1') as Dexie & {
  words: EntityTable<Word, 'id'>
  cards: EntityTable<StoredCard, 'id'>
  logs: EntityTable<StoredLog, 'id'>
  meta: EntityTable<Meta, 'key'>
}
db.version(1).stores({
  words: 'id',
  cards: 'id, wordId, due, state',
  logs: '++id, cardId, review',
  meta: 'key',
})

// 매 실행마다 JSON → Dexie 동기화. 단어는 덮어쓰고, 카드는 없는 것만 추가(진행도 보존).
// 전체 데이터로 바꿀 땐 public/data/n1_vocab.json 만 교체하면 됨.
export async function syncVocab() {
  const words: Word[] = await (await fetch('/data/n1_vocab.json')).json()
  await db.transaction('rw', db.words, db.cards, async () => {
    await db.words.bulkPut(words)
    const existing = new Set(await db.cards.toCollection().primaryKeys())
    const now = new Date()
    const fresh = words.flatMap((w) =>
      (['reading', 'context'] as const)
        .filter((type) => !existing.has(`${w.id}:${type}`))
        .map((type) => ({ ...createEmptyCard(now), id: `${w.id}:${type}`, wordId: w.id, type })),
    )
    await db.cards.bulkAdd(fresh)
  })
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  return ((await db.meta.get(key))?.value as T) ?? fallback
}
export const setSetting = (key: string, value: unknown) => db.meta.put({ key, value })

// 백업: 학습 상태(cards, logs, meta)만. 단어는 JSON 파일이 원본.
export async function exportBackup() {
  return JSON.stringify({
    version: 1,
    cards: await db.cards.toArray(),
    logs: await db.logs.toArray(),
    meta: await db.meta.toArray(),
  })
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
export async function importBackup(text: string) {
  const data = JSON.parse(text, (_, v) => (typeof v === 'string' && ISO.test(v) ? new Date(v) : v))
  if (data?.version !== 1 || !Array.isArray(data.cards) || !Array.isArray(data.logs) || !Array.isArray(data.meta))
    throw new Error('올바른 백업 파일이 아닙니다')
  await db.transaction('rw', db.cards, db.logs, db.meta, async () => {
    await Promise.all([db.cards.clear(), db.logs.clear(), db.meta.clear()])
    await db.cards.bulkPut(data.cards)
    await db.logs.bulkPut(data.logs)
    await db.meta.bulkPut(data.meta)
  })
}
