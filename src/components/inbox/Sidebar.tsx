'use client'

import Link from 'next/link'

const FILTERS = [
  { id: 'ALL',    label: 'All Messages', icon: '◈' },
  { id: 'URGENT', label: 'Urgent',       icon: '⚡' },
  { id: 'TODO',   label: 'Todo',         icon: '○' },
  { id: 'FYI',    label: 'FYI',          icon: '◎' },
  { id: 'DONE',   label: 'Done',         icon: '✓' },
  null, // divider
  { id: 'GMAIL',  label: 'Gmail',        icon: 'G' },
  { id: 'SLACK',  label: 'Slack',        icon: 'S' },
]

const WS_STATUS_COLOR: Record<string, string> = {
  connected:    'bg-emerald-400',
  disconnected: 'bg-red-400',
  connecting:   'bg-amber-400',
}

interface SidebarProps {
  filter: string
  setFilter: (f: string) => void
  stats: any
  user: any
  wsStatus: string
}

export default function Sidebar({ filter, setFilter, stats, user, wsStatus }: SidebarProps) {
  return (
    <div className="w-56 bg-zinc-900/50 border-r border-zinc-800/60 flex flex-col shrink-0">
      <div className="p-5 border-b border-zinc-800/60">
        <div className="text-sm font-bold tracking-widest uppercase">
          Inbox<span className="text-amber-400">AI</span>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className={`w-1.5 h-1.5 rounded-full pulse-dot ${WS_STATUS_COLOR[wsStatus] || 'bg-zinc-500'}`} />
          <span className="text-xs text-zinc-600 capitalize">
            {wsStatus === 'connected' ? 'Live updates on' : wsStatus}
          </span>
        </div>
      </div>

      <nav className="flex-1 p-3 overflow-y-auto">
        {FILTERS.map((f, i) =>
          f === null ? (
            <div key={`div-${i}`} className="my-2 border-t border-zinc-800/60" />
          ) : (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm mb-0.5 transition-all ${
                filter === f.id
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span className="text-xs w-4 text-center font-mono opacity-70">{f.icon}</span>
                {f.label}
              </span>
              {f.id === 'URGENT' && stats.urgent > 0 && (
                <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-mono">
                  {stats.urgent}
                </span>
              )}
              {f.id === 'TODO' && stats.todo > 0 && (
                <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-mono">
                  {stats.todo}
                </span>
              )}
            </button>
          )
        )}
      </nav>

      <div className="border-t border-zinc-800/60 p-3">
        <Link
          href="/settings"
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-all mb-2"
        >
          <span className="text-xs font-mono">⚙</span> Settings
        </Link>
        <div className="flex items-center gap-2 px-3 py-2">
          {user.image ? (
            <img src={user.image} className="w-6 h-6 rounded-full" alt="" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold">
              {user.name?.[0] || user.email?.[0]}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-400 truncate">{user.name}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
