'use client'

import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { format } from 'date-fns'

const LABEL_COLOR: Record<string, string> = {
  URGENT: 'text-rose-600',
  TODO:   'text-amber-600',
  FYI:    'text-blue-600',
  DONE:   'text-[#6E645E]',
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
    <div className="max-w-5xl mx-auto p-8 sm:p-10 bg-white m-4 rounded-[2rem] border border-[#EFECE6] min-h-[calc(100%-2rem)] shadow-[0_4px_20px_rgba(34,30,27,0.02)]">

      {/* ── Header ── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 flex-wrap mb-3 font-mono">
          <span className={`text-[11px] uppercase tracking-widest font-bold ${LABEL_COLOR[message.label] || 'text-stone-500'}`}>
            {message.label?.toLowerCase() || 'processing'}
          </span>
          <span className="text-[#EFECE6] text-xs">·</span>
          <span className="text-[11px] text-[#6E645E] font-medium">{message.source}</span>
          <span className="text-[#EFECE6] text-xs">·</span>
          <span className="text-[11px] text-[#6E645E]">
            {format(new Date(message.receivedAt), 'MMM d, yyyy · h:mm a')}
          </span>
        </div>

        <h2 className="text-xl font-extrabold text-[#221E1B] mb-2 leading-snug tracking-tight font-sans">
          {message.subject || '(no subject)'}
        </h2>
        <p className="text-xs text-[#6E645E] font-sans">
          From: <span className="font-semibold text-[#221E1B]">{message.from}</span>
        </p>

        {/* AI Summary */}
        {message.summary && message.label !== 'UNPROCESSED' && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-[#FAF8F5] border border-[#EFECE6] shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
            <p className="text-[9px] text-[#6E645E]/80 font-mono font-bold uppercase tracking-wider mb-1">AI Summary</p>
            <p className="text-xs text-[#221E1B] leading-relaxed font-sans font-medium">{message.summary}</p>
          </div>
        )}
      </div>

      {/* ── Action Items ── */}
      {message.actionItems?.length > 0 && (
        <div className="mb-6">
          <h3 className="text-[10px] font-mono font-bold text-[#6E645E]/80 uppercase tracking-widest mb-3">Checklist extracted by AI</h3>
          <div className="space-y-2">
            {message.actionItems.map((action: any) => (
              <div
                key={action.id}
                className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                  action.done
                    ? 'bg-[#FAF8F5]/80 border-[#EFECE6] opacity-60'
                    : 'bg-white border-[#EFECE6] shadow-[0_1px_3px_rgba(0,0,0,0.02)]'
                }`}
              >
                <button
                  onClick={() => onToggleAction(action.id, !action.done)}
                  className={`w-4.5 h-4.5 rounded-md border mt-0.5 shrink-0 flex items-center justify-center transition-all ${
                    action.done
                      ? 'bg-amber-100 border-amber-300 text-amber-800 font-bold cursor-pointer'
                      : 'border-stone-300 hover:border-amber-400 hover:bg-[#FAF8F5] bg-white cursor-pointer'
                  }`}
                >
                  {action.done && <span className="text-[10px]">✓</span>}
                </button>
                <div className="min-w-0">
                  <p className={`text-xs leading-normal ${action.done ? 'line-through text-[#6E645E]' : 'font-semibold text-[#221E1B]'}`}>
                    {action.task}
                  </p>
                  {action.deadline && (
                    <p className="text-[10px] font-semibold text-amber-700/80 mt-0.5 font-mono">📅 Due: {action.deadline}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Original message body ── */}
      <div className="mb-6">
        <h3 className="text-[10px] font-mono font-bold text-[#6E645E]/80 uppercase tracking-widest mb-2.5">Original message</h3>
        <div className="text-xs text-[#221E1B] leading-relaxed whitespace-pre-wrap font-mono bg-[#FAF8F5]/50 shadow-[inset_0_1px_2px_rgba(34,30,27,0.01)] rounded-xl p-5 border border-[#EFECE6]/80 max-h-96 overflow-y-auto">
          {message.body || '(empty body)'}
        </div>
      </div>

      {/* ── Interactive Draft Editing Panel ── */}
      {hasPendingDraft && (
        <div className="border border-amber-200/50 rounded-3xl overflow-hidden bg-[#FAF7F2] shadow-[0_8px_24px_rgba(217,119,6,0.04)]">

          {/* Panel header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-amber-200/30">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-amber-800 uppercase tracking-widest font-bold">AI Draft Reply</span>
              {history.length > 0 && (
                <span className="text-[10px] text-[#6E645E] font-mono">· {history.length} revision{history.length !== 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-[#6E645E] font-mono">{wordCount} words</span>
              {history.length > 0 && (
                <button
                  onClick={handleUndo}
                  title="Undo last revision"
                  className="text-[10px] text-amber-700 hover:text-amber-900 transition-colors flex items-center gap-1 font-semibold font-mono"
                >
                  ↩ Undo
                </button>
              )}
              <span className="text-[10px] text-[#6E645E] font-mono">llama-3.1-8b</span>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Draft textarea */}
            <textarea
              id={`draft-body-${message.draft.id}`}
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              rows={6}
              className={`w-full bg-white border rounded-xl p-4 text-xs text-[#221E1B] leading-relaxed resize-none focus:outline-none transition-all duration-300 font-mono shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)] ${
                flashNew
                  ? 'border-amber-400 ring-2 ring-amber-400/20 shadow-[0_0_12px_rgba(251,191,36,0.25)]'
                  : 'border-amber-200/80 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/10'
              }`}
              placeholder="Edit draft before sending…"
            />

            {/* ── AI Revision Row ── */}
            <div className="space-y-2.5">
              <label
                htmlFor={`revise-instruction-${message.draft.id}`}
                className="text-[9px] text-[#6E645E] font-mono uppercase tracking-widest font-bold"
              >
                Revise with AI Instruction
              </label>

              {/* Quick-suggestion chips */}
              <div className="flex flex-wrap gap-1.5">
                {REVISION_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => applySuggestion(s)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all ${
                      instruction === s
                        ? 'bg-amber-100 border-amber-300 text-amber-800'
                        : 'bg-white border-[#EFECE6] text-[#6E645E] hover:border-amber-300 hover:text-amber-800'
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
                  className="flex-1 bg-white border border-[#EFECE6] shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)] rounded-xl px-3 py-2 text-xs text-[#221E1B] placeholder-[#6E645E]/50 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/10 transition-all disabled:opacity-50 font-mono"
                />
                <button
                  onClick={handleRevise}
                  disabled={!instruction.trim() || revising || sending}
                  className="px-4 py-2 bg-white hover:bg-[#FAF8F5] disabled:opacity-40 disabled:cursor-not-allowed border border-[#EFECE6] text-[#6E645E] hover:text-[#221E1B] text-xs font-bold rounded-xl transition-all flex items-center gap-2 whitespace-nowrap shadow-[0_1px_2px_rgba(0,0,0,0.02)] cursor-pointer"
                >
                  {revising ? (
                    <>
                      <span className="inline-block w-3 h-3 border-2 border-stone-300 border-t-amber-600 rounded-full animate-spin" />
                      Revising…
                    </>
                  ) : (
                    <>✦ Revise</>
                  )}
                </button>
              </div>

              {/* Error */}
              {revisionErr && (
                <p className="text-xs text-rose-600 font-semibold font-mono">{revisionErr}</p>
              )}

              {/* Revising overlay hint */}
              {revising && (
                <p className="text-xs text-amber-700/80 font-mono animate-pulse">
                  AI is rewriting the draft…
                </p>
              )}
            </div>

            {/* ── Action buttons ── */}
            <div className="flex items-center gap-2 pt-1.5 border-t border-amber-200/30">
              <button
                onClick={handleSend}
                disabled={sending || revising || !draftBody.trim()}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-sm text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer"
              >
                {sending ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-amber-200 border-t-white rounded-full animate-spin" />
                    Sending…
                  </>
                ) : (
                  `Send via ${message.source === 'GMAIL' ? 'Gmail' : 'Slack'}`
                )}
              </button>
              <button
                onClick={() => onDiscardDraft(message.draft.id)}
                disabled={revising || sending}
                className="px-4 py-2 text-xs text-[#6E645E] hover:text-[#221E1B] font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sent confirmation ── */}
      {isSent && (
        <div className="border border-emerald-200 rounded-2xl p-4 bg-emerald-50 shadow-sm">
          <p className="text-xs font-semibold text-emerald-700 flex items-center gap-2">
            <span>✓</span> Reply sent via {message.source === 'GMAIL' ? 'Gmail' : 'Slack'}
          </p>
        </div>
      )}

      {/* ── Discarded notice ── */}
      {isDiscarded && (
        <div className="border border-[#EFECE6] rounded-2xl p-4 bg-[#FAF8F5] shadow-sm">
          <p className="text-xs font-semibold text-[#6E645E] flex items-center gap-2">
            <span>✕</span> Draft was discarded
          </p>
        </div>
      )}

      {/* ── Processing state ── */}
      {message.label === 'UNPROCESSED' && (
        <div className="border border-amber-100 rounded-2xl p-4 bg-amber-50/50 shadow-sm">
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-2.5">
            <span className="animate-spin inline-block">⟳</span>
            AI agents are processing this message through the Kafka pipeline…
          </p>
        </div>
      )}
    </div>
  )
}
