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
    <div className="px-4 py-2.5 border-b border-stone-200 bg-white">
      <div className="flex rounded-full overflow-hidden h-1 gap-px mb-2">
        {urgentPct > 0 && <div className="bg-red-500 transition-all"   style={{ width: `${urgentPct}%` }} />}
        {todoPct   > 0 && <div className="bg-amber-500 transition-all" style={{ width: `${todoPct}%` }} />}
        {fiyPct    > 0 && <div className="bg-blue-500 transition-all"  style={{ width: `${fiyPct}%` }} />}
        <div className="bg-stone-100 flex-1" />
      </div>

      <div className="flex items-center gap-3 text-xs font-mono">
        {stats.urgent > 0 && (
          <span className="text-red-400">{stats.urgent} urgent</span>
        )}
        {stats.todo > 0 && (
          <span className="text-amber-400">{stats.todo} todo</span>
        )}
        {stats.fyi > 0 && (
          <span className="text-blue-400">{stats.fyi} fyi</span>
        )}
        {stats.total === 0 && (
          <span className="text-stone-400">No messages yet — sync Gmail or Slack</span>
        )}
      </div>
    </div>
  )
}
