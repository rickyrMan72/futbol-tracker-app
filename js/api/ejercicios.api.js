import { db, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, auth, query, where } from '../firebase-config.js';

export const ejerciciosApi = {
    suscribir: (callback) => {
        if (!auth.currentUser) return () => {};
        const q = query(collection(db, 'ejercicios'), where('ownerId', '==', auth.currentUser.uid));
        return onSnapshot(q, (snapshot) => {
            const ejercicios = [];
            snapshot.forEach((doc) => ejercicios.push({ id: doc.id, ...doc.data() }));
            callback(ejercicios);
        }, (error) => {
            if (error.code === 'permission-denied' && !auth.currentUser) return;
            console.error("Error fetching exercises:", error);
        });
    },

    crear: async (datos) => {
        if (!auth.currentUser) throw new Error("No autenticado");
        datos.ownerId = auth.currentUser.uid;
        return await addDoc(collection(db, 'ejercicios'), datos);
    },

    actualizar: async (id, datos) => {
        return await updateDoc(doc(db, 'ejercicios', id), datos);
    },

    eliminar: async (id) => {
        return await deleteDoc(doc(db, 'ejercicios', id));
    }
};
