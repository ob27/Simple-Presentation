import { initializeApp, setLogLevel } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

// Opt-in only (VITE_USE_FIREBASE_EMULATOR=true), for local agent/browser
// testing against the Firebase Emulator Suite instead of the real project —
// never set in the committed .env files, so production behavior is
// unchanged unless someone deliberately exports this for a dev session.
const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true';

const firebaseConfig = useEmulator
  ? {
      apiKey: 'demo-api-key',
      authDomain: 'localhost',
      projectId: 'demo-simple-presentation',
      storageBucket: 'demo-simple-presentation.appspot.com',
      messagingSenderId: '000000000000',
      appId: '1:000000000000:web:0000000000000000000000',
      databaseURL: 'http://127.0.0.1:9000/?ns=demo-simple-presentation',
    }
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
      appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
      measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string,
      databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL as string,
    };

export const app = initializeApp(firebaseConfig);
setLogLevel('silent');
export const analytics = useEmulator ? undefined : getAnalytics(app);
export const auth = getAuth(app);
// Persisted (IndexedDB-backed) local cache — reopening a previously-viewed
// diagram now hydrates instantly from disk instead of a full network
// re-fetch of every document, only pulling deltas from there. The
// multiple-tab variant keeps that cache correctly shared/coherent across
// more than one open tab on the same diagram, rather than each tab paying
// for its own independent full fetch.
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const storage = getStorage(app);
export const rtdb = getDatabase(app);

if (useEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  connectDatabaseEmulator(rtdb, '127.0.0.1', 9000);
}

if (import.meta.env.PROD && !useEmulator) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY as string),
    isTokenAutoRefreshEnabled: true,
  });
}
