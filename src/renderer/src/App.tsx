import React, { useState } from 'react'
import { SingleTab } from './components/SingleTab'
import { BatchTab } from './components/BatchTab'

type Tab = 'single' | 'batch'

export default function App(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('single')

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      <header className="flex items-center gap-1 px-4 pt-4 border-b border-gray-800 pb-0">
        <h1 className="text-sm font-semibold text-white mr-4">React → MP4</h1>
        {(['single', 'batch'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-accent text-white'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {t === 'single' ? 'Conversión' : 'Cola Batch'}
          </button>
        ))}
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        {tab === 'single' ? <SingleTab /> : <BatchTab />}
      </main>
    </div>
  )
}
