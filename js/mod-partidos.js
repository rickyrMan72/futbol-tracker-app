import { db, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc } from './firebase-config.js';
import { mostrarNotificacion, bindModal, confirmarAccion } from './ui.js';
import { todosLosJugadores, equipoIdActivo } from './mod-jugadores.js';
import { todosLosEquipos } from './mod-equipos.js';

export let todosLosPartidos = [];
const contenedor = document.getElementById('lista-partidos-container');

export function initPartidos() {
    onSnapshot(collection(db, 'partidos'), (snapshot) => {
        todosLosPartidos = [];
        snapshot.forEach((doc) => todosLosPartidos.push({ id: doc.id, ...doc.data() }));
        // Ordenar por fecha y hora (menor a mayor)
        todosLosPartidos.sort((a, b) => {
            const dateA = new Date(`${a.fecha}T${a.hora}`);
            const dateB = new Date(`${b.fecha}T${b.hora}`);
            return dateA - dateB;
        });
        renderizarPartidos();
    });

    const prepPartido = () => {
        if (!document.getElementById('form-partido').dataset.editId) {
            document.getElementById('input-partido-fecha').value = new Date().toISOString().split('T')[0];
            document.getElementById('input-partido-hora').value = "10:00";
            
            const jugadoresEquipo = todosLosJugadores.filter(j => j.equipoId === equipoIdActivo);
            // Ordenar por dorsal temporalmente
            jugadoresEquipo.sort((a,b) => (parseInt(a.dorsal)||0) - (parseInt(b.dorsal)||0));

            document.getElementById('partido-jugadores-list').innerHTML = jugadoresEquipo.length > 0 
                ? jugadoresEquipo.map(jug => `
                    <label class="flex justify-between items-center text-sm p-2 hover:bg-slate-100 rounded cursor-pointer border-b border-slate-100 border-opacity-50">
                        <span class="truncate pr-2">#${jug.dorsal} ${jug.nombre}</span>
                        <div class="flex gap-4 min-w-max">
                            <input type="checkbox" value="${jug.id}" class="chk-convocado w-5 h-5 rounded border-slate-300 text-amber-500 focus:ring-amber-500">
                            <input type="checkbox" value="${jug.id}" class="chk-titular w-5 h-5 rounded border-slate-300 text-red-500 focus:ring-red-500" disabled>
                        </div>
                    </label>
                  `).join('')
                : '<p class="text-sm text-slate-500 text-center py-4">No hay jugadores en este equipo.</p>';
            
            añadirEventosCheckboxes();
            document.querySelector('#modal-partido h3').innerText = "Nuevo Partido";
        }
    };

    const closeModPartido = bindModal('modal-partido', 'btn-open-modal-partido', 'btn-close-modal-partido', 'btn-cancel-modal-partido', () => {
        document.getElementById('form-partido').reset();
        delete document.getElementById('form-partido').dataset.editId;
        prepPartido();
    });
    
    document.getElementById('btn-open-modal-partido').addEventListener('click', prepPartido);
    
    document.getElementById('btn-save-modal-partido').addEventListener('click', async () => {
        if (!equipoIdActivo) {
            alert("Selecciona un equipo primero.");
            return;
        }

        const convocados = Array.from(document.querySelectorAll('.chk-convocado:checked')).map(cb => cb.value);
        const titulares = Array.from(document.querySelectorAll('.chk-titular:checked')).map(cb => cb.value);

        const data = {
            rival: document.getElementById('input-partido-rival').value,
            escudoRival: document.getElementById('input-partido-escudo-rival').value || '',
            fecha: document.getElementById('input-partido-fecha').value,
            hora: document.getElementById('input-partido-hora').value,
            lugar: document.getElementById('input-partido-lugar').value,
            comentarios: document.getElementById('input-partido-comentarios').value,
            convocados: convocados,
            titulares: titulares,
            equipoId: equipoIdActivo
        };

        if (!data.rival || !data.fecha || !data.hora) return alert("Faltan campos obligatorios");

        try { 
            const editId = document.getElementById('form-partido').dataset.editId;
            if (editId) {
                await updateDoc(doc(db, 'partidos', editId), data);
                mostrarNotificacion("Partido actualizado"); 
            } else {
                // Initialize match state
                data.enCampo = titulares;
                data.cronometro = {
                    estado: 'pausado',
                    ultimoInicioTimer: 0,
                    tiempoAcumulado: 0,
                    periodo: '1ª Parte'
                };
                await addDoc(collection(db, 'partidos'), data); 
                mostrarNotificacion("Partido guardado"); 
            }
            closeModPartido(); 
        } catch(e) { mostrarNotificacion("Error al guardar", true); }
    });
}

