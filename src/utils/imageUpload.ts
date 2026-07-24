import { ref, uploadBytes, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export interface UploadResult {
  url: string;
  sizeBytes: number;
}

// Resumable (not the plain one-shot uploadBytes) specifically so callers can
// show a real progress bar — 'state_changed' fires with byte-level progress
// throughout the upload, which uploadBytes has no equivalent event for.
export function uploadDiagramMedia(
  diagramId: string, file: File | Blob, folder: string, onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const fileId = crypto.randomUUID();
    const ext = file instanceof File ? file.name.split('.').pop() ?? 'bin' : (file.type.split('/')[1] ?? 'bin');
    const storageRef = ref(storage, `${folder}/${diagramId}/${fileId}.${ext}`);
    // Media assets were re-downloading on every page open instead of being
    // served from the browser's own disk cache — no Cache-Control metadata
    // was ever set on upload. Safe to set a full year + immutable here
    // specifically because the path already carries a random id per upload
    // (unlike the two fixed-path logo uploaders elsewhere, which needed a
    // path change first) — a re-upload always gets a brand new URL, so
    // there's nothing to ever invalidate.
    const task = uploadBytesResumable(storageRef, file, { cacheControl: 'public, max-age=31536000, immutable' });
    task.on('state_changed',
      snapshot => onProgress?.(snapshot.totalBytes > 0 ? (snapshot.bytesTransferred / snapshot.totalBytes) * 100 : 0),
      reject,
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve({ url, sizeBytes: task.snapshot.totalBytes });
        } catch (err) {
          reject(err);
        }
      },
    );
  });
}

export function uploadDiagramImage(diagramId: string, file: File | Blob, onProgress?: (percent: number) => void): Promise<UploadResult> {
  return uploadDiagramMedia(diagramId, file, 'diagramImages', onProgress);
}

// Persists a page/cover thumbnail (a data URL from exportPageAsImage) to
// Storage so it survives reload/other sessions, not just the tab that
// rendered it. Random per-upload path (matching uploadDiagramMedia above),
// so the long-lived cacheControl below can never go stale — a regenerated
// thumbnail just gets a brand new URL rather than overwriting the old one.
export async function uploadThumbnail(diagramId: string, dataUrl: string, folder: 'pageThumbnails' | 'coverThumbnails'): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const storageRef = ref(storage, `${folder}/${diagramId}/${crypto.randomUUID()}.png`);
  await uploadBytes(storageRef, blob, { cacheControl: 'public, max-age=31536000, immutable' });
  return getDownloadURL(storageRef);
}

// Reads the file locally to get intrinsic pixel dimensions before it's placed
// as a shape, so the shape starts at the correct aspect ratio rather than a
// generic default box.
export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth || 200, height: img.naturalHeight || 200 });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image dimensions'));
    };
    img.src = url;
  });
}

// Mirrors getImageDimensions above — reads the file locally via a <video>
// element's loadedmetadata event instead of Image.onload, so a video shape
// also starts at its correct intrinsic aspect ratio.
export function getVideoDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({ width: video.videoWidth || 320, height: video.videoHeight || 180 });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read video dimensions'));
    };
    video.src = url;
  });
}
