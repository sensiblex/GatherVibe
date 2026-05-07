export function capitalizeFirstDisplayChar(value: unknown): string {
  if (value == null) return '';

  const text = String(value).trimStart();
  if (!text.trim()) return '';

  return text.charAt(0).toUpperCase() + text.slice(1);
}
