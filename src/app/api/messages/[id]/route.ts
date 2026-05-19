import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db/client'

// update label, isRead, etc.
export async function PATCH(req:NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = await params;
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const allowed = ['label', 'isRead'] // only allow safe field updates
  const data = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowed.includes(k))
  )

  try {
    const message = await db.message.update({
      where: { id: resolvedParams.id, userId: session.user.id },
      data,
      include: { draft: true, actionItems: true },
    })
    return NextResponse.json(message)
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: errorMessage }, { status: 404 })
  }
}
