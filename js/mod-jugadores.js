import { db, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, where, auth } from './firebase-config.js';
import { mostrarNotificacion, bindModal, confirmarAccion } from './ui.js';

export let todosLosJugadores = [];
export let equipoIdActivo = null;
let unsubJugadores = null;

const contenedor = document.getElementById('lista-jugadores-container');

export function setEquipoActivo(id) {
    equipoIdActivo = id;
    
    if (unsubJugadores) {
        unsubJugadores();
        unsubJugadores = null;
    }
    
    if (id && auth.currentUser) {
        const q = query(collection(db, 'jugadores'), where('equipoId', '==', id));
        unsubJugadores = onSnapshot(q, (snapshot) => {
            todosLosJugadores = [];
            snapshot.forEach((doc) => todosLosJugadores.push({ id: doc.id, ...doc.data() }));
            todosLosJugadores.sort((a, b) => a.dorsal - b.dorsal);
            renderizar();
        }, (err) => { if(err.code !== 'permission-denied' || auth.currentUser) console.error(err); });
    } else {
        todosLosJugadores = [];
        renderizar();
    }
    
    document.dispatchEvent(new Event('equipoModificado'));
}

export function initJugadores() {
    if (!auth.currentUser) return;


    const closeModJug = bindModal('modal-jugador', 'btn-open-modal-jugador', 'btn-close-modal-jugador', 'btn-cancel-modal-jugador', () => {
        document.getElementById('form-jugador').reset();
        document.getElementById('input-jugador-foto-base64').value = "";
        document.getElementById('preview-jugador-foto').src = "";
        document.getElementById('preview-jugador-foto').classList.add('hidden');
        document.getElementById('icon-jugador-foto').classList.remove('hidden');
        delete document.getElementById('form-jugador').dataset.editId;
        document.querySelector('#modal-jugador h3').innerText = "Añadir Jugador";
    });

    document.getElementById('input-jugador-foto').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const maxSize = 200;
                let width = img.width;
                let height = img.height;
                
                if (width > height) {
                    if (width > maxSize) { height = Math.round(height *= maxSize / width); width = maxSize; }
                } else {
                    if (height > maxSize) { width = Math.round(width *= maxSize / height); height = maxSize; }
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                
                document.getElementById('input-jugador-foto-base64').value = dataUrl;
                document.getElementById('preview-jugador-foto').src = dataUrl;
                document.getElementById('preview-jugador-foto').classList.remove('hidden');
                document.getElementById('icon-jugador-foto').classList.add('hidden');
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
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
            equipoId: equipoIdActivo,
            foto: document.getElementById('input-jugador-foto-base64').value,
            stats: {
                media: parseInt(document.getElementById('input-jugador-media').value) || 50,
                ritmo: parseInt(document.getElementById('input-jugador-ritmo').value) || 50,
                tiro: parseInt(document.getElementById('input-jugador-tiro').value) || 50,
                pase: parseInt(document.getElementById('input-jugador-pase').value) || 50,
                regate: parseInt(document.getElementById('input-jugador-regate').value) || 50,
                defensa: parseInt(document.getElementById('input-jugador-defensa').value) || 50,
                fisico: parseInt(document.getElementById('input-jugador-fisico').value) || 50
            }
        };
        if (!data.nombre) return alert("Falta nombre");
        try { 
            const editId = document.getElementById('form-jugador').dataset.editId;
            if (editId) {
                await updateDoc(doc(db, 'jugadores', editId), data);
                mostrarNotificacion("Jugador actualizado"); 
            } else {
                if (!auth.currentUser) throw new Error("No autenticado");
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
        const stats = jug.stats || { media: 50, ritmo: 50, tiro: 50, pase: 50, regate: 50, defensa: 50, fisico: 50 };
        let flagUrl = ''; 
        
        card.className = 'w-full max-w-[200px] mx-auto bg-gradient-to-br from-amber-200 via-amber-300 to-amber-500 rounded-2xl shadow-lg border border-amber-400 p-3 flex flex-col items-center relative transition-all duration-300 hover:-translate-y-2 hover:shadow-xl group font-sans overflow-hidden';
        card.innerHTML = `
            <div class="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none"></div>
            <div class="absolute top-2 right-2 flex gap-1 z-[20]">
                <button class="require-editor btn-edit-jug w-7 h-7 bg-white/90 hover:bg-white text-blue-600 rounded-full shadow transition-colors flex items-center justify-center" data-id="${jug.id}" title="Editar"><i class="fa-solid fa-pen text-xs"></i></button>
                <button class="require-editor btn-del-jug w-7 h-7 bg-white/90 hover:bg-white text-rose-600 rounded-full shadow transition-colors flex items-center justify-center" data-id="${jug.id}" title="Eliminar"><i class="fa-solid fa-trash text-xs"></i></button>
            </div>
            
            <div class="w-full flex justify-between items-start mb-0 relative z-10 px-1">
                <div class="flex flex-col items-center">
                    <span class="text-2xl font-bold text-amber-950 leading-none">${stats.media}</span>
                    <span class="text-[10px] font-bold text-amber-900 uppercase">${jug.posicion.substring(0, 3)}</span>
                </div>
                <div class="flex flex-col items-end gap-1 pt-1 opacity-80">
                    <i class="fa-solid fa-futbol text-amber-900 text-sm drop-shadow-sm"></i>
                    <div class="w-3 h-3 ${color} rounded-full border border-amber-900 shadow-sm" title="${jug.estado}"></div>
                </div>
            </div>

            <div class="w-20 h-20 bg-amber-100/50 rounded-full border-2 border-amber-600/30 flex items-center justify-center text-4xl text-amber-800 shadow-inner relative z-10 mb-1 overflow-hidden">
                ${jug.foto ? `<img src="${jug.foto}" class="w-full h-full object-cover">` : `<i class="fa-solid fa-user drop-shadow-sm"></i>`}
            </div>
            
            <div class="text-center w-full relative z-10">
                <h4 class="font-bold text-amber-950 text-sm uppercase tracking-wider truncate px-1 border-b border-amber-900/20 pb-1">${jug.nombre}</h4>
                <div class="text-[10px] text-amber-900 font-bold mb-1 opacity-70">#${jug.dorsal}</div>
            </div>

            <div class="w-full flex justify-center relative z-10 pb-1">
                <div class="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] font-bold text-amber-950">
                    <div class="flex items-center gap-1 justify-start"><span class="w-4 text-right">${stats.ritmo}</span><span class="text-amber-800 uppercase font-normal">PAC</span></div>
                    <div class="flex items-center gap-1 justify-start"><span class="w-4 text-right">${stats.regate}</span><span class="text-amber-800 uppercase font-normal">DRI</span></div>
                    <div class="flex items-center gap-1 justify-start"><span class="w-4 text-right">${stats.tiro}</span><span class="text-amber-800 uppercase font-normal">SHO</span></div>
                    <div class="flex items-center gap-1 justify-start"><span class="w-4 text-right">${stats.defensa}</span><span class="text-amber-800 uppercase font-normal">DEF</span></div>
                    <div class="flex items-center gap-1 justify-start"><span class="w-4 text-right">${stats.pase}</span><span class="text-amber-800 uppercase font-normal">PAS</span></div>
                    <div class="flex items-center gap-1 justify-start"><span class="w-4 text-right">${stats.fisico}</span><span class="text-amber-800 uppercase font-normal">PHY</span></div>
                </div>
            </div>
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
            
            const stats = jug.stats || { media:50, ritmo:50, tiro:50, pase:50, regate:50, defensa:50, fisico:50 };
            document.getElementById('input-jugador-media').value = stats.media;
            document.getElementById('input-jugador-ritmo').value = stats.ritmo;
            document.getElementById('input-jugador-tiro').value = stats.tiro;
            document.getElementById('input-jugador-pase').value = stats.pase;
            document.getElementById('input-jugador-regate').value = stats.regate;
            document.getElementById('input-jugador-defensa').value = stats.defensa;
            document.getElementById('input-jugador-fisico').value = stats.fisico;

            if (jug.foto) {
                document.getElementById('input-jugador-foto-base64').value = jug.foto;
                document.getElementById('preview-jugador-foto').src = jug.foto;
                document.getElementById('preview-jugador-foto').classList.remove('hidden');
                document.getElementById('icon-jugador-foto').classList.add('hidden');
            } else {
                document.getElementById('input-jugador-foto-base64').value = "";
                document.getElementById('preview-jugador-foto').src = "";
                document.getElementById('preview-jugador-foto').classList.add('hidden');
                document.getElementById('icon-jugador-foto').classList.remove('hidden');
            }

            document.getElementById('form-jugador').dataset.editId = jug.id;
            document.querySelector('#modal-jugador h3').innerText = "Editar Jugador";
            document.getElementById('modal-jugador').classList.remove('hidden');
        });

        contenedor.appendChild(card);
    });
}