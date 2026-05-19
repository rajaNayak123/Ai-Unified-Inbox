import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'

// Slack redirects here after OAuth consent
export async function GET(req:NextRequest) {
  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state') // contains userId set in /api/slack GET
  const error = searchParams.get('error')

  if (error || !code || !state) {
    return NextResponse.redirect(
      new URL('/settings?error=slack_cancelled', req.url)
    )
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.SLACK_CLIENT_ID!,
        client_secret: process.env.SLACK_CLIENT_SECRET!,
        code,
        redirect_uri: `${process.env.NEXTAUTH_URL}/api/slack/callback`,
      }),
    })

    const data = await tokenRes.json()

    if (!data.ok) {
      console.error('Slack OAuth error:', data.error)
      return NextResponse.redirect(
        new URL('/settings?error=slack_oauth_failed', req.url)
      )
    }

    const providerAccountId = data.authed_user?.id || data.team?.id
    const accessToken       = data.access_token

    // Save Slack tokens to DB
    await db.account.upsert({
      where: {
        provider_providerAccountId: {
          provider:          'slack',
          providerAccountId: providerAccountId,
        },
      },
      update: { accessToken },
      create: {
        userId:            state,   // state = userId passed in GET /api/slack
        provider:          'slack',
        providerAccountId: providerAccountId,
        accessToken,
      },
    })

    return NextResponse.redirect(
      new URL('/settings?success=slack_connected', req.url)
    )
  } catch (err) {
    console.error('Slack callback error:', err)
    return NextResponse.redirect(
      new URL('/settings?error=slack_server_error', req.url)
    )
  }
}
