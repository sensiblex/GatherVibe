import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Routes that require an authenticated user (server-side guard) */
const PROTECTED_PREFIXES = ['/profile', '/notifications', '/my-events'];

/** Routes that an already-authenticated user should be redirected away from */
const AUTH_ONLY_ROUTES = ['/login', '/register'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Read JWT from the `token` cookie (set by AuthContext on login)
  const token = request.cookies.get('token')?.value;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
  );

  const isAuthOnly = AUTH_ONLY_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/'),
  );

  // No token → redirect to /login if trying to access a protected route
  if (isProtected && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Already logged in → redirect away from /login and /register
  if (isAuthOnly && token) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/profile/:path*',
    '/notifications/:path*',
    '/my-events/:path*',
    '/login',
    '/register',
  ],
};
