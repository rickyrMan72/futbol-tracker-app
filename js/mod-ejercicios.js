import { ejerciciosApi } from './api/ejercicios.api.js';
import { mostrarNotificacion, bindModal, confirmarAccion } from './ui.js';
import { initCanvas, getCanvas, drawField, resizeCanvas, saveState, clearUndoStack } from './components/pizarra.js';

export let todosLosEjercicios = [];
const contenedor = document.getElementById('lista-ejercicios-container');

export function initEjercicios() {
    ejerciciosApi.suscribir((ejercicios) => {
        todosLosEjercicios = ejercicios;
        renderizar();
    });

    const closeModEj = bindModal('modal-ejercicio', 'btn-open-modal', 'btn-close-modal', 'btn-cancel-modal', () => {
        document.getElementById('form-ejercicio').reset();
        delete document.getElementById('form-ejercicio').dataset.editId;
        document.querySelector('#modal-ejercicio h3').innerText = "Nuevo Ejercicio";
        
        setTimeout(() => {
            initCanvas();
        }, 50);
    });
    
    document.getElementById('btn-save-modal').addEventListener('click', async (e) => {
        e.preventDefault();

        const canvas = getCanvas();
        if (canvas) {
            canvas.getObjects().forEach(o => {
                if (o.trajectories) {
                    o.traj_save = o.trajectories.map(t => t ? {x: t.x, y: t.y} : null);
                }
            });
        }

        const data = {
            nombre: document.getElementById('input-nombre').value,
            categoria: document.getElementById('input-categoria').value,
            duracion: parseInt(document.getElementById('input-duracion').value) || 0,
            descripcion: document.getElementById('input-descripcion').value,
            pizarraFondo: document.getElementById('pizarra-fondo').value,
            pizarraState: canvas ? JSON.stringify(canvas.toJSON(['id', 'isPlayer', 'isBall', 'isCone', 'keyframes', 'isFieldLine', 'hasControls', 'hasBorders', 'lockScalingX', 'lockScalingY', 'lockRotation'])) : null,
            pizarraImage: canvas ? canvas.toDataURL({ format: 'png', quality: 0.8, multiplier: 0.5 }) : null
        };
        if (!data.nombre) return alert("Rellena el nombre");
        
        const form = document.getElementById('form-ejercicio');
        const editId = form.dataset.editId;
        
        try { 
            document.getElementById('btn-save-modal').disabled = true;
            document.getElementById('btn-save-modal').innerText = "Guardando...";
            
            if (editId) {
                await ejerciciosApi.actualizar(editId, data);
            } else {
                await ejerciciosApi.crear(data); 
            }
            
            mostrarNotificacion("Guardado con éxito"); 
            document.getElementById('form-ejercicio').reset(); 
            delete form.dataset.editId;
            if(canvas) canvas.clear();
            closeModEj(); 
        } catch(err) { 
            console.error(err);
            mostrarNotificacion("Error al guardar", true); 
        } finally {
            document.getElementById('btn-save-modal').disabled = false;
            document.getElementById('btn-save-modal').innerText = "Guardar Ejercicio";
        }
    });

    // Event Delegation para Botones de la lista
    contenedor.addEventListener('click', async (e) => {
        const btnDel = e.target.closest('.btn-del');
        if (btnDel) {
            e.preventDefault();
            e.stopPropagation();
            const id = btnDel.getAttribute('data-id');
            if (await confirmarAccion('¿Eliminar este ejercicio de forma permanente?')) {
                try {
                    await ejerciciosApi.eliminar(id);
                    mostrarNotificacion("Ejercicio eliminado");
                } catch (error) {
                    console.error("Delete Error:", error);
                    alert("Error al eliminar el ejercicio. " + error.message);
                }
            }
            return;
        }

        const btnEdit = e.target.closest('.btn-edit');
        if (btnEdit) {
            e.preventDefault();
            e.stopPropagation();
            const id = btnEdit.getAttribute('data-id');
            const ej = todosLosEjercicios.find(x => x.id === id);
            if (ej) {
                document.getElementById('input-nombre').value = ej.nombre;
                document.getElementById('input-categoria').value = ej.categoria;
                document.getElementById('input-duracion').value = ej.duracion;
                document.getElementById('input-descripcion').value = ej.descripcion;
                if (ej.pizarraFondo) {
                    document.getElementById('pizarra-fondo').value = ej.pizarraFondo;
                }
                
                document.getElementById('form-ejercicio').dataset.editId = id;
                document.querySelector('#modal-ejercicio h3').innerText = "Editar Ejercicio";

                document.getElementById('modal-ejercicio').classList.remove('hidden');
                setTimeout(() => {
                    initCanvas();
                    const canvas = getCanvas();
                    if (ej.pizarraState && canvas) {
                        canvas.loadFromJSON(ej.pizarraState, () => {
                            canvas.getObjects().forEach(o => {
                                // Translate old trajectories format mapping into keyframes 
                                if(o.traj_save) {
                                    if (!o.keyframes) o.keyframes = {};
                                    o.keyframes[1] = {x: o.left, y: o.top};
                                    o.traj_save.forEach((t, i) => {
                                        if(t) {
                                            o.keyframes[i+2] = {x: t.x, y: t.y};
                                        }
                                    });
                                }

                                // Remove old legacy field groups
                                if(o.type === 'group' && o.getObjects().length >= 5 && !o.isFieldLine) {
                                    canvas.remove(o);
                                }
                                // Ensure players, balls, arrows, and any grouping are not resizable or rotatable
                                if (o.isPlayer || o.isBall || o.text === '⚽' || o.type === 'group') {
                                    if (!o.isFieldLine) {
                                        o.set('hasControls', false);
                                        o.set('hasBorders', true);
                                        o.set('lockScalingX', true);
                                        o.set('lockScalingY', true);
                                        o.set('lockRotation', true);
                                    }
                                }
                            });
                            drawField(document.getElementById('pizarra-fondo').value);
                            resizeCanvas();
                            clearUndoStack();
                            saveState();
                        });
                    }
                }, 50);
            }
            return;
        }
    });
}

