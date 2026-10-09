import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import type { Screen } from '../App'
import { db, exportBackup, flaggedEntries, getSetting, importBackup, knownWords, restoreKnown, setSetting } from '../db'
import { DEFAULT_EXAM_DATE, DEFAULT_NEW_PER_DAY } from '../srs'

export default function Settings({ go }: { go: (s: Screen) => void }) {
  const [newPerDay, setNewPerDay] = useState(DEFAULT_NEW_PER_DAY)
  const [msg, setMsg] = useState('')
  const lastBackup = useLiveQuery(() => getSetting<Date | null>('lastBackup', null))
  const flagged = useLiveQuery(flaggedEntries)
  const known = useLiveQuery(knownWords)
  const examDate = useLiveQuery(() => getSetting('examDate', DEFAULT_EXAM_DATE))
  const freezeOff = useLiveQuery(() => getSetting('freezeOff', false))
  const [persisted, setPersisted] = useState<boolean | null>(null)

  useEffect(() => {
    getSetting('newPerDay', DEFAULT_NEW_PER_DAY).then(setNewPerDay)
    navigator.storage?.persisted?.().then(setPersisted)
  }, [])

  function changeNew(v: number) {
    const n = Math.max(0, Math.min(200, Math.round(v) || 0))
    setNewPerDay(n)
    setSetting('newPerDay', n)
  }

  const today = () => new Date().toISOString().slice(0, 10)
  const doExport = async () => download(`jlpt-n1-backup-${today()}.json`, await exportBackup())
  const exportFlagged = () => download(`jlpt-n1-flagged-${today()}.json`, JSON.stringify(flagged, null, 1))

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
      <div className="-mx-5 flex flex-1 flex-col gap-4 overflow-y-auto px-5 pt-4 *:shrink-0">
        <details className="rounded-2xl bg-slate-800 px-5 py-4">
          <summary className="cursor-pointer">'이상함' 표시한 단어 {flagged?.length ?? 0}개</summary>
          <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm text-slate-300" lang="ja">
            {flagged?.map((w) => (
              <li key={`${w.word}|${w.reading}`} className="flex justify-between gap-2">
                <span>{w.word}（{w.reading}）</span>
                <button onClick={() => db.flags.delete(`${w.word}|${w.reading}`)} className="text-slate-500" aria-label="표시 해제">✕</button>
              </li>
            ))}
          </ul>
          <button onClick={exportFlagged} disabled={!flagged?.length} className="mt-3 h-11 w-full rounded-xl bg-slate-700 text-sm disabled:opacity-40">
            표시한 단어 JSON 내보내기
          </button>
        </details>
        <details className="rounded-2xl bg-slate-800 px-5 py-4">
          <summary className="cursor-pointer">'안다'로 분류한 단어 {known?.length ?? 0}개</summary>
          <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm text-slate-300" lang="ja">
            {known?.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-2">
                <span>{w.word}（{w.reading}）</span>
                <button onClick={() => restoreKnown(w.id)} className="rounded-lg bg-slate-700 px-3 py-1 text-xs" lang="ko">복구</button>
              </li>
            ))}
          </ul>
        </details>
        <div className="flex-1" />
        <div className="flex flex-col gap-3 rounded-2xl bg-slate-800 px-5 py-4">
          <label className="flex items-center justify-between">
            <span>시험일</span>
            <input
              type="date"
              value={examDate ?? ''}
              onChange={(e) => e.target.value && setSetting('examDate', e.target.value)}
              className="rounded-lg bg-slate-700 px-3 py-2"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
            <span>시험 2주 전부터 신규 카드 자동 중단</span>
            <input type="checkbox" checked={!freezeOff} onChange={(e) => setSetting('freezeOff', !e.target.checked)} className="h-5 w-5" />
          </label>
        </div>
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
          <br />
          저장소 영구 보존: {persisted === null ? '확인 불가' : persisted ? '예' : '아니오 (브라우저가 지울 수 있음)'}
        </p>
        {msg && <p className="px-1 text-sm text-sky-400">{msg}</p>}
        <button onClick={doExport} className="h-14 rounded-2xl bg-slate-800 active:bg-slate-700">백업 내보내기 (JSON)</button>
        <label className="flex h-14 items-center justify-center rounded-2xl bg-slate-800 active:bg-slate-700">
          백업 가져오기
          <input type="file" accept="application/json,.json" hidden onChange={(e) => doImport(e.target.files?.[0])} />
        </label>
      </div>
      <button onClick={() => go('home')} className="mt-4 h-16 shrink-0 rounded-2xl bg-sky-500 text-lg font-bold text-white">완료</button>
    </>
  )
}

function download(name: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
