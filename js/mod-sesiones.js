import { db, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc } from './firebase-config.js';
import { mostrarNotificacion, bindModal, confirmarAccion } from './ui.js';
import { todosLosEjercicios } from './mod-ejercicios.js';
import { todosLosJugadores, equipoIdActivo } from './mod-jugadores.js';

let todasLasSesiones = [];
const contenedor = document.getElementById('lista-sesiones-container');

export function initSesiones() {
    onSnapshot(collection(db, 'sesiones'), (snapshot) => {
        todasLasSesiones = [];
        snapshot.forEach((doc) => todasLasSesiones.push({ id: doc.id, ...doc.data() }));
        todasLasSesiones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        renderizarSesiones();
    });

    const prepSesion = () => {
        if (!document.getElementById('form-sesion').dataset.editId) {
            document.getElementById('sesion-ejercicios-list').innerHTML = todosLosEjercicios.map(ej => `<label><input type="checkbox" value="${ej.id}" class="chk-ej"> ${ej.nombre}</label>`).join('<br>');
            
            const jugadoresEquipo = todosLosJugadores.filter(j => j.equipoId === equipoIdActivo);
            document.getElementById('sesion-jugadores-list').innerHTML = jugadoresEquipo.length > 0 
                ? jugadoresEquipo.map(jug => `<label><input type="checkbox" value="${jug.id}" checked class="chk-jug"> #${jug.dorsal} ${jug.nombre}</label>`).join('<br>')
                : '<p class="text-sm text-slate-500">No hay jugadores en este equipo.</p>';
            
            document.getElementById('input-sesion-fecha').value = new Date().toISOString().split('T')[0];
            document.querySelector('#modal-sesion h3').innerText = "Planificar Sesión";
        }
    };

    const closeModSes = bindModal('modal-sesion', 'btn-open-modal-sesion', 'btn-close-modal-sesion', 'btn-cancel-modal-sesion', () => {
        document.getElementById('form-sesion').reset();
        delete document.getElementById('form-sesion').dataset.editId;
        prepSesion();
    });
    
    document.getElementById('btn-open-modal-sesion').addEventListener('click', prepSesion);
    
    document.getElementById('btn-save-modal-sesion').addEventListener('click', async () => {
        if (!equipoIdActivo) {
            alert("Selecciona un equipo primero.");
            return;
        }

        const data = {
            fecha: document.getElementById('input-sesion-fecha').value,
            objetivo: document.getElementById('input-sesion-objetivo').value,
            ejercicios: Array.from(document.querySelectorAll('.chk-ej:checked')).map(cb => cb.value),
            asistencia: Array.from(document.querySelectorAll('.chk-jug:checked')).map(cb => cb.value),
            equipoId: equipoIdActivo
        };
        if (!data.fecha) return alert("Falta fecha");
        try { 
            const editId = document.getElementById('form-sesion').dataset.editId;
            if (editId) {
                await updateDoc(doc(db, 'sesiones', editId), data);
                mostrarNotificacion("Sesión actualizada"); 
            } else {
                await addDoc(collection(db, 'sesiones'), data); 
                mostrarNotificacion("Sesión guardada"); 
            }
            closeModSes(); 
        } catch(e) { mostrarNotificacion("Error", true); }
    });
}

