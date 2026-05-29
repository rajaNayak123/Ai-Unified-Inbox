import { withAuth } from 'next-auth/middleware'

export default withAuth

export const config = {
  // Protect these routes — unauthenticated users are redirected to /login
  matcher: ['/inbox/:path*', '/settings/:path*'],
}
