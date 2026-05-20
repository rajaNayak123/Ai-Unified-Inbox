import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { redirect } from 'next/navigation'
import SettingsClient from '@/components/settings/SettingsClient'

interface SettingsPageProps {
  searchParams?: { [key: string]: string | string[] | undefined };
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  return (
    <SettingsClient
      user={{
        id:    session.user.id,
        name:  session.user.name,
        email: session.user.email,
        image: session.user.image,
        connectedProviders: session.user.connectedProviders || [],
      }}
      successMessage={(searchParams?.success as string) || undefined}
      errorMessage={(searchParams?.error as string)   || undefined}
    />
  )
}
