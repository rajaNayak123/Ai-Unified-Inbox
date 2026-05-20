export { default as proxy } from 'next-auth/middleware'

export const config = {
  // Protect these routes — unauthenticated users are redirected to /login
  matcher: ['/inbox/:path*', '/settings/:path*'],
}
