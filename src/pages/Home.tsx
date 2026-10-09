import { useLiveQuery } from 'dexie-react-hooks'
import type { Screen } from '../App'
import { backupStale } from '../db'
import { SESSION_MAX, todayCounts } from '../srs'

export default function Home({ go }: { go: (s: Screen) => void }) {
  const counts = useLiveQuery(todayCounts)
  const stale = useLiveQuery(() => backupStale())
  const total = (counts?.due ?? 0) + (counts?.newLeft ?? 0)

  return (
    <>
      <h1 className="text-xl font-bold">JLPT N1</h1>
      {stale && (
        <button onClick={() => go('settings')} className="mt-4 rounded-2xl bg-amber-500/15 px-5 py-3 text-left text-sm text-amber-300">
          마지막 백업 후 7일이 지났어요. 탭해서 백업하기 →
        </button>
      )}
      <div className="flex flex-1 flex-col justify-center gap-4">
        <Stat label="오늘 복습" value={counts?.due} color="text-sky-400" />
        <Stat label="신규 카드" value={counts?.newLeft} color="text-emerald-400" />
      </div>
      <div className="flex flex-col gap-3">
        <button
          disabled={total === 0}
          onClick={() => go('review')}
          className="h-16 rounded-2xl bg-sky-500 text-lg font-bold text-white active:bg-sky-600 disabled:bg-slate-700 disabled:text-slate-400"
        >
          {total === 0 ? '오늘 할 카드 없음 🎉' : `5분 세션 시작 (${Math.min(total, SESSION_MAX)}장)`}
        </button>
        <button onClick={() => go('settings')} className="h-12 rounded-2xl bg-slate-800 text-slate-300 active:bg-slate-700">
          설정
        </button>
      </div>
    </>
  )
}

function Stat({ label, value, color }: { label: string; value?: number; color: string }) {
  return (
    <div className="flex items-baseline justify-between rounded-2xl bg-slate-800 px-6 py-5">
      <span className="text-slate-300">{label}</span>
      <span className={`text-5xl font-bold tabular-nums ${color}`}>{value ?? '–'}</span>
    </div>
  )
}
