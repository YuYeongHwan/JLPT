import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import type { Screen } from '../App'
import { exportBackup, getSetting, importBackup, setSetting } from '../db'
import { DEFAULT_NEW_PER_DAY } from '../srs'

export default function Settings({ go }: { go: (s: Screen) => void }) {
  const [newPerDay, setNewPerDay] = useState(DEFAULT_NEW_PER_DAY)
  const [msg, setMsg] = useState('')
  const lastBackup = useLiveQuery(() => getSetting<Date | null>('lastBackup', null))

  useEffect(() => {
    getSetting('newPerDay', DEFAULT_NEW_PER_DAY).then(setNewPerDay)
  }, [])

  function changeNew(v: number) {
    const n = Math.max(0, Math.min(200, Math.round(v) || 0))
    setNewPerDay(n)
    setSetting('newPerDay', n)
  }

  async function doExport() {
    const blob = new Blob([await exportBackup()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `jlpt-n1-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function doImport(file?: File) {
    if (!file || !confirm('현재 학습 기록을 백업 파일로 덮어씁니다. 계속할까요?')) return
    try {
      await importBackup(await file.text())
      setMsg('가져오기 완료')
      getSetting('newPerDay', DEFAULT_NEW_PER_DAY).then(setNewPerDay)
    } catch (e) {
      setMsg(`실패: ${e instanceof Error ? e.message : e}`)
    }
  }

  return (
    <>
      <h1 className="text-xl font-bold">설정</h1>
      <div className="flex flex-1 flex-col justify-end gap-4">
        <div className="flex items-center justify-between rounded-2xl bg-slate-800 px-5 py-4">
          <span id="new-per-day">하루 신규 카드 수</span>
          <div className="flex items-center gap-2">
            <button onClick={() => changeNew(newPerDay - 5)} className="h-11 w-11 rounded-xl bg-slate-700 text-xl">−</button>
            <input
              type="number"
              inputMode="numeric"
              aria-labelledby="new-per-day"
              value={newPerDay}
              onChange={(e) => changeNew(+e.target.value)}
              className="w-14 bg-transparent text-center text-xl tabular-nums"
            />
            <button onClick={() => changeNew(newPerDay + 5)} className="h-11 w-11 rounded-xl bg-slate-700 text-xl">+</button>
          </div>
        </div>
        <p className="px-1 text-sm text-slate-500">카드는 단어당 2장(읽기·문맥)이에요.</p>
        <p className="px-1 text-sm text-slate-400">
          마지막 백업: {lastBackup ? lastBackup.toLocaleString('ko-KR') : '없음'}
        </p>
        {msg && <p className="px-1 text-sm text-sky-400">{msg}</p>}
        <button onClick={doExport} className="h-14 rounded-2xl bg-slate-800 active:bg-slate-700">백업 내보내기 (JSON)</button>
        <label className="flex h-14 items-center justify-center rounded-2xl bg-slate-800 active:bg-slate-700">
          백업 가져오기
          <input type="file" accept="application/json,.json" hidden onChange={(e) => doImport(e.target.files?.[0])} />
        </label>
        <button onClick={() => go('home')} className="h-16 rounded-2xl bg-sky-500 text-lg font-bold text-white">완료</button>
      </div>
    </>
  )
}
