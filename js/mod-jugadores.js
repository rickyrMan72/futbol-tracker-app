import { db, collection, addDoc, onSnapshot, deleteDoc, doc } from './firebase-config.js';
import { mostrarNotificacion, bindModal, confirmarAccion } from './ui.js';

export let todosLosJugadores = [];
const contenedor = document.getElementById('lista-jugadores-container');

export function initJugadores() {
    onSnapshot(collection(db, 'jugadores'), (snapshot) => {
        todosLosJugadores = [];
        snapshot.forEach((doc) => todosLosJugadores.push({ id: doc.id, ...doc.data() }));
        todosLosJugadores.sort((a, b) => a.dorsal - b.dorsal);
        renderizar();
    });

    const closeModJug = bindModal('modal-jugador', 'btn-open-modal-jugador', 'btn-close-modal-jugador', 'btn-cancel-modal-jugador');
    document.getElementById('btn-save-modal-jugador').addEventListener('click', async () => {
        const data = {
            nombre: document.getElementById('input-jugador-nombre').value,
            posicion: document.getElementById('input-jugador-posicion').value,
            dorsal: parseInt(document.getElementById('input-jugador-dorsal').value),
            estado: document.getElementById('input-jugador-estado').value
        };
        if (!data.nombre) return alert("Falta nombre");
        try { 
            await addDoc(collection(db, 'jugadores'), data); 
            mostrarNotificacion("Jugador añadido"); 
            document.getElementById('form-jugador').reset(); 
            closeModJug(); 
        } catch(e) { mostrarNotificacion("Error", true); }
    });
}

function renderizar() {
    contenedor.innerHTML = todosLosJugadores.length === 0 ? `<div class="col-span-full py-10 text-center text-slate-400">Sin jugadores</div>` : '';
    
    // Update Dashboard
    const contador = document.getElementById('contador-disponibles');
    if(contador) contador.innerHTML = `${todosLosJugadores.filter(j=>j.estado==='Disponible').length} <span class="text-lg text-slate-400">/ ${todosLosJugadores.length}</span>`;

    todosLosJugadores.forEach(jug => {
        let color = jug.estado === 'Tocado' ? 'bg-amber-500' : (jug.estado === 'Lesionado' ? 'bg-red-500' : 'bg-emerald-500');
        const card = document.createElement('div');
        card.className = 'bg-white rounded-xl shadow-sm border p-5 flex flex-col items-center text-center group relative transition-all duration-300 hover:-translate-y-1 hover:shadow-md';
        card.innerHTML = `
            <button class="btn-del absolute top-2 right-2 w-8 h-8 bg-red-50 hover:bg-red-100 text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300" data-id="${jug.id}"><i class="fa-solid fa-trash"></i></button>
            <div class="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-2xl relative mb-2"><i class="fa-solid fa-user"></i><div class="absolute -bottom-1 -right-1 w-4 h-4 ${color} rounded-full border-2 border-white"></div></div>
            <div class="text-xs font-bold text-slate-400">#${jug.dorsal}</div>
            <h4 class="font-bold text-slate-800 line-clamp-1 w-full">${jug.nombre}</h4>
            <p class="text-xs text-blue-600 font-bold uppercase">${jug.posicion}</p>
        `;
        contenedor.appendChild(card);
    });

    document.querySelectorAll('.btn-del').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (await confirmarAccion('¿Eliminar jugador de forma permanente?')) {
                await deleteDoc(doc(db, 'jugadores', e.currentTarget.getAttribute('data-id')));
                mostrarNotificacion("Jugador eliminado");
            }
        });
    });
}