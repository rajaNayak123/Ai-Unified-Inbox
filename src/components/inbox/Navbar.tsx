import Link from 'next/link'
import { Settings } from 'lucide-react'

interface NavbarProps {
  user: any
  wsStatus: string
}

const WS_STATUS_COLOR: Record<string, string> = {
  connected:    'bg-emerald-400',
  disconnected: 'bg-red-400',
  connecting:   'bg-amber-400',
}

export default function Navbar({ user, wsStatus }: NavbarProps) {
  return (
    <div className="h-16 shrink-0 border-b border-stone-200/50 bg-white/20 backdrop-blur-md flex items-center justify-between px-6 z-30 shadow-[0_1px_10px_rgba(0,0,0,0.01)] relative">
      <div className="flex items-center gap-4">
        <div className="text-lg font-bold tracking-widest uppercase text-stone-800">
          Inbox<span className="text-amber-500">AI</span>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <span className={`w-2 h-2 rounded-full pulse-dot ${WS_STATUS_COLOR[wsStatus] || 'bg-stone-300'}`} />
          <span className="text-xs text-stone-500 capitalize">
            {wsStatus === 'connected' ? 'Live updates on' : wsStatus}
          </span>
        </div>
      </div>
      
      <div className="flex items-center gap-5">
        <Link
          href="/settings"
          className="text-stone-400 hover:text-stone-800 transition-all duration-300 hover:rotate-90 hover:scale-110"
          title="Settings"
        >
          <Settings className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-2 cursor-pointer hover:scale-110 transition-transform duration-300 active:scale-95">
          {user?.image ? (
            <img src={user.image} className="w-8 h-8 rounded-full shadow-sm hover:shadow-md transition-shadow" alt="" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-medium text-white shadow-sm uppercase hover:shadow-md transition-shadow">
              {user?.name?.[0] || user?.email?.[0] || 'U'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
