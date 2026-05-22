import { db, doc, updateDoc, onSnapshot, collection } from './firebase-config.js';
import { bindModal, mostrarNotificacion } from './ui.js';
import { equipoIdActivo } from './mod-jugadores.js';
import { DEFAULT_ACCIONES } from './mod-directo.js';

let equipoGlobalConfig = null;
let currentConfigUnsub = null;

export function initConfiguracion() {
    document.getElementById('btn-config-global-acciones').addEventListener('click', abrirModalGlobalAcciones);

    document.getElementById('btn-close-modal-global-acciones')?.addEventListener('click', cerrarModalGlobalAcciones);
    document.getElementById('btn-save-global-accion')?.addEventListener('click', guardarNuevaAccionGlobal);
    document.getElementById('btn-cancel-global-accion')?.addEventListener('click', resetFormGlobalAccion);
    document.getElementById('btn-done-modal-global-acciones')?.addEventListener('click', cerrarModalGlobalAcciones);

    document.addEventListener('equipoModificado', () => {
        subscribeToConfiguracion(equipoIdActivo);
    });
}

export function subscribeToConfiguracion(equipoId) {
    if (!equipoId) return;
    if (currentConfigUnsub) currentConfigUnsub();
    currentConfigUnsub = onSnapshot(doc(db, 'equipos', equipoId), (docSnap) => {
        if (docSnap.exists()) {
            equipoGlobalConfig = docSnap.data().configAcciones || JSON.parse(JSON.stringify(DEFAULT_ACCIONES));
            renderListaGlobalAcciones();
        }
    });
}

export function getGlobalAcciones() {
    if (equipoGlobalConfig) {
        return JSON.parse(JSON.stringify(equipoGlobalConfig));
    }
    return JSON.parse(JSON.stringify(DEFAULT_ACCIONES));
}

function abrirModalGlobalAcciones() {
    if (!equipoIdActivo) {
        mostrarNotificacion('Selecciona un equipo primero', true);
        return;
    }
    resetFormGlobalAccion();
    renderListaGlobalAcciones();
    document.getElementById('modal-config-global-acciones').classList.remove('hidden');
}

function cerrarModalGlobalAcciones() {
    document.getElementById('modal-config-global-acciones').classList.add('hidden');
}

function renderListaGlobalAcciones() {
    const container = document.getElementById('list-global-acciones-config');
    if(!container) return;
    const list = getGlobalAcciones();
    
    container.innerHTML = list.map((acc, index) => {
        const isActive = acc.isActive !== false;
        return `
            <div class="draggable-global-accion flex items-center justify-between p-2 sm:p-3 border rounded-lg bg-white shadow-sm gap-2 opacity-${isActive ? '100' : '50'}" draggable="true" data-id="${acc.id}" data-index="${index}">
                <div class="flex items-center gap-2 flex-1 min-w-0">
                    <i class="fa-solid fa-grip-vertical text-slate-300 hover:text-slate-500 cursor-grab px-1" title="Arrastrar para reordenar"></i>
                    <input type="checkbox" class="chk-active-global-accion w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer" data-id="${acc.id}" ${isActive ? 'checked' : ''} title="Mostrar por defecto">
                    <i class="fa-solid ${acc.icon} ${acc.color} w-6 text-center text-lg shrink-0"></i>
                    <span class="font-medium text-slate-700 truncate ${isActive ? '' : 'line-through'}">${acc.nombre} ${acc.score !== undefined ? `<span class="text-xs text-slate-500 font-normal ml-1">(${acc.score} pt)</span>` : ''} ${acc.isChange ? '<span class="text-xs bg-amber-100 text-amber-700 px-1 rounded ml-1">[S]</span>' : ''}</span>
                </div>
                <div class="flex gap-1 shrink-0">
                    <button class="btn-edit-global-accion w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors" data-id="${acc.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-delete-global-accion w-8 h-8 rounded-full bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-colors" data-id="${acc.id}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `;
    }).join('');

    let draggedItemIdx = null;

    container.querySelectorAll('.draggable-global-accion').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedItemIdx = parseInt(item.getAttribute('data-index'));
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(() => item.classList.add('opacity-40', 'border-dashed', 'border-slate-400'), 0);
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const targetItem = e.target.closest('.draggable-global-accion');
            if (targetItem && targetItem !== item) {
                const targetIdx = parseInt(targetItem.getAttribute('data-index'));
                if (targetIdx > draggedItemIdx) {
                    targetItem.classList.add('border-b-2', 'border-b-blue-500');
                    targetItem.classList.remove('border-t-2', 'border-t-blue-500');
                } else {
                    targetItem.classList.add('border-t-2', 'border-t-blue-500');
                    targetItem.classList.remove('border-b-2', 'border-b-blue-500');
                }
            }
        });
        
        item.addEventListener('dragleave', (e) => {
            const targetItem = e.target.closest('.draggable-global-accion');
            if (targetItem) {
                targetItem.classList.remove('border-b-2', 'border-b-blue-500', 'border-t-2', 'border-t-blue-500');
            }
        });

        item.addEventListener('drop', async (e) => {
            e.preventDefault();
            const targetItem = e.target.closest('.draggable-global-accion');
            if (targetItem) {
                targetItem.classList.remove('border-b-2', 'border-b-blue-500', 'border-t-2', 'border-t-blue-500');
            }
            if (targetItem && draggedItemIdx !== null) {
                const targetIdx = parseInt(targetItem.getAttribute('data-index'));
                if (draggedItemIdx !== targetIdx) {
                    const newList = [...getGlobalAcciones()];
                    const [draggedItem] = newList.splice(draggedItemIdx, 1);
                    newList.splice(targetIdx, 0, draggedItem);
                    await updateDoc(doc(db, 'equipos', equipoIdActivo), { configAcciones: newList });
                }
            }
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('opacity-40', 'border-dashed', 'border-slate-400');
            container.querySelectorAll('.draggable-global-accion').forEach(el => {
                el.classList.remove('border-b-2', 'border-b-blue-500', 'border-t-2', 'border-t-blue-500');
            });
            draggedItemIdx = null;
        });
    });

    container.querySelectorAll('.chk-active-global-accion').forEach(cb => {
        cb.addEventListener('change', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const isActive = e.currentTarget.checked;
            const newList = [...getGlobalAcciones()];
            const idx = newList.findIndex(a => a.id === id);
            if (idx !== -1) {
                newList[idx].isActive = isActive;
                await updateDoc(doc(db, 'equipos', equipoIdActivo), { configAcciones: newList });
            }
        });
    });

    container.querySelectorAll('.btn-edit-global-accion').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const acc = getGlobalAcciones().find(a => a.id === id);
            if (acc) {
                document.getElementById('input-global-accion-id').value = acc.id;
                document.getElementById('input-global-accion-nombre').value = acc.nombre;
                document.getElementById('input-global-accion-icon').value = acc.icon;
                document.getElementById('input-global-accion-color').value = acc.color;
                document.getElementById('input-global-accion-isChange').checked = !!acc.isChange;
                document.getElementById('input-global-accion-score').value = acc.score !== undefined ? acc.score : '';
                document.getElementById('title-form-global-accion').innerText = 'Editar Acción (Global)';
                document.getElementById('btn-save-global-accion').innerText = 'Guardar Cambios';
                document.getElementById('btn-cancel-global-accion').classList.remove('hidden');
                document.getElementById('btn-save-global-accion').classList.remove('w-full');
            }
        });
    });

    container.querySelectorAll('.btn-delete-global-accion').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            if (confirm('¿Seguro que quieres eliminar esta acción de la configuración global?')) {
                const newList = getGlobalAcciones().filter(a => a.id !== id);
                await updateDoc(doc(db, 'equipos', equipoIdActivo), { configAcciones: newList });
            }
        });
    });
}