function añadirEventosCheckboxes() {
    // Si se desmarca convocado, se desmarca titular
    // Titular solo habilitado si convocado está marcado
    const convChecks = document.querySelectorAll('.chk-convocado');
    convChecks.forEach(chk => {
        chk.addEventListener('change', (e) => {
            const row = e.target.closest('label');
            const titChk = row.querySelector('.chk-titular');
            titChk.disabled = !e.target.checked;
            if (!e.target.checked) {
                titChk.checked = false;
            }
        });
    });
}

export function renderizarPartidos() {
    const msgNoEquipo = document.getElementById('msg-no-equipo-partido');
    const btnAddPartido = document.getElementById('btn-open-modal-partido');

    if (!equipoIdActivo) {
        contenedor.classList.add('hidden');
        if (msgNoEquipo) msgNoEquipo.classList.remove('hidden');
        if (btnAddPartido) btnAddPartido.disabled = true;
        return;
    }

    contenedor.classList.remove('hidden');
    if (msgNoEquipo) msgNoEquipo.classList.add('hidden');
    if (btnAddPartido) btnAddPartido.disabled = false;

    const equipoActual = todosLosEquipos.find(eq => eq.id === equipoIdActivo);
    const partidosEquipo = todosLosPartidos.filter(p => p.equipoId === equipoIdActivo);

    contenedor.innerHTML = partidosEquipo.length === 0 ? `<div class="col-span-full py-10 text-center text-slate-400">Sin partidos planificados</div>` : '';

    const ahora = new Date();
    const hoyStr = ahora.toISOString().split('T')[0];
    
    // Convertir fechas para saber cual es el próximo
    const partidosFuturos = partidosEquipo.filter(p => new Date(`${p.fecha}T${p.hora}`) >= ahora);
    const idProximo = partidosFuturos.length > 0 ? partidosFuturos[0].id : null;

    partidosEquipo.forEach(par => {
        const fechaPartido = new Date(`${par.fecha}T${par.hora}`);
        const isPast = fechaPartido < ahora;
        const isToday = par.fecha === hoyStr;
        const isNext = par.id === idProximo;

        let cardClasses = 'bg-white rounded-xl border p-5 mt-3 relative flex flex-col group transition-all duration-300 hover:shadow-md';
        let statusBadge = '';

        if (isPast && !isToday) {
            cardClasses += ' grayscale opacity-70 border-slate-200';
            statusBadge = '<span class="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-200 text-slate-500 text-[10px] font-bold px-3 py-1 rounded-full shadow-sm whitespace-nowrap z-30">FINALIZADO</span>';
        } else if (isNext) {
            cardClasses += ' border-amber-400 shadow-amber-100 shadow-lg scale-[1.02] z-10 ring-2 ring-amber-400 border-transparent';
            statusBadge = '<span class="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-sm whitespace-nowrap z-30">PRÓXIMO PARTIDO</span>';
        } else if (isToday) {
            cardClasses += ' border-blue-400 shadow-blue-100 shadow-md';
            statusBadge = '<span class="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-sm whitespace-nowrap z-30">HOY</span>';
        } else {
            cardClasses += ' border-slate-200';
        }

        const escudoLocal = equipoActual?.escudo ? `<img src="${equipoActual.escudo}" class="w-12 h-12 object-contain" alt="Local">` : `<div class="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><i class="fa-solid fa-shield"></i></div>`;
        const escudoRivalImg = par.escudoRival ? `<img src="${par.escudoRival}" class="w-12 h-12 object-contain" alt="Rival">` : `<div class="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><i class="fa-solid fa-shield"></i></div>`;

        const nomLocal = equipoActual?.nombre || 'Mi Equipo';
        const nomRival = par.rival || 'Rival';

        const card = document.createElement('div');
        card.className = cardClasses;
        card.innerHTML = `
            ${statusBadge}
            <div class="absolute top-2 left-2 flex gap-1 z-20">
                <button class="btn-play-par w-8 h-8 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full transition-colors shadow-sm focus:outline-none" data-id="${par.id}" title="Jugar/Ver Directo"><i class="fa-solid fa-play ml-0.5"></i></button>
            </div>
            <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 z-20">
                <button class="btn-edit-par w-8 h-8 bg-blue-50 hover:bg-blue-100 text-blue-500 rounded-full transition-colors" data-id="${par.id}" title="Editar Partido"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-del-par w-8 h-8 bg-red-50 hover:bg-red-100 text-red-500 rounded-full transition-colors" data-id="${par.id}" title="Eliminar Partido"><i class="fa-solid fa-trash"></i></button>
            </div>
            
            <div class="text-center font-bold text-slate-500 mb-4 mt-2 text-sm flex justify-center items-center gap-2">
                <i class="fa-regular fa-calendar"></i> ${par.fecha.split('-').reverse().join('/')} &nbsp;|&nbsp; <i class="fa-regular fa-clock"></i> ${par.hora}
            </div>

            <div class="flex items-center justify-between mb-4">
                <div class="flex flex-col items-center flex-1 w-1/3">
                    ${escudoLocal}
                    <span class="font-bold text-slate-800 text-sm mt-2 text-center line-clamp-1 w-full">${nomLocal}</span>
                </div>
                <div class="font-black text-xl text-slate-300 flex-shrink-0 px-4">VS</div>
                <div class="flex flex-col items-center flex-1 w-1/3">
                    ${escudoRivalImg}
                    <span class="font-bold text-slate-800 text-sm mt-2 text-center line-clamp-1 w-full">${nomRival}</span>
                </div>
            </div>

            ${par.lugar ? `<div class="text-xs text-slate-500 text-center mb-1"><i class="fa-solid fa-location-dot mr-1"></i> ${par.lugar}</div>` : ''}
            ${par.comentarios ? `<div class="text-xs text-amber-600 bg-amber-50 p-2 rounded text-center mt-2 mx-4">${par.comentarios}</div>` : ''}

            <div class="mt-4 pt-3 border-t text-xs text-slate-500 flex justify-around">
                <span><i class="fa-solid fa-clipboard-user border rounded p-1 mb-1 bg-slate-50"></i> Conv: <b>${par.convocados?.length || 0}</b></span>
                <span><i class="fa-solid fa-users border rounded p-1 mb-1 bg-slate-50"></i> Tit: <b>${par.titulares?.length || 0}</b></span>
            </div>
        `;
        
        card.querySelector('.btn-del-par').addEventListener('click', async () => {
            if (await confirmarAccion('¿Eliminar partido?')) {
                try {
                    await deleteDoc(doc(db, 'partidos', par.id));
                    mostrarNotificacion("Partido eliminado");
                } catch(err) {
                    mostrarNotificacion("Error al eliminar", true);
                }
            }
        });

        card.querySelector('.btn-play-par').addEventListener('click', () => {
            // Dispatch event to switch view to view-directo and load the match
            const event = new CustomEvent('open-directo', { detail: par.id });
            document.dispatchEvent(event);
        });

        card.querySelector('.btn-edit-par').addEventListener('click', () => {
            document.getElementById('input-partido-rival').value = par.rival;
            document.getElementById('input-partido-escudo-rival').value = par.escudoRival || '';
            document.getElementById('input-partido-fecha').value = par.fecha;
            document.getElementById('input-partido-hora').value = par.hora;
            document.getElementById('input-partido-lugar').value = par.lugar || '';
            document.getElementById('input-partido-comentarios').value = par.comentarios || '';
            
            const jugadoresEquipo = todosLosJugadores.filter(j => j.equipoId === equipoIdActivo);
            jugadoresEquipo.sort((a,b) => (parseInt(a.dorsal)||0) - (parseInt(b.dorsal)||0));

            document.getElementById('partido-jugadores-list').innerHTML = jugadoresEquipo.map(jug => {
                const esConv = (par.convocados || []).includes(jug.id);
                const esTit = (par.titulares || []).includes(jug.id);
                
                return `
                    <label class="flex justify-between items-center text-sm p-2 hover:bg-slate-100 rounded cursor-pointer border-b border-slate-100 border-opacity-50">
                        <span class="truncate pr-2">#${jug.dorsal} ${jug.nombre}</span>
                        <div class="flex gap-4 min-w-max">
                            <input type="checkbox" value="${jug.id}" class="chk-convocado w-5 h-5 rounded border-slate-300 text-amber-500 focus:ring-amber-500" ${esConv ? 'checked' : ''}>
                            <input type="checkbox" value="${jug.id}" class="chk-titular w-5 h-5 rounded border-slate-300 text-red-500 focus:ring-red-500" ${esTit ? 'checked' : ''} ${!esConv ? 'disabled' : ''}>
                        </div>
                    </label>
                `;
            }).join('');
            
            añadirEventosCheckboxes();

            document.getElementById('form-partido').dataset.editId = par.id;
            document.querySelector('#modal-partido h3').innerText = "Editar Partido";
            document.getElementById('modal-partido').classList.remove('hidden');
        });

        contenedor.appendChild(card);
    });
}
