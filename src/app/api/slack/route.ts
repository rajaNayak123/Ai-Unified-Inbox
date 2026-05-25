import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from '@/lib/auth/config'
import { fetchSlackMessages } from '@/lib/slack'
import { publishMessage, TOPICS } from '@/lib/kafka/client'
import { db } from '@/lib/db/client'

// redirect user to Slack OAuth consent screen
export async function GET(req:NextRequest){
    const session = await getServerSession(authOptions)
    if (!session) {
        return NextResponse.redirect(new URL('/login', req.url))
    }

    const params = new URLSearchParams({
        client_id:    process.env.SLACK_CLIENT_ID!,
        scope:        'channels:history,channels:read,users:read,chat:write,im:history,im:read',
        redirect_uri: `${process.env.NEXTAUTH_URL}/api/slack/callback`,
        state:        session.user.id,
    })

    return NextResponse.redirect(
        `https://slack.com/oauth/v2/authorize?${params}`
    )
}

// sync recent Slack messages into Kafka pipeline
export async function POST(req:NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  try {
    const messages = await fetchSlackMessages(userId, 20)
    const externalIds = messages.map((msg) => msg.externalId)

    const existingMessages = await db.message.findMany({
      where: { externalId: { in: externalIds } },
      select: { externalId: true },
    })
    const existingSet = new Set(existingMessages.map((m) => m.externalId))

    let queued = 0
    for (const msg of messages) {
      if (existingSet.has(msg.externalId)) continue

      await publishMessage(TOPICS.RAW, userId, { ...msg, userId })
      queued++
    }

    return NextResponse.json({ queued, total: messages.length })
  } catch (err) {
    console.error('Slack sync error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
