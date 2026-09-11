import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { db, doc, setDoc, auth } from './firebase-config.js';

export async function migrarDatosAntiguos() {
    if (!auth.currentUser) return;
    const status = document.getElementById('migration-status');
    const btn = document.getElementById('btn-migrate-data');
    if(status) {
        status.classList.remove('hidden');
        status.innerText = "Conectando a la base de datos anterior (puede tardar unos segundos)...";
    }
    if(btn) btn.disabled = true;
    
    try {
        const oldConfig = {
            apiKey: "AIzaSyBWv7cVvQZtXMWMOYhhodfdt_6fstImXK4",
            authDomain: "futbol-tracker-app.firebaseapp.com",
            projectId: "futbol-tracker-app",
            storageBucket: "futbol-tracker-app.firebasestorage.app",
            messagingSenderId: "272883171358",
            appId: "1:272883171358:web:c3e276ab3376923a912e0f"
        };
        
        // Copiar token de auth antiguo para que el SDK de oldApp lo detecte
        try {
            await new Promise((resolve) => {
                const request = indexedDB.open('firebaseLocalStorageDb');
                request.onsuccess = (event) => {
                    const idb = event.target.result;
                    if (!idb.objectStoreNames.contains('firebaseLocalStorage')) {
                        resolve(); return;
                    }
                    const transaction = idb.transaction(['firebaseLocalStorage'], 'readwrite');
                    const store = transaction.objectStore('firebaseLocalStorage');
                    const getReq = store.get(`firebase:authUser:${oldConfig.apiKey}:[DEFAULT]`);
                    getReq.onsuccess = (e) => {
                        if (e.target.result && e.target.result.value) {
                            const putReq = store.put({
                                fbase_key: `firebase:authUser:${oldConfig.apiKey}:oldApp`,
                                value: e.target.result.value
                            });
                            putReq.onsuccess = () => resolve();
                            putReq.onerror = () => resolve();
                        } else {
                            resolve();
                        }
                    };
                    getReq.onerror = () => resolve();
                };
                request.onerror = () => resolve();
            });
        } catch(e) {
            console.warn("Could not copy indexeddb auth", e);
        }

        const oldApp = initializeApp(oldConfig, "oldApp");
        const oldAuth = getAuth(oldApp);
        await oldAuth.authStateReady();
        
        const oldDb = getFirestore(oldApp);
        
        const colecciones = ['equipos', 'jugadores', 'ejercicios', 'sesiones', 'partidos', 'jugadas'];
        let count = 0;
        
        for (const coll of colecciones) {
            if(status) status.innerText = `Descargando ${coll}...`;
            try {
                const snap = await getDocs(collection(oldDb, coll));
                for (const d of snap.docs) {
                    try {
                        const data = d.data();
                        const docId = d.id;
                        data.ownerId = auth.currentUser.uid;
                        await setDoc(doc(db, coll, docId), data);
                        count++;
                        
                        if (coll === 'partidos') {
                            const efemSnap = await getDocs(collection(oldDb, 'partidos', docId, 'efemerides'));
                            for (const efem of efemSnap.docs) {
                                const efemData = efem.data();
                                efemData.ownerId = auth.currentUser.uid;
                                await setDoc(doc(db, 'partidos', docId, 'efemerides', efem.id), efemData);
                            }
                        }
                    } catch(err) {
                        console.error(`Error guardando migración ${coll} id ${d.id}:`, err);
                    }
                }
            } catch(collErr) {
                console.error(`Error obteniendo subcolección ${coll} de antigua BD:`, collErr);
            }
        }
        
        if(status) {
            status.innerText = `¡Migración completada! Se transifirieron ${count} registros a tu cuenta nueva.`;
            status.classList.replace('text-indigo-600', 'text-emerald-600');
        }
        setTimeout(() => window.location.reload(), 3000);
    } catch (e) {
        console.error("Error migracion:", e);
        if(status) {
            status.innerText = "Error general al transifir datos: " + e.message;
            status.classList.replace('text-indigo-600', 'text-red-600');
        }
        if(btn) btn.disabled = false;
    }
}
