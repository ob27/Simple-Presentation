// Read-side helpers for the shared, cross-product notifications/{docId}
// Firestore collection (also used by the main Oestler app and every other
// Simple-* product) — no shared code exists between these repos, so this
// is a hand-mirrored copy of Simple-Checklists' own src/store.ts functions
// of the same name. This app does not yet WRITE any notifications of its
// own (no domain-event triggers built here) — it only displays whatever's
// already in the shared feed for the signed-in user.
import { collection, doc, deleteDoc, updateDoc, onSnapshot, orderBy, query, where, writeBatch, limit } from 'firebase/firestore';
import { db } from '../firebase';

export interface PlatformNotification {
  id: string;
  userId: string | null;
  read?: boolean;
  createdAt: number | { toDate: () => Date };
  sourceApp?: 'simple-checklists' | 'simple-kanban' | 'simple-presentation' | 'simple-asset-management' | 'simple-doc-control';
  type: string;
  title: string;
  body?: string;
  message?: string;
  description?: string;
  link?: string;
}

export function notificationMillis(createdAt: PlatformNotification['createdAt']): number {
  return typeof createdAt === 'number' ? createdAt : createdAt?.toDate?.().getTime() ?? 0;
}

export function subscribeUserNotifications(uid: string, onChange: (notifications: PlatformNotification[]) => void): () => void {
  const q = query(collection(db, 'notifications'), where('userId', '==', uid), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(q, snap => {
    const notifications = snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as PlatformNotification));
    notifications.sort((a, b) => notificationMillis(b.createdAt) - notificationMillis(a.createdAt));
    onChange(notifications);
  });
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await updateDoc(doc(db, 'notifications', notificationId), { read: true });
}

export async function markAllNotificationsRead(notifications: PlatformNotification[]): Promise<void> {
  const unread = notifications.filter(n => !n.read);
  if (!unread.length) return;
  const batch = writeBatch(db);
  unread.forEach(n => batch.update(doc(db, 'notifications', n.id), { read: true }));
  await batch.commit();
}

export async function deleteNotification(notificationId: string): Promise<void> {
  await deleteDoc(doc(db, 'notifications', notificationId));
}

export async function clearAllNotifications(notifications: PlatformNotification[]): Promise<void> {
  if (!notifications.length) return;
  const batch = writeBatch(db);
  notifications.forEach(n => batch.delete(doc(db, 'notifications', n.id)));
  await batch.commit();
}
