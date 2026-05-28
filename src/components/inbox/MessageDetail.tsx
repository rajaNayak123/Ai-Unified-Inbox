'use client'

import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { format } from 'date-fns'

const LABEL_COLOR: Record<string, string> = {
  URGENT: 'text-red-400',
  TODO:   'text-amber-400',
  FYI:    'text-blue-400',
  DONE:   'text-zinc-500',
}

const REVISION_SUGGESTIONS = [
  'Make it more concise',
  'Make it sound more urgent',
  'Add a professional closing',
  'Make it friendlier',
  'Ask to schedule a meeting',
]

interface MessageDetailProps {
  message: any
  onSendDraft:    (draftId: string, body: string) => Promise<void>
  onDiscardDraft: (draftId: string) => Promise<void>
  onToggleAction: (actionId: string, done: boolean) => Promise<void>
  // Called after a successful AI revision so InboxClient can sync its messages state
  onDraftRevised: (draftId: string, revisedBody: string) => void
}

export default function MessageDetail({ message, onSendDraft, onDiscardDraft, onToggleAction, onDraftRevised }: MessageDetailProps) {
  const [draftBody,    setDraftBody]    = useState(message.draft?.body || '')
  const [sending,      setSending]      = useState(false)
  const [instruction,  setInstruction]  = useState('')
  const [revising,     setRevising]     = useState(false)
  const [revisionErr,  setRevisionErr]  = useState('')
  const [flashNew,     setFlashNew]     = useState(false)
  // Undo history: stack of previous draft bodies
  const [history,      setHistory]      = useState<string[]>([])
  const instructionRef = useRef<HTMLInputElement>(null)

  // ── Sync textarea when switching messages or when socket flips draft SENT ──
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setDraftBody(message.draft?.body || '')
    setHistory([])
    setInstruction('')
    setRevisionErr('')
  }, [message.id, message.draft?.status, message.draft?.body])
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Draft status helpers ──
  const hasPendingDraft = message.draft && (
    message.draft.status === 'PENDING' || message.draft.status === 'APPROVED'
  )
  const isSent      = message.draft?.status === 'SENT'
  const isDiscarded = message.draft?.status === 'DISCARDED'

  // ── Send ──
  async function handleSend() {
    setSending(true)
    try {
      await onSendDraft(message.draft.id, draftBody)
    } finally {
      setSending(false)
    }
  }

  // ── AI Revision ──
  async function handleRevise() {
    const trimmed = instruction.trim()
    // Prevent concurrent send + revise
    if (!trimmed || revising || sending) return
    setRevising(true)
    setRevisionErr('')
    try {
      const res = await fetch(`/api/draft/${message.draft.id}/revise`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ instruction: trimmed, currentBody: draftBody }),
      })
      const data = await res.json()
      if (data.error) {
        setRevisionErr(data.error)
        return
      }
      // Push current body to undo stack before applying revision
      setHistory((h) => [...h, draftBody])
      setDraftBody(data.revised)
      setInstruction('')
      // Flash the textarea to signal new content
      setFlashNew(true)
      setTimeout(() => setFlashNew(false), 700)
      // Notify InboxClient so other parts of the UI (message list, etc.) stay consistent
      onDraftRevised(message.draft.id, data.revised)
    } catch {
      setRevisionErr('Network error — please try again.')
    } finally {
      setRevising(false)
    }
  }

  function handleInstructionKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleRevise()
    }
    if (e.key === 'Escape') {
      setInstruction('')
      setRevisionErr('')
    }
  }

  function handleUndo() {
    if (!history.length) return
    const prev = history[history.length - 1]
    setHistory((h) => h.slice(0, -1))
    setDraftBody(prev)
  }

  function applySuggestion(s: string) {
    setInstruction(s)
    instructionRef.current?.focus()
  }

  const wordCount = draftBody.trim() ? draftBody.trim().split(/\s+/).length : 0

  return (
    <div className="max-w-2xl mx-auto p-8 animate-slide-in">

      {/* ── Header ── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className={`text-xs font-mono uppercase tracking-widest font-semibold ${LABEL_COLOR[message.label] || 'text-zinc-500'}`}>
            {message.label?.toLowerCase() || 'processing'}
          </span>
          <span className="text-zinc-700 text-xs">·</span>
          <span className="text-xs text-zinc-600 font-mono">{message.source}</span>
          <span className="text-zinc-700 text-xs">·</span>
          <span className="text-xs text-zinc-600">
            {format(new Date(message.receivedAt), 'MMM d, yyyy · h:mm a')}
          </span>
        </div>

        <h2 className="text-xl font-semibold text-zinc-100 mb-2 leading-snug">
          {message.subject || '(no subject)'}
        </h2>
        <p className="text-sm text-zinc-500">
          From: <span className="text-zinc-300">{message.from}</span>
        </p>

        {/* AI Summary */}
        {message.summary && message.label !== 'UNPROCESSED' && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50">
            <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest mb-1">AI Summary</p>
            <p className="text-sm text-zinc-300">{message.summary}</p>
          </div>
        )}
      </div>

      {/* ── Action Items ── */}
      {message.actionItems?.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-3">Action items</h3>
          <div className="space-y-2">
            {message.actionItems.map((action: any) => (
              <div
                key={action.id}
                className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                  action.done
                    ? 'bg-zinc-900/30 border-zinc-800/40 opacity-50'
                    : 'bg-amber-500/5 border-amber-500/20'
                }`}
              >
                <button
                  onClick={() => onToggleAction(action.id, !action.done)}
                  className={`w-5 h-5 rounded border mt-0.5 shrink-0 flex items-center justify-center transition-all ${
                    action.done
                      ? 'bg-zinc-700 border-zinc-600 text-zinc-400 cursor-pointer'
                      : 'border-amber-500/40 hover:bg-amber-500/20 cursor-pointer'
                  }`}
                >
                  {action.done && <span className="text-xs">✓</span>}
                </button>
                <div className="min-w-0">
                  <p className={`text-sm ${action.done ? 'line-through text-zinc-600' : 'text-zinc-200'}`}>
                    {action.task}
                  </p>
                  {action.deadline && (
                    <p className="text-xs text-amber-500/70 mt-0.5">Due: {action.deadline}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Original message body ── */}
      <div className="mb-6">
        <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-3">Message</h3>
        <div className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap font-mono bg-zinc-900/40 rounded-xl p-5 border border-zinc-800/60 max-h-56 overflow-y-auto">
          {message.body || '(empty body)'}
        </div>
      </div>

      {/* ── Interactive Draft Editing Panel ── */}
      {hasPendingDraft && (
        <div className="border border-amber-500/20 rounded-2xl overflow-hidden bg-amber-500/5">

          {/* Panel header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-amber-500/10">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-amber-400 uppercase tracking-widest">AI Draft Reply</span>
              {history.length > 0 && (
                <span className="text-xs text-zinc-600 font-mono">· {history.length} revision{history.length !== 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-600 font-mono">{wordCount} words</span>
              {history.length > 0 && (
                <button
                  onClick={handleUndo}
                  title="Undo last revision"
                  className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors flex items-center gap-1 font-mono"
                >
                  ↩ Undo
                </button>
              )}
              <span className="text-xs text-zinc-700 font-mono">groq / llama-3.1-8b-instant</span>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Draft textarea */}
            <textarea
              id={`draft-body-${message.draft.id}`}
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              rows={5}
              className={`w-full bg-zinc-900/60 border rounded-xl p-3 text-sm text-zinc-200 resize-none focus:outline-none transition-all duration-300 font-mono ${
                flashNew
                  ? 'border-amber-400/70 shadow-[0_0_12px_rgba(251,191,36,0.15)]'
                  : 'border-zinc-700/60 focus:border-amber-500/50'
              }`}
              placeholder="Edit draft before sending…"
            />

            {/* ── AI Revision Row ── */}
            <div className="space-y-2">
              <label
                htmlFor={`revise-instruction-${message.draft.id}`}
                className="text-xs text-zinc-500 font-mono uppercase tracking-widest"
              >
                Revise with AI
              </label>

              {/* Quick-suggestion chips */}
              <div className="flex flex-wrap gap-1.5">
                {REVISION_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => applySuggestion(s)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                      instruction === s
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                        : 'bg-zinc-800/60 border-zinc-700/50 text-zinc-400 hover:border-amber-500/30 hover:text-zinc-200'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Instruction input + button */}
              <div className="flex gap-2">
                <input
                  ref={instructionRef}
                  id={`revise-instruction-${message.draft.id}`}
                  type="text"
                  value={instruction}
                  onChange={(e) => { setInstruction(e.target.value); setRevisionErr('') }}
                  onKeyDown={handleInstructionKeyDown}
                  disabled={revising}
                  placeholder='e.g. "Make it sound more urgent" — press Enter'
                  className="flex-1 bg-zinc-900/60 border border-zinc-700/50 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 transition-colors disabled:opacity-50 font-mono"
                />
                <button
                  onClick={handleRevise}
                  disabled={!instruction.trim() || revising || sending}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed border border-zinc-700/60 hover:border-amber-500/30 text-zinc-200 text-sm font-semibold rounded-xl transition-all flex items-center gap-2 whitespace-nowrap"
                >
                  {revising ? (
                    <>
                      <span className="inline-block w-3 h-3 border-2 border-amber-400/40 border-t-amber-400 rounded-full animate-spin" />
                      Revising…
                    </>
                  ) : (
                    <>✦ Revise</>
                  )}
                </button>
              </div>

              {/* Error */}
              {revisionErr && (
                <p className="text-xs text-red-400 font-mono">{revisionErr}</p>
              )}

              {/* Revising overlay hint */}
              {revising && (
                <p className="text-xs text-amber-400/60 font-mono animate-pulse">
                  AI is rewriting the draft…
                </p>
              )}
            </div>

            {/* ── Action buttons ── */}
            <div className="flex items-center gap-2 pt-1 border-t border-amber-500/10">
              <button
                onClick={handleSend}
                disabled={sending || revising || !draftBody.trim()}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 text-sm font-bold rounded-xl transition-all flex items-center gap-2"
              >
                {sending ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-zinc-800/40 border-t-zinc-800 rounded-full animate-spin" />
                    Sending…
                  </>
                ) : (
                  `Send via ${message.source === 'GMAIL' ? 'Gmail' : 'Slack'}`
                )}
              </button>
              <button
                onClick={() => onDiscardDraft(message.draft.id)}
                disabled={revising || sending}
                className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sent confirmation ── */}
      {isSent && (
        <div className="border border-emerald-500/20 rounded-2xl p-4 bg-emerald-500/5">
          <p className="text-sm text-emerald-400 flex items-center gap-2">
            <span>✓</span> Reply sent via {message.source === 'GMAIL' ? 'Gmail' : 'Slack'}
          </p>
        </div>
      )}

      {/* ── Discarded notice ── */}
      {isDiscarded && (
        <div className="border border-zinc-700/40 rounded-2xl p-4 bg-zinc-900/30">
          <p className="text-sm text-zinc-600 flex items-center gap-2">
            <span>✕</span> Draft was discarded
          </p>
        </div>
      )}

      {/* ── Processing state ── */}
      {message.label === 'UNPROCESSED' && (
        <div className="border border-zinc-700/40 rounded-2xl p-4 bg-zinc-900/30">
          <p className="text-sm text-zinc-500 flex items-center gap-2">
            <span className="animate-spin inline-block">⟳</span>
            AI agents are processing this message through the Kafka pipeline…
          </p>
        </div>
      )}
    </div>
  )
}
