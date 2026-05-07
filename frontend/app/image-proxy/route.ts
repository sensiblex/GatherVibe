import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_IMAGE_HOSTS = new Set(['media.kudago.com']);

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url');
  if (!rawUrl) {
    return NextResponse.json({ detail: 'Missing image url' }, { status: 400 });
  }

  let imageUrl: URL;
  try {
    imageUrl = new URL(rawUrl);
  } catch {
    return NextResponse.json({ detail: 'Invalid image url' }, { status: 400 });
  }

  if (imageUrl.protocol !== 'https:' || !ALLOWED_IMAGE_HOSTS.has(imageUrl.hostname)) {
    return NextResponse.json({ detail: 'Image host is not allowed' }, { status: 400 });
  }

  const upstream = await fetch(imageUrl, {
    headers: {
      accept: request.headers.get('accept') ?? 'image/*',
    },
    next: { revalidate: 60 * 60 * 24 },
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ detail: 'Image fetch failed' }, { status: upstream.status || 502 });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}
