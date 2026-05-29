'use client'

import { useState, useEffect, useMemo } from 'react'
import { io } from 'socket.io-client'
import MessageList   from './MessageList'
import MessageDetail from './MessageDetail'
import Sidebar       from './Sidebar'
import StatsBar      from './StatsBar'
import SyncButton    from './SyncButton'

interface InboxClientProps {
  wsUrl: string
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

export default function InboxClient({ initialMessages, stats: initialStats, user, wsUrl }: InboxClientProps) {
  const [messages, setMessages] = useState<any[]>(initialMessages)
  const [actionItemsMap, setActionItemsMap] = useState<Record<string, any>>(() => {
    const acc: Record<string, any> = {}
    initialMessages.forEach((m) => {
      if (m.actionItems && Array.isArray(m.actionItems)) {
        m.actionItems.forEach((a: any) => {
          acc[a.id] = {
            ...a,
            messageSubject: m.subject || m.summary || "No Subject",
            messageSource: m.source,
          }
        })
      }
    })
    return acc
  })
  const [selected, setSelected] = useState<any>(null)
  const [filter,   setFilter]   = useState('ALL')
  
  const [hasMore, setHasMore] = useState(initialMessages.length >= 50)
  const [loadingMore, setLoadingMore] = useState(false)

  const stats = useMemo(() => ({
    urgent: messages.filter((m) => m.label === 'URGENT').length,
    todo:   messages.filter((m) => m.label === 'TODO').length,
    fyi:    messages.filter((m) => m.label === 'FYI').length,
    total:  messages.length,
  }), [messages])
  const [wsStatus, setWsStatus] = useState('connecting')
  const [syncing,  setSyncing]  = useState(false)
  const [toast,    setToast]    = useState<{msg: string, type: string} | null>(null)
  const [socket,   setSocket]   = useState<any>(null)

  // Toast helper
  function showToast(msg: string, type = 'info') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // WebSocket connects to worker server
  useEffect(() => {
    const s = io(wsUrl, { transports: ['websocket', 'polling'] })
    setSocket(s)

    s.on('connect', () => {
      s.emit('subscribe', user.id)
      setWsStatus('connected')
    })
    s.on('disconnect', () => setWsStatus('disconnected'))
    s.on('connect_error', () => setWsStatus('disconnected'))

    // New message arrives from Kafka pipeline
    s.on('message:new', (msg: any) => {
      setMessages((prev) => {
        const exists = prev.find((m) => m.id === msg.id || m.externalId === msg.externalId)
        if (exists) {
          return prev.map((m) => (m.id === msg.id || m.externalId === msg.externalId ? msg : m))
        }
        return [msg, ...prev]
      })
      if (msg.actionItems && Array.isArray(msg.actionItems)) {
        setActionItemsMap((prev) => {
          const next = { ...prev }
          msg.actionItems.forEach((a: any) => {
            next[a.id] = {
              ...a,
              messageSubject: msg.subject || msg.summary || "No Subject",
              messageSource: msg.source,
            }
          })
          return next
        })
      }
      setSelected((prev: any) => (prev?.id === msg.id || prev?.externalId === msg.externalId ? msg : prev))
      showToast(`New ${msg.source === 'GMAIL' ? 'email' : 'Slack message'}: ${msg.subject || msg.summary || '…'}`)
    })

    // Action toggled event received from Socket.IO (broadcast sync)
    s.on('action:updated', (action: any) => {
      setActionItemsMap((prev) => {
        if (!prev[action.id]) return prev
        return { ...prev, [action.id]: { ...prev[action.id], done: action.done } }
      })
      const updater = (m: any) => ({
        ...m,
        actionItems: m.actionItems?.map((a: any) => (a.id === action.id ? { ...a, done: action.done } : a)),
      })
      setMessages((prev: any[]) => prev.map(updater))
      setSelected((s: any) => (s?.actionItems?.some((a: any) => a.id === action.id) ? updater(s) : s))
    })

    // Draft sent in another tab — apply DONE/SENT state here too
    s.on('draft:sent', ({ draftId, messageId }: { draftId: string; messageId: string }) => {
      const sentUpdater = (m: any) =>
        m.draft?.id === draftId
          ? { ...m, label: 'DONE', draft: { ...m.draft, status: 'SENT' } }
          : m
      setMessages((prev: any[]) => prev.map(sentUpdater))
      setSelected((sel: any) => (sel?.draft?.id === draftId ? sentUpdater(sel) : sel))
    })

    // Draft discarded in another tab
    s.on('draft:discarded', ({ draftId }: { draftId: string }) => {
      const discardUpdater = (m: any) =>
        m.draft?.id === draftId ? { ...m, draft: { ...m.draft, status: 'DISCARDED' } } : m
      setMessages((prev: any[]) => prev.map(discardUpdater))
      setSelected((sel: any) => (sel?.draft?.id === draftId ? discardUpdater(sel) : sel))
    })

    return () => {
      s.disconnect()
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
    const res = await fetch(`/api/draft/${draftId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: editedBody }),
    })
    const data = await res.json()
    if (data.error) { showToast(data.error, 'error'); return }

    // Optimistic local update
    const sentUpdater = (m: any) =>
      m.draft?.id === draftId
        ? { ...m, label: 'DONE', draft: { ...m.draft, status: 'SENT' } }
        : m
    setMessages((prev: any[]) => prev.map(sentUpdater))
    setSelected((s: any) => (s?.draft?.id === draftId ? sentUpdater(s) : s))

    // Broadcast to all other open tabs via Socket.IO
    if (socket && data.userId) {
      socket.emit('draft:sent', {
        draftId,
        messageId: data.messageId,
        userId: data.userId,
      })
    }

    showToast('Reply sent!', 'success')
  }

  async function discardDraft(draftId: string) {
    const res = await fetch(`/api/draft/${draftId}`, { method: 'DELETE' })
    if (!res.ok) { showToast('Failed to discard draft', 'error'); return }

    const discardUpdater = (m: any) =>
      m.draft?.id === draftId ? { ...m, draft: { ...m.draft, status: 'DISCARDED' } } : m
    setMessages((prev: any[]) => prev.map(discardUpdater))
    setSelected((s: any) => (s?.draft?.id === draftId ? discardUpdater(s) : s))

    // Broadcast discard to all other open tabs
    if (socket) {
      socket.emit('draft:discarded', { draftId, userId: user.id })
    }
  }

  // Sync revised draft body into messages state so the in-memory draft matches DB
  function handleDraftRevised(draftId: string, revisedBody: string) {
    const updater = (m: any) =>
      m.draft?.id === draftId ? { ...m, draft: { ...m.draft, body: revisedBody } } : m
    setMessages((prev: any[]) => prev.map(updater))
    // Note: selected state has its own draftBody local state in MessageDetail;
    // we still update selected so switching away and back shows the latest body.
    setSelected((s: any) => (s?.draft?.id === draftId ? updater(s) : s))
  }

  async function toggleActionStatus(actionId: string, done: boolean) {
    // Latency compensation: optimistic local state update
    setActionItemsMap((prev) => {
      if (!prev[actionId]) return prev
      return { ...prev, [actionId]: { ...prev[actionId], done } }
    })
    const updater = (m: any) => ({
      ...m,
      actionItems: m.actionItems?.map((a: any) => (a.id === actionId ? { ...a, done } : a)),
    })
    setMessages((prev: any[]) => prev.map(updater))
    setSelected((s: any) => (s?.id ? updater(s) : s))

    try {
      // 1. Instantly update database via HTTP PATCH to ensure reliability
      await fetch(`/api/actions/${actionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done }),
      })

      // 2. Emit Socket.IO event so the worker broadcasts this update to all other open tabs
      if (socket) {
        socket.emit('action:toggle', { actionId, userId: user.id, done })
      }
    } catch (err) {
      console.error('[client] Failed to toggle action status:', err)
      showToast('Failed to update task status.', 'error')
      // Rollback optimistic update
      setActionItemsMap((prev) => {
        if (!prev[actionId]) return prev
        return { ...prev, [actionId]: { ...prev[actionId], done: !done } }
      })
      const rollback = (m: any) => ({
        ...m,
        actionItems: m.actionItems?.map((a: any) => (a.id === actionId ? { ...a, done: !done } : a)),
      })
      setMessages((prev: any[]) => prev.map(rollback))
      setSelected((s: any) => (s?.id ? rollback(s) : s))
    }
  }

