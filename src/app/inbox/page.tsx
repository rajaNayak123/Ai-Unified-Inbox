import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db/client'
import InboxClient from '@/components/inbox/InboxClient'

export default async function InboxPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const messages = await db.message.findMany({
    where: { userId: session.user.id },
    include: { draft: true, actionItems: true },
    orderBy: { receivedAt: 'desc' },
    take: 50,
  })

  const stats = {
    urgent: messages.filter((m) => m.label === 'URGENT').length,
    todo:   messages.filter((m) => m.label === 'TODO').length,
    fyi:    messages.filter((m) => m.label === 'FYI').length,
    total:  messages.length,
  }

  const serialized = JSON.parse(JSON.stringify(messages))

  return (
    <InboxClient
      initialMessages={serialized}
      stats={stats}
      user={{
        id:    session.user.id,
        name:  session.user.name,
        email: session.user.email,
        image: session.user.image,
        connectedProviders: session.user.connectedProviders || [],
      }}
    />
  )
}
