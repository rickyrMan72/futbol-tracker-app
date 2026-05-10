import { db, collection, addDoc, onSnapshot, getDocs, deleteDoc, doc, updateDoc } from './firebase-config.js';
import { mostrarNotificacion, bindModal, confirmarAccion } from './ui.js';
import { todosLosJugadores, equipoIdActivo } from './mod-jugadores.js';
import { todosLosEquipos } from './mod-equipos.js';
import { DEFAULT_ACCIONES } from './mod-directo.js';

export let todosLosPartidos = [];
const contenedor = document.getElementById('lista-partidos-container');

let mostrarHistoricos = false;

let currentShareText = "";

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

    document.getElementById('btn-close-modal-estadisticas')?.addEventListener('click', () => {
        document.getElementById('modal-estadisticas').classList.add('hidden');
    });
    document.getElementById('btn-done-modal-estadisticas')?.addEventListener('click', () => {
        document.getElementById('modal-estadisticas').classList.add('hidden');
    });
    
    document.getElementById('btn-share-modal-estadisticas')?.addEventListener('click', async () => {
        if (!currentShareText) return;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Estadísticas del Partido',
                    text: currentShareText
                });
            } catch (err) {
                console.error('Error al compartir', err);
            }
        } else {
            // Fallback to clipboard
            navigator.clipboard.writeText(currentShareText).then(() => {
                mostrarNotificacion("Estadísticas copiadas al portapapeles");
            }).catch(err => {
                mostrarNotificacion("No se pudo copiar", true);
            });
        }
    });

    document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
        const element = document.getElementById('stats-content-to-export');
        if (!element) return;
        
        // Prepare for PDF export by expanding scrollable containers
        const timelineScroll = document.getElementById('stats-timeline-scroll');
        const playersListWrapper = document.getElementById('stats-players-list').closest('.overflow-x-auto');
        const exportGrid = document.getElementById('stats-export-grid');
        
        element.classList.remove('overflow-y-auto');
        if (timelineScroll) {
            timelineScroll.classList.remove('overflow-y-auto', 'max-h-[400px]');
        }
        if (playersListWrapper) {
            playersListWrapper.classList.remove('overflow-x-auto');
        }
        if (exportGrid) {
            exportGrid.classList.remove('md:grid-cols-2');
        }

        const opt = {
          margin:       0.5,
          filename:     'estadisticas-partido.pdf',
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { scale: 2 },
          jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' },
          pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
        };
        
        html2pdf().set(opt).from(element).outputPdf('blob').then((pdfBlob) => {
            // Restore original classes
            element.classList.add('overflow-y-auto');
            if (timelineScroll) {
                timelineScroll.classList.add('overflow-y-auto', 'max-h-[400px]');
            }
            if (playersListWrapper) {
                playersListWrapper.classList.add('overflow-x-auto');
            }
            if (exportGrid) {
                exportGrid.classList.add('md:grid-cols-2');
            }
            
            const file = new File([pdfBlob], "estadisticas-partido.pdf", { type: "application/pdf" });
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                navigator.share({
                    title: 'Estadísticas del Partido',
                    files: [file]
                }).catch(err => console.log('Error al compartir', err));
            } else {
                // Fallback download if share not supported
                const url = window.URL.createObjectURL(pdfBlob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = 'estadisticas-partido.pdf';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
            }
        }).catch(err => {
            console.error("Error PDF:", err);
            element.classList.add('overflow-y-auto');
            if (timelineScroll) timelineScroll.classList.add('overflow-y-auto', 'max-h-[400px]');
            if (playersListWrapper) playersListWrapper.classList.add('overflow-x-auto');
            if (exportGrid) exportGrid.classList.add('md:grid-cols-2');
        });
    });

    document.getElementById('btn-toggle-historicos').addEventListener('click', () => {
        mostrarHistoricos = !mostrarHistoricos;
        const btn = document.getElementById('btn-toggle-historicos');
        if (mostrarHistoricos) {
            btn.innerHTML = '<i class="fa-solid fa-eye-slash mr-2"></i> Ocultar Históricos';
        } else {
            btn.innerHTML = '<i class="fa-solid fa-clock-rotate-left mr-2"></i> Ver Históricos';
        }
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
            esLocal: document.getElementById('input-partido-local').checked,
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
                const existingPartido = todosLosPartidos.find(p => p.id === editId);
                const hasStarted = existingPartido && existingPartido.cronometro && 
                                   (existingPartido.cronometro.tiempoAcumulado > 0 || existingPartido.cronometro.estado !== 'pausado');
                
                if (!hasStarted) {
                    data.enCampo = titulares;
                }
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

    actualizarDashboardUltimoPartido(partidosEquipo, ahora);

    let partidosToShow = partidosEquipo;
    if (!mostrarHistoricos) {
        partidosToShow = partidosEquipo.filter(p => {
             const fechaPartido = new Date(`${p.fecha}T${p.hora}`);
             const isPast = fechaPartido < ahora;
             const isToday = p.fecha === hoyStr;
             return !isPast || isToday;
        });
    }

    if (partidosToShow.length === 0) {
        contenedor.innerHTML = `<div class="col-span-full py-10 text-center text-slate-400">No hay partidos ${mostrarHistoricos ? '' : 'próximos '}para mostrar</div>`;
    }

    partidosToShow.forEach(par => {
        const fechaPartido = new Date(`${par.fecha}T${par.hora}`);
        const isPast = fechaPartido < ahora;
        const isToday = par.fecha === hoyStr;
        const isNext = par.id === idProximo;

        const isFinalizadoMatch = par.cronometro?.periodo === 'Finalizado' || (isPast && !isToday);

        let actionIcon = '<i class="fa-solid fa-play ml-0.5"></i>';
        let actionTitle = 'Jugar / Ver Directo';
        let actionColorClass = 'bg-emerald-500 hover:bg-emerald-600';

        let cardClasses = 'bg-white rounded-xl border p-5 mt-3 relative flex flex-col group transition-all duration-300 hover:shadow-md';
        let statusBadge = '';

        if (isFinalizadoMatch) {
            actionIcon = '<i class="fa-solid fa-clipboard-list"></i>';
            actionTitle = 'Planilla Original';
            actionColorClass = 'bg-blue-500 hover:bg-blue-600';
            
            // Add extra button for stats
            var statsBtn = `<button class="btn-stats-par w-8 h-8 bg-purple-500 hover:bg-purple-600 text-white rounded-full transition-colors shadow-sm focus:outline-none" data-id="${par.id}" title="Estadísticas"><i class="fa-solid fa-chart-simple"></i></button>`;
        }

        if (isPast && !isToday) {
            cardClasses += ' grayscale opacity-70 border-slate-200';
            statusBadge = '<span class="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-200 text-slate-500 text-[10px] font-bold px-3 py-1 rounded-full shadow-sm whitespace-nowrap z-30">FINALIZADO</span>';
        } else if (isNext) {
            cardClasses += ' border-amber-400 shadow-amber-100 shadow-lg relative z-10 ring-2 ring-amber-400';
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

        let equipoIzquierdaEscudo, equipoIzquierdaNombre;
        let equipoDerechaEscudo, equipoDerechaNombre;

        // Si esLocal es false (visitante), Rival va a la izquierda y Mi Equipo a la derecha
        if (par.esLocal === false) {
            equipoIzquierdaEscudo = escudoRivalImg;
            equipoIzquierdaNombre = nomRival;
            equipoDerechaEscudo = escudoLocal;
            equipoDerechaNombre = nomLocal;
        } else {
            equipoIzquierdaEscudo = escudoLocal;
            equipoIzquierdaNombre = nomLocal;
            equipoDerechaEscudo = escudoRivalImg;
            equipoDerechaNombre = nomRival;
        }

        const card = document.createElement('div');
        card.className = cardClasses;
        card.innerHTML = `
            ${statusBadge}
            <div class="absolute top-2 left-2 flex gap-1 z-20">
                <button class="btn-play-par w-8 h-8 ${actionColorClass} text-white rounded-full transition-colors shadow-sm focus:outline-none" data-id="${par.id}" title="${actionTitle}">${actionIcon}</button>
                ${isFinalizadoMatch ? statsBtn : ''}
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
                    ${equipoIzquierdaEscudo}
                    <span class="font-bold text-slate-800 text-sm mt-2 text-center line-clamp-1 w-full">${equipoIzquierdaNombre}</span>
                </div>
                <div class="font-black text-xl flex-shrink-0 px-4 ${par.resultado ? 'text-blue-600 bg-blue-50 py-1 rounded-lg' : 'text-slate-300'}">${par.resultado || 'VS'}</div>
                <div class="flex flex-col items-center flex-1 w-1/3">
                    ${equipoDerechaEscudo}
                    <span class="font-bold text-slate-800 text-sm mt-2 text-center line-clamp-1 w-full">${equipoDerechaNombre}</span>
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

        if (isFinalizadoMatch) {
            const statsBtnEl = card.querySelector('.btn-stats-par');
            if (statsBtnEl) {
                statsBtnEl.addEventListener('click', () => {
                    abrirEstadisticas(par);
                });
            }
        }

        card.querySelector('.btn-edit-par').addEventListener('click', () => {
            document.getElementById('input-partido-rival').value = par.rival;
            document.getElementById('input-partido-local').checked = par.esLocal !== false;
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

async function abrirEstadisticas(par) {
    const modal = document.getElementById('modal-estadisticas');
    if (!modal) return;
    
    // Fetch efemerides
    modal.classList.remove('hidden');
    document.getElementById('stats-timeline-container').innerHTML = '<div class="text-center p-4"><i class="fa-solid fa-spinner fa-spin text-2xl text-slate-400"></i></div>';
    document.getElementById('stats-global-container').innerHTML = '';
    document.getElementById('stats-players-list').innerHTML = '';
    
    // Match info for PDF and summary
    const equipoActual = todosLosEquipos.find(eq => eq.id === par.equipoId) || { nombre: 'Mi Equipo', escudo: '' };
    const escudoLocal = equipoActual.escudo ? `<img src="${equipoActual.escudo}" class="w-10 h-10 object-contain" alt="Local">` : `<div class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><i class="fa-solid fa-shield"></i></div>`;
    const escudoRivalImg = par.escudoRival ? `<img src="${par.escudoRival}" class="w-10 h-10 object-contain" alt="Rival">` : `<div class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><i class="fa-solid fa-shield"></i></div>`;
    const nomLocal = equipoActual.nombre;
    const nomRival = par.rival || 'Rival';
    
    let eqIzdaEscudo, eqIzdaNombre, eqDchaEscudo, eqDchaNombre;
    if (par.esLocal === false) {
        eqIzdaEscudo = escudoRivalImg; eqIzdaNombre = nomRival;
        eqDchaEscudo = escudoLocal; eqDchaNombre = nomLocal;
    } else {
        eqIzdaEscudo = escudoLocal; eqIzdaNombre = nomLocal;
        eqDchaEscudo = escudoRivalImg; eqDchaNombre = nomRival;
    }
    
    let fechaFormateada = '';
    if (par.fecha) {
        const p = par.fecha.split('-');
        fechaFormateada = p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : par.fecha;
    }
    const fechaHora = `${fechaFormateada} ${par.hora ? '- ' + par.hora : ''}`;
    const headerHtml = `
        <div class="flex items-center gap-3">
            ${eqIzdaEscudo}
            <span class="font-bold text-slate-700 text-lg">${eqIzdaNombre}</span>
        </div>
        <div class="flex flex-col items-center">
            <span class="text-xs text-slate-400 font-medium bg-slate-100 px-2 py-1 rounded-full">${fechaHora}</span>
            <span class="text-sm font-bold text-slate-500 mt-1">VS</span>
        </div>
        <div class="flex items-center gap-3 text-right">
            <span class="font-bold text-slate-700 text-lg">${eqDchaNombre}</span>
            ${eqDchaEscudo}
        </div>
    `;
    const infoContainer = document.getElementById('stats-match-info');
    if (infoContainer) {
        infoContainer.innerHTML = headerHtml;
    }
    
    let efemerides = [];
    try {
        const snap = await getDocs(collection(db, 'partidos', par.id, 'efemerides'));
        snap.forEach(d => efemerides.push({id: d.id, ...d.data()}));
    } catch (e) {
        console.error("Error fetching efemerides:", e);
    }
    
    efemerides.sort((a,b) => a.timestamp - b.timestamp);
    const configAcc = par.configAcciones || DEFAULT_ACCIONES;
    
    // Procesar estadisticas
    let golesMios = 0;
    let golesRival = 0;
    let totalAcciones = efemerides.length;
    let positivas = 0;
    
    let statsJugadores = {};
    
    const titulares = par.titulares || [];
    titulares.forEach(id => {
        statsJugadores[id] = { mins: 0, goles: 0, asis: 0, tPuerta: 0, tFuera: 0, pos: 0, neg: 0, scoreValor: 0, entrada: 0, salida: null };
    });
    
    const minFinal = par.cronometro && par.cronometro.tiempoAcumulado ? Math.floor(par.cronometro.tiempoAcumulado / 60000) : 90;
    let distribucion = {};
    let temporalData = {};
    let colorByAcc = {};
    let iconByAcc = {};
    
    // Helper to draw FA icon on canvas
    const getIconCanvas = (iconClass, color) => {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 24;
        const ctx = canvas.getContext('2d');
        
        const el = document.createElement('i');
        el.className = `fa-solid ${iconClass}`;
        el.style.display = 'none';
        document.body.appendChild(el);
        let unicode = window.getComputedStyle(el, '::before').getPropertyValue('content');
        document.body.removeChild(el);
        
        if (unicode && unicode !== 'none') {
            unicode = unicode.replace(/['"]/g, '');
            ctx.font = '900 16px "Font Awesome 6 Free"';
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(unicode, 12, 12);
        } else {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(12, 12, 6, 0, Math.PI * 2);
            ctx.fill();
        }
        return canvas;
    };
    
    const twColors = {
      emerald: '#10b981', blue: '#3b82f6', amber: '#f59e0b', rose: '#f43f5e', 
      slate: '#64748b', purple: '#a855f7', indigo: '#6366f1', red: '#ef4444'
    };
    
    efemerides.forEach(ef => {
        const eTipo = ef.tipo || ef.accionId;
        const accInfo = configAcc.find(a => a.id === eTipo);
        const accNombre = ef.nombre || (accInfo ? accInfo.nombre : eTipo);
        let minParse = 0;
        if (ef.tiempoAnotado) {
            minParse = parseInt(ef.tiempoAnotado.split(':')[0], 10) || 0;
        } else if (ef.minutoMs) {
            minParse = Math.floor(ef.minutoMs / 60000);
        } else if (ef.minuto) {
            minParse = ef.minuto;
        }
        
        if (accInfo || accNombre) {
            distribucion[accNombre] = (distribucion[accNombre] || 0) + 1;
            
            if (!temporalData[accNombre]) {
                temporalData[accNombre] = [];
            }
            temporalData[accNombre].push({ x: minParse, y: distribucion[accNombre] });
            
            if (!colorByAcc[accNombre]) {
                let colorHex = '#64748b';
                if (accInfo && accInfo.color) {
                    const match = accInfo.color.match(/(emerald|blue|amber|rose|slate|purple|indigo|red)/);
                    if (match) colorHex = twColors[match[1]];
                }
                colorByAcc[accNombre] = colorHex;
            }
            if (!iconByAcc[accNombre]) {
                iconByAcc[accNombre] = (accInfo && accInfo.icon) ? accInfo.icon : 'fa-circle';
            }
            
            if (accInfo && accInfo.isPositive) positivas++;
        }
        
        if (eTipo && typeof eTipo === 'string' && eTipo.startsWith('gol-')) {
            if (eTipo === 'gol-rival') {
                golesRival++;
            } else {
                golesMios++;
                if (ef.jugadorId && statsJugadores[ef.jugadorId]) {
                    statsJugadores[ef.jugadorId].goles++;
                }
            }
        }
        if (eTipo === 'asistencia') {
            if (ef.jugadorId && statsJugadores[ef.jugadorId]) statsJugadores[ef.jugadorId].asis++;
        }
        if (eTipo === 'tiro-puerta') {
            if (ef.jugadorId && statsJugadores[ef.jugadorId]) statsJugadores[ef.jugadorId].tPuerta++;
        }
        if (eTipo === 'tiro-fuera') {
            if (ef.jugadorId && statsJugadores[ef.jugadorId]) statsJugadores[ef.jugadorId].tFuera++;
        }
        
        if (eTipo === 'sustitucion' || eTipo === 'sustitucion-lesion') {
            if (ef.jugadorId) {
                if (statsJugadores[ef.jugadorId]) {
                    const st = statsJugadores[ef.jugadorId];
                    if (st.entrada !== null) {
                        st.mins += (minParse - st.entrada);
                        st.entrada = null;
                        st.salida = minParse;
                    }
                }
            }
            if (ef.jugadorEntraId) {
                if (!statsJugadores[ef.jugadorEntraId]) {
                    statsJugadores[ef.jugadorEntraId] = { mins: 0, goles: 0, asis: 0, tPuerta: 0, tFuera: 0, pos: 0, neg: 0, scoreValor: 0, entrada: minParse, salida: null };
                } else {
                    statsJugadores[ef.jugadorEntraId].entrada = minParse;
                    statsJugadores[ef.jugadorEntraId].salida = null;
                }
            }
        }
        
        if (ef.jugadorId && statsJugadores[ef.jugadorId] && accInfo) {
            if (accInfo.score !== undefined) {
                statsJugadores[ef.jugadorId].scoreValor += parseFloat(accInfo.score);
            } else {
                if (accInfo.isPositive) statsJugadores[ef.jugadorId].scoreValor += 1;
                else if (accInfo.isPositive === false) statsJugadores[ef.jugadorId].scoreValor -= 1;
            }
            if (accInfo.isPositive) statsJugadores[ef.jugadorId].pos++;
            else if (accInfo.isPositive === false) statsJugadores[ef.jugadorId].neg++;
        }
    });
    
    Object.keys(statsJugadores).forEach(id => {
        const st = statsJugadores[id];
        if (st.entrada !== null) {
            const endMin = minFinal > st.entrada ? minFinal : st.entrada + 1; // Fallback if minFinal is inaccurate
            st.mins += (endMin - st.entrada);
            st.entrada = null;
        }
        if (st.mins < 0) st.mins = 0;
    });
    
    document.getElementById('stats-global-container').innerHTML = `
        <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-center">
            <h5 class="text-slate-500 text-xs uppercase font-bold mb-1">Resultado Final</h5>
            <div class="text-3xl font-black text-slate-800">${par.resultado || (golesMios + ' - ' + golesRival)}</div>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-center">
            <h5 class="text-slate-500 text-xs uppercase font-bold mb-1">Tot. Acciones</h5>
            <div class="text-3xl font-black text-blue-500">${totalAcciones}</div>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-center">
            <h5 class="text-slate-500 text-xs uppercase font-bold mb-1">% Acciones Pos.</h5>
            <div class="text-3xl font-black text-purple-500">${totalAcciones > 0 ? Math.round((positivas/totalAcciones)*100) : 0}%</div>
        </div>
    `;
    
    const jugListHTML = Object.keys(statsJugadores).map(id => {
        const jug = todosLosJugadores.find(j => j.id === id);
        if (!jug) return '';
        const st = statsJugadores[id];
        const val = Number(st.scoreValor % 1 === 0 ? st.scoreValor : st.scoreValor.toFixed(2));
        let pColor = val > 0 ? 'text-emerald-500' : (val < 0 ? 'text-red-500' : 'text-slate-400');
        return `
            <tr class="hover:bg-slate-50 border-b border-slate-50 last:border-0 md:table-row">
                <td class="px-3 py-2 font-medium">#${jug.dorsal || '-'} ${jug.nombre}</td>
                <td class="px-3 py-2 text-center text-slate-600 font-bold">${st.mins}'</td>
                <td class="px-3 py-2 text-center text-slate-600 font-bold">${st.tPuerta}</td>
                <td class="px-3 py-2 text-center text-slate-600 font-bold">${st.tFuera}</td>
                <td class="px-3 py-2 text-center text-slate-600 font-bold">${st.goles}</td>
                <td class="px-3 py-2 text-center text-slate-600 font-bold">${st.asis}</td>
                <td class="px-3 py-2 text-center font-bold ${pColor}" title="Valoración: ${val}">${val > 0 ? '+'+val : val}</td>
            </tr>
        `;
    }).join('');
    document.getElementById('stats-players-list').innerHTML = jugListHTML || `<tr><td colspan="7" class="p-4 text-center text-slate-500 text-sm">No hay datos de jugadores</td></tr>`;
    
    const tlHTML = efemerides.map(ef => {
         const eTipo = ef.tipo || ef.accionId;
         const acc = configAcc.find(a => a.id === eTipo);
         const icon = ef.icon || (acc ? acc.icon : 'fa-bolt');
         const cl = ef.color || (acc ? acc.color : 'text-slate-500');
         const text = ef.nombre || (acc ? acc.nombre : eTipo);
         
         let minText = ef.tiempoAnotado || (ef.minuto ? ef.minuto + "'" : "?'");
         let subText = ef.jugadorNombre || '';
         if (!subText) {
             const jug = todosLosJugadores.find(j => j.id === ef.jugadorId);
             subText = jug ? jug.nombre : '';
         }
         
         if (ef.jugadorEntraId || ef.jugadorEntraNombre) {
              const nombreEntra = ef.jugadorEntraNombre || todosLosJugadores.find(j => j.id === ef.jugadorEntraId)?.nombre || '';
              subText += ` <i class="fa-solid fa-arrow-right-long text-slate-400 mx-1"></i> ${nombreEntra}`;
         }
         
         return `
             <div class="relative pl-6">
                <div class="absolute -left-[13px] bg-white border-2 border-slate-200 rounded-full w-6 h-6 flex items-center justify-center text-[10px] ${cl} z-10 mt-1"><i class="fa-solid ${icon}"></i></div>
                <div class="bg-white border rounded-lg p-2 text-sm shadow-sm hover:shadow transition-shadow">
                    <span class="font-bold text-slate-700">${minText}</span> - <span class="font-semibold ${cl}">${text}</span>
                    ${subText ? `<div class="text-xs text-slate-500 mt-1"><i class="fa-regular fa-user mr-1"></i> ${subText}</div>` : ''}
                </div>
             </div>
         `;
    }).reverse().join('');
    
    document.getElementById('stats-timeline-container').innerHTML = tlHTML || `<div class="text-slate-500 text-sm text-center mt-4">No hay eventos registrados</div>`;
    
    // Generate share text
    let stText = `📊 ESTADÍSTICAS DEL PARTIDO\n`;
    stText += `Resultado: ${golesMios} - ${golesRival}\n\n`;
    stText += `Jugadores destacados:\n`;
    Object.keys(statsJugadores).forEach(id => {
        const jug = todosLosJugadores.find(j => j.id === id);
        if(!jug) return;
        const st = statsJugadores[id];
        const val = Number(st.scoreValor % 1 === 0 ? st.scoreValor : st.scoreValor.toFixed(2));
        stText += `- ${jug.nombre}: ${st.mins}' | Gol: ${st.goles} | Asi: ${st.asis} | T.Puerta: ${st.tPuerta} | T.Fuera: ${st.tFuera} | Val: ${val > 0 ? '+'+val : val}\n`;
    });
    currentShareText = stText;

    const wrapper = document.getElementById('stats-chart-wrapper');
    const canvas = document.getElementById('stats-chart');
    const temporalWrapper = document.getElementById('stats-temporal-chart-wrapper');
    const temporalCanvas = document.getElementById('stats-temporal-chart');
    
    if (Object.keys(distribucion).length > 0) {
        wrapper.classList.remove('hidden');
        if (temporalWrapper) temporalWrapper.classList.remove('hidden');
        
        if (window.statsChartInstance) window.statsChartInstance.destroy();
        if (window.temporalChartInstance) window.temporalChartInstance.destroy();
        
        const labels = Object.keys(distribucion);
        const data = Object.values(distribucion);
        
        if (!window.Chart) {
            try {
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = "https://cdn.jsdelivr.net/npm/chart.js";
                    s.onload = resolve;
                    s.onerror = reject;
                    document.head.appendChild(s);
                });
            } catch(e) {
                console.error("No se pudo cargar Chart.js");
            }
        }
        
        if (window.Chart) {
            window.statsChartInstance = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Número de acciones',
                        data: data,
                        backgroundColor: 'rgba(56, 189, 248, 0.6)',
                        borderColor: 'rgb(14, 165, 233)',
                        borderWidth: 1,
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
                }
            });
            
            if (temporalCanvas) {
                 const tDatasets = Object.keys(temporalData).map(accKey => {
                     const color = colorByAcc[accKey];
                     return {
                         label: accKey,
                         data: temporalData[accKey],
                         pointStyle: getIconCanvas(iconByAcc[accKey], color),
                         pointRadius: 8,
                         pointHoverRadius: 10,
                         pointBorderWidth: 0,
                         backgroundColor: color,
                         borderColor: color,
                         showLine: false
                     };
                 });
                 window.temporalChartInstance = new Chart(temporalCanvas, {
                     type: 'scatter',
                     data: { datasets: tDatasets },
                     options: {
                         responsive: true,
                         maintainAspectRatio: false,
                         plugins: { 
                             legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 10 } } }
                         },
                         scales: {
                             x: { type: 'linear', min: 0, max: minFinal > 0 ? minFinal : 90, title: { display: true, text: 'Minutos', font: {size: 11} } },
                             y: { beginAtZero: true, ticks: { stepSize: 1 }, title: { display: true, text: 'Acumulado', font: {size: 11} } }
                         }
                     }
                 });
            }
        }
    } else {
        wrapper.classList.add('hidden');
        if (temporalWrapper) temporalWrapper.classList.add('hidden');
    }
}

