import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { fetchRecentThreads } from "@/lib/gmail";
import { publishMessage, TOPICS } from "@/lib/kafka/client";
import { db } from "@/lib/db/client";

// trigger a Gmail sync, publish new threads to Kafka
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    // If no authenticated browser session, delegate to Google Pub/Sub webhook handler
    return webhookHandler(req)
  }

  const userId = session.user.id
    try {
        const threads = await fetchRecentThreads(userId, 20);
        const validThreads = threads.filter((t): t is NonNullable<typeof t> => !!t);
        const externalIds = validThreads.map((t) => t.externalId);

        const existingMessages = await db.message.findMany({
            where: { externalId: { in: externalIds } },
            select: { externalId: true },
        });
        const existingSet = new Set(existingMessages.map((m) => m.externalId));

        console.log(`[API/gmail] Fetched ${validThreads.length} threads, checking DB for duplicates`) 
        let queued = 0;
        for(const thread of validThreads){
            if (existingSet.has(thread.externalId)){
              console.log(`[API/gmail] Skipping existing: ${thread.externalId} — "${thread.subject}"`)  // ← ADD
              continue
            }
            console.log(`[API/gmail] Queueing new thread: ${thread.externalId} — "${thread.subject}"`)  // ← ADD
            await publishMessage(TOPICS.RAW, userId, { ...thread, userId })
            queued++
        }

        return NextResponse.json({ queued, total: threads.length })
    } catch (error) {
        console.error('Gmail sync error:', error)
        return NextResponse.json({ error: (error as Error).message }, { status: 500 })
    }
}

// Google Pub/Sub push for real-time Gmail notifications
export async function webhookHandler(req:NextRequest) {
  try {
    const body = await req.json()
    const data = JSON.parse(
      Buffer.from(body.message?.data || '', 'base64').toString()
    )
    const { emailAddress } = data
    if (!emailAddress) return NextResponse.json({ ok: true })

    const user = await db.user.findUnique({ where: { email: emailAddress } })
    if (user) {
      const threads = await fetchRecentThreads(user.id, 5)
      const validThreads = threads.filter((t): t is NonNullable<typeof t> => !!t);
      const externalIds = validThreads.map((t) => t.externalId);

      const existingMessages = await db.message.findMany({
        where: { externalId: { in: externalIds } },
        select: { externalId: true },
      });
      const existingSet = new Set(existingMessages.map((m) => m.externalId));

      for (const t of validThreads) {
        if (!existingSet.has(t.externalId)) {
          await publishMessage(TOPICS.RAW, user.id, { ...t, userId: user.id })
        }
      }
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Gmail webhook error:', err)
    return NextResponse.json({ ok: true }) // Always 200 to stop Pub/Sub retries
  }
}