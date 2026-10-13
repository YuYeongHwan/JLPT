import { useEffect, useRef, useState } from 'react'
import type { Screen } from '../App'
import { db, setTriage, triageCandidates, type Word } from '../db'

const SWIPE = 80 // 이 거리(px) 이상 밀면 확정

// 신규 단어를 안다/모른다로 빠르게 분류. 뒤집기 없음. 왼쪽 스와이프 = 모른다, 오른쪽 = 안다
export default function Triage({ go }: { go: (s: Screen) => void }) {
  const [words, setWords] = useState<Word[] | null>(null)
  const [done, setDone] = useState(0) // 이전 세션 포함 분류한 수
  const [i, setI] = useState(0)
  const card = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; id: number } | null>(null)

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
    navigator.vibrate?.(10)
    await setTriage(word.id, value)
    setI(i + 1)
    setDone((d) => d + 1)
  }

  // 드래그 중엔 리렌더 없이 transform만 직접 갱신
  const move = (dx: number) => {
    const el = card.current
    if (!el) return
    el.style.transform = dx ? `translateX(${dx}px) rotate(${dx / 40}deg)` : ''
    el.style.opacity = String(1 - Math.min(Math.abs(dx) / 400, 0.5))
  }
  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, id: e.pointerId }
    e.currentTarget.setPointerCapture(e.pointerId)
    card.current?.style.setProperty('transition', 'none')
  }
  const onMove = (e: React.PointerEvent) => drag.current && move(e.clientX - drag.current.x)
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    drag.current = null
    card.current?.style.setProperty('transition', 'transform 150ms ease-out, opacity 150ms ease-out')
    move(0)
    if (Math.abs(dx) >= SWIPE) answer(dx > 0 ? 'known' : 'unknown')
  }

  return (
    <>
      <div className="fixed inset-x-0 top-0 h-px">
        <div className="h-full bg-ink" style={{ width: `${total ? (done / total) * 100 : 100}%` }} />
      </div>
      <div className="flex items-center justify-between text-sm text-muted">
        <button onClick={() => go('home')} className="-m-3 p-3" aria-label="닫기">✕</button>
        <span className="tabular-nums">분류 {done} / {total}</span>
      </div>

      {word ? (
        <>
          <div
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="flex flex-1 touch-pan-y flex-col items-center pt-[18dvh] select-none"
          >
            <div ref={card} key={word.id} className="flex flex-col items-center gap-4 text-center" lang="ja">
              <p className="font-mincho text-[72px] leading-none font-medium">{word.word}</p>
              {word.reading !== word.word && <p className="font-mincho text-2xl text-muted">{word.reading}</p>}
            </div>
            <p className="mt-auto mb-4 flex w-full justify-between text-xs text-muted">
              <span>← 모른다</span>
              <span>안다 →</span>
            </p>
          </div>
          <div className="grid h-16 grid-cols-2 divide-x divide-ink rounded-xs border border-ink">
            <button onClick={() => answer('unknown')} className="font-medium active:bg-ink/5">
              모른다
            </button>
            <button onClick={() => answer('known')} className="font-medium active:bg-ink/5">
              안다
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="flex flex-1 items-center justify-center font-mincho text-3xl" lang="ja">分類 完了</p>
          <button onClick={() => go('home')} className="h-14 rounded-xs border border-ink font-medium active:bg-ink/5">
            홈으로
          </button>
        </>
      )}
    </>
  )
}