function resetFormGlobalAccion() {
    document.getElementById('input-global-accion-id').value = '';
    document.getElementById('input-global-accion-nombre').value = '';
    document.getElementById('input-global-accion-icon').value = 'fa-bolt';
    document.getElementById('input-global-accion-color').value = 'text-slate-500';
    document.getElementById('input-global-accion-isChange').checked = false;
    document.getElementById('input-global-accion-score').value = '';
    document.getElementById('title-form-global-accion').innerText = 'Nueva Acción (Global)';
    document.getElementById('btn-save-global-accion').innerText = 'Añadir Acción';
    document.getElementById('btn-cancel-global-accion').classList.add('hidden');
    document.getElementById('btn-save-global-accion').classList.add('w-full');
}

async function guardarNuevaAccionGlobal() {
    const idField = document.getElementById('input-global-accion-id').value;
    const nombre = document.getElementById('input-global-accion-nombre').value.trim();
    let icon = document.getElementById('input-global-accion-icon').value.trim();
    const color = document.getElementById('input-global-accion-color').value;
    const isChange = document.getElementById('input-global-accion-isChange').checked;
    const scoreVal = document.getElementById('input-global-accion-score').value.trim();
    const score = scoreVal !== '' ? parseFloat(scoreVal) : undefined;

    if (!nombre) {
        mostrarNotificacion('El nombre es obligatorio', true);
        return;
    }
    if (!icon) {
        icon = isChange ? 'fa-arrows-rotate' : 'fa-bolt';
    }
    
    icon = icon.replace('fa-solid ', '').trim();
    if (!icon.startsWith('fa-')) icon = 'fa-' + icon;

    let newList = [...getGlobalAcciones()];

    if (idField) {
        const idx = newList.findIndex(a => a.id === idField);
        if (idx !== -1) {
            newList[idx] = { ...newList[idx], nombre, icon, color, isChange };
            if (score !== undefined) newList[idx].score = score;
            else delete newList[idx].score;
        }
    } else {
        const newId = 'acc_' + Date.now().toString(36);
        const newAcc = { id: newId, nombre, icon, color, isChange, isActive: true };
        if (score !== undefined) newAcc.score = score;
        newList.push(newAcc);
    }

    await updateDoc(doc(db, 'equipos', equipoIdActivo), { configAcciones: newList });
    resetFormGlobalAccion();
}
