import { useState, useEffect, useCallback } from "react";
import type { User } from "firebase/auth";
import { onFirebaseAuthChange, signInWithGoogle, signOutFirebase, isFirebaseConfigured } from "../utils/firebase";

export type FirebaseAuthStatus = 'unavailable' | 'loading' | 'signed-out' | 'signed-in';

/** État de connexion Firebase (Auth Google) — écoute l'état global du SDK, partagé par tous les composants. */
export function useFirebaseAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<FirebaseAuthStatus>(isFirebaseConfigured ? 'loading' : 'unavailable');

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    let unsubscribe: (() => void) | undefined;
    onFirebaseAuthChange(u => {
      setUser(u);
      setStatus(u ? 'signed-in' : 'signed-out');
    }).then(fn => { unsubscribe = fn; });
    return () => unsubscribe?.();
  }, []);

  const signIn = useCallback(async () => {
    await signInWithGoogle();
  }, []);

  const signOut = useCallback(async () => {
    await signOutFirebase();
  }, []);

  return { user, status, signIn, signOut };
}
