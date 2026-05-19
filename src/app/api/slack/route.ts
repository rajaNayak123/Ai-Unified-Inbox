import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from '@/lib/auth/config'


// redirect user to Slack OAuth consent screen
export async function GET(req:NextRequest){
    const session = await getServerSession(authOptions)
    if (!session) {
        return NextResponse.redirect(new URL('/login', req.url))
    }

    const params = new URLSearchParams({
        client_id:    process.env.SLACK_CLIENT_ID!,
        scope:        'channels:history,channels:read,users:read,chat:write,im:history,im:read',
        redirect_uri: `${process.env.NEXTAUTH_URL}/api/slack/callback`,
        state:        session.user.id,
    })

    return NextResponse.redirect(
        `https://slack.com/oauth/v2/authorize?${params}`
    )
}


