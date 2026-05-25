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
  let body
  try {
    const json = await req.json()
    body = json.body || draft.body
  } catch {
    body = draft.body
  }

  const { message } = draft

  try {
    if (message.source === 'GMAIL') {
      if (!message.threadId) {
        return NextResponse.json({ error: 'Missing thread ID' }, { status: 400 })
      }
      await sendGmailReply(
        session.user.id,
        message.threadId,
        message.from,
        message.subject || '',
        body
      )
    } else if (message.source === 'SLACK') {
      // externalId format: "<channelId>-<ts>"
      const dashIdx = message.externalId.indexOf('-')
      const channelId = message.externalId.slice(0, dashIdx)
      const ts        = message.externalId.slice(dashIdx + 1)
      await sendSlackReply(session.user.id, channelId, ts, body)
    }

    // Mark draft sent
    await db.draft.update({
      where: { id: draft.id },
      data: { status: 'SENT', sentAt: new Date(), body },
    })

    // Mark message done
    await db.message.update({
      where: { id: message.id },
      data: { label: 'DONE' },
    })

    return NextResponse.json({ sent: true })
  } catch (err) {
    console.error('Send draft error:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
