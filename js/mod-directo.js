import { db, collection, addDoc, onSnapshot, doc, updateDoc, arrayRemove, arrayUnion, deleteDoc } from './firebase-config.js';
import { mostrarNotificacion, confirmarAccion } from './ui.js';
import { todosLosJugadores } from './mod-jugadores.js';
import { todosLosEquipos } from './mod-equipos.js';
import { todosLosPartidos } from './mod-partidos.js';

let partidoIdActivo = null;
let partidoObj = null;
let efemeridesList = [];
let unsubPartido = null;
let unsubEfemerides = null;
let cronoInterval = null;

let jugadorSeleccionadoId = null;
let accionCambioPendiente = null;

export const DEFAULT_ACCIONES = [
    { id: 'gol-pie', nombre: 'Gol con el pie', icon: 'fa-futbol', color: 'text-emerald-500', isPositive: true },
    { id: 'gol-cabeza', nombre: 'Gol de cabeza', icon: 'fa-futbol', color: 'text-emerald-500', isPositive: true },
    { id: 'gol-falta', nombre: 'Gol de falta', icon: 'fa-futbol', color: 'text-emerald-500', isPositive: true },
    { id: 'gol-olimpico', nombre: 'Gol Olímpico', icon: 'fa-crown', color: 'text-amber-500', isPositive: true },
    { id: 'asistencia', nombre: 'Asistencia', icon: 'fa-handshake', color: 'text-blue-500', isPositive: true },
    { id: 'tiro-puerta', nombre: 'Tiro a puerta', icon: 'fa-bullseye', color: 'text-emerald-400' },
    { id: 'tiro-fuera', nombre: 'Tiro fuera', icon: 'fa-xmark', color: 'text-slate-500' },
    { id: 'recuperacion', nombre: 'Recuperación', icon: 'fa-magnet', color: 'text-emerald-500', isPositive: true },
    { id: 'perdida', nombre: 'Pérdida', icon: 'fa-arrow-right-from-bracket', color: 'text-rose-400' },
    { id: 'falta-cometida', nombre: 'Falta Cometida', icon: 'fa-gavel', color: 'text-amber-600' },
    { id: 'falta-recibida', nombre: 'Falta Recibida', icon: 'fa-user-nurse', color: 'text-blue-400' },
    { id: 'parada', nombre: 'Parada', icon: 'fa-hand', color: 'text-emerald-500', isPositive: true },
    { id: 'amarilla', nombre: 'Tarjeta Amarilla', icon: 'fa-square', color: 'text-amber-500', isPositive: false },
    { id: 'roja', nombre: 'Tarjeta Roja', icon: 'fa-square', color: 'text-red-500', isPositive: false },
    { id: 'sustitucion', nombre: 'Sustituido', icon: 'fa-arrows-rotate', color: 'text-slate-500', isChange: true },
    { id: 'sustitucion-lesion', nombre: 'Sustit. por Lesión', icon: 'fa-truck-medical', color: 'text-red-500', isChange: true }
];

export function getAccionesPartido() {
    if (partidoObj && partidoObj.configAcciones) {
        return partidoObj.configAcciones;
    }
    return DEFAULT_ACCIONES;
}

