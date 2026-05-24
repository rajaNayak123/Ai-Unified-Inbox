import { google } from 'googleapis'
import { db } from '@/lib/db/client'

export async function getGmailClient(userId: string) {
  const account = await db.account.findFirst({
    where: { userId, provider: 'google' },
  })
  if (!account) throw new Error('Gmail not connected for this user')

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )

  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
  })

  // Persist refreshed token automatically
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await db.account.update({
        where: { id: account.id },
        data: {
          accessToken: tokens.access_token,
          ...(tokens.expiry_date && {
            expiresAt: Math.floor(tokens.expiry_date / 1000),
          }),
        },
      })
    }
  })

  return google.gmail({ version: 'v1', auth: oauth2Client })
}

export async function fetchRecentThreads(userId: string, maxResults = 20) {
  const gmail = await getGmailClient(userId)

  const listRes = await gmail.users.threads.list({
    userId: 'me',
    maxResults,
    labelIds: ['INBOX'],
  })

  const threads = listRes.data.threads || []
  console.log(`[Gmail] Found ${threads.length} threads for user ${userId}`)
  if(threads.length == 0){
    console.log('====================================');
    console.log("No thread found 😔");
    console.log('====================================');
  }

  const results = await Promise.all(
    threads.map(async (t) => {
      if (!t.id) return null
      try {
        const { data: thread } = await gmail.users.threads.get({
          userId: 'me',
          id: t.id,
          format: 'full',
        })
        return parseThread(thread)
      } catch {
        return null
      }
    })
  )

  return results.filter(Boolean)
}

function parseThread(thread: any) {
  const msg = thread.messages?.[0]
  if (!msg) return null

  const headers = msg.payload?.headers || []
  const getHeader = (name: string) =>
    headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

  return {
    externalId: thread.id,
    source:     'GMAIL',
    from:       getHeader('from'),
    subject:    getHeader('subject'),
    body:       extractBody(msg.payload),
    threadId:   thread.id,
    receivedAt: new Date(parseInt(msg.internalDate || Date.now())).toISOString(),
  }
}

function extractBody(payload: any): string {
  if (!payload) return ''

  // Direct body data
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8').trim()
  }

  // Multi-part — prefer text/plain
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8').trim()
      }
    }
    // Fallback: recurse into nested parts
    for (const part of payload.parts) {
      const nested:any = extractBody(part)
      if (nested) return nested
    }
  }

  return ''
}

export async function sendGmailReply(userId: string, threadId: string, to: string, subject: string, body: string) {
  const gmail = await getGmailClient(userId)

  const raw = [
    `To: ${to}`,
    `Subject: Re: ${subject}`,
    `In-Reply-To: ${threadId}`,
    `References: ${threadId}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n')

  const encoded = Buffer.from(raw).toString('base64url')

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded, threadId },
  })
}
