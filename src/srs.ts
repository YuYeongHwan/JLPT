import { fsrs, Rating, State, type RecordLogItem } from 'ts-fsrs'
import { db, getSetting, type StoredCard } from './db'

const f = fsrs({ enable_fuzz: true })
export const SESSION_MAX = 15
export const DEFAULT_NEW_PER_DAY = 20
export const DEFAULT_EXAM_DATE = '2026-12-06'
export const FREEZE_DAYS = 14 // 시험 전 이 기간은 신규 없이 복습만

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

// 시험까지 남은 일수(D-day), 권장 하루 신규 reading 수, 신규 중단 여부
export async function examInfo(now = new Date()) {
  const [y, m, d] = (await getSetting('examDate', DEFAULT_EXAM_DATE)).split('-').map(Number)
  const t = dayStart(now)
  // 달력 날짜끼리 비교. round로 서머타임 1시간 차이 흡수
  const days = Math.round((+new Date(y, m - 1, d) - +new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 86_400_000)
  const remaining = await db.cards
    .where('state')
    .equals(State.New)
    .filter((c) => c.type === 'reading' && !c.suspended)
    .count()
  const studyDays = days - FREEZE_DAYS
  const frozen = days >= 0 && days <= FREEZE_DAYS && !(await getSetting('freezeOff', false))
  return { days, recommended: studyDays > 0 ? Math.ceil(remaining / studyDays) : 0, frozen }
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
  const newPerDay = (await examInfo(now)).frozen ? 0 : await getSetting('newPerDay', DEFAULT_NEW_PER_DAY)
  const order = new Map((await db.words.toArray()).map((w) => [w.id, w.order]))
  // 신규는 reading 카드 먼저. context는 같은 단어 reading을 Good 이상으로 맞힌 뒤에만
  // ponytail: 로그 전체 스캔. 로그가 수십만 건이 되면 cardId 인덱스 쿼리로.
  const readingOk = new Set(
    (await db.logs.filter((l) => l.rating >= Rating.Good && l.cardId.endsWith(':reading')).toArray()).map((l) =>
      l.cardId.slice(0, -':reading'.length),
    ),
  )
  // 순서: 분류 '모른다' → 미분류 → 그 외
  const triage = new Map((await db.triage.toArray()).map((t) => [t.wordId, t.value]))
  const rank = (c: StoredCard) => {
    const t = triage.get(c.wordId)
    return t === 'unknown' ? 0 : t === undefined ? 1 : 2
  }
  const fresh = active
    .filter((c) => c.state === State.New && (c.type === 'reading' || readingOk.has(c.wordId)))
    .sort((a, b) => rank(a) - rank(b) || order.get(a.wordId)! - order.get(b.wordId)! || (a.type === 'reading' ? -1 : 1))
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

// 4개 평가별 결과. 화면 간격 표시와 실제 저장에 같은 결과를 씀(fuzz 때문에 다시 계산하면 달라짐)
export const schedule = (card: StoredCard, now = new Date()) => f.repeat(card, now)

// 10분, 3시간, 3일, 2개월, 1.5년
export function formatInterval(ms: number) {
  const min = ms / 60_000
  if (min < 60) return `${Math.max(1, Math.round(min))}분`
  if (min < 60 * 24) return `${Math.round(min / 60)}시간`
  const days = min / (60 * 24)
  if (days < 30) return `${Math.round(days)}일`
  if (days < 365) return `${Math.round(days / 30)}개월`
  return `${+(days / 365).toFixed(1)}년`
}

// schedule()[grade] 결과 저장 + 오늘 due인 형제 카드는 다음 학습일로.
// 반환값: 세션 안에서 다시 보여줘야 하면(학습 단계라 오늘 다시 due) 갱신된 카드
export async function rate(card: StoredCard, { card: next, log }: RecordLogItem, now = new Date()): Promise<StoredCard | null> {
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