export function initDirecto() {
    document.addEventListener('open-directo', (e) => {
        abrirDirecto(e.detail);
    });

    document.getElementById('btn-back-partidos').addEventListener('click', cerrarDirecto);

    document.getElementById('btn-config-acciones').addEventListener('click', abrirModalConfigAcciones);
    document.getElementById('btn-close-modal-acciones').addEventListener('click', cerrarModalConfigAcciones);
    document.getElementById('btn-done-modal-acciones').addEventListener('click', cerrarModalConfigAcciones);
    document.getElementById('btn-save-accion').addEventListener('click', guardarNuevaAccion);
    document.getElementById('btn-cancel-accion').addEventListener('click', resetFormAccion);

    // Controles de cronómetro
    document.getElementById('btn-crono-start').addEventListener('click', toggleCrono);
    document.getElementById('btn-crono-pause').addEventListener('click', toggleCrono);
    document.getElementById('btn-crono-next').addEventListener('click', avanzarPeriodo);

    // Timeline Fullscreen
    const btnTimelineExpand = document.getElementById('btn-timeline-expand');
    if (btnTimelineExpand) {
        btnTimelineExpand.addEventListener('click', (e) => {
            e.stopPropagation();
            const container = document.getElementById('directo-timeline-container');
            if (container.classList.contains('absolute')) {
                container.classList.remove('absolute', 'inset-0', 'z-50', 'h-full');
                container.classList.add('h-28', 'sm:h-36', 'hover:h-48', 'sm:hover:h-64');
                btnTimelineExpand.innerHTML = '<i class="fa-solid fa-expand"></i>';
                btnTimelineExpand.title = "Pantalla completa";
            } else {
                container.classList.add('absolute', 'inset-0', 'z-50', 'h-full');
                container.classList.remove('h-28', 'sm:h-36', 'hover:h-48', 'sm:hover:h-64');
                btnTimelineExpand.innerHTML = '<i class="fa-solid fa-compress"></i>';
                btnTimelineExpand.title = "Minimizar";
            }
        });
    }

    // Deseleccionar
    document.getElementById('btn-unselect-jugador').addEventListener('click', clearSeleccionJugador);

    // Modal Sustitución
    document.getElementById('btn-close-modal-sustitucion').addEventListener('click', cerrarModalCambio);
    document.getElementById('btn-cancel-modal-sustitucion').addEventListener('click', cerrarModalCambio);
    document.getElementById('btn-save-modal-sustitucion').addEventListener('click', ejecutarCambio);
    
    renderAcciones();
}

function abrirDirecto(id) {
    partidoIdActivo = id;
    
    // Switch Views
    document.querySelectorAll('.app-view').forEach(v => v.classList.add('hidden'));
    document.getElementById('view-directo').classList.remove('hidden');
    
    // Ocultar sidebar
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        if (window.innerWidth >= 768) {
            sidebar.classList.remove('md:flex');
            sidebar.classList.add('hidden');
        } else {
            sidebar.classList.add('hidden');
            sidebar.classList.remove('flex');
        }
    }

    // Subscribe to specific match
    if (unsubPartido) unsubPartido();
    unsubPartido = onSnapshot(doc(db, 'partidos', id), (docSnap) => {
        if (!docSnap.exists()) return;
        partidoObj = { id: docSnap.id, ...docSnap.data() };
        
        // Safety initialization if match doesn't have tracking fields yet
        if (!partidoObj.cronometro) {
            partidoObj.cronometro = { estado: 'pausado', ultimoInicioTimer: 0, tiempoAcumulado: 0, periodo: '1ª Parte' };
        }
        if (!partidoObj.enCampo) {
            partidoObj.enCampo = partidoObj.titulares || [];
        }

        renderJugadoresEnCampo();
        updateCronoUI();
        manejarIntervaloCrono();
    });

    // Subscribe to efemerides
    if (unsubEfemerides) unsubEfemerides();
    unsubEfemerides = onSnapshot(collection(db, 'partidos', id, 'efemerides'), (snapshot) => {
        efemeridesList = [];
        snapshot.forEach(docSnap => efemeridesList.push({ id: docSnap.id, ...docSnap.data() }));
        efemeridesList.sort((a,b) => b.timestamp - a.timestamp); // Mas recientes primero
        renderEfemerides();
    });

    clearSeleccionJugador();
}

function cerrarDirecto() {
    partidoIdActivo = null;
    if (unsubPartido) unsubPartido();
    if (unsubEfemerides) unsubEfemerides();
    if (cronoInterval) clearInterval(cronoInterval);
    
    document.querySelectorAll('.app-view').forEach(v => v.classList.add('hidden'));
    document.getElementById('view-partidos').classList.remove('hidden');

    // Restaurar sidebar si estamos en escritorio
    const sidebar = document.getElementById('sidebar');
    if (sidebar && window.innerWidth >= 768) {
        sidebar.classList.add('md:flex');
        sidebar.classList.remove('hidden');
    }
}

// --------------------------------- CRONOMETRO ---------------------------------
async function toggleCrono() {
    if (!partidoObj) return;
    const c = partidoObj.cronometro;
    const isPlaying = c.estado === 'corriendo';
    
    const nuevoEstado = isPlaying ? 'pausado' : 'corriendo';
    const ahora = Date.now();
    let nuevoTiempoAcu = c.tiempoAcumulado;
    let nuevoInicio = c.ultimoInicioTimer;

    if (isPlaying) {
        // Stop
        nuevoTiempoAcu += (ahora - c.ultimoInicioTimer);
        nuevoInicio = 0;
    } else {
        // Start
        nuevoInicio = ahora;
    }

    try {
        await updateDoc(doc(db, 'partidos', partidoIdActivo), {
            'cronometro.estado': nuevoEstado,
            'cronometro.ultimoInicioTimer': nuevoInicio,
            'cronometro.tiempoAcumulado': nuevoTiempoAcu
        });
    } catch(err) {
        mostrarNotificacion("Error de conexión", true);
    }
}

