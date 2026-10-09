import 'fake-indexeddb/auto'
import { beforeEach, expect, test } from 'vitest'
import { db, exportBackup, flaggedEntries, importBackup, knownWords, restoreKnown, setTriage, syncVocab, toggleFlag, triageCandidates } from './db'

const entry = { word: '語', reading: 'ご', meaning_ko: '말', example_ja: '語です。', example_ko: '', pos: '명사' as const }

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await syncVocab([entry])
})

test('플래그: 토글, 내보내기 형식, 백업 왕복', async () => {
  await toggleFlag('語|ご')
  expect(await flaggedEntries()).toEqual([entry])
  const backup = await exportBackup()
  await toggleFlag('語|ご')
  expect(await db.flags.count()).toBe(0)
  await importBackup(backup)
  expect((await db.flags.get('語|ご'))?.at).toBeInstanceOf(Date)
})

test('백업 버전: v2는 flags 없이 마이그레이션, v1은 거부', async () => {
  await toggleFlag('語|ご')
  const v2 = JSON.parse(await exportBackup())
  v2.schemaVersion = 2
  delete v2.flags
  await importBackup(JSON.stringify(v2))
  expect(await db.flags.count()).toBe(0)
  expect(await db.cards.count()).toBe(2)

  await expect(importBackup(JSON.stringify({ version: 1, cards: [], logs: [], meta: [] }))).rejects.toThrow('호환되지 않는')
})

test('분류: known은 두 카드 suspended, 재동기화 후에도 유지, 복구 가능', async () => {
  const other = { ...entry, word: '他', reading: 'た', example_ja: '他です。' }
  await syncVocab([entry, other])
  expect((await triageCandidates()).map((w) => w.id)).toEqual(['語|ご', '他|た'])

  await setTriage('語|ご', 'known')
  await setTriage('他|た', 'unknown')
  expect(await triageCandidates()).toEqual([])
  expect((await db.cards.where('wordId').equals('語|ご').toArray()).every((c) => c.suspended)).toBe(true)

  await syncVocab([entry, other])
  expect((await db.cards.where('wordId').equals('語|ご').toArray()).every((c) => c.suspended)).toBe(true)
  expect((await knownWords()).map((w) => w.id)).toEqual(['語|ご'])

  await restoreKnown('語|ご')
  expect((await db.cards.where('wordId').equals('語|ご').toArray()).some((c) => c.suspended)).toBe(false)
  expect((await triageCandidates()).map((w) => w.id)).toEqual(['語|ご'])
})

test('백업 v3 → v4: triage 빈 값으로 마이그레이션', async () => {
  await setTriage('語|ご', 'unknown')
  const v3 = JSON.parse(await exportBackup())
  v3.schemaVersion = 3
  delete v3.triage
  await importBackup(JSON.stringify(v3))
  expect(await db.triage.count()).toBe(0)
})