    // Extract all action items across messages
  const allActionItems = useMemo(() => Object.values(actionItemsMap), [actionItemsMap])

  async function loadMoreMessages() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    
    const params = new URLSearchParams()
    if (filter === 'GMAIL') params.set('source', 'GMAIL')
    else if (filter === 'SLACK') params.set('source', 'SLACK')
    else if (filter !== 'ALL') params.set('label', filter)
    
    // Find the oldest message that matches the current filter to use as cursor
    const filteredMsgs = messages.filter((m: any) => {
      if (filter === 'ALL')   return true
      if (filter === 'GMAIL') return m.source === 'GMAIL'
      if (filter === 'SLACK') return m.source === 'SLACK'
      return m.label === filter
    })
    
    const lastMsg = filteredMsgs[filteredMsgs.length - 1]
    if (lastMsg) {
      params.set('cursor', lastMsg.id)
    }

    try {
      const res = await fetch(`/api/messages?${params.toString()}`)
      const data = await res.json()
      
      if (data.error) throw new Error(data.error)
      
      if (data.length < 50) {
        setHasMore(false)
      }

      setMessages((prev) => {
        const existingIds = new Set(prev.map(m => m.id))
        const newMsgs = data.filter((m: any) => !existingIds.has(m.id))
        const combined = [...prev, ...newMsgs]
        combined.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
        return combined
      })

      // Add new action items from fetched messages
      const newActionItems: any[] = []
      data.forEach((m: any) => {
        if (m.actionItems && Array.isArray(m.actionItems)) {
          m.actionItems.forEach((a: any) => {
            newActionItems.push({
              ...a,
              messageSubject: m.subject || m.summary || "No Subject",
              messageSource: m.source,
            })
          })
        }
      })
      
      if (newActionItems.length > 0) {
        setActionItemsMap((prev) => {
          const next = { ...prev }
          newActionItems.forEach((a) => {
            if (!next[a.id]) next[a.id] = a
          })
          return next
        })
      }
    } catch (err) {
      showToast('Failed to load older messages', 'error')
    } finally {
      setLoadingMore(false)
    }
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
        actionItems={allActionItems}
        onToggleAction={toggleActionStatus}
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
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={loadMoreMessages}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {selected ? (
            <MessageDetail
              message={selected}
              onSendDraft={sendDraft}
              onDiscardDraft={discardDraft}
              onToggleAction={toggleActionStatus}
              onDraftRevised={handleDraftRevised}
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