async function actualizarDashboardUltimoPartido(partidos, ahora) {
    const card = document.getElementById('dash-chart-card');
    if (!card) return;
    
    // Buscar ultimo partido finalizado
    const hoyStr = ahora.toISOString().split('T')[0];
    const finalizados = partidos.filter(p => p.cronometro?.periodo === 'Finalizado' || (new Date(`${p.fecha}T${p.hora}`) < ahora && p.fecha !== hoyStr));
    if (finalizados.length === 0) {
        card.classList.add('hidden');
        return;
    }
    
    // Sort by date descending
    finalizados.sort((a,b) => new Date(`${b.fecha}T${b.hora}`) - new Date(`${a.fecha}T${a.hora}`));
    const ultimo = finalizados[0];
    
    document.getElementById('dash-chart-title').innerText = `Último Partido: ${ultimo.esLocal === false ? ultimo.rival + ' - Mi Eq.' : 'Mi Eq. - ' + ultimo.rival}`;
    
    try {
        const snap = await getDocs(collection(db, 'partidos', ultimo.id, 'efemerides'));
        let configAcc = ultimo.configAcciones || DEFAULT_ACCIONES;
        let distribucion = {};
        
        snap.forEach(d => {
            const data = d.data();
            const eTipo = data.tipo || data.accionId;
            const accInfo = configAcc.find(a => a.id === eTipo);
            const accNombre = data.nombre || (accInfo ? accInfo.nombre : eTipo);
            if (accInfo || accNombre) {
                distribucion[accNombre] = (distribucion[accNombre] || 0) + 1;
            }
        });
        
        if (Object.keys(distribucion).length > 0) {
            card.classList.remove('hidden');
            
            const canvas = document.getElementById('rendimientoChart');
            if (window.dashChartInstance) window.dashChartInstance.destroy();
            
            if (!window.Chart) {
                try {
                    await new Promise((resolve, reject) => {
                        const s = document.createElement('script');
                        s.src = "https://cdn.jsdelivr.net/npm/chart.js";
                        s.onload = resolve;
                        s.onerror = reject;
                        document.head.appendChild(s);
                    });
                } catch(e) {}
            }
            
            if (window.Chart) {
                window.dashChartInstance = new Chart(canvas, {
                    type: 'bar',
                    data: {
                        labels: Object.keys(distribucion),
                        datasets: [{
                            label: 'Acciones',
                            data: Object.values(distribucion),
                            backgroundColor: 'rgba(16, 185, 129, 0.6)',
                            borderColor: 'rgb(5, 150, 105)',
                            borderWidth: 1,
                            borderRadius: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
                    }
                });
            }
        } else {
            card.classList.add('hidden');
        }
    } catch (e) {
        console.error("No se pudieron cargar estadisticas del dashboard:", e);
        card.classList.add('hidden');
    }
}
