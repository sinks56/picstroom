import type { Feed } from '../types';

/**
 * Sort feeds by their saved `order`, keeping the incoming order for ties and for feeds
 * with no (or an invalid) order value, then renumber 0..n-1.
 *
 * Before v1.5.0 `order` was only `feeds.length` at the time a feed was added, so after
 * deleting feeds there can be gaps or duplicates. Array.prototype.sort is stable, so
 * the result is exactly the order v1.4.0 displayed, now made explicit and unique.
 */
export function normalizeFeedOrder(feeds: Feed[]): { feeds: Feed[]; changed: Feed[] } {
  const key = (f: Feed) => (typeof f.order === 'number' && Number.isFinite(f.order) ? f.order : Number.POSITIVE_INFINITY);
  const sorted = feeds.map((f, i) => ({ f, i })).sort((a, b) => key(a.f) - key(b.f) || a.i - b.i);
  const changed: Feed[] = [];
  const out = sorted.map(({ f }, i) => {
    if (f.order === i) return f;
    const next = { ...f, order: i };
    changed.push(next);
    return next;
  });
  return { feeds: out, changed };
}

/** Move one item to a new index (clamped) and renumber `order`. Returns null when nothing moves. */
export function moveFeed(feeds: Feed[], feedId: string, toIndex: number): Feed[] | null {
  const from = feeds.findIndex(f => f.id === feedId);
  if (from === -1) return null;
  const to = Math.max(0, Math.min(feeds.length - 1, toIndex));
  if (from === to) return null;
  const next = [...feeds];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next.map((f, i) => (f.order === i ? f : { ...f, order: i }));
}
