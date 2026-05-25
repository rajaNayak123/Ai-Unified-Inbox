export default function InboxLoading() {
  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Sidebar Skeleton */}
      <div className="w-56 bg-zinc-900/50 border-r border-zinc-800/60 flex flex-col shrink-0 p-5">
        <div className="h-5 w-24 bg-zinc-800 rounded mb-6 animate-pulse" />
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-8 w-full bg-zinc-800/50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>

      {/* Message List Skeleton */}
      <div className="w-96 border-r border-zinc-800/60 flex flex-col shrink-0">
        <div className="p-4 border-b border-zinc-800/60 flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-4 w-28 bg-zinc-800 rounded animate-pulse" />
            <div className="h-3 w-16 bg-zinc-800/60 rounded animate-pulse" />
          </div>
          <div className="h-8 w-8 bg-zinc-800 rounded-lg animate-pulse" />
        </div>
        <div className="p-3 space-y-3 flex-1 overflow-y-auto">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="p-4 rounded-xl border border-zinc-800/40 bg-zinc-900/30 space-y-2">
              <div className="flex justify-between items-center">
                <div className="h-3.5 w-24 bg-zinc-800 rounded animate-pulse" />
                <div className="h-3 w-12 bg-zinc-800/60 rounded animate-pulse" />
              </div>
              <div className="h-4 w-48 bg-zinc-800 rounded animate-pulse" />
              <div className="h-3.5 w-full bg-zinc-800/60 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* Detail Pane Skeleton */}
      <div className="flex-grow p-8 max-w-2xl mx-auto space-y-6">
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="h-4 w-12 bg-zinc-800 rounded animate-pulse" />
            <div className="h-4 w-16 bg-zinc-800/60 rounded animate-pulse" />
          </div>
          <div className="h-8 w-3/4 bg-zinc-800 rounded animate-pulse" />
          <div className="h-4 w-32 bg-zinc-800/60 rounded animate-pulse" />
        </div>
        <div className="h-24 w-full bg-zinc-900 border border-zinc-800 rounded-2xl animate-pulse" />
        <div className="space-y-3">
          <div className="h-4 w-24 bg-zinc-800 rounded animate-pulse" />
          <div className="h-32 w-full bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
        </div>
      </div>
    </div>
  )
}
