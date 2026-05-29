import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db/client'
import { sendGmailReply } from '@/lib/gmail'
import { sendSlackReply } from '@/lib/slack'

// POST /api/draft/[id]/send — approve and send an AI draft reply
export async function POST(req:NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const draft = await db.draft.findUnique({
    where: { id: resolvedParams.id, userId: session.user.id },
    include: { message: true },
  })

  if (!draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  if (draft.status === 'SENT') {
    return NextResponse.json({ error: 'Already sent' }, { status: 400 })
  }

  // Allow optional body override from request (user may have edited in UI)
  let body: string = draft.body
  try {
    const json = await req.json()
    if (json.body && typeof json.body === 'string') body = json.body
  } catch {
    // no body in request — use stored draft body
  }

  const { message } = draft

  try {
    // 1. Send via the appropriate external API
    if (message.source === 'GMAIL') {
      if (!message.threadId) {
        return NextResponse.json({ error: 'Missing Gmail thread ID' }, { status: 400 })
      }
      await sendGmailReply(
        session.user.id,
        message.threadId,
        message.from,
        message.subject || '',
        body
      )
    } else if (message.source === 'SLACK') {
      // Parse externalId safely using guaranteed separator
      const parts = message.externalId.split('::')
      if (parts.length !== 2) {
        return NextResponse.json({ error: 'Malformed Slack externalId' }, { status: 400 })
      }
      const [channelId, ts] = parts
      await sendSlackReply(session.user.id, channelId, ts, body)
    } else {
      return NextResponse.json({ error: `Unsupported source: ${message.source}` }, { status: 400 })
    }

    // 2. Atomically mark draft SENT + message DONE in one transaction
    await db.$transaction([
      db.draft.update({
        where: { id: draft.id },
        data: { status: 'SENT', sentAt: new Date(), body },
      }),
      db.message.update({
        where: { id: message.id },
        data: { label: 'DONE' },
      }),
    ])

    return NextResponse.json({
      sent: true,
      draftId: draft.id,
      messageId: message.id,
      userId: session.user.id,
    })
  } catch (err) {
    console.error('[draft/send] Error sending draft:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
