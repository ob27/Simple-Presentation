import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export async function uploadDiagramImage(diagramId: string, file: File): Promise<string> {
  const fileId = crypto.randomUUID();
  const ext = file.name.split('.').pop() ?? 'png';
  const storageRef = ref(storage, `diagramImages/${diagramId}/${fileId}.${ext}`);
  await uploadBytes(storageRef, file);
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
