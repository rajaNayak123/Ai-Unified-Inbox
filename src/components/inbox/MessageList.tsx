'use client'

import { formatDistanceToNow } from 'date-fns'

const LABEL_CLASS: Record<string, string> = {
  URGENT:       'bg-rose-50 text-rose-700 border-rose-150',
  TODO:         'bg-amber-50 text-amber-700 border-amber-200',
  FYI:          'bg-blue-50 text-blue-700 border-blue-150',
  DONE:         'bg-stone-50 text-[#6E645E] border-stone-200',
  UNPROCESSED:  'bg-stone-50 text-stone-400 border-stone-150',
}

function GmailIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" className="shrink-0 opacity-80">
      <path fill="#EA4335" d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.907 1.528-1.147C21.69 2.28 24 3.434 24 5.457z"/>
    </svg>
  )
}

function SlackIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="#E2A4FF" className="shrink-0 opacity-80">
      <path fill="#A855F7" d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
    </svg>
  )
}

interface MessageListProps {
  messages: any[]
  selected: any
  onSelect: (msg: any) => void
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
}

export default function MessageList({ messages, selected, onSelect, hasMore, loadingMore, onLoadMore }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="p-10 text-center">
        <p className="text-[#6E645E] text-sm font-medium">No messages here</p>
        <p className="text-stone-400 text-xs mt-1 font-sans">Try syncing Gmail or Slack</p>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-2.5 bg-transparent">
      {messages.map((msg: any) => {
        const isSelected = selected?.id === msg.id
        const pendingActions = msg.actionItems?.filter((a: any) => !a.done).length || 0

        return (
          <button
            key={msg.id}
            onClick={() => onSelect(msg)}
            className={`w-full text-left p-4 rounded-2xl transition-all duration-300 border ${
              isSelected 
                ? 'border-amber-400 shadow-[0_4px_12px_rgba(217,119,6,0.05)] ring-1 ring-amber-400/20 bg-white translate-x-1' 
                : 'border-[#EFECE6] shadow-[0_1px_3px_rgba(34,30,27,0.01)] bg-[#FAF8F5]/85 hover:bg-white hover:border-amber-300/60 hover:-translate-y-0.5 hover:shadow-[0_4px_10px_rgba(34,30,27,0.03)]'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                {msg.source === 'GMAIL' ? <GmailIcon /> : <SlackIcon />}
                <span className="text-[11px] font-semibold text-[#6E645E] truncate tracking-wide">
                  {msg.from?.split('<')[0].trim() || 'Unknown'}
                </span>
              </div>
              <span className="text-[10px] text-stone-400 font-medium font-mono shrink-0">
                {formatDistanceToNow(new Date(msg.receivedAt), { addSuffix: true })}
              </span>
            </div>

            <p className={`text-xs truncate mb-1 leading-snug font-sans ${!msg.isRead ? 'font-bold text-[#221E1B]' : 'text-[#6E645E]'}`}>
              {msg.subject || msg.body?.slice(0, 60) || '(no subject)'}
            </p>

            {msg.summary && msg.label !== 'UNPROCESSED' && (
              <p className="text-[11px] text-[#6E645E]/80 truncate mb-2 leading-relaxed font-sans">{msg.summary}</p>
            )}

            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              {msg.label && (
                <span className={`text-[9px] px-1.5 py-0.5 font-bold rounded-md border uppercase tracking-wider ${LABEL_CLASS[msg.label] || LABEL_CLASS.UNPROCESSED}`}>
                  {msg.label === 'UNPROCESSED' ? '⟳ processing' : msg.label.toLowerCase()}
                </span>
              )}
              {msg.draft?.status === 'PENDING' && (
                <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 font-bold rounded-md uppercase tracking-wider">
                  draft
                </span>
              )}
              {pendingActions > 0 && (
                <span className="text-[10px] text-amber-800 font-semibold font-mono bg-amber-100/50 px-1.5 py-0.2 rounded">
                  {pendingActions} checklist item{pendingActions > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </button>
        )
      })}
      
      {hasMore && onLoadMore && (
        <div className="pt-2 pb-4 text-center bg-transparent">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="px-4 py-2 text-xs font-semibold text-[#6E645E] bg-white border border-[#EFECE6] hover:bg-[#FAF8F5] shadow-[0_1px_2px_rgba(0,0,0,0.02)] rounded-xl transition-all disabled:opacity-50"
          >
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  )
}
