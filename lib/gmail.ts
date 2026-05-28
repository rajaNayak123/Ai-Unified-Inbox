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

  // Proactively refresh token if expired or expiring within 5 minutes
  const isExpired = account.expiresAt
    ? Math.floor(Date.now() / 1000) >= account.expiresAt - 300
    : true;

  if (isExpired && account.refreshToken) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      if (credentials.access_token) {
        await db.account.update({
          where: { id: account.id },
          data: {
            accessToken: credentials.access_token,
            ...(credentials.expiry_date && {
              expiresAt: Math.floor(credentials.expiry_date / 1000),
            }),
          },
        });
        oauth2Client.setCredentials(credentials);
      }
    } catch (err) {
      console.error('[Gmail] Failed to refresh and persist OAuth token proactively:', err);
      throw new Error(`Gmail token refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Fallback / dynamic listener to persist refreshed tokens automatically
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      try {
        await db.account.update({
          where: { id: account.id },
          data: {
            accessToken: tokens.access_token,
            ...(tokens.expiry_date && {
              expiresAt: Math.floor(tokens.expiry_date / 1000),
            }),
          },
        });
      } catch (err) {
        console.error('[Gmail] Failed to persist refreshed token in event listener:', err);
        throw err;
      }
    }
  });

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

function findPartByMimeType(payload: any, mimeType: string): string | null {
  if (!payload) return null

  if (payload.mimeType === mimeType && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8').trim()
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const found = findPartByMimeType(part, mimeType)
      if (found) return found
    }
  }

  return null
}

function stripHtmlTags(html: string): string {
  if (!html) return ''
  let text = html.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<\/p>/gi, '\n\n')
  text = text.replace(/<\/div>/gi, '\n')
  text = text.replace(/<[^>]+>/g, '')

  const entities: { [key: string]: string } = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
  }

  text = text.replace(/&[a-z0-9#]+;/gi, (match) => {
    return entities[match.toLowerCase()] || match
  })

  return text.replace(/\n\s*\n\s*\n+/g, '\n\n').trim()
}

function extractBody(payload: any): string {
  if (!payload) return ''

  // 1. Try to find text/plain
  const plainText = findPartByMimeType(payload, 'text/plain')
  if (plainText) {
    return plainText
  }

  // 2. If no text/plain, try to find text/html and strip tags
  const htmlText = findPartByMimeType(payload, 'text/html')
  if (htmlText) {
    return stripHtmlTags(htmlText)
  }

  // 3. Fallback: if there is direct body data, decode it
  if (payload.body?.data) {
    const raw = Buffer.from(payload.body.data, 'base64').toString('utf-8').trim()
    if (payload.mimeType === 'text/html') {
      return stripHtmlTags(raw)
    }
    return raw
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
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    body,
  ].join('\r\n')

  const encoded = Buffer.from(raw).toString('base64url')

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded, threadId },
  })
}