export function renderizarSesiones() {
    const msgNoEquipo = document.getElementById('msg-no-equipo-sesion');
    const btnAddSesion = document.getElementById('btn-open-modal-sesion');

    if (!equipoIdActivo) {
        contenedor.classList.add('hidden');
        if (msgNoEquipo) msgNoEquipo.classList.remove('hidden');
        if (btnAddSesion) btnAddSesion.disabled = true;
        
        const dashEntreno = document.getElementById('dash-proximo-entreno');
        if (dashEntreno) dashEntreno.innerText = "Sin planificar";
        return;
    }

    contenedor.classList.remove('hidden');
    if (msgNoEquipo) msgNoEquipo.classList.add('hidden');
    if (btnAddSesion) btnAddSesion.disabled = false;

    const sesionesEquipo = todasLasSesiones.filter(s => s.equipoId === equipoIdActivo);

    contenedor.innerHTML = sesionesEquipo.length === 0 ? `<div class="col-span-full py-10 text-center text-slate-400">Sin sesiones planificadas para este equipo</div>` : '';
    const dashEntreno = document.getElementById('dash-proximo-entreno');
    if (dashEntreno) dashEntreno.innerText = sesionesEquipo.length > 0 ? sesionesEquipo[0].fecha : "Sin planificar";

    sesionesEquipo.forEach(ses => {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-xl shadow-sm border p-5 relative flex flex-col group transition-all duration-300 hover:-translate-y-1 hover:shadow-md';
        card.innerHTML = `
            <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300">
                <button class="btn-edit-ses w-8 h-8 bg-purple-50 hover:bg-purple-100 text-purple-600 rounded-full transition-colors" data-id="${ses.id}" title="Editar Sesión"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-del-ses w-8 h-8 bg-red-50 hover:bg-red-100 text-red-500 rounded-full transition-colors" data-id="${ses.id}" title="Eliminar Sesión"><i class="fa-solid fa-trash"></i></button>
            </div>
            <div class="font-bold text-slate-700 mb-2">${ses.fecha}</div>
            <h4 class="font-bold text-lg mb-2 line-clamp-2" title="${ses.objetivo}">${ses.objetivo}</h4>
            <div class="mt-auto pt-3 border-t text-sm text-slate-500">
                <i class="fa-solid fa-clipboard-list mr-1"></i> Ejercicios: <span class="font-bold text-slate-700">${ses.ejercicios?.length || 0}</span> | 
                <i class="fa-solid fa-users mr-1"></i> Asistencia: <span class="font-bold text-slate-700">${ses.asistencia?.length || 0}</span>
            </div>
        `;
        
        card.querySelector('.btn-del-ses').addEventListener('click', async (e) => {
            if (await confirmarAccion('¿Eliminar sesión de forma permanente?')) {
                try {
                    await deleteDoc(doc(db, 'sesiones', ses.id));
                    mostrarNotificacion("Sesión eliminada");
                } catch(err) {
                    mostrarNotificacion("Error al eliminar", true);
                }
            }
        });

        card.querySelector('.btn-edit-ses').addEventListener('click', (e) => {
            document.getElementById('input-sesion-fecha').value = ses.fecha;
            document.getElementById('input-sesion-objetivo').value = ses.objetivo;
            
            // Build the lists with checked states based on the session data
            document.getElementById('sesion-ejercicios-list').innerHTML = todosLosEjercicios.map(ej => {
                const checked = (ses.ejercicios || []).includes(ej.id) ? 'checked' : '';
                return `<label><input type="checkbox" value="${ej.id}" class="chk-ej" ${checked}> ${ej.nombre}</label>`;
            }).join('<br>');
            
            const jugadoresEquipo = todosLosJugadores.filter(j => j.equipoId === equipoIdActivo);
            document.getElementById('sesion-jugadores-list').innerHTML = jugadoresEquipo.length > 0 
                ? jugadoresEquipo.map(jug => {
                    const checked = (ses.asistencia || []).includes(jug.id) ? 'checked' : '';
                    return `<label><input type="checkbox" value="${jug.id}" class="chk-jug" ${checked}> #${jug.dorsal} ${jug.nombre}</label>`;
                  }).join('<br>')
                : '<p class="text-sm text-slate-500">No hay jugadores en este equipo.</p>';

            document.getElementById('form-sesion').dataset.editId = ses.id;
            document.querySelector('#modal-sesion h3').innerText = "Editar Sesión";
            document.getElementById('modal-sesion').classList.remove('hidden');
        });

        contenedor.appendChild(card);
    });
}