function renderizar() {
    contenedor.innerHTML = todosLosEjercicios.length === 0 ? `<div class="col-span-full py-10 text-slate-400 text-center"><p>No hay ejercicios.</p></div>` : '';
    todosLosEjercicios.forEach(ej => {
        let color = ej.categoria === 'Táctico' ? 'bg-blue-500' : (ej.categoria === 'Físico' ? 'bg-emerald-500' : 'bg-amber-500');
        
        let headerHTML = '';
        if (ej.pizarraImage) {
            headerHTML = `
            <div class="h-32 bg-emerald-600 relative overflow-hidden flex items-center justify-center">
                <img src="${ej.pizarraImage}" class="w-full h-full object-cover mix-blend-luminosity opacity-80 hover:mix-blend-normal hover:opacity-100 transition-all duration-300">
                <span class="absolute top-2 right-2 ${color} text-white text-xs px-2 py-1 rounded shadow">${ej.categoria}</span>
            </div>`;
        } else {
            headerHTML = `
            <div class="h-32 bg-slate-800 flex items-center justify-center relative">
                <i class="fa-solid fa-pen text-3xl text-slate-600"></i>
                <span class="absolute top-2 right-2 ${color} text-white text-xs px-2 py-1 rounded shadow">${ej.categoria}</span>
            </div>`;
        }

        const card = document.createElement('div');
        card.className = 'bg-white rounded-xl shadow-sm border overflow-hidden relative group hover:shadow-md transition-shadow flex flex-col h-full';
        card.innerHTML = `
            <button class="btn-del absolute top-2 left-2 z-10 w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full drop-shadow-md flex items-center justify-center cursor-pointer transition-colors" title="Eliminar ejercicio" data-id="${ej.id}"><i class="fa-solid fa-trash pointer-events-none"></i></button>
            ${headerHTML}
            <div class="p-4 flex flex-col flex-1">
                <div class="flex justify-between items-start mb-2 gap-2">
                    <h4 class="font-bold text-lg leading-tight text-slate-800">${ej.nombre}</h4>
                    <span class="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded flex-shrink-0"><i class="fa-regular fa-clock mr-1"></i>${ej.duracion}m</span>
                </div>
                <p class="text-sm text-slate-500 line-clamp-3 mb-4 flex-1">${ej.descripcion}</p>
                <button class="btn-edit w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-medium transition-colors" data-id="${ej.id}">
                    <i class="fa-solid fa-pen-to-square mr-1"></i> Editar Ejercicio
                </button>
            </div>
        `;
        contenedor.appendChild(card);
    });
}
