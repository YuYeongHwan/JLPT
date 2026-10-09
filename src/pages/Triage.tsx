import { useEffect, useState } from 'react'
import type { Screen } from '../App'
import { db, setTriage, triageCandidates, type Word } from '../db'

// 신규 단어를 안다/모른다로 빠르게 분류. 뒤집기 없음
export default function Triage({ go }: { go: (s: Screen) => void }) {
  const [words, setWords] = useState<Word[] | null>(null)
  const [done, setDone] = useState(0) // 이전 세션 포함 분류한 수
  const [i, setI] = useState(0)

  useEffect(() => {
    Promise.all([triageCandidates(), db.triage.count()]).then(([ws, n]) => {
      setWords(ws)
      setDone(n)
    })
  }, [])

  if (!words) return null
  const word = words[i]
  const total = done - i + words.length // 시작 시점 기준 전체

  async function answer(value: 'known' | 'unknown') {
    await setTriage(word.id, value)
    setI(i + 1)
    setDone((d) => d + 1)
  }

  return (
    <>
      <div className="flex items-center justify-between text-sm text-slate-400">
        <button onClick={() => go('home')} className="-m-3 p-3" aria-label="나가기">✕</button>
        <span className="tabular-nums">분류 {done} / {total}</span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full bg-emerald-500" style={{ width: `${total ? (done / total) * 100 : 100}%` }} />
      </div>

      {word ? (
        <>
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center" lang="ja">
            <p className="text-6xl font-bold">{word.word}</p>
            {word.reading !== word.word && <p className="text-2xl text-slate-400">{word.reading}</p>}
          </div>
          <div className="grid h-20 grid-cols-2 gap-3">
            <button onClick={() => answer('unknown')} className="rounded-2xl bg-slate-700 text-lg font-bold active:bg-slate-600">
              모른다
            </button>
            <button onClick={() => answer('known')} className="rounded-2xl bg-emerald-500 text-lg font-bold text-white active:bg-emerald-600">
              안다
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="flex flex-1 items-center justify-center text-2xl font-bold">분류 완료</p>
          <button onClick={() => go('home')} className="h-16 rounded-2xl bg-sky-500 text-lg font-bold text-white">홈으로</button>
        </>
      )}
    </>
  )
}
