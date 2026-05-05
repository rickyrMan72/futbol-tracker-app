import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, setDoc, arrayRemove, arrayUnion, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBWv7cVvQZtXMWMOYhhodfdt_6fstImXK4",
    authDomain: "futbol-tracker-app.firebaseapp.com",
    projectId: "futbol-tracker-app",
    storageBucket: "futbol-tracker-app.firebasestorage.app",
    messagingSenderId: "272883171358",
    appId: "1:272883171358:web:c3e276ab3376923a912e0f"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { signInAnonymously, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, setDoc, arrayRemove, arrayUnion, query, where };