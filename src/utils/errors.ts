/** Extract a human-readable message from an unknown caught value. */
export function toErrorMessage(e: unknown): string {
  if (e instanceof Error) { return e.message; }
  if (typeof e === 'string') { return e; }
  return 'Unknown error';
}
