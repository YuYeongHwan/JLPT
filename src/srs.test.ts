import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Rating, State } from 'ts-fsrs'
import { db, setSetting, setTriage, syncVocab, type VocabEntry } from './db'
import { buildSession, dayStart, examInfo, nextDayStart, rate, schedule, SESSION_MAX, todayCounts } from './srs'

const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m) // 2026-10-{day} 로컬
const vocab = (n: number): VocabEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    word: `語${i}`, reading: `ご${i}`, meaning_ko: '', example_ja: `語${i}です。`, example_ko: '',
  }))
const good = (id: string, now: Date) => db.cards.get(id).then((c) => rate(c!, schedule(c!, now)[Rating.Good], now))

beforeEach(async () => {
  // 카드 생성 시각(syncVocab의 new Date())을 테스트 시점들보다 앞으로 고정. 실제 날짜와 무관하게
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 1))
  await Promise.all(db.tables.map((t) => t.clear()))
})
afterEach(() => {
  vi.useRealTimers()
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

test('신규 카드: reading 먼저, context는 reading Good 이상 후에만', async () => {
  await syncVocab(vocab(2))
  const now = at(10, 10)
  expect((await buildSession(now)).map((c) => c.id)).toEqual(['語0|ご0:reading', '語1|ご1:reading'])

  // Again만으로는 context 안 열림
  const r0 = (await db.cards.get('語0|ご0:reading'))!
  await rate(r0, schedule(r0, now)[Rating.Again], now)
  const next = at(11, 10)
  expect((await buildSession(next)).some((c) => c.id === '語0|ご0:context')).toBe(false)

  // Good 이상 후 (형제 분리로 다음 학습일부터) 신규 대상. Easy로 학습 단계를 건너뛰어 reading이 그날 due가 아니게
  const r1 = (await db.cards.get('語1|ご1:reading'))!
  await rate(r1, schedule(r1, next)[Rating.Easy], next)
  expect((await buildSession(at(12, 10))).some((c) => c.id === '語1|ご1:context')).toBe(true)
})

test('신규 순서: 모른다 → 미분류 → 그 외', async () => {
  await syncVocab(vocab(4))
  await setTriage('語3|ご3', 'unknown')
  await setTriage('語1|ご1', 'known')
  expect((await buildSession(at(10, 10))).map((c) => c.wordId)).toEqual(['語3|ご3', '語0|ご0', '語2|ご2'])
})

test('시험일: D-day, 권장 신규 수, 2주 전 신규 중단·해제', async () => {
  await syncVocab(vocab(30))
  await setSetting('examDate', '2026-12-06')
  // 10/31 → 36일 남음, 신규 reading 30장 / (36 - 14) = 1.36 → 2
  expect(await examInfo(at(31, 10))).toEqual({ days: 36, recommended: 2, frozen: false })
  expect(await examInfo(new Date(2026, 10, 1, 10))).toEqual({ days: 35, recommended: 2, frozen: false })
  // 새벽 4시 전은 전날 학습일
  expect((await examInfo(new Date(2026, 10, 22, 3))).days).toBe(15)

  const twoWeeks = new Date(2026, 10, 22, 10) // D-14
  expect(await examInfo(twoWeeks)).toEqual({ days: 14, recommended: 0, frozen: true })
  expect((await todayCounts(twoWeeks)).newLeft).toBe(0)

  await setSetting('freezeOff', true)
  expect((await examInfo(twoWeeks)).frozen).toBe(false)
  expect((await todayCounts(twoWeeks)).newLeft).toBe(20)

  // 시험 후엔 중단 없음
  await setSetting('freezeOff', false)
  expect((await examInfo(new Date(2026, 11, 7, 10))).frozen).toBe(false)
})
