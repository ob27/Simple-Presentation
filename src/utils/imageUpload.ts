import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export async function uploadDiagramMedia(diagramId: string, file: File, folder: string): Promise<string> {
  const fileId = crypto.randomUUID();
  const ext = file.name.split('.').pop() ?? 'bin';
  const storageRef = ref(storage, `${folder}/${diagramId}/${fileId}.${ext}`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export function uploadDiagramImage(diagramId: string, file: File): Promise<string> {
  return uploadDiagramMedia(diagramId, file, 'diagramImages');
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
