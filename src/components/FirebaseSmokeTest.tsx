import { useState } from "react";
import { Flame, Loader2 } from "lucide-react";
import { isFirebaseConfigured, getFirestoreDb } from "../utils/firebase";
import type { useFirebaseAuth } from "../hooks/useFirebaseAuth";

type TestState = 'idle' | 'running' | 'ok' | 'error';

interface Props {
  auth: ReturnType<typeof useFirebaseAuth>;
}

/**
 * Panneau de test temporaire (étape A/B du plan Firebase) — reflète l'état réel de connexion
 * (partagé avec le reste de l'app via useFirebaseAuth, pas un état isolé) pour vérifier que la
 * session persiste bien après un rechargement de page. À supprimer à l'étape C (vraie UI).
 */
export function FirebaseSmokeTest({ auth }: Props) {
  const [state, setState] = useState<TestState>('idle');
  const [message, setMessage] = useState<string>('');

  if (!isFirebaseConfigured) return null;

  const testFirestore = async () => {
    if (!auth.user) return;
    setState('running');
    setMessage('');
    try {
      const [db, { doc, setDoc, getDoc }] = await Promise.all([
        getFirestoreDb(),
        import("firebase/firestore"),
      ]);
      const ref = doc(db, 'users', auth.user.uid, '_smoketest', 'ping');
      const at = new Date().toISOString();
      await setDoc(ref, { at, from: 'gpx-analyzer web' });
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Document introuvable après écriture');
      setState('ok');
      setMessage(`Firestore OK — doc lu : ${JSON.stringify(snap.data())}`);
    } catch (e) {
      setState('error');
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div style={{
      position: 'fixed', bottom: '1rem', right: '1rem', zIndex: 1500,
      background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem',
      boxShadow: 'var(--shadow-xl)', maxWidth: '360px', fontSize: '0.8rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: '#f97316', marginBottom: '0.4rem' }}>
        <Flame size={15} />
        Firebase (temporaire)
      </div>

      {auth.status === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-tertiary)' }}>
          <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Vérification de la session…
        </div>
      )}

      {auth.status === 'signed-out' && (
        <button type="button" onClick={() => auth.signIn()}
          style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
            padding: '0.3rem 0.6rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
          Se connecter
        </button>
      )}

      {auth.status === 'signed-in' && auth.user && (
        <>
          <div style={{ color: '#34d399', fontWeight: 600 }}>
            ✓ Connecté comme {auth.user.email}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
            <button type="button" onClick={testFirestore} disabled={state === 'running'}
              style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
                padding: '0.25rem 0.55rem', cursor: state === 'running' ? 'default' : 'pointer', color: 'var(--text-primary)',
                display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              {state === 'running' && <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} />}
              Tester Firestore
            </button>
            <button type="button" onClick={() => auth.signOut()}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
              Déconnexion
            </button>
          </div>
        </>
      )}

      {message && (
        <div style={{ marginTop: '0.5rem', color: state === 'error' ? '#ef4444' : 'var(--text-secondary)', wordBreak: 'break-word' }}>
          {message}
        </div>
      )}
    </div>
  );
}
