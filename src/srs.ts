import { fsrs, State, type Grade } from 'ts-fsrs'
import { db, getSetting, type StoredCard } from './db'

const f = fsrs({ enable_fuzz: true })
export const SESSION_MAX = 15
export const DEFAULT_NEW_PER_DAY = 20

// 학습일 경계 = 로컬 새벽 4시. 03:59까지는 전날 학습일
export const DAY_START_HOUR = 4
export const dayStart = (now: Date) => {
  const d = new Date(now)
  if (d.getHours() < DAY_START_HOUR) d.setDate(d.getDate() - 1)
  d.setHours(DAY_START_HOUR, 0, 0, 0)
  return d
}
export const nextDayStart = (now: Date) => {
  const d = dayStart(now)
  d.setDate(d.getDate() + 1)
  return d
}

// 오늘 출제할 카드. 같은 단어(형제)는 1장만, 복습 우선.
// ponytail: 매번 카드 전체 스캔. 수만 장이 되면 due/state 인덱스 쿼리로.
export async function todayQueue(now = new Date()) {
  // 다음 경계 전에 due면 오늘 카드
  const tomorrow = nextDayStart(now)
  const active = (await db.cards.toArray()).filter((c) => !c.suspended && c.due < tomorrow)
  const used = new Set<string>()
  const once = (c: StoredCard) => !used.has(c.wordId) && !!used.add(c.wordId)

  const due = active
    .filter((c) => c.state !== State.New)
    .sort((a, b) => +a.due - +b.due)
    .filter(once)

  // 오늘 처음 학습한 카드 = state가 New였던 로그
  const newDone = await db.logs.where('review').aboveOrEqual(dayStart(now)).filter((l) => l.state === State.New).count()
  const newPerDay = await getSetting('newPerDay', DEFAULT_NEW_PER_DAY)
  const order = new Map((await db.words.toArray()).map((w) => [w.id, w.order]))
  const fresh = active
    .filter((c) => c.state === State.New)
    .sort((a, b) => order.get(a.wordId)! - order.get(b.wordId)! || (a.type === 'reading' ? -1 : 1))
    .filter(once)
    .slice(0, Math.max(0, newPerDay - newDone))

  return { due, fresh }
}

export async function todayCounts(now = new Date()) {
  const { due, fresh } = await todayQueue(now)
  return { due: due.length, newLeft: fresh.length }
}

// 복습 카드 우선, 남는 자리에 신규 카드
export async function buildSession(now = new Date()): Promise<StoredCard[]> {
  const { due, fresh } = await todayQueue(now)
  return [...due, ...fresh].slice(0, SESSION_MAX)
}

// 평가 저장 + 오늘 due인 형제 카드는 다음 학습일로.
// 반환값: 세션 안에서 다시 보여줘야 하면(학습 단계라 오늘 다시 due) 갱신된 카드
export async function rate(card: StoredCard, grade: Grade, now = new Date()): Promise<StoredCard | null> {
  const { card: next, log } = f.next(card, now, grade)
  const updated = { ...card, ...next }
  const tomorrow = nextDayStart(now)
  await db.transaction('rw', db.cards, db.logs, async () => {
    await db.cards.put(updated)
    await db.logs.add({ ...log, cardId: card.id })
    await db.cards
      .where('wordId')
      .equals(card.wordId)
      .filter((c) => c.id !== card.id && c.due < tomorrow)
      .modify({ due: tomorrow })
  })
  return next.due < tomorrow ? updated : null
}
