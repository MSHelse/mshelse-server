import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyA1gBNOALDbaUKrvuH8wrstlTF_RpPL-aA",
  authDomain: "mshelse.firebaseapp.com",
  projectId: "mshelse",
  storageBucket: "mshelse.firebasestorage.app",
  messagingSenderId: "525464618607",
  appId: "1:525464618607:web:3aa1fdcd3f70f19e89af9a"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);