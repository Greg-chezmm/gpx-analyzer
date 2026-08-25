// ─── Firebase — init paresseuse (Auth + Firestore) ─────────────────────────────
//
// Le SDK Firebase est chargé en import() dynamique, pas au chargement initial de l'app —
// même discipline que Leaflet/fit-file-parser (voir App.tsx) pour garder le bundle initial léger.
// initializeApp() lui-même est bon marché ; ce qui pèse, ce sont les modules auth/firestore,
// donc on ne les importe qu'au premier appel réel (connexion, lecture/écriture).

import type { FirebaseApp } from 'firebase/app';
import type { Auth, User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const isFirebaseConfigured = !!firebaseConfig.apiKey;

let appPromise: Promise<FirebaseApp> | null = null;

/** Initialise (une seule fois) et retourne l'app Firebase. */
async function getApp(): Promise<FirebaseApp> {
  if (!appPromise) {
    appPromise = import('firebase/app').then(({ initializeApp }) => initializeApp(firebaseConfig));
  }
  return appPromise;
}

let authPromise: Promise<Auth> | null = null;

/** Retourne l'instance Auth Firebase (charge le module `firebase/auth` à la demande). */
export async function getFirebaseAuth(): Promise<Auth> {
  if (!authPromise) {
    authPromise = (async () => {
      const [app, { getAuth }] = await Promise.all([getApp(), import('firebase/auth')]);
      return getAuth(app);
    })();
  }
  return authPromise;
}

let dbPromise: Promise<Firestore> | null = null;

/** Retourne l'instance Firestore (charge le module `firebase/firestore` à la demande). */
export async function getFirestoreDb(): Promise<Firestore> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const [app, { getFirestore }] = await Promise.all([getApp(), import('firebase/firestore')]);
      return getFirestore(app);
    })();
  }
  return dbPromise;
}

/** Ouvre la popup de connexion Google via Firebase Auth ; retourne l'utilisateur connecté. */
export async function signInWithGoogle(): Promise<User> {
  const [auth, { GoogleAuthProvider, signInWithPopup }] = await Promise.all([
    getFirebaseAuth(),
    import('firebase/auth'),
  ]);
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  return result.user;
}

/** Déconnecte l'utilisateur Firebase courant. */
export async function signOutFirebase(): Promise<void> {
  const [auth, { signOut }] = await Promise.all([getFirebaseAuth(), import('firebase/auth')]);
  await signOut(auth);
}

/** Enregistre un callback appelé à chaque changement d'état de connexion ; retourne la fonction de désinscription. */
export async function onFirebaseAuthChange(callback: (user: User | null) => void): Promise<() => void> {
  const [auth, { onAuthStateChanged }] = await Promise.all([getFirebaseAuth(), import('firebase/auth')]);
  return onAuthStateChanged(auth, callback);
}