async function avanzarPeriodo() {
    if (!partidoObj) return;
    const periodos = ['1ª Parte', '2ª Parte', 'Prórroga 1', 'Prórroga 2', 'Penaltis'];
    const c = partidoObj.cronometro;
    
    let idx = periodos.indexOf(c.periodo);
    let nextPeriodo = periodos[idx + 1] || 'Finalizado';

    const ahora = Date.now();
    let nuevoTiempoAcu = c.tiempoAcumulado;
    if (c.estado === 'corriendo') {
        nuevoTiempoAcu += (ahora - c.ultimoInicioTimer);
    }

    try {
        await updateDoc(doc(db, 'partidos', partidoIdActivo), {
            'cronometro.estado': 'pausado',
            'cronometro.ultimoInicioTimer': 0,
            'cronometro.tiempoAcumulado': nuevoTiempoAcu,
            'cronometro.periodo': nextPeriodo
        });
    } catch(err) {}
}

function manejarIntervaloCrono() {
    if (cronoInterval) clearInterval(cronoInterval);
    
    if (partidoObj?.cronometro?.estado === 'corriendo') {
        cronoInterval = setInterval(updateCronoUI, 1000);
    }
}

function calcularMsActuales() {
    if (!partidoObj || !partidoObj.cronometro) return 0;
    const c = partidoObj.cronometro;
    let totalMs = c.tiempoAcumulado || 0;
    if (c.estado === 'corriendo' && c.ultimoInicioTimer) {
        totalMs += (Date.now() - c.ultimoInicioTimer);
    }
    return totalMs;
}

