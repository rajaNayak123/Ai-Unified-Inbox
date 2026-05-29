'use client'

import Link from 'next/link'
import { Inbox, Zap, CheckCircle2, Info, CheckCircle, Mail, Hash } from 'lucide-react'

const FILTERS = [
  { id: 'ALL',    label: 'All Messages', icon: Inbox },
  { id: 'URGENT', label: 'Urgent',       icon: Zap },
  { id: 'TODO',   label: 'Todo',         icon: CheckCircle2 },
  { id: 'FYI',    label: 'FYI',          icon: Info },
  { id: 'DONE',   label: 'Done',         icon: CheckCircle },
  null, // divider
  { id: 'GMAIL',  label: 'Gmail',        icon: Mail },
  { id: 'SLACK',  label: 'Slack',        icon: Hash },
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
    <div className="group w-[80px] hover:w-[280px] transition-[width] duration-300 ease-in-out overflow-hidden bg-white/20 backdrop-blur-md border-r border-stone-200/50 flex flex-col shrink-0 h-full z-20 shadow-[1px_0_20px_rgba(0,0,0,0.02)]">
      <nav className="px-2 py-4 overflow-y-auto mt-2">
        {FILTERS.map((f, i) =>
          f === null ? (
            <div key={`div-${i}`} className="my-2 border-t border-stone-200" />
          ) : (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`w-full flex items-center justify-between p-3 rounded-xl text-sm mb-1.5 transition-all duration-300 whitespace-nowrap ${
                filter === f.id
                  ? 'bg-white shadow-sm border border-stone-200/80 text-stone-900 font-semibold translate-x-1'
                  : 'text-stone-500 hover:text-stone-800 hover:bg-white/50 border border-transparent hover:translate-x-1 hover:shadow-sm'
              }`}
            >
              <span className="flex items-center">
                <span className="w-10 shrink-0 flex items-center justify-center opacity-80 text-stone-500">
                  <f.icon className="w-[18px] h-[18px]" strokeWidth={2.5} />
                </span>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 ml-2">
                  {f.label}
                </span>
              </span>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                {f.id === 'URGENT' && stats.urgent > 0 && (
                  <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-mono">
                    {stats.urgent}
                  </span>
                )}
                {f.id === 'TODO' && stats.todo > 0 && (
                  <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-mono">
                    {stats.todo}
                  </span>
                )}
              </div>
            </button>
          )
        )}
      </nav>

      {/* Interactive AI Checklist Section */}
      <div className="flex-1 border-t border-stone-200 p-4 overflow-y-auto min-h-0 flex flex-col opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div className="text-[10px] font-mono font-bold tracking-widest uppercase text-stone-500 mb-3 px-1 flex items-center justify-between shrink-0 whitespace-nowrap">
          <span>AI Action Items</span>
          {actionItems.filter(a => !a.done).length > 0 && (
            <span className="text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-sans font-medium">
              {actionItems.filter(a => !a.done).length} pending
            </span>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
          {actionItems.length === 0 ? (
            <p className="text-xs text-stone-400 italic px-1">No tasks extracted.</p>
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
                <div className="text-[10px] font-semibold font-mono text-amber-600/80 mb-1 flex items-center gap-1.5 opacity-80 uppercase tracking-wider">
                  <span>📅</span> {deadline}
                </div>
                <div className="space-y-1">
                  {items.map((item) => (
                    <label
                      key={item.id}
                      className={`flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-stone-200/40 cursor-pointer border border-transparent transition-all select-none ${
                        item.done 
                          ? "opacity-60 line-through text-stone-400" 
                          : "text-stone-700 hover:bg-white hover:shadow-sm"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={(e) => onToggleAction(item.id, e.target.checked)}
                        className="mt-0.5 rounded border-stone-300 bg-white text-amber-500 focus:ring-amber-500 focus:ring-offset-[#FAFAFA] w-3.5 h-3.5 shrink-0"
                      />
                      <div className="text-[11px] leading-snug">
                        <p className="font-medium break-words leading-tight">{item.task}</p>
                        <p className="text-[9px] text-stone-500 truncate mt-0.5 max-w-[130px]">
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
    </div>
  )
}
