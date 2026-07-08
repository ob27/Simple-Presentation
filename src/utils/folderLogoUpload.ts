import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';
import { storage, db } from '../firebase';

// Mirrors Simple AIM Kanban's utils/logoUpload.ts folder-icon functions,
// at a distinct storage path (diagramFolders vs. Kanban's folders) so the
// two apps' folder icons never collide despite sharing a Storage bucket.

export async function uploadFolderLogo(folderId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'png';
  const storageRef = ref(storage, `logos/diagramFolders/${folderId}/logo.${ext}`);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  await setDoc(doc(db, 'diagramFolders', folderId), { folderLogoUrl: url }, { merge: true });
  return url;
}

export async function deleteFolderLogo(folderId: string): Promise<void> {
  for (const ext of ['png', 'jpg', 'jpeg', 'svg', 'webp']) {
    try { await deleteObject(ref(storage, `logos/diagramFolders/${folderId}/logo.${ext}`)); } catch { /* skip */ }
  }
  await setDoc(doc(db, 'diagramFolders', folderId), { folderLogoUrl: null }, { merge: true });
}
