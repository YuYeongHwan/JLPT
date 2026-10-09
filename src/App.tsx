import { useEffect, useState } from 'react'
import { syncVocab } from './db'
import Home from './pages/Home'
import Review from './pages/Review'
import Settings from './pages/Settings'
import Triage from './pages/Triage'

export type Screen = 'home' | 'review' | 'settings' | 'triage'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    syncVocab().then(() => setReady(true), (e) => setError(String(e)))
  }, [])

  if (error) return <p className="p-6 text-red-400">데이터 로드 실패: {error}</p>
  if (!ready) return <p className="p-6 text-slate-400">불러오는 중…</p>

  return (
    <main className="mx-auto flex h-full max-w-md flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      {screen === 'home' && <Home go={setScreen} />}
      {screen === 'review' && <Review go={setScreen} />}
      {screen === 'settings' && <Settings go={setScreen} />}
      {screen === 'triage' && <Triage go={setScreen} />}
    </main>
  )
}
