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
  const rawMessages: any[] = []

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
        rawMessages.push({ channel, msg })
      }
    } catch(err) {
      // Skip channels we can't read
      console.log("Skip the channels we can't read", err)
    }
  }

  // 1. Collect unique user IDs
  const uniqueUserIds = Array.from(new Set(rawMessages.map(r => r.msg.user).filter(Boolean)))
  
  // 2. Fetch users with concurrency limit of 5
  const userMap = new Map<string, string>()
  
  const pLimit = (concurrency: number) => {
    let active = 0
    const queue: (() => void)[] = []
    const next = () => {
      active--
      if (queue.length > 0) queue.shift()!()
    }
    return <T>(fn: () => Promise<T>): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        const run = async () => {
          active++
          try {
            resolve(await fn())
          } catch (err) {
            reject(err)
          } finally {
            next()
          }
        }
        if (active < concurrency) run()
        else queue.push(run)
      })
    }
  }

  const limitCall = pLimit(5)
  await Promise.all(
    uniqueUserIds.map(uid => limitCall(async () => {
      try {
        const { user } = await client.users.info({ user: uid as string })
        if (user?.real_name || user?.name) {
          userMap.set(uid as string, user.real_name || user.name || uid as string)
        }
      } catch (err) {
        // Ignore user info fetch errors
      }
    }))
  )

  // 3. Build final messages
  const messages = rawMessages.map(({ channel, msg }) => {
    const from = msg.user ? (userMap.get(msg.user) || msg.user) : 'Unknown'
    return {
      externalId: `${channel.id}::${msg.ts}`,
      source:     'SLACK',
      from,
      subject:    `#${channel.name || 'direct-message'}`,
      body:       msg.text,
      threadId:   msg.thread_ts || msg.ts,
      receivedAt: new Date(parseFloat(msg.ts) * 1000).toISOString(),
      _channelId: channel.id,
      _ts:        msg.ts,
    }
  })

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
