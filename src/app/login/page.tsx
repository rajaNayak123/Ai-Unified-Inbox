'use client'
import { signIn } from 'next-auth/react'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#FDFCFB] flex items-center justify-center relative overflow-hidden">
      {/* Interactive background decoration */}
      <div className="absolute top-0 inset-x-0 h-[500px] bg-gradient-to-b from-amber-500/10 to-transparent pointer-events-none" />
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-amber-400/20 rounded-full blur-[100px] opacity-50 animate-pulse pointer-events-none" />
      <div className="absolute top-40 -left-40 w-72 h-72 bg-orange-400/10 rounded-full blur-[80px] opacity-50 pointer-events-none" />

      <div className="w-full max-w-sm relative z-10 animate-slide-in">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white border border-stone-200 shadow-sm mb-6 transform transition-transform hover:scale-105 hover:rotate-3 duration-300">
            <span className="text-3xl font-mono">⌘</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900 mb-2">
            Inbox<span className="text-amber-500">AI</span>
          </h1>
          <p className="text-stone-500 text-sm">
            Gmail + Slack, unified. AI-powered.
          </p>
        </div>

        <div className="bg-white border border-stone-200/80 rounded-3xl p-8 space-y-5 shadow-2xl shadow-stone-200/50 hover:shadow-amber-900/5 hover:border-amber-200/60 transition-all duration-500 group">
          <button
            onClick={() => signIn('google', { callbackUrl: '/inbox' })}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 bg-white hover:bg-stone-50 border border-stone-200 rounded-2xl text-sm font-medium text-stone-700 shadow-sm hover:shadow hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300"
          >
            <svg className="transition-transform group-hover:scale-110 duration-300" width="18" height="18" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.198 2.698 1.24 6.65l4.026 3.115z"/>
              <path fill="#34A853" d="M16.04 18.013c-1.09.703-2.474 1.078-4.04 1.078a7.077 7.077 0 0 1-6.723-4.823l-4.04 3.067A11.965 11.965 0 0 0 12 24c2.933 0 5.735-1.043 7.834-3l-3.793-2.987z"/>
              <path fill="#4A90E2" d="M19.834 21c2.195-2.048 3.62-5.096 3.62-9 0-.71-.109-1.473-.272-2.182H12v4.637h6.436c-.317 1.559-1.17 2.766-2.395 3.558L19.834 21z"/>
              <path fill="#FBBC05" d="M5.277 14.268A7.12 7.12 0 0 1 4.909 12c0-.782.125-1.533.357-2.235L1.24 6.65A11.934 11.934 0 0 0 0 12c0 1.92.445 3.73 1.237 5.335l4.04-3.067z"/>
            </svg>
            Continue with Google
          </button>

          <button
            onClick={() => signIn('slack', { callbackUrl: '/inbox' })}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 bg-white hover:bg-stone-50 border border-stone-200 rounded-2xl text-sm font-medium text-stone-700 shadow-sm hover:shadow hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300"
          >
            <svg className="transition-transform group-hover:scale-110 duration-300" width="18" height="18" viewBox="0 0 24 24" fill="#A855F7">
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
            </svg>
            Continue with Slack
          </button>

          <p className="text-xs text-stone-400 text-center px-2">
            We request read & send access to power the AI inbox
          </p>
        </div>

        <p className="text-center text-xs text-stone-400 mt-8 transition-colors hover:text-stone-600">
          You can connect additional accounts later from Settings
        </p>
      </div>
    </div>
  )
}
