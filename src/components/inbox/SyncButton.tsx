'use client'

import { useState, useRef, useEffect } from 'react'

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
        className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-zinc-700"
      >
        <span className={syncing ? 'animate-spin' : 'transition-transform'}>↻</span>
        {syncing ? 'Syncing…' : 'Sync'}
      </button>

      {open && !syncing && (
        <div className="absolute right-0 top-9 z-20 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden w-44">
          <button
            onClick={() => { onSyncGmail(); setOpen(false) }}
            className="w-full text-left px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors flex items-center gap-2.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.907 1.528-1.147C21.69 2.28 24 3.434 24 5.457z"/>
            </svg>
            Sync Gmail
          </button>
          <div className="border-t border-zinc-700" />
          <button
            onClick={() => { onSyncSlack(); setOpen(false) }}
            className="w-full text-left px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors flex items-center gap-2.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#A855F7">
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
            </svg>
            Sync Slack
          </button>
        </div>
      )}
    </div>
  )
}
