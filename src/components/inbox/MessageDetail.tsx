'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'

const LABEL_COLOR: Record<string, string> = {
  URGENT: 'text-red-400',
  TODO:   'text-amber-400',
  FYI:    'text-blue-400',
  DONE:   'text-zinc-500',
}

interface MessageDetailProps {
  message: any
  onSendDraft: (draftId: string, body: string) => Promise<void>
  onDiscardDraft: (draftId: string) => Promise<void>
  onMarkActionDone: (actionId: string) => Promise<void>
}

export default function MessageDetail({ message, onSendDraft, onDiscardDraft, onMarkActionDone }: MessageDetailProps) {
  const [draftBody, setDraftBody] = useState(message.draft?.body || '')
  const [sending,   setSending]   = useState(false)

  // Update local draft when message changes (different message selected)
  useEffect(() => {
    setDraftBody(message.draft?.body || '')
  }, [message.id, message.draft?.body])

  async function handleSend() {
    setSending(true)
    await onSendDraft(message.draft.id, draftBody)
    setSending(false)
  }

  const hasPendingDraft = message.draft && message.draft.status === 'PENDING'
  const isSent          = message.draft?.status === 'SENT'

  return (
    <div className="max-w-2xl mx-auto p-8 animate-slide-in">

      {/* Header */}
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
            <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest mb-1">
              AI Summary
            </p>
            <p className="text-sm text-zinc-300">{message.summary}</p>
          </div>
        )}
      </div>

      {/* Action Items */}
      {message.actionItems?.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-3">
            Action items
          </h3>
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
                  onClick={() => !action.done && onMarkActionDone(action.id)}
                  disabled={action.done}
                  className={`w-5 h-5 rounded border mt-0.5 shrink-0 flex items-center justify-center transition-all ${
                    action.done
                      ? 'bg-zinc-700 border-zinc-600 text-zinc-400 cursor-default'
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

      {/* Message body */}
      <div className="mb-6">
        <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-3">
          Message
        </h3>
        <div className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap font-mono bg-zinc-900/40 rounded-xl p-5 border border-zinc-800/60 max-h-72 overflow-y-auto">
          {message.body || '(empty body)'}
        </div>
      </div>

      {/* AI Draft */}
      {hasPendingDraft && (
        <div className="border border-amber-500/20 rounded-2xl p-5 bg-amber-500/5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-mono text-amber-400 uppercase tracking-widest">
              AI Draft Reply
            </h3>
            <span className="text-xs text-zinc-600 font-mono">
              groq / {message.source === 'GMAIL' ? 'mixtral-8x7b' : 'mixtral-8x7b'}
            </span>
          </div>

          <textarea
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            rows={4}
            className="w-full bg-zinc-900/60 border border-zinc-700/60 rounded-xl p-3 text-sm text-zinc-200 resize-none focus:outline-none focus:border-amber-500/50 transition-colors font-mono"
            placeholder="Edit draft before sending…"
          />

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleSend}
              disabled={sending || !draftBody.trim()}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 text-sm font-semibold rounded-xl transition-all"
            >
              {sending ? 'Sending…' : `Send via ${message.source === 'GMAIL' ? 'Gmail' : 'Slack'}`}
            </button>
            <button
              onClick={() => onDiscardDraft(message.draft.id)}
              className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Sent confirmation */}
      {isSent && (
        <div className="border border-emerald-500/20 rounded-2xl p-4 bg-emerald-500/5">
          <p className="text-sm text-emerald-400 flex items-center gap-2">
            <span>✓</span> Reply sent via {message.source === 'GMAIL' ? 'Gmail' : 'Slack'}
          </p>
        </div>
      )}

      {/* Unprocessed state */}
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
