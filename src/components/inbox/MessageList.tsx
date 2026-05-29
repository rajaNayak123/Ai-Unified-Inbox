'use client'

import { formatDistanceToNow } from 'date-fns'

const LABEL_CLASS: Record<string, string> = {
  URGENT:       'bg-red-50 text-red-600 border-red-200',
  TODO:         'bg-amber-50 text-amber-600 border-amber-200',
  FYI:          'bg-blue-50 text-blue-600 border-blue-200',
  DONE:         'bg-stone-100 text-stone-500 border-stone-200',
  UNPROCESSED:  'bg-stone-50 text-stone-400 border-stone-200',
}

function GmailIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" className="shrink-0">
      <path fill="#EA4335" d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.907 1.528-1.147C21.69 2.28 24 3.434 24 5.457z"/>
    </svg>
  )
}

function SlackIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="#A855F7" className="shrink-0">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
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
        <p className="text-stone-500 text-sm">No messages here</p>
        <p className="text-stone-400 text-xs mt-1">Try syncing Gmail or Slack</p>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-3 bg-transparent">
      {messages.map((msg: any) => {
        const isSelected = selected?.id === msg.id
        const pendingActions = msg.actionItems?.filter((a: any) => !a.done).length || 0

        return (
          <button
            key={msg.id}
            onClick={() => onSelect(msg)}
            className={`w-full text-left p-4 rounded-2xl transition-all duration-300 border backdrop-blur-sm ${
              isSelected ? 'border-amber-300 shadow-md ring-1 ring-amber-300/50 bg-white translate-x-1' : 'border-stone-200/60 shadow-sm bg-white/70 hover:shadow-md hover:border-amber-200/60 hover:-translate-y-0.5'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                {msg.source === 'GMAIL' ? <GmailIcon /> : <SlackIcon />}
                <span className="text-xs text-stone-500 truncate">
                  {msg.from?.split('<')[0].trim() || 'Unknown'}
                </span>
              </div>
              <span className="text-xs text-stone-400 shrink-0">
                {formatDistanceToNow(new Date(msg.receivedAt), { addSuffix: true })}
              </span>
            </div>

            <p className={`text-sm truncate mb-1 ${!msg.isRead ? 'font-semibold text-stone-900' : 'text-stone-500'}`}>
              {msg.subject || msg.body?.slice(0, 60) || '(no subject)'}
            </p>

            {msg.summary && msg.label !== 'UNPROCESSED' && (
              <p className="text-xs text-stone-500 truncate mb-2">{msg.summary}</p>
            )}

            <div className="flex items-center gap-1.5 flex-wrap">
              {msg.label && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full border ${LABEL_CLASS[msg.label] || LABEL_CLASS.UNPROCESSED}`}>
                  {msg.label === 'UNPROCESSED' ? '⟳ processing' : msg.label.toLowerCase()}
                </span>
              )}
              {msg.draft?.status === 'PENDING' && (
                <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded-full">
                  draft ready
                </span>
              )}
              {pendingActions > 0 && (
                <span className="text-xs text-stone-500">
                  {pendingActions} action{pendingActions > 1 ? 's' : ''}
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
            className="px-4 py-2 text-xs font-medium text-stone-600 bg-white border border-stone-200 hover:bg-stone-50 shadow-sm rounded-xl transition-all disabled:opacity-50"
          >
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  )
}
