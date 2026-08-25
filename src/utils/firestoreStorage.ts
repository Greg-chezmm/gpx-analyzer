import { getFirestoreDb } from './firebase';
import type { Sex } from '../hooks/useUserSettings';
import type { RaceGoalConfig } from '../hooks/useRaceGoal';
import type { ActivityIndexEntry } from './driveStorage';

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

// ── Activités — métadonnées Firestore uniquement ───────────────────────────────────────
// Le fichier brut GPX/FIT reste sur Google Drive (`entry.fileId`) — solution hybride, Firebase
// Storage nécessitant un forfait payant non actif actuellement. Upload/téléchargement/suppression
// du fichier vivent dans driveStorage.ts (uploadRawFileToDrive/fetchActivityFile/deleteRawFileFromDrive) ;
// ce module n'orchestre que les métadonnées, la coordination des deux se fait dans useFirebaseCloud.ts.

/** Récupère toutes les activités d'un utilisateur depuis Firestore (tri chronologique inversé). */
export async function fetchCloudActivities(uid: string): Promise<ActivityIndexEntry[]> {
  const [db, { collection, getDocs, query, orderBy }] = await Promise.all([
    getFirestoreDb(), import('firebase/firestore'),
  ]);
  const snap = await getDocs(query(collection(db, 'users', uid, 'activities'), orderBy('date', 'desc')));
  return snap.docs.map(d => ({ ...(d.data() as Omit<ActivityIndexEntry, 'cloudId'>), cloudId: d.id }));
}

/** Résultat d'une recherche d'activité existante (même jour + même nom ou nom de fichier). */
export interface ExistingCloudActivity {
  cloudId: string;
  fileId: string | null;
}

/**
 * Recherche une activité déjà sauvegardée le même jour, sous le même nom ou le même nom de
 * fichier (renommage) — source de vérité unique pour la déduplication, toujours interrogée
 * fraîche sur Firestore (jamais l'état local React, qui peut être périmé juste après un
 * rechargement de page et provoquerait sinon un re-upload Drive inutile, voir useFirebaseCloud.ts).
 * Recherche limitée au jour (pas de requête composite date+nom) pour éviter un index Firestore
 * composite ; le volume par jour (quelques activités max) rend le filtrage côté client négligeable.
 */
export async function findExistingCloudActivity(
  uid: string, date: string, name: string, fileName: string,
): Promise<ExistingCloudActivity | null> {
  const [db, { collection, getDocs, query, where }] = await Promise.all([
    getFirestoreDb(), import('firebase/firestore'),
  ]);
  const col = collection(db, 'users', uid, 'activities');
  const sameDay = await getDocs(query(col, where('date', '==', date)));
  const existing = sameDay.docs.find(d => {
    const data = d.data() as ActivityIndexEntry;
    return data.name === name || data.fileName === fileName;
  });
  return existing ? { cloudId: existing.id, fileId: (existing.data() as ActivityIndexEntry).fileId } : null;
}

/** Crée un nouveau document d'activité ; retourne son id. À n'appeler qu'après avoir vérifié via `findExistingCloudActivity` qu'aucun doublon n'existe. */
export async function createCloudActivityMeta(uid: string, entry: Omit<ActivityIndexEntry, 'cloudId'>): Promise<string> {
  const [db, { collection, doc, setDoc }] = await Promise.all([getFirestoreDb(), import('firebase/firestore')]);
  const ref = doc(collection(db, 'users', uid, 'activities'));
  await setDoc(ref, entry);
  return ref.id;
}

/** Met à jour uniquement les métadonnées d'une activité Firestore (ex. drapeau course, meilleurs efforts). */
export async function updateCloudActivityMeta(
  uid: string,
  cloudId: string,
  updates: Partial<ActivityIndexEntry>,
): Promise<void> {
  const [db, { doc, updateDoc }] = await Promise.all([getFirestoreDb(), import('firebase/firestore')]);
  await updateDoc(doc(db, 'users', uid, 'activities', cloudId), updates);
}

/** Supprime le document Firestore d'une activité (le fichier brut Drive est supprimé séparément, voir driveStorage.ts). */
export async function deleteCloudActivityDoc(uid: string, cloudId: string): Promise<void> {
  const [db, { doc, deleteDoc }] = await Promise.all([getFirestoreDb(), import('firebase/firestore')]);
  await deleteDoc(doc(db, 'users', uid, 'activities', cloudId));
}
