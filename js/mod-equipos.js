import { db, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc } from './firebase-config.js';
import { mostrarNotificacion, bindModal, confirmarAccion } from './ui.js';
import { setEquipoActivo, equipoIdActivo } from './mod-jugadores.js';
import { renderizarSesiones } from './mod-sesiones.js';
import { renderizarPartidos } from './mod-partidos.js';

export let todosLosEquipos = [];

// Función para setear y renderizar todo
function cambiarEquipoActivo(id) {
    setEquipoActivo(id);
    actualizarBotonesAccion(id);
    renderizarSesiones();
    renderizarPartidos();
}

export function initEquipos() {
    onSnapshot(collection(db, 'equipos'), (snapshot) => {
        todosLosEquipos = [];
        snapshot.forEach((doc) => todosLosEquipos.push({ id: doc.id, ...doc.data() }));
        
        // Sort by name
        todosLosEquipos.sort((a, b) => a.nombre.localeCompare(b.nombre));
        
        actualizarSelectEquipos();
    });

    const closeModEq = bindModal('modal-equipo', 'btn-open-modal-equipo', 'btn-close-modal-equipo', 'btn-cancel-modal-equipo', () => {
        document.getElementById('form-equipo').reset();
        delete document.getElementById('form-equipo').dataset.editId;
        document.querySelector('#modal-equipo h3').innerText = "Añadir Equipo";
    });

    document.getElementById('btn-open-modal-equipo').addEventListener('click', () => {
        if (!document.getElementById('form-equipo').dataset.editId) {
            document.querySelector('#modal-equipo h3').innerText = "Añadir Equipo";
        } else {
            document.querySelector('#modal-equipo h3').innerText = "Editar Equipo";
        }
    });
    
    document.getElementById('btn-save-modal-equipo').addEventListener('click', async () => {
        const data = {
            nombre: document.getElementById('input-equipo-nombre').value,
            modalidad: document.getElementById('input-equipo-modalidad').value,
            temporada: document.getElementById('input-equipo-temporada').value || '',
            escudo: document.getElementById('input-equipo-escudo').value || ''
        };
        if (!data.nombre) return alert("Falta el nombre del equipo");
        
        try { 
            const editId = document.getElementById('form-equipo').dataset.editId;
            if (editId) {
                await updateDoc(doc(db, 'equipos', editId), data);
                mostrarNotificacion("Equipo actualizado"); 
            } else {
                data.createdAt = Date.now();
                const docRef = await addDoc(collection(db, 'equipos'), data); 
                mostrarNotificacion("Equipo añadido"); 
                // Set the newly created team as active
                const select = document.getElementById('select-equipo');
                select.value = docRef.id;
                cambiarEquipoActivo(docRef.id);
            }
            closeModEq(); 
        } catch(e) { 
            mostrarNotificacion("Error al guardar equipo", true); 
        }
    });

    document.getElementById('select-equipo').addEventListener('change', (e) => {
        cambiarEquipoActivo(e.target.value);
    });

    document.getElementById('btn-del-equipo').addEventListener('click', async () => {
        const select = document.getElementById('select-equipo');
        const equipoId = select.value;
        if (!equipoId) return;
        
        if (await confirmarAccion('¿Eliminar este equipo y perder acceso a todos sus datos?')) {
            try {
                await deleteDoc(doc(db, 'equipos', equipoId));
                mostrarNotificacion('Equipo eliminado');
                select.value = "";
                cambiarEquipoActivo("");
            } catch (err) {
                mostrarNotificacion('Error al eliminar', true);
            }
        }
    });

    document.getElementById('btn-edit-equipo').addEventListener('click', () => {
        const select = document.getElementById('select-equipo');
        const equipoId = select.value;
        if (!equipoId) return;

        const equipo = todosLosEquipos.find(eq => eq.id === equipoId);
        if (equipo) {
            document.getElementById('input-equipo-nombre').value = equipo.nombre;
            document.getElementById('input-equipo-modalidad').value = equipo.modalidad;
            document.getElementById('input-equipo-temporada').value = equipo.temporada || '';
            document.getElementById('input-equipo-escudo').value = equipo.escudo || '';
            document.getElementById('form-equipo').dataset.editId = equipoId;
            document.querySelector('#modal-equipo h3').innerText = "Editar Equipo";
            document.getElementById('modal-equipo').classList.remove('hidden');
        }
    });
}

function actualizarBotonesAccion(equipoId) {
    const btnEdit = document.getElementById('btn-edit-equipo');
    const btnDel = document.getElementById('btn-del-equipo');
    if (btnEdit) btnEdit.disabled = !equipoId;
    if (btnDel) btnDel.disabled = !equipoId;

    const imgContainer = document.getElementById('equipo-escudo-container');
    const imgElement = document.getElementById('equipo-escudo-img');
    
    if (equipoId) {
        const equipo = todosLosEquipos.find(eq => eq.id === equipoId);
        if (equipo && equipo.escudo) {
            imgElement.src = equipo.escudo;
            imgElement.classList.remove('hidden');
            imgContainer.classList.remove('hidden');
        } else {
            imgElement.src = '';
            imgContainer.classList.add('hidden');
        }
    } else {
        imgElement.src = '';
        imgContainer.classList.add('hidden');
    }
}

function actualizarSelectEquipos() {
    const select = document.getElementById('select-equipo');
    const valorActual = select.value;
    
    select.innerHTML = '<option value="">Selecciona un equipo...</option>';
    
    todosLosEquipos.forEach(eq => {
        const opt = document.createElement('option');
        opt.value = eq.id;
        const textoTemp = eq.temporada ? ` (${eq.temporada})` : '';
        opt.textContent = `${eq.nombre}${textoTemp} - ${eq.modalidad}`;
        select.appendChild(opt);
    });
    
    if (valorActual && todosLosEquipos.find(eq => eq.id === valorActual)) {
        select.value = valorActual;
        cambiarEquipoActivo(valorActual);
    } else if (todosLosEquipos.length > 0) {
        // Automatically select the first team when none is selected
        select.value = todosLosEquipos[0].id;
        cambiarEquipoActivo(todosLosEquipos[0].id);
    } else {
        // If current selection is invalid, clear
        cambiarEquipoActivo("");
    }
}
