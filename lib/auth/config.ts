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
              provider: account.provider,
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
            provider: account.provider,
            providerAccountId: account.providerAccountId,
            accessToken: account.access_token,
            refreshToken: account.refresh_token ?? null,
            expiresAt: account.expires_at ?? null,
          },
        })
      }
      return true
    },

    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id
        try {
          const dbUser = user.email ? await db.user.findUnique({
            where: { email: user.email },
            include: { accounts: { select: { provider: true } } },
          }) : null
          if (dbUser) {
            token.id = dbUser.id
            token.connectedProviders = dbUser.accounts.map((a: any) => a.provider)
          }
        } catch (err) {
          console.error('[auth] jwt callback: failed to fetch dbUser, falling back to provider id:', err)
        }
      }
      if (trigger === 'update' && session?.connectedProviders) {
        token.connectedProviders = session.connectedProviders
      }
      return token
    },

    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.connectedProviders = (token.connectedProviders as string[]) || []
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
