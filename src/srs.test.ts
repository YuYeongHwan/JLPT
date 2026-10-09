import 'fake-indexeddb/auto'
import { beforeEach, expect, test } from 'vitest'
import { Rating, State } from 'ts-fsrs'
import { db, setSetting, syncVocab, type VocabEntry } from './db'
import { buildSession, dayStart, nextDayStart, rate, schedule, SESSION_MAX, todayCounts } from './srs'

const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m) // 2026-10-{day} 로컬
const vocab = (n: number): VocabEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    word: `語${i}`, reading: `ご${i}`, meaning_ko: '', example_ja: `語${i}です。`, example_ko: '', kanji: [],
  }))
const good = (id: string, now: Date) => db.cards.get(id).then((c) => rate(c!, schedule(c!, now)[Rating.Good], now))

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

test('세션: 복습 카드가 due 순으로 먼저, 최대 15장', async () => {
  await syncVocab(vocab(30))
  for (const [i, h] of [[3, 9], [1, 7], [2, 8]])
    await db.cards.update(`語${i}|ご${i}:reading`, { state: State.Review, due: at(9, h) })

  const s = await buildSession(at(10, 10))
  expect(s).toHaveLength(SESSION_MAX)
  expect(s.slice(0, 3).map((c) => c.wordId)).toEqual(['語1|ご1', '語2|ご2', '語3|ご3'])
  expect(s.slice(3).every((c) => c.state === State.New)).toBe(true)
})

test('신규 한도: 하루 한도 - 오늘 학습한 신규 수', async () => {
  await syncVocab(vocab(30))
  await setSetting('newPerDay', 5)
  const now = at(10, 10)
  expect(await todayCounts(now)).toEqual({ due: 0, newLeft: 5 })
  await good('語0|ご0:reading', now)
  await good('語1|ご1:reading', now)
  expect((await todayCounts(now)).newLeft).toBe(3)
  expect((await buildSession(now)).filter((c) => c.state === State.New)).toHaveLength(3)
})

test('새벽 4시 경계', async () => {
  expect(dayStart(at(10, 3, 59))).toEqual(at(9, 4))
  expect(dayStart(at(10, 4))).toEqual(at(10, 4))
  expect(nextDayStart(at(10, 23))).toEqual(at(11, 4))

  await syncVocab(vocab(30))
  await setSetting('newPerDay', 1)
  await good('語0|ご0:reading', at(10, 3)) // 03:00 = 9일 학습일
  expect((await todayCounts(at(10, 3, 30))).newLeft).toBe(0)
  expect((await todayCounts(at(10, 4))).newLeft).toBe(1)

  // 다음 경계(11일 04:00) 전에 due면 오늘 복습
  const has5 = async () => (await buildSession(at(10, 5))).some((c) => c.id === '語5|ご5:reading')
  await db.cards.update('語5|ご5:reading', { state: State.Review, due: at(11, 3, 59) })
  expect(await has5()).toBe(true)
  await db.cards.update('語5|ご5:reading', { due: at(11, 4) })
  expect(await has5()).toBe(false)
})

test('형제 카드: 같은 학습일엔 단어당 1장, 평가하면 형제는 다음 학습일로', async () => {
  await syncVocab(vocab(3))
  const now = at(10, 10)
  const ids = (await buildSession(now)).map((c) => c.id)
  expect(ids).toEqual(['語0|ご0:reading', '語1|ご1:reading', '語2|ご2:reading'])

  // 둘 다 복습 due여도 1장만
  await db.cards.where('wordId').equals('語0|ご0').modify({ state: State.Review, due: at(9, 10) })
  expect((await buildSession(now)).filter((c) => c.wordId === '語0|ご0')).toHaveLength(1)

  await good('語0|ご0:reading', now)
  expect((await db.cards.get('語0|ご0:context'))!.due).toEqual(at(11, 4))
  expect((await buildSession(now)).some((c) => c.wordId === '語0|ご0')).toBe(false)
  expect((await buildSession(at(11, 4))).some((c) => c.id === '語0|ご0:context')).toBe(true)
})

test('sync: 빠진 단어 suspended, 빈칸 매칭 실패면 문맥 카드 없음', async () => {
  const v = vocab(3)
  await syncVocab(v)
  await syncVocab([v[0], { ...v[1], example_ja: '활용형뿐。', example_target: '없음' }])
  expect((await db.cards.get('語2|ご2:reading'))!.suspended).toBe(true)
  expect((await db.cards.get('語0|ご0:reading'))!.suspended).toBeFalsy()
  expect((await db.cards.get('語1|ご1:context'))!.suspended).toBe(true)
  expect((await buildSession(new Date())).map((c) => c.wordId)).toEqual(['語0|ご0', '語1|ご1'])
})