function formatoCrono(ms) {
    const totalSecs = Math.floor(ms / 1000);
    const m = Math.floor(totalSecs / 60).toString().padStart(2, '0');
    const s = (totalSecs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

const formatStringHora = (ms) => formatoCrono(ms);

function updateCronoUI() {
    if (!partidoObj) return;
    const c = partidoObj.cronometro;
    
    const msActuales = calcularMsActuales();
    document.getElementById('directo-cronometro').innerText = formatoCrono(msActuales);
    document.getElementById('directo-periodo').innerText = c.periodo || '1ª Parte';

    const btnStart = document.getElementById('btn-crono-start');
    const btnPause = document.getElementById('btn-crono-pause');
    const btnNext = document.getElementById('btn-crono-next');

    // Comprobar tiempo
    const hoyStr = new Date().toLocaleDateString('en-CA');
    const isPast = partidoObj.fecha && partidoObj.fecha < hoyStr;

    // Comprobar si está finalizado
    const isFinalizado = c.periodo === 'Finalizado' || isPast;
    const campoContainer = document.getElementById('directo-jugadores-list');

    if (isFinalizado) {
        btnStart.classList.add('hidden');
        btnPause.classList.add('hidden');
        btnNext.classList.add('hidden');
        campoContainer.classList.add('pointer-events-none', 'opacity-70');
        document.getElementById('directo-acciones-list').classList.add('opacity-50', 'pointer-events-none');
        document.getElementById('directo-cronometro').classList.remove('text-emerald-400');
    } else {
        btnNext.classList.remove('hidden');
        campoContainer.classList.remove('pointer-events-none', 'opacity-70');
        // El de acciones se controla por seleccionarJugador, no limpiar en update cíclico

        if (c.estado === 'corriendo') {
            btnStart.classList.add('hidden');
            btnPause.classList.remove('hidden');
            document.getElementById('directo-cronometro').classList.add('text-emerald-400');
        } else {
            btnPause.classList.add('hidden');
            btnStart.classList.remove('hidden');
            document.getElementById('directo-cronometro').classList.remove('text-emerald-400');
        }
    }

    const isLocal = partidoObj.esLocal !== false;
    const rivalName = partidoObj.rival || 'Rival';
    const miEquipo = todosLosEquipos.find(eq => eq.id === partidoObj.equipoId)?.nombre || 'Mi Equipo';
    const matchTitle = isLocal ? `${miEquipo} vs ${rivalName}` : `${rivalName} vs ${miEquipo}`;
    document.getElementById('directo-titulo-partido').innerText = `${matchTitle} - Directo`;
}


// --------------------------------- JUGADORES ---------------------------------
function renderJugadoresEnCampo() {
    const container = document.getElementById('directo-jugadores-list');
    const enCampo = partidoObj?.enCampo || [];
    
    document.getElementById('directo-count-campo').innerText = enCampo.length;

    if (enCampo.length === 0) {
        container.innerHTML = `<div class="col-span-full py-6 text-center text-slate-400"><i class="fa-solid fa-bed text-2xl mb-2"></i><br>Nadie en el campo</div>`;
        return;
    }

    const jugadoresObj = todosLosJugadores.filter(j => enCampo.includes(j.id));
    jugadoresObj.sort((a,b) => (parseInt(a.dorsal)||0) - (parseInt(b.dorsal)||0));

    container.innerHTML = jugadoresObj.map(j => {
        const isSelected = j.id === jugadorSeleccionadoId;
        const colorEstado = j.estado === 'Tocado' ? 'bg-amber-500' : (j.estado === 'Lesionado' ? 'bg-red-500' : 'bg-emerald-500');

        return `
            <div class="jugador-campo-card relative flex items-center p-1 sm:p-2 rounded-lg sm:rounded-xl border ${isSelected ? 'border-blue-500 bg-blue-50 shadow-md ring-1 ring-blue-500' : 'border-slate-200 bg-white hover:bg-slate-50 cursor-pointer'} transition-all" data-id="${j.id}">
                <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0 font-bold mr-2 sm:mr-3 relative text-xs sm:text-base">
                    ${j.dorsal || '?'}
                    <div class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 ${colorEstado} border-2 border-white rounded-full"></div>
                </div>
                <div class="font-semibold text-slate-800 text-[10px] sm:text-sm truncate flex-1" title="${j.nombre}">${j.nombre}</div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.jugador-campo-card').forEach(c => {
        c.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const j = todosLosJugadores.find(x => x.id === id);
            seleccionarJugador(j);
        });
    });
}

function seleccionarJugador(jug) {
    if (!jug) return;
    if (jugadorSeleccionadoId === jug.id) {
        clearSeleccionJugador(); // click again to unselect
        return;
    }

    jugadorSeleccionadoId = jug.id;
    document.getElementById('directo-jugador-sel-name').innerText = `#${jug.dorsal} ${jug.nombre}`;
    document.getElementById('btn-unselect-jugador').classList.remove('hidden');
    document.getElementById('directo-acciones-list').classList.remove('opacity-50', 'pointer-events-none');
    
    renderJugadoresEnCampo(); // Re-render to show selection highlight
}

function clearSeleccionJugador() {
    jugadorSeleccionadoId = null;
    document.getElementById('directo-jugador-sel-name').innerText = 'Nadie';
    document.getElementById('btn-unselect-jugador').classList.add('hidden');
    document.getElementById('directo-acciones-list').classList.add('opacity-50', 'pointer-events-none');
    if (partidoObj) renderJugadoresEnCampo();
}


// --------------------------------- CONFIG ACCIONES ---------------------------------
function abrirModalConfigAcciones() {
    // Si no tiene config propia, la inicializamos con los defaults
    if (!partidoObj.configAcciones) {
        partidoObj.configAcciones = JSON.parse(JSON.stringify(DEFAULT_ACCIONES));
        // Save back to db so we have it
        updateDoc(doc(db, 'partidos', partidoIdActivo), { configAcciones: partidoObj.configAcciones });
    }
    resetFormAccion();
    renderListaConfigAcciones();
    document.getElementById('modal-config-acciones').classList.remove('hidden');
}

function cerrarModalConfigAcciones() {
    document.getElementById('modal-config-acciones').classList.add('hidden');
    renderAcciones(); // Re-render main actions
}

function renderListaConfigAcciones() {
    const container = document.getElementById('list-acciones-config');
    const list = getAccionesPartido();
    
    container.innerHTML = list.map(acc => {
        const isActive = acc.isActive !== false; // true by default
        return `
            <div class="flex items-center justify-between p-2 sm:p-3 border rounded-lg bg-white shadow-sm gap-2 opacity-${isActive ? '100' : '50'}">
                <div class="flex items-center gap-3 flex-1 min-w-0">
                    <input type="checkbox" class="chk-active-accion w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer" data-id="${acc.id}" ${isActive ? 'checked' : ''} title="Mostrar en el partido">
                    <i class="fa-solid ${acc.icon} ${acc.color} w-6 text-center text-lg shrink-0"></i>
                    <span class="font-medium text-slate-700 truncate ${isActive ? '' : 'line-through'}">${acc.nombre} ${acc.isChange ? '<span class="text-xs bg-amber-100 text-amber-700 px-1 rounded ml-1">[S]</span>' : ''}</span>
                </div>
                <div class="flex gap-1 shrink-0">
                    <button class="btn-edit-accion w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors" data-id="${acc.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-delete-accion w-8 h-8 rounded-full bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-colors" data-id="${acc.id}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.chk-active-accion').forEach(cb => {
        cb.addEventListener('change', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const isActive = e.currentTarget.checked;
            const idx = partidoObj.configAcciones.findIndex(a => a.id === id);
            if (idx !== -1) {
                partidoObj.configAcciones[idx].isActive = isActive;
                await updateDoc(doc(db, 'partidos', partidoIdActivo), { configAcciones: partidoObj.configAcciones });
                renderListaConfigAcciones();
            }
        });
    });

    container.querySelectorAll('.btn-edit-accion').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const acc = getAccionesPartido().find(a => a.id === id);
            if (acc) {
                document.getElementById('input-accion-id').value = acc.id;
                document.getElementById('input-accion-nombre').value = acc.nombre;
                document.getElementById('input-accion-icon').value = acc.icon;
                document.getElementById('input-accion-color').value = acc.color;
                document.getElementById('input-accion-isChange').checked = !!acc.isChange;
                document.getElementById('title-form-accion').innerText = 'Editar Acción';
                document.getElementById('btn-save-accion').innerText = 'Guardar Cambios';
                document.getElementById('btn-cancel-accion').classList.remove('hidden');
                document.getElementById('btn-save-accion').classList.remove('w-full');
            }
        });
    });

    container.querySelectorAll('.btn-delete-accion').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            if (await confirmarAccion('¿Seguro que quieres eliminar esta acción?')) {
                const newList = getAccionesPartido().filter(a => a.id !== id);
                partidoObj.configAcciones = newList;
                await updateDoc(doc(db, 'partidos', partidoIdActivo), { configAcciones: newList });
                renderListaConfigAcciones();
            }
        });
    });
}

function resetFormAccion() {
    document.getElementById('input-accion-id').value = '';
    document.getElementById('input-accion-nombre').value = '';
    document.getElementById('input-accion-icon').value = 'fa-bolt';
    document.getElementById('input-accion-color').value = 'text-slate-500';
    document.getElementById('input-accion-isChange').checked = false;
    document.getElementById('title-form-accion').innerText = 'Nueva Acción';
    document.getElementById('btn-save-accion').innerText = 'Añadir Acción';
    document.getElementById('btn-cancel-accion').classList.add('hidden');
    document.getElementById('btn-save-accion').classList.add('w-full');
}

async function guardarNuevaAccion() {
    const idField = document.getElementById('input-accion-id').value;
    const nombre = document.getElementById('input-accion-nombre').value.trim();
    let icon = document.getElementById('input-accion-icon').value.trim();
    const color = document.getElementById('input-accion-color').value;
    const isChange = document.getElementById('input-accion-isChange').checked;

    if (!nombre) {
        mostrarNotificacion('El nombre es obligatorio', true);
        return;
    }
    if (!icon) {
        icon = isChange ? 'fa-arrows-rotate' : 'fa-bolt'; // default icon
    }
    
    // Remove "fa-solid" just keep the icon name if user copied whole class
    icon = icon.replace('fa-solid ', '').trim();
    if (!icon.startsWith('fa-')) icon = 'fa-' + icon;

    let newList = [...getAccionesPartido()];

    if (idField) {
        // Edit
        const idx = newList.findIndex(a => a.id === idField);
        if (idx !== -1) {
            newList[idx] = { ...newList[idx], nombre, icon, color, isChange };
        }
    } else {
        // Add
        const newId = 'acc_' + Date.now().toString(36);
        newList.push({ id: newId, nombre, icon, color, isChange, isActive: true });
    }

    partidoObj.configAcciones = newList;
    await updateDoc(doc(db, 'partidos', partidoIdActivo), { configAcciones: newList });
    resetFormAccion();
    renderListaConfigAcciones();
}

// --------------------------------- ACCIONES ---------------------------------
function renderAcciones() {
    const container = document.getElementById('directo-acciones-list');
    const list = getAccionesPartido().filter(acc => acc.isActive !== false);
    container.innerHTML = list.map(acc => {
        let btnCls = 'bg-white border hover:bg-slate-50';
        if (acc.isChange) btnCls = 'bg-amber-50 border-amber-200 hover:bg-amber-100 text-amber-700';

        return `
            <button class="btn-accion flex flex-col sm:flex-row items-center justify-start sm:justify-center p-2 rounded-lg transition-colors shadow-sm text-left sm:text-center ${btnCls}" data-id="${acc.id}">
                <i class="fa-solid ${acc.icon} ${acc.color} text-lg sm:text-2xl mb-1 sm:mb-2 mr-2 sm:mr-0 shrink-0 w-6 text-center"></i>
                <span class="text-[10px] sm:text-xs font-bold text-slate-700 leading-tight flex-1 break-words">${acc.nombre}</span>
            </button>
        `;
    }).join('');

    container.querySelectorAll('.btn-accion').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            manejarClickAccion(id);
        });
    });
}

function manejarClickAccion(accionId) {
    if (!jugadorSeleccionadoId || !partidoIdActivo) return;
    
    const acc = getAccionesPartido().find(a => a.id === accionId);
    if (!acc) return;

    if (acc.isChange) {
        accionCambioPendiente = acc;
        abrirModalSustitucion();
    } else {
        registrarEfemeride(acc);
    }
}

async function registrarEfemeride(accDef, extraData = {}) {
    if (!jugadorSeleccionadoId) return;

    const jInfo = todosLosJugadores.find(j => j.id === jugadorSeleccionadoId);
    if (!jInfo) return;

    const msActuales = calcularMsActuales();
    
    const e = {
        tipo: accDef.id,
        nombre: accDef.nombre,
        jugadorId: jInfo.id,
        jugadorNombre: jInfo.nombre,
        jugadorDorsal: jInfo.dorsal,
        tiempoAnotado: formatoCrono(msActuales),
        minutoMs: msActuales,
        periodo: partidoObj?.cronometro?.periodo || '1ª Parte',
        timestamp: Date.now(),
        icon: accDef.icon,
        color: accDef.color,
        ...extraData
    };

    try {
        await addDoc(collection(db, 'partidos', partidoIdActivo, 'efemerides'), e);
        mostrarNotificacion(`${accDef.nombre} registrado`);
    } catch(err) {
        mostrarNotificacion("Error al guardar acción", true);
    }

    clearSeleccionJugador();
}


// --------------------------------- SUSTITUCIÓN ---------------------------------
function abrirModalSustitucion() {
    const banquilloContainer = document.getElementById('sustitucion-banquillo-list');
    const jSale = todosLosJugadores.find(j => j.id === jugadorSeleccionadoId);
    
    document.getElementById('sustitucion-jugador-sale').innerText = `#${jSale?.dorsal || ''} ${jSale?.nombre || 'Error'}`;

    const convocados = partidoObj?.convocados || [];
    const enCampo = partidoObj?.enCampo || [];

    // Banquillo = Convocados que no están enCampo
    const banquilloIds = convocados.filter(id => !enCampo.includes(id));
    const jugadoresBanquillo = todosLosJugadores.filter(j => banquilloIds.includes(j.id));
    jugadoresBanquillo.sort((a,b) => (parseInt(a.dorsal)||0) - (parseInt(b.dorsal)||0));

    if (jugadoresBanquillo.length === 0) {
        banquilloContainer.innerHTML = '<div class="text-slate-400 p-4 text-center">No hay jugadores en el banquillo.</div>';
        document.getElementById('btn-save-modal-sustitucion').disabled = true;
    } else {
        banquilloContainer.innerHTML = jugadoresBanquillo.map(j => `
            <label class="flex items-center p-3 border rounded-lg hover:bg-blue-50 cursor-pointer transition-colors bg-white">
                <input type="radio" name="radio-entra" value="${j.id}" class="w-5 h-5 mr-3 text-blue-600 focus:ring-blue-500">
                <span class="font-bold w-8 text-slate-400 shrink-0">#${j.dorsal}</span>
                <span class="font-semibold text-slate-800">${j.nombre}</span>
            </label>
        `).join('');
        document.getElementById('btn-save-modal-sustitucion').disabled = false;
    }

    document.getElementById('modal-sustitucion').classList.remove('hidden');
}

function cerrarModalCambio() {
    document.getElementById('modal-sustitucion').classList.add('hidden');
    accionCambioPendiente = null;
}

async function ejecutarCambio() {
    const radioSelected = document.querySelector('input[name="radio-entra"]:checked');
    if (!radioSelected) {
        alert("Selecciona quién entra al campo.");
        return;
    }

    const jEntraId = radioSelected.value;
    const jSaleId = jugadorSeleccionadoId;
    const jEntra = todosLosJugadores.find(j => j.id === jEntraId);

    // 1. Guardar efeméride del cambio
    await registrarEfemeride(accionCambioPendiente, {
        jugadorEntraId: jEntraId,
        jugadorEntraNombre: jEntra?.nombre,
        jugadorEntraDorsal: jEntra?.dorsal
    });

    cerrarModalCambio();
    
    // 2. Modificar EnCampo en el partido
    try {
        let nuevosEnCampo = [...(partidoObj.enCampo || [])];
        
        // Quitar al que sale
        if (jSaleId) {
            nuevosEnCampo = nuevosEnCampo.filter(id => id !== jSaleId);
        }
        
        // Añadir al que entra
        if (jEntraId && !nuevosEnCampo.includes(jEntraId)) {
            nuevosEnCampo.push(jEntraId);
        }

        await updateDoc(doc(db, 'partidos', partidoIdActivo), {
            enCampo: nuevosEnCampo
        });
        
        clearSeleccionJugador();
    } catch(e) {
        console.error("Error al actualizar enCampo:", e);
    }
}


// --------------------------------- TIMELINE (EFEMÉRIDES) ---------------------------------
function renderEfemerides() {
    const container = document.getElementById('directo-timeline');
    
    if (efemeridesList.length === 0) {
        container.innerHTML = '<div class="text-center text-slate-400 py-6">Aún no hay acciones registradas.</div>';
        return;
    }

    container.innerHTML = efemeridesList.map(e => {
        const isSust = (e.tipo === 'sustitucion' || e.tipo === 'sustitucion-lesion');
        
        let desc = `<span class="font-bold text-slate-800">#${e.jugadorDorsal} ${e.jugadorNombre}</span>`;
        if (isSust) {
            desc += ` <i class="fa-solid fa-arrow-right-long text-slate-400 mx-2"></i> <span class="font-bold text-slate-800">#${e.jugadorEntraDorsal} ${e.jugadorEntraNombre}</span>`;
        }

        return `
            <div class="flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 bg-white/80 border border-slate-100 rounded-lg shadow-sm group hover:bg-white transition-colors">
                <div class="text-[10px] sm:text-xs font-bold text-slate-400 w-10 sm:w-12 text-center shrink-0">
                    <div>${e.tiempoAnotado}</div>
                    <div class="text-[8px] sm:text-[9px] uppercase leading-none mt-0.5">${e.periodo}</div>
                </div>
                <div class="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-slate-50 flex items-center justify-center shrink-0">
                    <i class="fa-solid ${e.icon} ${e.color} text-xs sm:text-sm"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="text-xs sm:text-sm font-bold text-slate-600 mb-0.5 truncate">${e.nombre}</div>
                    <div class="text-[10px] sm:text-xs truncate">${desc}</div>
                </div>
                <button class="btn-del-efemeride text-slate-300 hover:text-red-500 md:opacity-0 group-hover:opacity-100 transition-opacity p-1 sm:p-2 shrink-0" data-id="${e.id}" title="Eliminar"><i class="fa-solid fa-trash text-xs"></i></button>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.btn-del-efemeride').forEach(btn => {
        btn.addEventListener('click', async (ev) => {
            const id = ev.currentTarget.getAttribute('data-id');
            if (await confirmarAccion("¿Eliminar este registro?")) {
                // If it was a substitution, maybe we should warn that enCampo wasn't reverted, but for now just delete the record so it doesn't count in statistics.
                try {
                    await deleteDoc(doc(db, 'partidos', partidoIdActivo, 'efemerides', id));
                    mostrarNotificacion("Registro eliminado");
                } catch(err) {
                    mostrarNotificacion("Error al eliminar", true);
                }
            }
        });
    });
}
