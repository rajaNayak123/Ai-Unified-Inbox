import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db/client'

// mark action item as done or update task text
export async function PATCH(req:NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = await params;
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const allowed = ['done', 'task', 'deadline']
  const data = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowed.includes(k))
  )

  try {
    const action = await db.actionItem.update({
      where: { id: resolvedParams.id, userId: session.user.id },
      data,
    })
    return NextResponse.json(action)
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error:errorMessage }, { status: 404 })
  }
}

// remove an action item
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = await params;
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await db.actionItem.delete({
      where: { id: resolvedParams.id, userId: session.user.id },
    })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: errorMessage }, { status: 404 })
  }
}