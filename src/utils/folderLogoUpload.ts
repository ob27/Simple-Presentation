import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';
import { storage, db } from '../firebase';

// Mirrors Simple AIM Kanban's utils/logoUpload.ts folder-icon functions,
// at a distinct storage path (diagramFolders vs. Kanban's folders) so the
// two apps' folder icons never collide despite sharing a Storage bucket.
//
// The filename carries a timestamp rather than being fixed (`logo.{ext}`)
// — that's what lets this upload get a real long-lived Cache-Control
// below: a fixed path re-used across re-uploads would mean a legitimate
// icon change stays stuck behind other users' year-long browser cache
// until it expires, whereas a genuinely new path per upload needs no cache
// invalidation at all. The old blob is simply left behind (cheap,
// low-volume) rather than tracked for cleanup.

export async function uploadFolderLogo(folderId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'png';
  const storageRef = ref(storage, `logos/diagramFolders/${folderId}/logo.${Date.now()}.${ext}`);
  await uploadBytes(storageRef, file, { cacheControl: 'public, max-age=31536000, immutable' });
  const url = await getDownloadURL(storageRef);
  await setDoc(doc(db, 'diagramFolders', folderId), { folderLogoUrl: url }, { merge: true });
  return url;
}

export async function deleteFolderLogo(folderId: string): Promise<void> {
  // Only ever clears the Firestore field the app actually reads to decide
  // whether an icon displays — the versioned-path scheme above means the
  // current blob's exact name isn't guessable from a fixed extension list
  // the way it was before, so removal no longer also deletes the
  // underlying Storage object (an orphaned-blob storage cost, not a
  // visible bug: the icon genuinely disappears the moment this field
  // clears).
  await setDoc(doc(db, 'diagramFolders', folderId), { folderLogoUrl: null }, { merge: true });
}
