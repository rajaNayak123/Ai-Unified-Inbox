import Link from 'next/link'
import { Settings } from 'lucide-react'

interface NavbarProps {
  user: any
  wsStatus: string
}

const WS_STATUS_COLOR: Record<string, string> = {
  connected:    'bg-emerald-500',
  disconnected: 'bg-rose-500',
  connecting:   'bg-amber-500',
}

export default function Navbar({ user, wsStatus }: NavbarProps) {
  return (
    <div className="h-16 shrink-0 border-b border-[#EFECE6] bg-[#FAF8F5]/90 backdrop-blur-md flex items-center justify-between px-6 z-30 shadow-[0_1px_4px_rgba(34,30,27,0.02)] relative">
      <div className="flex items-center gap-4">
        <div className="text-md font-bold tracking-wider uppercase text-[#221E1B] flex items-center gap-1 font-mono">
          <span>INBOX</span>
          <span className="bg-amber-100/80 text-amber-700 text-[10px] px-1.5 py-0.5 rounded-md font-sans font-bold tracking-normal">AI</span>
        </div>
        <div className="flex items-center gap-2 ml-4 px-2.5 py-1 rounded-full bg-[#FAF8F5] border border-[#EFECE6]/60">
          <span className={`w-2 h-2 rounded-full ${wsStatus === 'connected' ? 'animate-pulse' : ''} ${WS_STATUS_COLOR[wsStatus] || 'bg-stone-300'}`} />
          <span className="text-[11px] text-[#6E645E] font-medium font-sans">
            {wsStatus === 'connected' ? 'Live updates' : wsStatus}
          </span>
        </div>
      </div>
      
      <div className="flex items-center gap-5">
        <Link
          href="/settings"
          className="text-[#6E645E] hover:text-[#221E1B] transition-all duration-300 hover:rotate-90 hover:scale-105"
          title="Settings"
        >
          <Settings className="w-4.5 h-4.5" />
        </Link>
        <div className="flex items-center gap-2 cursor-pointer hover:scale-105 transition-transform duration-300 active:scale-95">
          {user?.image ? (
            <img src={user.image} className="w-7 h-7 rounded-full shadow-sm hover:shadow-md transition-shadow border border-[#EFECE6]" alt="" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-amber-700 flex items-center justify-center text-xs font-semibold text-[#FAF8F5] shadow-sm uppercase hover:shadow-md transition-shadow">
              {user?.name?.[0] || user?.email?.[0] || 'U'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
