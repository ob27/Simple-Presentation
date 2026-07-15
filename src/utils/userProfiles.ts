import { useEffect, useState } from 'react';
import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export interface UserProfile {
  nickname?: string;
  avatarSeed?: string;
  avatarPhotoURL?: string;
}

const CHUNK_SIZE = 30; // Firestore's current `in`-query cap
const cache = new Map<string, UserProfile>();
const cacheStamp = new Map<string, number>();
const TTL_MS = 10 * 60 * 1000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Resolves nicknames/avatars for OTHER users by uid, off the same shared
// `users/{uid}` doc this app already reads its own workspace settings from
// (see utils/workspaceSettings.ts). One-time fetch per uid, cached —
// nickname edits are rare, and every consumer's uid list already changes on
// its own live triggers, so staleness self-heals on the next natural
// re-render rather than needing a dedicated live listener per avatar.
export async function resolveUserProfiles(uids: string[]): Promise<Record<string, UserProfile>> {
  const now = Date.now();
  const unique = Array.from(new Set(uids.filter(Boolean)));
  const result: Record<string, UserProfile> = {};
  const missing = unique.filter(uid => {
    const stamp = cacheStamp.get(uid);
    if (cache.has(uid) && stamp && now - stamp < TTL_MS) { result[uid] = cache.get(uid)!; return false; }
    return true;
  });
  if (missing.length === 0) return result;

  await Promise.all(chunk(missing, CHUNK_SIZE).map(async batch => {
    try {
      const snap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', batch)));
      snap.forEach(d => {
        const data = d.data() || {};
        const profile: UserProfile = {
          nickname: data.nickname || undefined,
          avatarSeed: data.avatarSeed || undefined,
          avatarPhotoURL: data.avatarPhotoURL || undefined,
        };
        cache.set(d.id, profile);
        cacheStamp.set(d.id, now);
        result[d.id] = profile;
      });
    } catch (err) {
      console.warn('resolveUserProfiles: batch fetch failed', err);
    }
  }));
  return result;
}

export function useUserProfiles(uids: string[]): Record<string, UserProfile> {
  const key = Array.from(new Set(uids.filter(Boolean))).sort().join('|');
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  useEffect(() => {
    if (!key) { setProfiles({}); return; }
    let cancelled = false;
    resolveUserProfiles(key.split('|')).then(p => { if (!cancelled) setProfiles(p); });
    return () => { cancelled = true; };
  }, [key]);
  return profiles;
}

// Convenience for the common "nickname-or-email, seed-or-fallback" display
// pattern used across every member/comment-author rendering site.
export function resolveDisplay(uid: string, fallbackNameOrEmail: string, profiles: Record<string, UserProfile>): {
  name: string;
  avatarSeed: string;
  avatarPhotoURL: string | undefined;
} {
  const p = profiles[uid];
  return {
    name: p?.nickname || fallbackNameOrEmail || uid,
    avatarSeed: p?.avatarSeed || fallbackNameOrEmail || uid,
    avatarPhotoURL: p?.avatarPhotoURL,
  };
}
