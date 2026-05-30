import { NextRequest,NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db/client'

const VALID_LABELS  = ['UNPROCESSED', 'URGENT', 'TODO', 'FYI', 'DONE'] as const
const VALID_SOURCES = ['GMAIL', 'SLACK'] as const

type Label  = typeof VALID_LABELS[number]
type Source = typeof VALID_SOURCES[number]

// GET /api/messages?label=URGENT&source=GMAIL
export async function GET(req:NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const rawLabel  = searchParams.get('label')
  const rawSource = searchParams.get('source')

  const label  = rawLabel  && VALID_LABELS.includes(rawLabel   as Label)  ? rawLabel  as Label  : null
  const source = rawSource && VALID_SOURCES.includes(rawSource as Source) ? rawSource as Source : null

  const cursor = searchParams.get('cursor')

  const messages = await db.message.findMany({
    where: {
      userId: session.user.id,
      ...(label  && { label }),
      ...(source && { source }),
    },
    include: { draft: true, actionItems: true },
    orderBy: { receivedAt: 'desc' },
    take: 50,
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  })

  return NextResponse.json(messages)
}
