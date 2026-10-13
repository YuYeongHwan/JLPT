import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type ReactNode } from 'react'
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
      <h1 className="font-medium tracking-wide">설정</h1>
      <div className="-mx-6 flex flex-1 flex-col overflow-y-auto px-6 pb-6">
        <Section title="학습">
          <Row>
            <span id="new-per-day">하루 신규 카드</span>
            <div className="flex items-center">
              <Step onClick={() => changeNew(newPerDay - 5)} label="5 줄이기">−</Step>
              <input
                type="number"
                inputMode="numeric"
                aria-labelledby="new-per-day"
                value={newPerDay}
                onChange={(e) => changeNew(+e.target.value)}
                className="w-14 bg-transparent text-center text-lg tabular-nums"
              />
              <Step onClick={() => changeNew(newPerDay + 5)} label="5 늘리기">+</Step>
            </div>
          </Row>
        </Section>
        <p className="mt-2 text-xs text-muted">카드는 단어당 2장(읽기, 문맥)이에요.</p>

        <Section title="시험">
          <Row>
            <label htmlFor="exam-date">시험일</label>
            <input
              id="exam-date"
              type="date"
              value={examDate ?? ''}
              onChange={(e) => e.target.value && setSetting('examDate', e.target.value)}
              className="rounded-xs border border-rule bg-transparent px-2 py-1.5 tabular-nums"
            />
          </Row>
          <Row>
            <label htmlFor="freeze">시험 2주 전부터 신규 중단</label>
            <input
              id="freeze"
              type="checkbox"
              checked={!freezeOff}
              onChange={(e) => setSetting('freezeOff', !e.target.checked)}
              className="size-5"
            />
          </Row>
        </Section>

        <Section title="단어">
          <WordList title="이상함 표시한 단어" words={flagged} onRemove={(id) => db.flags.delete(id)} removeLabel="해제">
            <button
              onClick={exportFlagged}
              disabled={!flagged?.length}
              className="mt-2 h-10 w-full rounded-xs border border-rule text-sm disabled:text-muted"
            >
              JSON 내보내기
            </button>
          </WordList>
          <WordList title="'안다'로 분류한 단어" words={known} onRemove={restoreKnown} removeLabel="복구" />
        </Section>

        <Section title="백업">
          <Row>
            <span>마지막 백업</span>
            <span className="text-sm text-muted">{lastBackup ? lastBackup.toLocaleString('ko-KR') : '없음'}</span>
          </Row>
          <Row>
            <span>저장소 영구 보존</span>
            <span className="text-sm text-muted">{persisted === null ? '확인 불가' : persisted ? '예' : '아니오'}</span>
          </Row>
          <li>
            <button onClick={doExport} className="w-full py-3.5 text-left active:bg-ink/5">
              백업 내보내기 (JSON)
            </button>
          </li>
          <li>
            <label className="block w-full cursor-pointer py-3.5 active:bg-ink/5">
              백업 가져오기
              <input type="file" accept="application/json,.json" hidden onChange={(e) => doImport(e.target.files?.[0])} />
            </label>
          </li>
        </Section>
        {persisted === false && <p className="mt-2 text-xs text-muted">브라우저가 저장 공간이 부족하면 기록을 지울 수 있어요. 백업을 자주 해 두세요.</p>}
        {msg && <p className="mt-3 text-sm">{msg}</p>}
      </div>
      <button onClick={() => go('home')} className="h-14 shrink-0 rounded-xs bg-accent font-medium text-paper active:translate-y-px">
        완료
      </button>
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-xs font-medium tracking-[0.14em] text-muted">{title}</h2>
      <ul className="divide-y divide-rule border-y border-rule">{children}</ul>
    </section>
  )
}

function Row({ children }: { children: ReactNode }) {
  return <li className="flex min-h-13 items-center justify-between gap-4 py-2">{children}</li>
}

function Step({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} className="size-9 rounded-xs border border-rule text-lg active:bg-ink/5">
      {children}
    </button>
  )
}

function WordList(props: {
  title: string
  words?: { word: string; reading: string }[]
  onRemove: (id: string) => void
  removeLabel: string
  children?: ReactNode
}) {
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between py-3.5">
          <span>{props.title}</span>
          <span className="text-sm text-muted tabular-nums">
            {props.words?.length ?? 0}
            <span className="ml-3 group-open:hidden">보기</span>
            <span className="ml-3 hidden group-open:inline">닫기</span>
          </span>
        </summary>
        <ul className="mb-3 max-h-56 divide-y divide-rule overflow-y-auto border-t border-rule" lang="ja">
          {props.words?.map((w) => {
            const id = `${w.word}|${w.reading}`
            return (
              <li key={id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <span className="font-mincho text-base">{w.word}</span>
                  <span className="ml-2 text-muted">{w.reading}</span>
                </span>
                <button onClick={() => props.onRemove(id)} className="text-xs underline underline-offset-4" lang="ko">
                  {props.removeLabel}
                </button>
              </li>
            )
          })}
        </ul>
        {props.children}
      </details>
    </li>
  )
}

function download(name: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
