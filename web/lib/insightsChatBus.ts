// A tiny cross-component bridge so the dashboard's "Today's digest" button can
// drive the floating Insights chat widget — the two live in different parts of
// the admin tree (the widget in app/admin/layout.tsx, the digest card deep
// inside app/admin/page.tsx) so they can't share React state directly.
//
// The widget subscribes on mount; the digest card fires the request. Kept
// deliberately minimal: one event, no payload — the widget owns the digest
// generation itself so it can show the same typing/answer flow as a chat reply.

type DigestListener = () => void;

const listeners = new Set<DigestListener>();

/** The chat widget subscribes on mount; returns an unsubscribe for cleanup. */
export function onDigestRequested(fn: DigestListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Fired by the dashboard to open the chat and generate today's digest there.
 * Returns false when no widget is listening (e.g. the copilot is turned off),
 * so the caller can fall back gracefully.
 */
export function requestDigestInChat(): boolean {
  if (listeners.size === 0) return false;
  listeners.forEach((fn) => fn());
  return true;
}
