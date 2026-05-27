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
  actionItems: any[]
  onToggleAction: (actionId: string, done: boolean) => void
}

export default function Sidebar({
  filter,
  setFilter,
  stats,
  user,
  wsStatus,
  actionItems,
  onToggleAction,
}: SidebarProps) {
  return (
    <div className="w-56 bg-zinc-900/50 border-r border-zinc-800/60 flex flex-col shrink-0 h-full">
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

      <nav className="p-3 overflow-y-auto">
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

      {/* Interactive AI Checklist Section */}
      <div className="flex-1 border-t border-zinc-800/60 p-4 overflow-y-auto min-h-0 flex flex-col">
        <div className="text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-500 mb-3 px-1 flex items-center justify-between shrink-0">
          <span>AI Action Items</span>
          {actionItems.filter(a => !a.done).length > 0 && (
            <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1 py-0.2 rounded font-sans font-medium">
              {actionItems.filter(a => !a.done).length} pending
            </span>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
          {actionItems.length === 0 ? (
            <p className="text-xs text-zinc-700 italic px-1">No tasks extracted.</p>
          ) : (
            Object.entries(
              actionItems.reduce((groups: Record<string, any[]>, item) => {
                const key = item.deadline || "No Deadline";
                if (!groups[key]) groups[key] = [];
                groups[key].push(item);
                return groups;
              }, {})
            ).map(([deadline, items]) => (
              <div key={deadline} className="space-y-1">
                <div className="text-[10px] font-semibold font-mono text-amber-500/80 mb-1 flex items-center gap-1.5 opacity-80 uppercase tracking-wider">
                  <span>📅</span> {deadline}
                </div>
                <div className="space-y-1">
                  {items.map((item) => (
                    <label
                      key={item.id}
                      className={`flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-800/30 cursor-pointer border border-transparent transition-all select-none ${
                        item.done 
                          ? "opacity-40 line-through text-zinc-600 hover:border-transparent" 
                          : "text-zinc-300 border-zinc-800/20 hover:border-zinc-800/60 hover:bg-zinc-800/20"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={(e) => onToggleAction(item.id, e.target.checked)}
                        className="mt-0.5 rounded border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-zinc-900 w-3.5 h-3.5 shrink-0"
                      />
                      <div className="text-[11px] leading-snug">
                        <p className="font-medium break-words leading-tight">{item.task}</p>
                        <p className="text-[9px] text-zinc-600 truncate mt-0.5 max-w-[130px]">
                          via {item.messageSubject}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

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
