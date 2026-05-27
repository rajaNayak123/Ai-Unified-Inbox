import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db/client'
import { reviseDraftAgent } from '@/lib/groq/agents'

// POST /api/draft/[id]/revise — AI-revise an existing draft given a plain-English instruction
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Validate request body
  let instruction: string
  let currentBody: string | undefined
  try {
    const json = await req.json()
    if (!json.instruction || typeof json.instruction !== 'string' || !json.instruction.trim()) {
      return NextResponse.json({ error: 'instruction is required' }, { status: 400 })
    }
    instruction = json.instruction.trim()
    currentBody = typeof json.currentBody === 'string' ? json.currentBody : undefined
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Load draft + parent message for context
  const draft = await db.draft.findUnique({
    where: { id: resolvedParams.id, userId: session.user.id },
    include: { message: true },
  })

  if (!draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  if (draft.status === 'SENT' || draft.status === 'DISCARDED') {
    return NextResponse.json({ error: `Cannot revise a ${draft.status.toLowerCase()} draft` }, { status: 400 })
  }

  // Use whatever body the user currently has in their editor (may differ from DB)
  const bodyToRevise = currentBody ?? draft.body
  const { message } = draft

  try {
    const revised = await reviseDraftAgent({
      currentDraft: bodyToRevise,
      instruction,
      subject: message.subject ?? '',
      body: message.body,
      from: message.from,
      source: message.source,
    })

    if (!revised || !revised.trim()) {
      return NextResponse.json({ error: 'Revision produced empty output' }, { status: 500 })
    }

    // Persist revised body back to DB so next page load is consistent
    await db.draft.update({
      where: { id: draft.id },
      data: { body: revised },
    })

    return NextResponse.json({ revised })
  } catch (err) {
    console.error('[draft/revise] Error during revision:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
