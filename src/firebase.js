import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAPFTupd16Mi0O6BiYOi37f_o9dOPfgfEc",
  authDomain: "ecoshare-cnew.firebaseapp.com",
  projectId: "ecoshare-cnew",
  storageBucket: "ecoshare-cnew.firebasestorage.app",
  messagingSenderId: "728070194354",
  appId: "1:728070194354:web:5996b442532c30c20875ab",
  measurementId: "G-75HYHFT4RB"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);