import { db, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc } from '../firebase-config.js';

export const ejerciciosApi = {
    suscribir: (callback) => {
        return onSnapshot(collection(db, 'ejercicios'), (snapshot) => {
            const ejercicios = [];
            snapshot.forEach((doc) => ejercicios.push({ id: doc.id, ...doc.data() }));
            callback(ejercicios);
        }, (error) => {
            console.error("Error fetching exercises:", error);
        });
    },

    crear: async (datos) => {
        return await addDoc(collection(db, 'ejercicios'), datos);
    },

    actualizar: async (id, datos) => {
        return await updateDoc(doc(db, 'ejercicios', id), datos);
    },

    eliminar: async (id) => {
        return await deleteDoc(doc(db, 'ejercicios', id));
    }
};
