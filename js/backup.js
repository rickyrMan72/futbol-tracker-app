import { db, doc, setDoc, auth, collection, getDocs, query, where } from './firebase-config.js';
import { mostrarNotificacion } from './ui.js';

const COLECCIONES = ['equipos', 'jugadores', 'ejercicios', 'sesiones', 'partidos', 'jugadas'];

export async function exportarDatos() {
    if (!auth.currentUser) return;
    
    try {
        const backupData = {};
        
        for (const coll of COLECCIONES) {
            const q = query(collection(db, coll), where('ownerId', '==', auth.currentUser.uid));
            const snap = await getDocs(q);
            backupData[coll] = [];
            
            for (const d of snap.docs) {
                const data = d.data();
                data.id = d.id; // Store original ID
                backupData[coll].push(data);
                
                if (coll === 'partidos') {
                    // Fetch subcollections for partidos
                    const efemQ = query(collection(db, 'partidos', d.id, 'efemerides'));
                    const efemSnap = await getDocs(efemQ);
                    data.efemerides = [];
                    efemSnap.forEach(efem => {
                        const efemData = efem.data();
                        efemData.id = efem.id;
                        data.efemerides.push(efemData);
                    });
                }
            }
        }

        const jsonStr = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `futbol-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        mostrarNotificacion("Datos exportados correctamente");
    } catch (e) {
        console.error("Error al exportar:", e);
        mostrarNotificacion("Error al exportar los datos", true);
    }
}

export async function importarDatos(file) {
    if (!auth.currentUser) return;
    
    try {
        const text = await file.text();
        const backupData = JSON.parse(text);
        
        let count = 0;
        for (const coll of COLECCIONES) {
            if (!backupData[coll]) continue;
            
            for (const item of backupData[coll]) {
                const docId = item.id;
                delete item.id; // Remove id from data body
                item.ownerId = auth.currentUser.uid; // Override with current user
                
                const efemerides = item.efemerides;
                delete item.efemerides;
                
                await setDoc(doc(db, coll, docId), item);
                count++;
                
                if (coll === 'partidos' && efemerides) {
                    for (const efem of efemerides) {
                        const efemId = efem.id;
                        delete efem.id;
                        efem.ownerId = auth.currentUser.uid;
                        await setDoc(doc(db, 'partidos', docId, 'efemerides', efemId), efem);
                    }
                }
            }
        }
        
        mostrarNotificacion(`Importación completada: ${count} registros`);
        setTimeout(() => window.location.reload(), 2000);
        
    } catch (e) {
        console.error("Error al importar:", e);
        mostrarNotificacion("Error al importar los datos. Archivo inválido.", true);
    }
}
