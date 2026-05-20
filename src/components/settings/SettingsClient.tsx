'use client'

import { signOut } from 'next-auth/react'
import Link from 'next/link'

const SUCCESS_MESSAGES: Record<string, string> = {
  slack_connected: '✅ Slack connected successfully! You can now sync Slack messages.',
}
const ERROR_MESSAGES: Record<string, string> = {
  slack_oauth_failed:  '❌ Slack OAuth failed. Please try again.',
  slack_cancelled:     '⚠️  Slack connection was cancelled.',
  slack_server_error:  '❌ A server error occurred. Please try again.',
}

interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  connectedProviders?: string[];
}

interface SettingsClientProps {
  user: User;
  successMessage?: string;
  errorMessage?: string;
}

export default function SettingsClient({ user, successMessage, errorMessage }: SettingsClientProps) {
  const isGmailConnected = user.connectedProviders?.includes('google')
  const isSlackConnected = user.connectedProviders?.includes('slack')

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="border-b border-zinc-800/60 px-6 py-4 flex items-center justify-between">
        <Link href="/inbox" className="text-sm font-bold tracking-widest">
          Inbox<span className="text-amber-400">AI</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/inbox" className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
            ← Back to inbox
          </Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold mb-2">Settings</h1>
        <p className="text-zinc-500 text-sm mb-10">Manage your connected accounts and preferences.</p>

        {successMessage && SUCCESS_MESSAGES[successMessage] && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
            {SUCCESS_MESSAGES[successMessage]}
          </div>
        )}
        {errorMessage && ERROR_MESSAGES[errorMessage] && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {ERROR_MESSAGES[errorMessage]}
          </div>
        )}

        <section className="mb-8">
          <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-4">Profile</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex items-center gap-4">
            {user.image ? (
              <img src={user.image} className="w-12 h-12 rounded-full" alt="" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-zinc-700 flex items-center justify-center text-lg font-bold">
                {user.name?.[0] || user.email?.[0]}
              </div>
            )}
            <div>
              <p className="font-semibold">{user.name}</p>
              <p className="text-sm text-zinc-500">{user.email}</p>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-4">Connected accounts</h2>
          <div className="space-y-3">

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#EA4335" d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.907 1.528-1.147C21.69 2.28 24 3.434 24 5.457z"/>
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-sm">Gmail</p>
                  <p className="text-xs text-zinc-500">Read, send and classify emails</p>
                </div>
              </div>
              {isGmailConnected ? (
                <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full">
                  Connected
                </span>
              ) : (
                <a
                  href="/api/auth/signin/google"
                  className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Connect
                </a>
              )}
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#A855F7">
                    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-sm">Slack</p>
                  <p className="text-xs text-zinc-500">Read channels, post replies</p>
                </div>
              </div>
              {isSlackConnected ? (
                <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full">
                  Connected
                </span>
              ) : (
                <a
                  href="/api/slack"
                  className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Connect
                </a>
              )}
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-4">Account</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Sign out</p>
              <p className="text-xs text-zinc-500">Sign out of your account on this device</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-xs bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 border border-zinc-700 hover:border-red-500/30 px-3 py-1.5 rounded-lg transition-all"
            >
              Sign out
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
