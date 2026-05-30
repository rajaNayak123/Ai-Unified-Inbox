'use client'

interface StatsBarProps {
  stats: any
}

export default function StatsBar({ stats }: StatsBarProps) {
  const total = Math.max(stats.total || 1, 1)
  const urgentPct = Math.round(((stats.urgent || 0) / total) * 100)
  const todoPct   = Math.round(((stats.todo   || 0) / total) * 100)
  const fiyPct    = Math.round(((stats.fyi    || 0) / total) * 100)

  return (
    <div className="px-4 py-2.5 border-b border-[#EFECE6] bg-[#FAF8F5]/80">
      <div className="flex rounded-full overflow-hidden h-1 gap-px mb-2">
        {urgentPct > 0 && <div className="bg-rose-500 transition-all"   style={{ width: `${urgentPct}%` }} />}
        {todoPct   > 0 && <div className="bg-amber-500 transition-all" style={{ width: `${todoPct}%` }} />}
        {fiyPct    > 0 && <div className="bg-blue-500 transition-all"  style={{ width: `${fiyPct}%` }} />}
        <div className="bg-[#EFECE6] flex-1" />
      </div>

      <div className="flex items-center gap-3 text-[10px] font-bold font-mono uppercase tracking-wide">
        {stats.urgent > 0 && (
          <span className="text-rose-600">{stats.urgent} urgent</span>
        )}
        {stats.todo > 0 && (
          <span className="text-amber-600">{stats.todo} todo</span>
        )}
        {stats.fyi > 0 && (
          <span className="text-blue-600">{stats.fyi} fyi</span>
        )}
        {stats.total === 0 && (
          <span className="text-stone-400 font-sans normal-case">No messages yet — sync Gmail or Slack</span>
        )}
      </div>
    </div>
  )
}
