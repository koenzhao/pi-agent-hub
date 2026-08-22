export function nextUpdatedAt(previous: number, requestedNow = Date.now()): number {
  return Math.max(requestedNow, previous + 1);
}
