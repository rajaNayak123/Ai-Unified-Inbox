'use client'

import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import MessageList   from './MessageList'
import MessageDetail from './MessageDetail'
import Sidebar       from './Sidebar'
import StatsBar      from './StatsBar'
import SyncButton    from './SyncButton'

interface InboxClientProps {
  initialMessages: any[]
  stats: Record<string, number>
  user: {
    id: string
    name?: string | null
    email?: string | null
    image?: string | null
    connectedProviders?: string[]
  }
}

export default function InboxClient({ initialMessages, stats: initialStats, user }: InboxClientProps) {
  const [messages, setMessages] = useState<any[]>(initialMessages)
  const [selected, setSelected] = useState<any>(null)
  const [filter,   setFilter]   = useState('ALL')
  const [stats,    setStats]    = useState<Record<string, number>>(initialStats)
  const [wsStatus, setWsStatus] = useState('connecting')
  const [syncing,  setSyncing]  = useState(false)
  const [toast,    setToast]    = useState<{msg: string, type: string} | null>(null)

  // Toast helper
  function showToast(msg: string, type = 'info') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // WebSocket connects to worker server
  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001'
    const socket = io(wsUrl, { transports: ['websocket', 'polling'] })

    socket.on('connect', () => {
      socket.emit('subscribe', user.id)
      setWsStatus('connected')
    })
    socket.on('disconnect', () => setWsStatus('disconnected'))
    socket.on('connect_error', () => setWsStatus('disconnected'))

    // New message arrives from Kafka pipeline
    socket.on('message:new', (msg: any) => {
      setMessages((prev) => {
        const exists = prev.find((m) => m.id === msg.id)
        if (exists) return prev.map((m) => (m.id === msg.id ? msg : m))
        return [msg, ...prev]
      })
      setStats((prev) => ({
        ...prev,
        total: prev.total + 1,
        [msg.label?.toLowerCase()]: (prev[msg.label?.toLowerCase()] || 0) + 1,
      }))
      showToast(`New ${msg.source === 'GMAIL' ? 'email' : 'Slack message'}: ${msg.subject || msg.summary || '…'}`)
    })

    return () => {
      socket.disconnect()
    }
  }, [user.id])

  // Sync handlers
  async function syncGmail() {
    setSyncing(true)
    try {
      const res  = await fetch('/api/gmail', { method: 'POST' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      showToast(`Queued ${data.queued} new Gmail threads for AI processing`, 'success')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      showToast(`Gmail sync failed: ${errorMessage}`, 'error')
    } finally {
      setSyncing(false)
    }
  }

  async function syncSlack() {
    setSyncing(true)
    try {
      const res  = await fetch('/api/slack', { method: 'POST' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      showToast(`Queued ${data.queued} new Slack messages for AI processing`, 'success')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      showToast(`Slack sync failed: ${errorMessage}`, 'error')
    } finally {
      setSyncing(false)
    }
  }

  // Draft actions 
  async function sendDraft(draftId: string, editedBody: string) {
    const res = await fetch(`/api/drafts/${draftId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: editedBody }),
    })
    const data = await res.json()
    if (data.error) { showToast(data.error, 'error'); return }

    setMessages((prev: any[]) =>
      prev.map((m: any) =>
        m.draft?.id === draftId
          ? { ...m, label: 'DONE', draft: { ...m.draft, status: 'SENT' } }
          : m
      )
    )
    setSelected((s: any) =>
      s?.draft?.id === draftId ? { ...s, label: 'DONE', draft: { ...s.draft, status: 'SENT' } } : s
    )
    showToast('Reply sent!', 'success')
  }

  async function discardDraft(draftId: string) {
    await fetch(`/api/drafts/${draftId}`, { method: 'DELETE' })
    setMessages((prev: any[]) =>
      prev.map((m: any) => (m.draft?.id === draftId ? { ...m, draft: null } : m))
    )
    setSelected((s: any) => (s?.draft?.id === draftId ? { ...s, draft: null } : s))
  }

  async function markActionDone(actionId: string) {
    await fetch(`/api/actions/${actionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: true }),
    })
    const updater = (m: any) => ({
      ...m,
      actionItems: m.actionItems?.map((a: any) => (a.id === actionId ? { ...a, done: true } : a)),
    })
    setMessages((prev: any[]) => prev.map(updater))
    setSelected((s: any) => (s ? updater(s) : s))
  }

  // Filter logic 
  const filtered = messages.filter((m: any) => {
    if (filter === 'ALL')   return true
    if (filter === 'GMAIL') return m.source === 'GMAIL'
    if (filter === 'SLACK') return m.source === 'SLACK'
    return m.label === filter
  })

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      <Sidebar
        filter={filter}
        setFilter={setFilter}
        stats={stats}
        user={user}
        wsStatus={wsStatus}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="w-96 border-r border-zinc-800/60 flex flex-col shrink-0">
          <div className="p-4 border-b border-zinc-800/60 flex items-center justify-between">
            <div>
              <h1 className="text-sm font-semibold tracking-wide uppercase text-zinc-400">
                {filter === 'ALL' ? 'All Messages' : filter.charAt(0) + filter.slice(1).toLowerCase()}
              </h1>
              <p className="text-xs text-zinc-600 mt-0.5">{filtered.length} items</p>
            </div>
            <SyncButton onSyncGmail={syncGmail} onSyncSlack={syncSlack} syncing={syncing} />
          </div>

          <StatsBar stats={stats} />

          <div className="flex-1 overflow-y-auto">
            <MessageList
              messages={filtered}
              selected={selected}
              onSelect={setSelected}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {selected ? (
            <MessageDetail
              message={selected}
              onSendDraft={sendDraft}
              onDiscardDraft={discardDraft}
              onMarkActionDone={markActionDone}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-zinc-700">
                <div className="text-5xl mb-4">⌘</div>
                <p className="text-sm">Select a message to read</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl text-sm shadow-xl border animate-slide-in z-50 max-w-sm ${
          toast.type === 'success' ? 'bg-emerald-900/80 border-emerald-500/30 text-emerald-300' :
          toast.type === 'error'   ? 'bg-red-900/80 border-red-500/30 text-red-300' : 'bg-zinc-800 border-zinc-700 text-zinc-300'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
