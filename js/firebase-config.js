import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, GoogleAuthProvider, signInWithPopup, linkWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, getDocs, deleteDoc, doc, updateDoc, setDoc, arrayRemove, arrayUnion, query, where, getDocFromServer, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCEFyF--8CCDZNCAVjNPNMqHVlT13YlfkY",
  authDomain: "futbol-tracker-pro.firebaseapp.com",
  projectId: "futbol-tracker-pro",
  storageBucket: "futbol-tracker-pro.firebasestorage.app",
  messagingSenderId: "73174664755",
  appId: "1:73174664755:web:a0bdf89f996274129b8546"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { signInAnonymously, GoogleAuthProvider, signInWithPopup, linkWithPopup, onAuthStateChanged, signOut, collection, addDoc, onSnapshot, getDocs, deleteDoc, doc, updateDoc, setDoc, arrayRemove, arrayUnion, query, where, getDocFromServer, getDoc };
