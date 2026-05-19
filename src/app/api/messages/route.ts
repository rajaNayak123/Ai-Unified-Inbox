import { NextRequest,NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db/client'

// GET /api/messages?label=URGENT&source=GMAIL
export async function GET(req:NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const label  = searchParams.get('label')
  const source = searchParams.get('source')

  const messages = await db.message.findMany({
    where: {
      userId: session.user.id,
      ...(label  && label  !== 'ALL' && { label: label as any }),
      ...(source && source !== 'ALL' && { source: source as any }),
    },
    include: { draft: true, actionItems: true },
    orderBy: { receivedAt: 'desc' },
    take: 50,
  })

  return NextResponse.json(messages)
}
