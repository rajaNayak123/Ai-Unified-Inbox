'use client'

import { useState, useRef, useEffect } from 'react'
import { RefreshCw, Mail, Hash } from 'lucide-react'

interface SyncButtonProps {
  onSyncGmail: () => void
  onSyncSlack: () => void
  syncing: boolean
}

export default function SyncButton({ onSyncGmail, onSyncSlack, syncing }: SyncButtonProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handle(e: any) {
      if (ref.current && !(ref.current as any).contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={syncing}
        className="group flex items-center gap-2 px-4 py-2 bg-white hover:bg-[#FAF8F5] text-[#6E645E] hover:text-[#221E1B] text-xs font-bold rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed border border-[#EFECE6] shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-[0_1px_2px_rgba(0,0,0,0.02)] cursor-pointer"
      >
        <RefreshCw className={`w-3.5 h-3.5 text-[#6E645E] transition-transform duration-500 ${syncing ? 'animate-spin text-amber-500' : 'group-hover:rotate-180'}`} />
        {syncing ? 'Syncing…' : 'Sync'}
      </button>

      {open && !syncing && (
        <div className="absolute right-0 top-11 z-20 bg-[#FAF8F5]/95 backdrop-blur-md border border-[#EFECE6] rounded-2xl shadow-xl overflow-hidden w-48 p-1 animate-in fade-in slide-in-from-top-2 duration-200">
          <button
            onClick={() => { onSyncGmail(); setOpen(false) }}
            className="w-full text-left px-3 py-2.5 text-xs font-semibold text-[#6E645E] hover:text-[#221E1B] hover:bg-[#F5EFEB]/50 rounded-xl transition-all flex items-center gap-3 cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-rose-50 flex items-center justify-center border border-rose-100">
              <Mail className="w-3.5 h-3.5 text-rose-500" />
            </div>
            Sync Gmail
          </button>
          <div className="border-t border-[#EFECE6]/60" />
          <button
            onClick={() => { onSyncSlack(); setOpen(false) }}
            className="w-full text-left px-3 py-2.5 text-xs font-semibold text-[#6E645E] hover:text-[#221E1B] hover:bg-[#F5EFEB]/50 rounded-xl transition-all flex items-center gap-3 mt-1 cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center border border-purple-100">
              <Hash className="w-3.5 h-3.5 text-purple-500" />
            </div>
            Sync Slack
          </button>
        </div>
      )}
    </div>
  )
}
