/**
 * Web Push client — service worker registration, subscription, status.
 *
 * Flow:
 *   1. registerServiceWorker() — idempotent, call once on app mount
 *   2. subscribeToPush()       — call only after user consents to browser prompt
 *   3. unsubscribeFromPush()   — call on logout or settings toggle
 */

import { apiFetch } from './apiFetch';

export type PushStatus = 'granted' | 'denied' | 'default' | 'unsupported';

/**
 * Decode a base64url-encoded VAPID public key into the Uint8Array format
 * required by pushManager.subscribe({ applicationServerKey }).
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  if (!base64String) return new Uint8Array(new ArrayBuffer(0));
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getPushStatus(): PushStatus {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission as PushStatus;
}

/** Register sw.js. Safe to call repeatedly — returns existing registration. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration('/sw.js');
    if (existing) return existing;
    return await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.warn('[push] SW registration failed', err);
    return null;
  }
}

/**
 * Request permission + subscribe + POST the subscription to the backend.
 * Returns true on success. Triggers the native prompt if status is 'default'.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  const reg = await registerServiceWorker();
  if (!reg) return false;

  if (Notification.permission === 'default') {
    const result = await Notification.requestPermission();
    if (result !== 'granted') return false;
  } else if (Notification.permission !== 'granted') {
    return false;
  }

  let keyRes: Response;
  try {
    keyRes = await apiFetch('/notifications/vapid-public-key');
  } catch {
    return false;
  }
  if (!keyRes.ok) return false;
  const { public_key: publicKey } = await keyRes.json();
  if (!publicKey) return false;

  let subscription: PushSubscription;
  try {
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      subscription = existing;
    } else {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
  } catch (err) {
    console.warn('[push] subscribe failed', err);
    return false;
  }

  const json = subscription.toJSON();
  const keys = (json.keys ?? {}) as Record<string, string>;
  const body = {
    endpoint: subscription.endpoint,
    p256dh: keys.p256dh ?? '',
    auth: keys.auth ?? '',
  };

  const res = await apiFetch('/notifications/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.ok;
}

/** Remove the browser's current subscription and tell the backend. */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!reg) return true;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return true;

  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } catch {
    // ignore — still tell backend
  }

  const res = await apiFetch('/notifications/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
  return res.ok || res.status === 404;
}

/**
 * Re-POST the current subscription to the backend. Use on app mount when
 * permission is already granted — covers cases where the browser rotated
 * keys or the backend row was lost. Does NOT prompt for permission.
 */
export async function refreshSubscription(): Promise<void> {
  if (!isPushSupported()) return;
  if (Notification.permission !== 'granted') return;
  const reg = await registerServiceWorker();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;

  const json = sub.toJSON();
  const keys = (json.keys ?? {}) as Record<string, string>;
  await apiFetch('/notifications/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      p256dh: keys.p256dh ?? '',
      auth: keys.auth ?? '',
    }),
  }).catch(() => {
    /* best-effort */
  });
}

const DISMISS_KEY = 'push_prompt_dismissed_until';
const DISMISS_DAYS = 7;

export function shouldShowPermissionPrompt(): boolean {
  if (getPushStatus() !== 'default') return false;
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return true;
    const until = Number(raw);
    if (Number.isFinite(until) && Date.now() < until) return false;
  } catch {
    /* ignore */
  }
  return true;
}

export function dismissPermissionPrompt(): void {
  try {
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, String(until));
  } catch {
    /* ignore */
  }
}
