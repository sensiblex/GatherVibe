function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function extractApiErrorMessage(detail: unknown): string {
  if (typeof detail === 'string') {
    const trimmed = detail.trim();
    return trimmed || 'Ошибка';
  }

  if (Array.isArray(detail)) {
    return detail
      .map((entry) => {
        if (entry && typeof entry === 'object') {
          const msg = (entry as { msg?: unknown }).msg;
          if (typeof msg === 'string') return msg;
        }
        return stringifyUnknown(entry);
      })
      .join('; ');
  }

  if (detail && typeof detail === 'object') {
    const details = detail as { msg?: unknown; message?: unknown };
    if (typeof details.msg === 'string') return details.msg;
    if (typeof details.message === 'string') return details.message;
    return stringifyUnknown(details);
  }

  return 'Ошибка';
}
