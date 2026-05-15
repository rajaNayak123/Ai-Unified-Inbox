import NextAuth, { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { db } from '@/lib/db/client'


export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // Request Gmail read + send + offline access
          scope: [
            'openid email profile',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/gmail.modify',
          ].join(' '),
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
    // Slack is connected separately via /api/slack/connect
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user.email && account.access_token) {
        // Upsert user
        const dbUser = await db.user.upsert({
          where: { email: user.email },
          update: { 
            name: user.name ?? null, 
            image: user.image ?? null 
          },
          create: { 
            email: user.email, 
            name: user.name ?? null, 
            image: user.image ?? null 
          },
        })
 
        // Save OAuth tokens
        await db.account.upsert({
          where: {
            provider_providerAccountId: {
              provider: 'google',
              providerAccountId: account.providerAccountId,
            },
          },
          update: {
            accessToken: account.access_token,
            refreshToken: account.refresh_token ?? null,
            expiresAt: account.expires_at ?? null,
          },
          create: {
            userId: dbUser.id,
            provider: 'google',
            providerAccountId: account.providerAccountId,
            accessToken: account.access_token,
            refreshToken: account.refresh_token ?? null,
            expiresAt: account.expires_at ?? null,
          },
        })
      }
      return true
    },

    async session({ session, token }) {
      const dbUser = await db.user.findUnique({
        where: { email: session.user.email },
        include: { accounts: { select: { provider: true } } },
      })
      if (dbUser) {
        session.user.id = dbUser.id
        session.user.connectedProviders = dbUser.accounts.map(a => a.provider)
      }
      return session
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  session: { strategy: 'jwt' },
}

export default NextAuth(authOptions)
