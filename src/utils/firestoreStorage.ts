import { getFirestoreDb } from './firebase';
import type { Sex } from '../hooks/useUserSettings';
import type { RaceGoalConfig } from '../hooks/useRaceGoal';

/** Document de réglages athlète stocké sur Firestore (`users/{uid}/settings/main`). */
export interface FirestoreUserSettings {
  fcMax: number;
  fcRest: number;
  vma: number;
  ftp: number;
  weight: number;
  birthYear: number;
  sex: Sex;
  raceGoal: RaceGoalConfig | null;
}

/** Charge le document de réglages athlète depuis Firestore ; retourne null si inexistant. */
export async function loadFirestoreSettings(uid: string): Promise<FirestoreUserSettings | null> {
  const [db, { doc, getDoc }] = await Promise.all([getFirestoreDb(), import('firebase/firestore')]);
  const snap = await getDoc(doc(db, 'users', uid, 'settings', 'main'));
  return snap.exists() ? (snap.data() as FirestoreUserSettings) : null;
}

/** Sauvegarde (fusion partielle) le document de réglages athlète sur Firestore. */
export async function saveFirestoreSettings(uid: string, settings: Partial<FirestoreUserSettings>): Promise<void> {
  const [db, { doc, setDoc }] = await Promise.all([getFirestoreDb(), import('firebase/firestore')]);
  await setDoc(doc(db, 'users', uid, 'settings', 'main'), settings, { merge: true });
}
