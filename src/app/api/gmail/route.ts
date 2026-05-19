import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { fetchRecentThreads } from "@/lib/gmail";
import { publishMessage, TOPICS } from "@/lib/kafka/client";
import { db } from "@/lib/db/client";

// trigger a Gmail sync, publish new threads to Kafka
export async function POST(req:NextRequest){
    const session= await getServerSession(authOptions)
    if(!session?.user?.id) throw new Error("Unauthorized")

    const userId = session.user.id
    try {
        const threads = await fetchRecentThreads(userId, 20);
        let queued = 0;
        for(const thread of threads){
            if (!thread) continue;
            
            const existing = await db.message.findUnique({
                where: { externalId: thread.externalId },
            })

            if(existing) continue;
            await publishMessage(TOPICS.RAW, userId, { ...thread, userId })
            queued++
        }

        return NextResponse.json({ queued, total: threads.length })
    } catch (error) {
        console.error('Gmail sync error:', error)
        return NextResponse.json({ error: (error as Error).message }, { status: 500 })
    }
}