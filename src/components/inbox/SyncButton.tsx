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
        className="group flex items-center gap-2 px-4 py-2 bg-white hover:bg-stone-50 text-stone-700 text-sm font-medium rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed border border-stone-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm"
      >
        <RefreshCw className={`w-4 h-4 text-stone-500 transition-transform duration-500 ${syncing ? 'animate-spin text-amber-500' : 'group-hover:rotate-180'}`} />
        {syncing ? 'Syncing…' : 'Sync'}
      </button>

      {open && !syncing && (
        <div className="absolute right-0 top-11 z-20 bg-white/90 backdrop-blur-xl border border-stone-200/60 rounded-2xl shadow-2xl overflow-hidden w-48 p-1 animate-in fade-in slide-in-from-top-2 duration-200">
          <button
            onClick={() => { onSyncGmail(); setOpen(false) }}
            className="w-full text-left px-3 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-100 rounded-xl transition-all flex items-center gap-3"
          >
            <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center border border-red-100">
              <Mail className="w-3.5 h-3.5 text-red-500" />
            </div>
            Sync Gmail
          </button>
          <div className="border-t border-stone-100" />
          <button
            onClick={() => { onSyncSlack(); setOpen(false) }}
            className="w-full text-left px-3 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-100 rounded-xl transition-all flex items-center gap-3 mt-1"
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
