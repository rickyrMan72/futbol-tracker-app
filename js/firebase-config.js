import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, GoogleAuthProvider, signInWithPopup, linkWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, getDocs, deleteDoc, doc, updateDoc, setDoc, arrayRemove, arrayUnion, query, where, getDocFromServer, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
    projectId: "responsive-client-x07pf",
    appId: "1:281075593314:web:9a356ddd0d8b17e983613b",
    apiKey: "AIzaSyDWqXjSOiZDWleYHWiwGkhyrm0mY-ekPBo",
    authDomain: "responsive-client-x07pf.firebaseapp.com",
    storageBucket: "responsive-client-x07pf.firebasestorage.app",
    messagingSenderId: "281075593314"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, "ai-studio-b3344664-12cc-4e29-b689-6c4b51d55662");
export { signInAnonymously, GoogleAuthProvider, signInWithPopup, linkWithPopup, onAuthStateChanged, signOut, collection, addDoc, onSnapshot, getDocs, deleteDoc, doc, updateDoc, setDoc, arrayRemove, arrayUnion, query, where, getDocFromServer, getDoc };