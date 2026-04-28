import { db, collection, addDoc, onSnapshot, deleteDoc, doc } from './firebase-config.js';
import { mostrarNotificacion, bindModal, confirmarAccion } from './ui.js';
import { todosLosEjercicios } from './mod-ejercicios.js';
import { todosLosJugadores } from './mod-jugadores.js';

const contenedor = document.getElementById('lista-sesiones-container');

export function initSesiones() {
    onSnapshot(collection(db, 'sesiones'), (snapshot) => {
        const sesiones = [];
        snapshot.forEach((doc) => sesiones.push({ id: doc.id, ...doc.data() }));
        sesiones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        renderizar(sesiones);
    });

    const prepSesion = () => {
        document.getElementById('sesion-ejercicios-list').innerHTML = todosLosEjercicios.map(ej => `<label><input type="checkbox" value="${ej.id}" class="chk-ej"> ${ej.nombre}</label>`).join('<br>');
        document.getElementById('sesion-jugadores-list').innerHTML = todosLosJugadores.map(jug => `<label><input type="checkbox" value="${jug.id}" checked class="chk-jug"> #${jug.dorsal} ${jug.nombre}</label>`).join('<br>');
        document.getElementById('input-sesion-fecha').value = new Date().toISOString().split('T')[0];
    };

    const closeModSes = bindModal('modal-sesion', 'btn-open-modal-sesion', 'btn-close-modal-sesion', 'btn-cancel-modal-sesion', prepSesion);
    
    document.getElementById('btn-save-modal-sesion').addEventListener('click', async () => {
        const data = {
            fecha: document.getElementById('input-sesion-fecha').value,
            objetivo: document.getElementById('input-sesion-objetivo').value,
            ejercicios: Array.from(document.querySelectorAll('.chk-ej:checked')).map(cb => cb.value),
            asistencia: Array.from(document.querySelectorAll('.chk-jug:checked')).map(cb => cb.value)
        };
        if (!data.fecha) return alert("Falta fecha");
        try { 
            await addDoc(collection(db, 'sesiones'), data); 
            mostrarNotificacion("Sesión guardada"); 
            document.getElementById('form-sesion').reset(); 
            closeModSes(); 
        } catch(e) { mostrarNotificacion("Error", true); }
    });
}

function renderizar(sesiones) {
    contenedor.innerHTML = sesiones.length === 0 ? `<div class="col-span-full py-10 text-center text-slate-400">Sin sesiones</div>` : '';
    const dashEntreno = document.getElementById('dash-proximo-entreno');
    if (dashEntreno) dashEntreno.innerText = sesiones.length > 0 ? sesiones[0].fecha : "Sin planificar";

    sesiones.forEach(ses => {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-xl shadow-sm border p-5 relative flex flex-col group';
        card.innerHTML = `
            <button class="btn-del absolute top-2 right-2 w-8 h-8 bg-red-50 text-red-500 rounded-full opacity-0 group-hover:opacity-100" data-id="${ses.id}"><i class="fa-solid fa-trash"></i></button>
            <div class="font-bold text-slate-700 mb-2">${ses.fecha}</div>
            <h4 class="font-bold text-lg mb-2">${ses.objetivo}</h4>
            <div class="mt-auto pt-3 border-t text-sm">Ejercicios: ${ses.ejercicios?.length || 0} | Asistencia: ${ses.asistencia?.length || 0}</div>
        `;
        contenedor.appendChild(card);
    });

    document.querySelectorAll('.btn-del').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (await confirmarAccion('¿Eliminar sesión de forma permanente?')) {
                await deleteDoc(doc(db, 'sesiones', e.currentTarget.getAttribute('data-id')));
                mostrarNotificacion("Sesión eliminada");
            }
        });
    });
}