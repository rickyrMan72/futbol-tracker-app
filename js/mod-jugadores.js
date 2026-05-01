import { db, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc } from './firebase-config.js';
import { mostrarNotificacion, bindModal, confirmarAccion } from './ui.js';

export let todosLosJugadores = [];
export let equipoIdActivo = null;

const contenedor = document.getElementById('lista-jugadores-container');

export function setEquipoActivo(id) {
    equipoIdActivo = id;
    renderizar();
}

export function initJugadores() {
    onSnapshot(collection(db, 'jugadores'), (snapshot) => {
        todosLosJugadores = [];
        snapshot.forEach((doc) => todosLosJugadores.push({ id: doc.id, ...doc.data() }));
        todosLosJugadores.sort((a, b) => a.dorsal - b.dorsal);
        renderizar();
    });

    const closeModJug = bindModal('modal-jugador', 'btn-open-modal-jugador', 'btn-close-modal-jugador', 'btn-cancel-modal-jugador', () => {
        document.getElementById('form-jugador').reset();
        delete document.getElementById('form-jugador').dataset.editId;
        document.querySelector('#modal-jugador h3').innerText = "Añadir Jugador";
    });

    document.getElementById('btn-open-modal-jugador').addEventListener('click', () => {
        if (!document.getElementById('form-jugador').dataset.editId) {
            document.querySelector('#modal-jugador h3').innerText = "Añadir Jugador";
        } else {
            document.querySelector('#modal-jugador h3').innerText = "Editar Jugador";
        }
    });

    document.getElementById('btn-save-modal-jugador').addEventListener('click', async () => {
        if (!equipoIdActivo) {
            alert("Selecciona un equipo primero.");
            return;
        }

        const data = {
            nombre: document.getElementById('input-jugador-nombre').value,
            posicion: document.getElementById('input-jugador-posicion').value,
            dorsal: parseInt(document.getElementById('input-jugador-dorsal').value),
            estado: document.getElementById('input-jugador-estado').value,
            equipoId: equipoIdActivo
        };
        if (!data.nombre) return alert("Falta nombre");
        try { 
            const editId = document.getElementById('form-jugador').dataset.editId;
            if (editId) {
                await updateDoc(doc(db, 'jugadores', editId), data);
                mostrarNotificacion("Jugador actualizado"); 
            } else {
                await addDoc(collection(db, 'jugadores'), data); 
                mostrarNotificacion("Jugador añadido"); 
            }
            closeModJug(); 
        } catch(e) { mostrarNotificacion("Error", true); }
    });
}

function renderizar() {
    const msgNoEquipo = document.getElementById('msg-no-equipo-plantilla');
    const btnAddJugador = document.getElementById('btn-open-modal-jugador');

    if (!equipoIdActivo) {
        contenedor.classList.add('hidden');
        if (msgNoEquipo) msgNoEquipo.classList.remove('hidden');
        if (btnAddJugador) btnAddJugador.disabled = true;
        
        // Clear Dashboard for players
        const contador = document.getElementById('contador-disponibles');
        if(contador) contador.innerHTML = `0 <span class="text-lg text-slate-400">/ 0</span>`;
        return;
    }

    contenedor.classList.remove('hidden');
    if (msgNoEquipo) msgNoEquipo.classList.add('hidden');
    if (btnAddJugador) btnAddJugador.disabled = false;

    const jugadoresEquipo = todosLosJugadores.filter(j => j.equipoId === equipoIdActivo);

    contenedor.innerHTML = jugadoresEquipo.length === 0 ? `<div class="col-span-full py-10 text-center text-slate-400">Sin jugadores en este equipo</div>` : '';
    
    // Update Dashboard
    const contador = document.getElementById('contador-disponibles');
    if(contador) contador.innerHTML = `${jugadoresEquipo.filter(j=>j.estado==='Disponible').length} <span class="text-lg text-slate-400">/ ${jugadoresEquipo.length}</span>`;

    jugadoresEquipo.forEach(jug => {
        let color = jug.estado === 'Tocado' ? 'bg-amber-500' : (jug.estado === 'Lesionado' ? 'bg-red-500' : 'bg-emerald-500');
        const card = document.createElement('div');
        card.className = 'bg-white rounded-xl shadow-sm border p-5 flex flex-col items-center text-center group relative transition-all duration-300 hover:-translate-y-1 hover:shadow-md';
        card.innerHTML = `
            <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300">
                <button class="btn-edit-jug w-8 h-8 bg-blue-50 hover:bg-blue-100 text-blue-500 rounded-full transition-colors" data-id="${jug.id}" title="Editar Jugador"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-del-jug w-8 h-8 bg-red-50 hover:bg-red-100 text-red-500 rounded-full transition-colors" data-id="${jug.id}" title="Eliminar Jugador"><i class="fa-solid fa-trash"></i></button>
            </div>
            <div class="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-2xl relative mb-2"><i class="fa-solid fa-user"></i><div class="absolute -bottom-1 -right-1 w-4 h-4 ${color} rounded-full border-2 border-white" title="${jug.estado}"></div></div>
            <div class="text-xs font-bold text-slate-400">#${jug.dorsal}</div>
            <h4 class="font-bold text-slate-800 line-clamp-1 w-full" title="${jug.nombre}">${jug.nombre}</h4>
            <p class="text-xs text-blue-600 font-bold uppercase">${jug.posicion}</p>
        `;
        
        card.querySelector('.btn-del-jug').addEventListener('click', async (e) => {
            if (await confirmarAccion('¿Eliminar jugador de forma permanente?')) {
                try {
                    await deleteDoc(doc(db, 'jugadores', jug.id));
                    mostrarNotificacion("Jugador eliminado");
                } catch(err) {
                    mostrarNotificacion("Error al eliminar", true);
                }
            }
        });

        card.querySelector('.btn-edit-jug').addEventListener('click', (e) => {
            document.getElementById('input-jugador-nombre').value = jug.nombre;
            document.getElementById('input-jugador-posicion').value = jug.posicion;
            document.getElementById('input-jugador-dorsal').value = jug.dorsal;
            document.getElementById('input-jugador-estado').value = jug.estado;
            document.getElementById('form-jugador').dataset.editId = jug.id;
            document.querySelector('#modal-jugador h3').innerText = "Editar Jugador";
            document.getElementById('modal-jugador').classList.remove('hidden');
        });

        contenedor.appendChild(card);
    });
}