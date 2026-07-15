import { useEffect, useRef, useState, useCallback } from 'react';
import { ref, set, update, remove, onValue, onDisconnect } from 'firebase/database';
import type { User } from 'firebase/auth';
import { rtdb } from '../firebase';
import type { PresenceRecord, DragPreview } from '../types/presence';

const STALE_MS = 15000;

function colorForUid(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360}, 70%, 50%)`;
}

export function usePresence(diagramId: string, user: User | null, mode: 'edit' | 'present' = 'edit') {
  const sessionId = useRef(crypto.randomUUID()).current;
  const [peers, setPeers] = useState<PresenceRecord[]>([]);
  const lastCursorWrite = useRef(0);
  const rafPending = useRef(false);
  // Raw, unfiltered snapshot of every peer record — the staleness filter is
  // re-applied on a timer (not just when this ref changes), since onDisconnect
  // cleanup can lag well behind a real disconnect (RTDB has to detect the
  // dropped TCP connection server-side, which isn't instant) and a peer that
  // simply stops sending updates should still visually drop off client-side
  // without waiting for the next unrelated RTDB write to trigger a re-filter.
  const rawPeers = useRef<PresenceRecord[]>([]);

  useEffect(() => {
    if (!user) return;
    const myRef = ref(rtdb, `presence/${diagramId}/${sessionId}`);
    const initial: PresenceRecord = {
      uid: user.uid,
      displayName: user.email ?? 'Guest',
      color: colorForUid(user.uid),
      cursor: null,
      selectedShapeIds: [],
      dragPreview: null,
      lastActive: Date.now(),
      mode,
    };
    set(myRef, initial);
    onDisconnect(myRef).remove();

    function applyStaleFilter() {
      const now = Date.now();
      setPeers(rawPeers.current.filter(p => now - p.lastActive < STALE_MS));
    }

    const peersRef = ref(rtdb, `presence/${diagramId}`);
    const unsub = onValue(peersRef, snap => {
      const all: PresenceRecord[] = [];
      snap.forEach(child => {
        if (child.key === sessionId) return;
        const val = child.val() as PresenceRecord;
        if (!val) return;
        // Never show the current account's own cursor, even from a second
        // tab/window signed in as the same user — a "peer" is only ever
        // someone else. Two tabs of the same account get two different
        // sessionIds, so the session-key check above doesn't catch this.
        if (val.uid === user.uid) return;
        // While presenting, a remote cursor is only meaningful if that
        // person is actively editing — another viewer's inert pointer over
        // their own fullscreen view isn't useful the way a co-editor's is.
        if (mode === 'present' && val.mode !== 'edit') return;
        all.push(val);
      });
      rawPeers.current = all;
      applyStaleFilter();
    });

    const staleInterval = setInterval(applyStaleFilter, 3000);

    return () => {
      unsub();
      clearInterval(staleInterval);
      remove(myRef).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagramId, user?.uid, mode]);

  const updateCursor = useCallback((x: number, y: number) => {
    if (!user) return;
    const now = performance.now();
    // Throttle to ~24Hz via rAF gating rather than writing on every raw pointermove.
    if (rafPending.current || now - lastCursorWrite.current < 40) return;
    rafPending.current = true;
    lastCursorWrite.current = now;
    requestAnimationFrame(() => {
      rafPending.current = false;
      update(ref(rtdb, `presence/${diagramId}/${sessionId}`), {
        cursor: { x, y }, lastActive: Date.now(),
      });
    });
  }, [diagramId, sessionId, user]);

  const updateDragPreview = useCallback((preview: DragPreview | null) => {
    if (!user) return;
    update(ref(rtdb, `presence/${diagramId}/${sessionId}`), {
      dragPreview: preview, lastActive: Date.now(),
    });
  }, [diagramId, sessionId, user]);

  return { peers, updateCursor, updateDragPreview };
}
