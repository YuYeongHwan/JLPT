import { useLiveQuery } from 'dexie-react-hooks'
import type { ReactNode } from 'react'
import type { Screen } from '../App'
import { backupStale, getSetting, triageCandidates } from '../db'
import { DEFAULT_EXAM_DATE, examInfo, SESSION_MAX, todayCounts } from '../srs'

export default function Home({ go }: { go: (s: Screen) => void }) {
  const counts = useLiveQuery(todayCounts)
  const stale = useLiveQuery(() => backupStale())
  const exam = useLiveQuery(() => examInfo())
  const examDate = useLiveQuery(() => getSetting('examDate', DEFAULT_EXAM_DATE))
  const untriaged = useLiveQuery(async () => (await triageCandidates()).length)
  const total = (counts?.due ?? 0) + (counts?.newLeft ?? 0)

  return (
    <>
      <header className="flex items-center justify-between">
        <h1 className="font-medium tracking-wide">JLPT N1</h1>
        <button onClick={() => go('settings')} className="-m-3 p-3 text-sm text-muted">
          설정
        </button>
      </header>

      {stale && (
        <button onClick={() => go('settings')} className="mt-4 flex justify-between border-y border-rule py-3 text-left text-sm">
          <span>마지막 백업 후 7일이 지났어요</span>
          <span className="underline underline-offset-4">백업하기</span>
        </button>
      )}

      {exam && exam.days >= 0 && (
        <section className="mt-[9dvh]">
          <p className="text-xs text-muted">{examDate?.replaceAll('-', '.')} 試験</p>
          {exam.days > 0 ? (
            <p className="mt-1 flex items-baseline gap-3 font-ja text-xl" lang="ja">
              あと
              <span className="font-mincho text-[112px] leading-none font-medium tabular-nums">{exam.days}</span>日
            </p>
          ) : (
            <p className="mt-1 font-mincho text-[72px] leading-tight font-medium" lang="ja">本日 試験</p>
          )}
          <p className="mt-3 text-sm text-muted">
            {exam.frozen ? '시험 2주 전이라 신규 없이 복습만 해요' : exam.recommended > 0 && `권장 신규 하루 ${exam.recommended}개`}
          </p>
        </section>
      )}

      <ul className="mt-auto mb-6 divide-y divide-rule border-y border-rule">
        <Row label="오늘 복습" value={counts?.due} />
        <Row label="신규 카드" value={counts?.newLeft} />
        {!!untriaged && (
          <Row label={<span className="underline decoration-rule underline-offset-4">분류 남은 단어</span>} value={untriaged} onClick={() => go('triage')} />
        )}
      </ul>

      <button
        disabled={total === 0}
        onClick={() => go('review')}
        className="h-14 rounded-xs bg-accent font-medium text-paper active:translate-y-px disabled:border disabled:border-rule disabled:bg-transparent disabled:text-muted"
      >
        {total === 0 ? '오늘 할 카드가 없어요' : `세션 시작 · ${Math.min(total, SESSION_MAX)}장`}
      </button>
    </>
  )
}

function Row({ label, value, onClick }: { label: ReactNode; value?: number; onClick?: () => void }) {
  const inner = (
    <>
      <span>{label}</span>
      <span className="text-xl tabular-nums">{value ?? ''}</span>
    </>
  )
  return (
    <li>
      {onClick ? (
        <button onClick={onClick} className="flex w-full items-baseline justify-between py-3.5 text-left active:bg-ink/5">
          {inner}
        </button>
      ) : (
        <div className="flex items-baseline justify-between py-3.5">{inner}</div>
      )}
    </li>
  )
}
