import { WebClient } from '@slack/web-api'
import { db } from '@/lib/db/client'

export async function getSlackClient(userId: string) {
  const account = await db.account.findFirst({
    where: { userId, provider: 'slack' },
  })
  if (!account) throw new Error('Slack not connected for this user')
  return new WebClient(account.accessToken)
}

export async function fetchSlackMessages(userId: string, limit = 20) {
  const client = await getSlackClient(userId)
  const messages = []

  // List channels the bot/user is in
  const { channels = [] } = await client.conversations.list({
    types: 'public_channel,private_channel,im',
    limit: 10,
  })

  for (const channel of channels) {
    if (!channel.id) continue

    try {
      const { messages: msgs = [] } = await client.conversations.history({
        channel: channel.id,
        limit: 5,
      })

      for (const msg of msgs) {
        if (!msg.text || msg.bot_id || msg.subtype || !msg.ts) continue

        let from = 'Unknown'
        if (msg.user) {
          try {
            const { user } = await client.users.info({ user: msg.user })
            from = user?.real_name || user?.name || msg.user
          } catch {
            from = msg.user
          }
        }

        messages.push({
          externalId: `${channel.id}-${msg.ts}`,
          source:     'SLACK',
          from,
          subject:    `#${channel.name || 'direct-message'}`,
          body:       msg.text,
          threadId:   msg.thread_ts || msg.ts,
          receivedAt: new Date(parseFloat(msg.ts) * 1000).toISOString(),
          _channelId: channel.id,
          _ts:        msg.ts,
        })
      }
    } catch(err) {
      // Skip channels we can't read
      console.log("Skip the channels we can't read", err)
    }
  }

  return messages
    .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
    .slice(0, limit)
}

export async function sendSlackReply(userId: string, channelId: string, threadTs: string, text: string) {
  const client = await getSlackClient(userId)
  await client.chat.postMessage({
    channel: channelId,
    thread_ts: threadTs,
    text,
  })
}
