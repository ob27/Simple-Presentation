import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { storage, db } from '../firebase';

export interface WorkspaceSettings {
  navLogoUrl: string | null;
  navBgColor: string;
}

const DEFAULT_SETTINGS: WorkspaceSettings = { navLogoUrl: null, navBgColor: '#1a1a2e' };

// Stored on the same shared `users/{uid}` doc Simple Kanban already uses for
// its own workspace settings (its Firestore rule already permits
// create/update by the owning uid, so no rules change is needed here) —
// but under distinctly-prefixed field names so the two apps' branding never
// collides on the same doc.
export async function getWorkspaceSettings(uid: string): Promise<WorkspaceSettings> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return DEFAULT_SETTINGS;
  const d = snap.data();
  return {
    navLogoUrl: (d.presentationNavLogoUrl as string | null | undefined) ?? null,
    navBgColor: (d.presentationNavBgColor as string | null | undefined) ?? DEFAULT_SETTINGS.navBgColor,
  };
}

export async function saveNavBgColor(uid: string, color: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), { presentationNavBgColor: color }, { merge: true });
}

// Stored under the existing logos/{uid}/ Storage path Simple Kanban already
// uses (its rule already permits write by the owning uid) — a distinctly
// named file slot (presentation-nav.*) so it never collides with Kanban's
// own nav.*/board.* logo files in the same uid folder.
export async function uploadNavLogo(uid: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'png';
  const storageRef = ref(storage, `logos/${uid}/presentation-nav.${ext}`);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  await setDoc(doc(db, 'users', uid), { presentationNavLogoUrl: url }, { merge: true });
  return url;
}

export async function deleteNavLogo(uid: string): Promise<void> {
  for (const ext of ['png', 'jpg', 'jpeg', 'svg', 'webp']) {
    try { await deleteObject(ref(storage, `logos/${uid}/presentation-nav.${ext}`)); } catch { /* not found, skip */ }
  }
  await setDoc(doc(db, 'users', uid), { presentationNavLogoUrl: null }, { merge: true });
}
