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

interface SidebarProps {
  filter: string
  setFilter: (f: string) => void
  stats: {
    all: number
    urgent: number
    todo: number
    fyi: number
    done: number
    gmail: number
    slack: number
    total: number
  }
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
  
  const getBadgeClass = (id: string) => {
    switch (id) {
      case 'ALL':    return 'bg-[#FAF8F5] text-[#6E645E] border border-[#EFECE6]'
      case 'URGENT': return 'bg-rose-50 text-rose-700 border border-rose-150'
      case 'TODO':   return 'bg-amber-50 text-amber-700 border border-amber-200'
      case 'FYI':    return 'bg-blue-50 text-blue-700 border border-blue-150'
      case 'DONE':   return 'bg-stone-50 text-stone-500 border border-stone-200'
      case 'GMAIL':  return 'bg-red-50 text-red-700 border border-red-150'
      case 'SLACK':  return 'bg-purple-50 text-purple-700 border border-purple-150'
      default:       return 'bg-stone-100 text-stone-500'
    }
  }

  const getBadgeValue = (id: string) => {
    switch (id) {
      case 'ALL':    return stats.all
      case 'URGENT': return stats.urgent
      case 'TODO':   return stats.todo
      case 'FYI':    return stats.fyi
      case 'DONE':   return stats.done
      case 'GMAIL':  return stats.gmail
      case 'SLACK':  return stats.slack
      default:       return 0
    }
  }

  const pendingActionItems = actionItems.filter(a => !a.done)

  return (
    <div className="group w-[72px] hover:w-[260px] transition-[width] duration-300 ease-in-out overflow-hidden bg-[#FAF8F5]/60 backdrop-blur-md border-r border-[#EFECE6] flex flex-col shrink-0 h-full z-20 shadow-[1px_0_4px_rgba(34,30,27,0.01)] hover:shadow-[4px_0_12px_rgba(34,30,27,0.02)]">
      {/* Filters Navigation */}
      <nav className="px-2 py-4 overflow-y-auto mt-2 select-none">
        {FILTERS.map((f, i) =>
          f === null ? (
            <div key={`div-${i}`} className="my-3 border-t border-[#EFECE6] mx-2" />
          ) : (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`w-full flex items-center justify-between py-2 px-0 rounded-xl text-[13px] mb-1 transition-all duration-200 border border-transparent ${
                filter === f.id
                  ? 'bg-amber-100/40 border-amber-200/60 text-amber-900 font-semibold shadow-sm'
                  : 'text-[#6E645E] hover:text-[#221E1B] hover:bg-[#F5EFEB]/50'
              }`}
            >
              <span className="flex items-center min-w-0">
                <span className={`w-14 shrink-0 flex items-center justify-center transition-colors ${
                  filter === f.id ? 'text-amber-700' : 'text-[#6E645E]/80'
                }`}>
                  <f.icon className="w-4 h-4" strokeWidth={filter === f.id ? 2.5 : 2} />
                </span>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 font-medium tracking-wide whitespace-nowrap">
                  {f.label}
                </span>
              </span>
              
              {getBadgeValue(f.id) > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold font-mono opacity-0 group-hover:opacity-100 transition-opacity duration-300 mr-2.5 shrink-0 ${getBadgeClass(f.id)}`}>
                  {getBadgeValue(f.id)}
                </span>
              )}
            </button>
          )
        )}
      </nav>

      {/* Interactive AI Checklist Section */}
      <div className="flex-1 border-t border-[#EFECE6] p-4 overflow-y-auto min-h-0 flex flex-col bg-[#FAF8F5]/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div className="text-[10px] font-mono font-bold tracking-widest uppercase text-[#6E645E] mb-3 px-1 flex items-center justify-between shrink-0 whitespace-nowrap">
          <span>AI Tasks</span>
          {pendingActionItems.length > 0 && (
            <span className="text-[9px] bg-amber-100/80 text-amber-800 px-2 py-0.5 rounded-md font-sans font-semibold border border-amber-200/40">
              {pendingActionItems.length} active
            </span>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
          {actionItems.length === 0 ? (
            <p className="text-xs text-stone-400 italic px-1 font-sans">No tasks extracted yet.</p>
          ) : (
            Object.entries(
              actionItems.reduce((groups: Record<string, any[]>, item) => {
                const key = item.deadline || "No Deadline";
                if (!groups[key]) groups[key] = [];
                groups[key].push(item);
                return groups;
              }, {})
            ).map(([deadline, items]) => (
              <div key={deadline} className="space-y-1.5">
                <div className="text-[10px] font-bold font-mono text-amber-700/80 mb-1 flex items-center gap-1.5 opacity-90 uppercase tracking-wider">
                  <span>📅</span> {deadline}
                </div>
                <div className="space-y-1">
                  {items.map((item) => (
                    <label
                      key={item.id}
                      className={`flex items-start gap-2 px-2.5 py-2 rounded-xl hover:bg-[#F5EFEB]/40 cursor-pointer border border-transparent transition-all select-none ${
                        item.done 
                          ? "opacity-60 line-through text-stone-400" 
                          : "text-[#221E1B] bg-[#FAF8F5]/80 hover:bg-[#FAF8F5] border border-[#EFECE6]/50 shadow-[0_1px_2px_rgba(0,0,0,0.01)] hover:shadow-sm"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={(e) => onToggleAction(item.id, e.target.checked)}
                        className="mt-0.5 rounded border-[#EFECE6] bg-[#FAF8F5] text-amber-600 focus:ring-amber-500 focus:ring-offset-[#FAF8F5] w-3.5 h-3.5 shrink-0 cursor-pointer transition-all"
                      />
                      <div className="text-[11px] leading-snug">
                        <p className="font-semibold break-words leading-tight text-[#221E1B]">{item.task}</p>
                        <p className="text-[9px] text-[#6E645E]/80 truncate mt-0.5 max-w-[170px] font-mono">
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
