import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Rating, type Grade, type IPreview } from 'ts-fsrs'
import type { Screen } from '../App'
import { blankTarget, db, toggleFlag, type StoredCard, type Word } from '../db'
import { buildSession, formatInterval, rate, schedule } from '../srs'

const GRADES: { grade: Grade; label: string; accent?: boolean }[] = [
  { grade: Rating.Again, label: 'もう一度', accent: true },
  { grade: Rating.Hard, label: '難しい' },
  { grade: Rating.Good, label: '良い' },
  { grade: Rating.Easy, label: '簡単' },
]

export default function Review({ go }: { go: (s: Screen) => void }) {
  const [queue, setQueue] = useState<StoredCard[] | null>(null)
  const [words, setWords] = useState(new Map<string, Word>())
  const [preview, setPreview] = useState<IPreview | null>(null) // 뒤집는 순간의 repeat() 결과
  const [done, setDone] = useState(0)
  const flagged = useLiveQuery(() => (queue?.[0] ? db.flags.get(queue[0].wordId) : undefined), [queue?.[0]?.wordId])

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
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <Stamp />
          <p className="text-muted">{done}장 복습</p>
        </div>
        <button onClick={() => go('home')} className="h-14 rounded-xs border border-ink font-medium active:bg-ink/5">
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
      <div className="fixed inset-x-0 top-0 h-px">
        <div className="h-full bg-ink transition-[width] duration-300" style={{ width: `${(done / (done + queue.length)) * 100}%` }} />
      </div>
      <div className="flex items-center justify-between text-sm text-muted">
        <button onClick={() => go('home')} className="-m-3 p-3" aria-label="닫기">✕</button>
        <span>{card.type === 'reading' ? '읽기' : '문맥'}</span>
      </div>

      <button onClick={flip} className="flex flex-1 flex-col items-center overflow-y-auto pt-[16dvh] text-center" lang="ja">
        {card.type === 'reading' ? <ReadingFace word={word} flipped={flipped} /> : <ContextFace word={word} flipped={flipped} />}
      </button>

      <div className="flex h-10 items-center justify-end">
        {flipped && (
          <button
            onClick={() => toggleFlag(word.id)}
            aria-pressed={!!flagged}
            className={`text-sm underline-offset-4 ${flagged ? 'text-ink underline' : 'text-muted'}`}
          >
            {flagged ? '이상함 표시됨' : '이상함 표시'}
          </button>
        )}
      </div>
      {flipped ? (
        <div className="grid h-16 grid-cols-4 divide-x divide-ink rounded-xs border border-ink">
          {GRADES.map((g) => (
            <button
              key={g.grade}
              onClick={() => answer(g.grade)}
              className="flex flex-col items-center justify-center gap-0.5 active:bg-ink/5"
            >
              <span lang="ja" className={`font-ja text-[15px] font-medium ${g.accent ? 'text-accent' : ''}`}>{g.label}</span>
              <span className="text-[11px] text-muted">
                {formatInterval(+preview[g.grade].card.due - +preview[g.grade].log.review)}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <button onClick={flip} className="h-16 rounded-xs border border-ink font-medium active:bg-ink/5">
          정답 보기
        </button>
      )}
    </>
  )
}

// 단어는 명조 64px 이상. 화면 폭을 넘는 긴 단어만 폭에 맞춰 줄임
const wordSize = (w: string) => `${Math.min(80, Math.max(40, Math.floor(320 / [...w].length)))}px`

function ReadingFace({ word, flipped }: { word: Word; flipped: boolean }) {
  return (
    <>
      <p className="font-mincho leading-none font-medium" style={{ fontSize: wordSize(word.word) }}>
        {word.word}
      </p>
      {flipped && <Answer word={word} />}
    </>
  )
}

function ContextFace({ word, flipped }: { word: Word; flipped: boolean }) {
  const target = blankTarget(word)!
  const [before, ...rest] = word.example_ja.split(target)
  return (
    <>
      <p className="font-ja text-[22px] leading-[1.9]">
        {before}
        {flipped ? (
          <span className="font-mincho font-bold underline decoration-1 underline-offset-[6px]">{target}</span>
        ) : (
          <span className="inline-block min-w-[3em] border-b border-ink align-baseline">&nbsp;</span>
        )}
        {rest.join(target)}
      </p>
      {!flipped && <p className="mt-4 text-[15px] text-muted" lang="ko">{word.example_ko}</p>}
      {flipped && <Answer word={word} hideExample />}
    </>
  )
}

function Answer({ word, hideExample }: { word: Word; hideExample?: boolean }) {
  return (
    <div className="reveal flex w-full flex-col items-center">
      <hr className="my-7 w-12 border-rule" />
      <p className="font-mincho text-[28px] font-medium">{word.reading}</p>
      <p className="mt-2 text-lg" lang="ko">{word.meaning_ko}</p>
      {!hideExample && (
        <>
          <p className="mt-7 font-ja text-[17px] leading-relaxed">{word.example_ja}</p>
          <p className="mt-1 text-sm text-muted" lang="ko">{word.example_ko}</p>
        </>
      )}
    </div>
  )
}

// 세션 완료 도장
function Stamp() {
  return (
    <svg viewBox="0 0 120 120" className="stamp size-36 text-accent" role="img" aria-label="済">
      <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="5" />
      <circle cx="60" cy="60" r="46" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text x="60" y="79" textAnchor="middle" fill="currentColor" fontFamily="'Shippori Mincho', serif" fontWeight="700" fontSize="54">
        済
      </text>
    </svg>
  )
}
