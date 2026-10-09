import { useEffect, useState } from 'react'
import { Rating, type Grade, type IPreview } from 'ts-fsrs'
import type { Screen } from '../App'
import { blankTarget, db, type StoredCard, type Word } from '../db'
import { buildSession, formatInterval, rate, schedule } from '../srs'

const GRADES: { grade: Grade; label: string; cls: string }[] = [
  { grade: Rating.Again, label: 'Again', cls: 'bg-red-500/90 active:bg-red-600' },
  { grade: Rating.Hard, label: 'Hard', cls: 'bg-amber-500/90 active:bg-amber-600' },
  { grade: Rating.Good, label: 'Good', cls: 'bg-emerald-500/90 active:bg-emerald-600' },
  { grade: Rating.Easy, label: 'Easy', cls: 'bg-sky-500/90 active:bg-sky-600' },
]

export default function Review({ go }: { go: (s: Screen) => void }) {
  const [queue, setQueue] = useState<StoredCard[] | null>(null)
  const [words, setWords] = useState(new Map<string, Word>())
  const [preview, setPreview] = useState<IPreview | null>(null) // 뒤집는 순간의 repeat() 결과
  const [done, setDone] = useState(0)

  useEffect(() => {
    buildSession().then(async (cards) => {
      const ws = await db.words.bulkGet(cards.map((c) => c.wordId))
      setWords(new Map(ws.filter((w) => w !== undefined).map((w) => [w.id, w])))
      setQueue(cards)
    })
  }, [])

  if (!queue) return null
  const card = queue[0]
  const word = card && words.get(card.wordId)

  if (!card || !word)
    return (
      <>
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <p className="text-2xl font-bold">세션 완료</p>
          <p className="text-slate-400">{done}회 평가</p>
        </div>
        <button onClick={() => go('home')} className="h-16 rounded-2xl bg-sky-500 text-lg font-bold text-white">
          홈으로
        </button>
      </>
    )

  const flipped = preview !== null
  const flip = () => !flipped && setPreview(schedule(card))

  async function answer(grade: Grade) {
    const again = await rate(card, preview![grade])
    setQueue((q) => [...q!.slice(1), ...(again ? [again] : [])])
    setDone((d) => d + 1)
    setPreview(null)
  }

  return (
    <>
      <div className="flex items-center justify-between text-sm text-slate-400">
        <button onClick={() => go('home')} className="-m-3 p-3">✕</button>
        <span>{card.type === 'reading' ? '읽기' : '문맥'} · 남은 {queue.length}</span>
      </div>

      <button
        onClick={flip}
        className="flex flex-1 flex-col items-center justify-center gap-6 text-center"
        lang="ja"
      >
        {card.type === 'reading' ? <ReadingFace word={word} flipped={flipped} /> : <ContextFace word={word} flipped={flipped} />}
        {!flipped && <span className="text-sm text-slate-500" lang="ko">탭해서 정답 보기</span>}
      </button>

      <div className="grid h-20 grid-cols-4 gap-2">
        {flipped ? (
          GRADES.map((g) => (
            <button key={g.grade} onClick={() => answer(g.grade)} className={`rounded-2xl font-bold text-white ${g.cls}`}>
              {g.label}
            </button>
          ))
        ) : (
          <button onClick={flip} className="col-span-4 rounded-2xl bg-slate-700 text-lg font-bold active:bg-slate-600">
            정답 보기
          </button>
        )}
      </div>
      <div className="mt-1 grid h-5 grid-cols-4 gap-2 text-center text-xs text-slate-400 tabular-nums">
        {preview && GRADES.map((g) => <span key={g.grade}>{formatInterval(+preview[g.grade].card.due - +preview[g.grade].log.review)}</span>)}
      </div>
    </>
  )
}

function ReadingFace({ word, flipped }: { word: Word; flipped: boolean }) {
  return (
    <>
      <p className="text-6xl font-bold">{word.word}</p>
      {flipped && <Answer word={word} />}
    </>
  )
}

function ContextFace({ word, flipped }: { word: Word; flipped: boolean }) {
  const target = blankTarget(word)!
  const [before, ...rest] = word.example_ja.split(target)
  return (
    <>
      <p className="text-2xl leading-relaxed">
        {before}
        <span className={flipped ? 'font-bold text-emerald-400' : 'text-slate-500'}>{flipped ? target : '＿＿＿'}</span>
        {rest.join(target)}
      </p>
      {!flipped && <p className="text-slate-400" lang="ko">{word.example_ko}</p>}
      {flipped && <Answer word={word} hideExample />}
    </>
  )
}

function Answer({ word, hideExample }: { word: Word; hideExample?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-3xl text-emerald-400">{word.reading}</p>
      <p className="text-xl" lang="ko">{word.meaning_ko}</p>
      {!hideExample && (
        <>
          <p className="mt-4 text-lg">{word.example_ja}</p>
          <p className="text-slate-400" lang="ko">{word.example_ko}</p>
        </>
      )}
    </div>
  )
}
