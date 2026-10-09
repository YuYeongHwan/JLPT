import { fsrs, State, type Grade } from 'ts-fsrs'
import { db, getSetting, type StoredCard } from './db'

const f = fsrs({ enable_fuzz: true })
export const SESSION_MAX = 15
export const DEFAULT_NEW_PER_DAY = 20

const startOfToday = () => new Date(new Date().setHours(0, 0, 0, 0))

export async function todayCounts() {
  const now = new Date()
  const due = await db.cards.where('due').belowOrEqual(now).filter((c) => c.state !== State.New).count()
  // 오늘 처음 학습한 카드 = state가 New였던 로그
  const newDone = await db.logs.where('review').aboveOrEqual(startOfToday()).filter((l) => l.state === State.New).count()
  const newPerDay = await getSetting('newPerDay', DEFAULT_NEW_PER_DAY)
  const newTotal = await db.cards.where('state').equals(State.New).count()
  return { due, newLeft: Math.max(0, Math.min(newPerDay - newDone, newTotal)) }
}

// 복습 카드 우선, 남는 자리에 신규 카드
export async function buildSession(): Promise<StoredCard[]> {
  const now = new Date()
  const due = (await db.cards.where('due').belowOrEqual(now).filter((c) => c.state !== State.New).sortBy('due'))
    .slice(0, SESSION_MAX)
  const { newLeft } = await todayCounts()
  const n = Math.min(newLeft, SESSION_MAX - due.length)
  // ponytail: 같은 단어의 reading/context가 같은 날 나올 수 있음. 거슬리면 sibling bury 추가.
  const fresh = n > 0 ? (await db.cards.where('state').equals(State.New).toArray())
          .sort((a, b) => a.wordId - b.wordId || (a.type === 'reading' ? -1 : 1))
          .slice(0, n) : []
  return [...due, ...fresh]
}

// 평가 저장. 반환값: 세션 안에서 다시 보여줘야 하면(10분 이내 due) 갱신된 카드
export async function rate(card: StoredCard, grade: Grade): Promise<StoredCard | null> {
  const now = new Date()
  const { card: next, log } = f.next(card, now, grade)
  const updated = { ...card, ...next }
  await db.transaction('rw', db.cards, db.logs, async () => {
    await db.cards.put(updated)
    await db.logs.add({ ...log, cardId: card.id })
  })
  return next.due.getTime() - now.getTime() < 10 * 60_000 ? updated : null
}
