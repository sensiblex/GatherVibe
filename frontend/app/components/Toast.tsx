'use client';

import { useEffect, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

let _addToast: ((msg: string, type: ToastType, action?: ToastAction) => void) | null = null;
let _toastCounter = 0;

export function toast(message: string, type: ToastType = 'info', action?: ToastAction) {
  _addToast?.(message, type, action);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    let alive = true;
    _addToast = (message, type, action) => {
      if (!alive) return;
      const id = ++_toastCounter;
      setToasts(prev => [...prev, { id, message, type, action }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    };
    return () => {
      alive = false;
      _addToast = null;
    };
  }, []);

  if (toasts.length === 0) return null;

  const styles: Record<ToastType, string> = {
    success: 'bg-emerald-600 text-white',
    error:   'bg-red-500 text-white',
    info:    'bg-indigo-600 text-white',
  };

  const icons: Record<ToastType, string> = {
    success: '✅',
    error:   '❌',
    info:    'ℹ️',
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 items-end">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold max-w-xs animate-fade-in ${
            styles[t.type]
          }`}
        >
          <span>{icons[t.type]}</span>
          <span className="flex-1">{t.message}</span>
          {t.action && (
            <button
              onClick={t.action.onClick}
              className="ml-2 underline underline-offset-2 opacity-90 hover:opacity-100 whitespace-nowrap text-xs font-bold shrink-0"
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
