import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export async function opprettBrukerDokument(userId: string, navn: string, epost: string) {
  const ref = doc(db, 'users', userId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    await setDoc(ref, {
      navn,
      epost,
      opprettet: serverTimestamp(),
      aktiveProgram: [],
      sisteKartleggingId: null,
      varsler: {
        okt: true,
        reassessment: true,
        streak: false,
        tidspunkt: '08:00',
      },
    });
  }
}

export async function hentBruker(userId: string) {
  const ref = doc(db, 'users', userId);
  const snapshot = await getDoc(ref);
  return snapshot.exists() ? snapshot.data() : null;
}
