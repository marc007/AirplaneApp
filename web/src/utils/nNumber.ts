export function normalizeNNumber(input: unknown): string {
  if (input === null || input === undefined) {
    return '';
  }

  const value = String(input)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  if (!value) {
    return '';
  }

  const withoutPrefix = value.replace(/^N+/, '');
  return withoutPrefix ? `N${withoutPrefix}` : 'N';
}
