'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/apiFetch';

/** Converts a base64url VAPID public key string into a Uint8Array<ArrayBuffer>. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export interface UsePushNotificationsReturn {
  isSupported: boolean;
  permission: NotificationPermission;
  isSubscribed: boolean;
  isLoading: boolean;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Check support and current subscription state on mount (client-side only).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    setIsSupported(true);
    setPermission(Notification.permission);

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        return registration.pushManager.getSubscription();
      })
      .then((subscription) => {
        setIsSubscribed(!!subscription);
      })
      .catch(() => {
        // Service worker registration failed — leave isSubscribed false.
      });
  }, []);

  const subscribe = useCallback(async (): Promise<void> => {
    if (typeof window === 'undefined') return;
    setIsLoading(true);
    try {
      // 1. Register the service worker.
      const registration = await navigator.serviceWorker.register('/sw.js');

      // 2. Fetch the VAPID public key from the backend.
      const vapidRes = await apiFetch('/notifications/vapid-public-key');
      if (!vapidRes.ok) throw new Error('Failed to fetch VAPID key');
      const { public_key: vapidKey } = (await vapidRes.json()) as { public_key: string };

      // 3. Request notification permission from the user.
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return;

      // 4. Subscribe the browser to push notifications.
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const rawKeys = subscription.toJSON().keys as { p256dh: string; auth: string };

      // 5. Send the subscription to the backend.
      const res = await apiFetch('/notifications/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh: rawKeys.p256dh,
          auth: rawKeys.auth,
        }),
      });

      if (!res.ok) {
        // Roll back the browser subscription if the server rejected it.
        await subscription.unsubscribe();
        throw new Error('Backend rejected push subscription');
      }

      setIsSubscribed(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (typeof window === 'undefined') return;
    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      if (!registration) return;

      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setIsSubscribed(false);
        return;
      }

      // 1. Notify the backend first so it stops sending pushes to this endpoint.
      const res = await apiFetch('/notifications/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      // 404 means it was already removed server-side — still safe to unsubscribe locally.
      if (!res.ok && res.status !== 404) {
        throw new Error('Failed to unsubscribe on server');
      }

      // 2. Unsubscribe in the browser.
      await subscription.unsubscribe();
      setIsSubscribed(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { isSupported, permission, isSubscribed, isLoading, subscribe, unsubscribe };
}
