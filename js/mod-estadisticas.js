import { db, collection, getDocs, auth } from './firebase-config.js';
import { compararEfemeridesAsc } from './ui.js';
import { todosLosJugadores, equipoIdActivo } from './mod-jugadores.js';
import { todosLosEquipos } from './mod-equipos.js';
import { todosLosPartidos } from './mod-partidos.js';
import { todasLasSesiones } from './mod-sesiones.js';
import { DEFAULT_ACCIONES } from './mod-directo.js';

let estadisticasEventsBound = false;
let scopeModo = 'jugados'; // 'jugados' | 'todos'
let searchDesconvocados = '';
let filtroEstadoDesc = 'todos'; // 'todos' | 'disponibles'
let soloConDesconvocatorias = false;
let expandedDescPlayers = new Set();

let searchPlantilla = '';
let sortPlantillaCol = 'valoracionMedia';
let sortPlantillaDir = 'desc';

let chartGlobalGolesInstance = null;
let refreshDebounceTimer = null;
let lastComputedDataset = null;
let renderVersion = 0;

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function esVistaEstadisticasActiva() {
    const view = document.getElementById('view-estadisticas');
    return Boolean(view && !view.classList.contains('hidden'));
}

function formatFechaCorta(fechaStr) {
    if (!fechaStr || typeof fechaStr !== 'string') return 'Sin fecha';
    const parts = fechaStr.split('-');
    if (parts.length !== 3) return fechaStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function initEstadisticas() {
    if (estadisticasEventsBound) return;
    estadisticasEventsBound = true;

    const btnScopeJugados = document.getElementById('btn-stats-scope-jugados');
    const btnScopeTodos = document.getElementById('btn-stats-scope-todos');
    const btnRefresh = document.getElementById('btn-refresh-estadisticas');

    const updateScopeButtons = () => {
        if (!btnScopeJugados || !btnScopeTodos) return;
        if (scopeModo === 'jugados') {
            btnScopeJugados.className = 'px-3 py-1.5 bg-white shadow-sm text-slate-900 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0';
            btnScopeTodos.className = 'px-3 py-1.5 text-slate-600 hover:text-slate-900 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0';
        } else {
            btnScopeTodos.className = 'px-3 py-1.5 bg-white shadow-sm text-slate-900 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0';
            btnScopeJugados.className = 'px-3 py-1.5 text-slate-600 hover:text-slate-900 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0';
        }
    };

    btnScopeJugados?.addEventListener('click', () => {
        if (scopeModo === 'jugados') return;
        scopeModo = 'jugados';
        updateScopeButtons();
        renderizarEstadisticasGlobales();
    });

    btnScopeTodos?.addEventListener('click', () => {
        if (scopeModo === 'todos') return;
        scopeModo = 'todos';
        updateScopeButtons();
        renderizarEstadisticasGlobales();
    });

    btnRefresh?.addEventListener('click', () => {
        renderizarEstadisticasGlobales(true);
    });

    document.addEventListener('view-changed', (e) => {
        if (e.detail === 'view-estadisticas') {
            renderizarEstadisticasGlobales();
        }
    });

    const scheduleAutoRefresh = () => {
        if (!esVistaEstadisticasActiva()) return;
        if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
        refreshDebounceTimer = setTimeout(() => {
            renderizarEstadisticasGlobales();
        }, 120);
    };

    document.addEventListener('partidosActualizados', scheduleAutoRefresh);
    document.addEventListener('jugadoresActualizados', scheduleAutoRefresh);
    document.addEventListener('sesionesActualizadas', scheduleAutoRefresh);
    document.getElementById('select-equipo')?.addEventListener('change', scheduleAutoRefresh);
}

async function calcularDatosGlobales(equipoId) {
    const ahora = new Date();
    const equipoObj = todosLosEquipos.find(e => e.id === equipoId) || {};
    const jugadoresEquipo = todosLosJugadores
        .filter(j => j.equipoId === equipoId)
        .sort((a, b) => (parseInt(a.dorsal, 10) || 999) - (parseInt(b.dorsal, 10) || 999));

    const partidosEquipo = (todosLosPartidos || [])
        .filter(p => p.equipoId === equipoId)
        .sort((a, b) => new Date(`${a.fecha || '1970-01-01'}T${a.hora || '00:00'}`) - new Date(`${b.fecha || '1970-01-01'}T${b.hora || '00:00'}`));

    const esDisputado = (p) => {
        if (p.cronometro?.periodo === 'Finalizado') return true;
        if (!p.fecha) return false;
        return new Date(`${p.fecha}T${p.hora || '00:00'}`) < ahora;
    };

    const partidosDisputados = partidosEquipo.filter(esDisputado);
    const partidosAlcanceConvocatoria = scopeModo === 'todos' ? partidosEquipo : partidosDisputados;

    // Fetch efemerides de todos los partidos disputados (y si scope es 'todos', solo disputados tienen efemerides relevantes)
    const efemPorPartidoId = new Map();
    if (auth.currentUser && partidosDisputados.length > 0) {
        const snaps = await Promise.all(
            partidosDisputados.map(p => getDocs(collection(db, 'partidos', p.id, 'efemerides')))
        );
        snaps.forEach((snap, idx) => {
            const arr = [];
            snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
            arr.sort(compararEfemeridesAsc);
            efemPorPartidoId.set(partidosDisputados[idx].id, arr);
        });
    }

    const sesionesEquipo = (todasLasSesiones || []).filter(s => s.equipoId === equipoId);
    const totalSesiones = sesionesEquipo.length;

    const esF7 = equipoObj.modalidad === 'Fútbol 7';
    const duracionReglamentaria = esF7 ? 50 : 90;

    // Inicializar mapa global por jugador de la plantilla
    const jugadoresMap = {};
    jugadoresEquipo.forEach(j => {
        const asistSesiones = sesionesEquipo.reduce((acc, ses) => {
            return acc + (Array.isArray(ses.asistencia) && ses.asistencia.includes(j.id) ? 1 : 0);
        }, 0);
        jugadoresMap[j.id] = {
            id: j.id,
            nombre: j.nombre || 'Jugador',
            dorsal: j.dorsal ?? '',
            posicion: j.posicion || 'Sin pos.',
            estado: j.estado || 'Disponible',
            foto: j.foto || '',
            convocatorias: 0,
            desconvocatorias: 0,
            partidosEvaluadosConv: 0,
            partidosDesconvocados: [],
            jugados: 0,
            titularidades: 0,
            suplencias: 0,
            minutos: 0,
            goles: 0,
            asistencias: 0,
            tirosPuerta: 0,
            tirosFuera: 0,
            paradas: 0,
            faltasRecibidas: 0,
            faltasCometidas: 0,
            amarillas: 0,
            rojas: 0,
            valoracionTotal: 0,
            valoracionMedia: null,
            asistSesiones,
            totalSesiones,
            asistSesionesPct: totalSesiones > 0 ? Math.round((asistSesiones / totalSesiones) * 100) : null
        };
    });

    // Métricas colectivas del equipo (sobre partidos disputados)
    const resumen = {
        totalPartidosEquipo: partidosEquipo.length,
        disputados: partidosDisputados.length,
        victorias: 0,
        empates: 0,
        derrotas: 0,
        puntos: 0,
        golesFavor: 0,
        golesContra: 0,
        casa: { pj: 0, v: 0, e: 0, d: 0, gf: 0, gc: 0 },
        fuera: { pj: 0, v: 0, e: 0, d: 0, gf: 0, gc: 0 },
        tirosPuerta: 0,
        tirosFuera: 0,
        tirosRival: 0,
        paradas: 0,
        cornersFavor: 0,
        cornersContra: 0,
        faltasCometidas: 0,
        faltasRecibidas: 0,
        amarillas: 0,
        rojas: 0,
        amarillasRival: 0,
        rojasRival: 0,
        recuperaciones: 0,
        perdidas: 0,
        pasesCorrectos: 0,
        pasesFallados: 0,
        totalSesiones,
        asistenciaMediaSesionesPct: null,
        mediaConvocadosPorPartido: 0,
        partidosConConvocatoria: 0
    };

    if (totalSesiones > 0 && jugadoresEquipo.length > 0) {
        const sumaAsistencias = sesionesEquipo.reduce((acc, s) => acc + (Array.isArray(s.asistencia) ? s.asistencia.length : 0), 0);
        resumen.asistenciaMediaSesionesPct = Math.round((sumaAsistencias / (totalSesiones * jugadoresEquipo.length)) * 100);
    }

    const seriePartidos = [];

    // 1. Procesar partidos disputados (marcador, acciones individuales y colectivas)
    partidosDisputados.forEach(par => {
        const efemerides = efemPorPartidoId.get(par.id) || [];
        const configAcc = par.configAcciones || DEFAULT_ACCIONES;
        const titulares = (par.titulares || []).filter(Boolean);

        const minCrono = par.cronometro?.tiempoAcumulado ? Math.floor(par.cronometro.tiempoAcumulado / 60000) : 0;
        const minFinal = minCrono > 0 ? minCrono : duracionReglamentaria;

        // Control de participación y minutos por jugador en este partido
        const estadoJugPartido = {};
        titulares.forEach(jId => {
            estadoJugPartido[jId] = {
                jugo: true,
                esTitular: true,
                entrada: 0,
                minutos: 0,
                score: 0
            };
        });

        let golesMiosEf = 0;
        let golesRivalEf = 0;

        efemerides.forEach(ef => {
            const eTipo = (ef.tipo || ef.accionId || '').toLowerCase();
            const accInfo = configAcc.find(a => (a.id || '').toLowerCase() === eTipo);
            const accNombre = (ef.nombre || accInfo?.nombre || eTipo || '').toLowerCase();

            const esRival = Boolean(ef.rival || ef.ambito === 'rival' || eTipo.includes('rival') || accNombre.includes('rival'));
            const esGol = (eTipo.startsWith('gol-') || eTipo === 'gol' || accNombre.startsWith('gol')) && !accNombre.includes('parada');

            let minEv = 0;
            if (ef.tiempoAnotado && String(ef.tiempoAnotado).includes(':')) {
                minEv = parseInt(String(ef.tiempoAnotado).split(':')[0], 10) || 0;
            } else if (ef.minutoMs !== undefined) {
                minEv = Math.floor(ef.minutoMs / 60000);
            } else if (ef.minuto !== undefined) {
                minEv = parseInt(ef.minuto, 10) || 0;
            }

            if (esGol) {
                if (esRival) golesRivalEf++;
                else golesMiosEf++;
            }

            // Métricas colectivas
            if (eTipo === 'tiro-puerta' || accNombre.includes('tiro a puerta')) resumen.tirosPuerta++;
            else if (eTipo === 'tiro-fuera' || accNombre.includes('tiro fuera')) resumen.tirosFuera++;
            else if (eTipo === 'tiro-rival' || accNombre.includes('tiro rival')) resumen.tirosRival++;
            else if (eTipo.startsWith('parada') || accNombre.includes('parada')) resumen.paradas++;
            else if (eTipo === 'corner-favor' || eTipo === 'corner') resumen.cornersFavor++;
            else if (eTipo === 'corner-contra' || eTipo === 'corner-rival') resumen.cornersContra++;
            else if (eTipo === 'falta-cometida' || accNombre.includes('falta cometida')) resumen.faltasCometidas++;
            else if (eTipo === 'falta-recibida' || accNombre.includes('falta recibida')) resumen.faltasRecibidas++;
            else if (eTipo === 'recuperacion' || accNombre.includes('recuperaci')) resumen.recuperaciones++;
            else if (eTipo === 'perdida' || accNombre.includes('pérdida') || accNombre.includes('perdida')) resumen.perdidas++;
            else if (eTipo === 'pase-correcto' || accNombre.includes('pase correcto')) resumen.pasesCorrectos++;
            else if (eTipo === 'pase-fallado' || accNombre.includes('pase fallado')) resumen.pasesFallados++;
            else if (eTipo === 'amarilla' || eTipo === 'tarjeta-amarilla' || accNombre.includes('amarilla')) {
                if (esRival) resumen.amarillasRival++;
                else resumen.amarillas++;
            } else if (eTipo === 'roja' || eTipo === 'tarjeta-roja' || accNombre.includes('roja')) {
                if (esRival) resumen.rojasRival++;
                else resumen.rojas++;
            }

            // Sustituciones
            if (eTipo === 'sustitucion' || eTipo === 'sustitucion-lesion' || eTipo === 'cambio') {
                const saleId = ef.jugadorId || ef.jugadorSaleId;
                const entraId = ef.jugadorEntraId;
                if (saleId && estadoJugPartido[saleId] && estadoJugPartido[saleId].entrada !== null) {
                    estadoJugPartido[saleId].minutos += Math.max(0, minEv - estadoJugPartido[saleId].entrada);
                    estadoJugPartido[saleId].entrada = null;
                }
                if (entraId) {
                    if (!estadoJugPartido[entraId]) {
                        estadoJugPartido[entraId] = { jugo: true, esTitular: false, entrada: minEv, minutos: 0, score: 0 };
                    } else {
                        estadoJugPartido[entraId].jugo = true;
                        if (estadoJugPartido[entraId].entrada === null) estadoJugPartido[entraId].entrada = minEv;
                    }
                }
            }

            // Estadística individual del jugador
            const jId = ef.jugadorId;
            if (jId && jugadoresMap[jId]) {
                const jm = jugadoresMap[jId];
                if (!estadoJugPartido[jId]) {
                    estadoJugPartido[jId] = { jugo: true, esTitular: titulares.includes(jId), entrada: null, minutos: 0, score: 0 };
                } else {
                    estadoJugPartido[jId].jugo = true;
                }

                if (esGol && !esRival) jm.goles++;
                if (eTipo === 'asistencia' || accNombre.includes('asistencia')) jm.asistencias++;
                if (eTipo === 'tiro-puerta' || accNombre.includes('tiro a puerta')) jm.tirosPuerta++;
                if (eTipo === 'tiro-fuera' || accNombre.includes('tiro fuera')) jm.tirosFuera++;
                if (eTipo.startsWith('parada') || accNombre.includes('parada')) jm.paradas++;
                if (eTipo === 'falta-recibida' || accNombre.includes('falta recibida')) jm.faltasRecibidas++;
                if (eTipo === 'falta-cometida' || accNombre.includes('falta cometida')) jm.faltasCometidas++;
                if ((eTipo === 'amarilla' || eTipo === 'tarjeta-amarilla' || accNombre.includes('amarilla')) && !esRival) jm.amarillas++;
                if ((eTipo === 'roja' || eTipo === 'tarjeta-roja' || accNombre.includes('roja')) && !esRival) {
                    jm.rojas++;
                    if (estadoJugPartido[jId].entrada !== null) {
                        estadoJugPartido[jId].minutos += Math.max(0, minEv - estadoJugPartido[jId].entrada);
                        estadoJugPartido[jId].entrada = null;
                    }
                }

                if (accInfo) {
                    if (accInfo.score !== undefined) {
                        estadoJugPartido[jId].score += parseFloat(accInfo.score) || 0;
                    } else if (accInfo.isPositive === true) {
                        estadoJugPartido[jId].score += 1;
                    } else if (accInfo.isPositive === false) {
                        estadoJugPartido[jId].score -= 1;
                    }
                }
            }
        });

        // Consolidar minutos y partidos jugados
        Object.entries(estadoJugPartido).forEach(([jId, st]) => {
            const jm = jugadoresMap[jId];
            if (!jm || !st.jugo) return;
            if (st.entrada !== null) {
                const cierre = minFinal > st.entrada ? minFinal : st.entrada + 1;
                st.minutos += Math.max(0, cierre - st.entrada);
            }
            jm.jugados++;
            if (st.esTitular) jm.titularidades++;
            else jm.suplencias++;
            jm.minutos += st.minutos;
            jm.valoracionTotal += st.score;
        });

        // Resolver marcador final del partido (efemérides o fallback al campo resultado si no hay efemérides)
        let gf = golesMiosEf;
        let gc = golesRivalEf;
        if (efemerides.length === 0 && typeof par.resultado === 'string') {
            const matchRes = par.resultado.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
            if (matchRes) {
                const n1 = parseInt(matchRes[1], 10);
                const n2 = parseInt(matchRes[2], 10);
                if (par.esLocal === false) {
                    gc = n1;
                    gf = n2;
                } else {
                    gf = n1;
                    gc = n2;
                }
            }
        }

        const esLocal = par.esLocal !== false;
        const bloque = esLocal ? resumen.casa : resumen.fuera;
        resumen.golesFavor += gf;
        resumen.golesContra += gc;
        bloque.pj++;
        bloque.gf += gf;
        bloque.gc += gc;

        let resultadoLetra = 'E';
        if (gf > gc) {
            resumen.victorias++;
            resumen.puntos += 3;
            bloque.v++;
            resultadoLetra = 'V';
        } else if (gf < gc) {
            resumen.derrotas++;
            bloque.d++;
            resultadoLetra = 'D';
        } else {
            resumen.empates++;
            resumen.puntos += 1;
            bloque.e++;
        }

        seriePartidos.push({
            id: par.id,
            fecha: par.fecha || '',
            rival: par.rival || 'Rival',
            esLocal,
            gf,
            gc,
            resultadoLetra
        });
    });

    // 2. Calcular Convocatorias y Desconvocados sobre el alcance seleccionado
    let sumaConvocados = 0;
    partidosAlcanceConvocatoria.forEach(par => {
        const efemerides = efemPorPartidoId.get(par.id) || [];
        const convocadosSet = new Set([
            ...(par.convocados || []).filter(Boolean),
            ...(par.titulares || []).filter(Boolean)
        ]);
        efemerides.forEach(ef => {
            if (ef.jugadorId) convocadosSet.add(ef.jugadorId);
            if (ef.jugadorEntraId) convocadosSet.add(ef.jugadorEntraId);
        });

        // Solo contabilizar partidos que tengan convocatoria registrada (para no falsear partidos sin convocatoria creada)
        if (convocadosSet.size === 0) return;

        resumen.partidosConConvocatoria++;
        let convActivosEnPartido = 0;

        jugadoresEquipo.forEach(jug => {
            const jm = jugadoresMap[jug.id];
            jm.partidosEvaluadosConv++;
            if (convocadosSet.has(jug.id)) {
                jm.convocatorias++;
                convActivosEnPartido++;
            } else {
                jm.desconvocatorias++;
                jm.partidosDesconvocados.push({
                    partidoId: par.id,
                    fecha: par.fecha || '',
                    rival: par.rival || 'Rival',
                    esLocal: par.esLocal !== false
                });
            }
        });
        sumaConvocados += convActivosEnPartido;
    });

    if (resumen.partidosConConvocatoria > 0) {
        resumen.mediaConvocadosPorPartido = Number((sumaConvocados / resumen.partidosConConvocatoria).toFixed(1));
    }

    // Calcular medias finales por jugador
    const jugadoresLista = Object.values(jugadoresMap).map(jm => {
        const valMedia = jm.jugados > 0 ? Number((jm.valoracionTotal / jm.jugados).toFixed(1)) : null;
        const pctDesc = jm.partidosEvaluadosConv > 0 ? Math.round((jm.desconvocatorias / jm.partidosEvaluadosConv) * 100) : 0;
        const desconvOrdenadosRecientes = [...jm.partidosDesconvocados].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
        return {
            ...jm,
            valoracionMedia: valMedia,
            pctDesconvocado: pctDesc,
            partidosDesconvocados: desconvOrdenadosRecientes,
            golesAsistencias: jm.goles + jm.asistencias,
            tirosTotales: jm.tirosPuerta + jm.tirosFuera
        };
    });

    return {
        equipoObj,
        resumen,
        jugadoresLista,
        seriePartidos
    };
}

export async function renderizarEstadisticasGlobales(forceLoading = false) {
    const msgNoEquipo = document.getElementById('msg-no-equipo-estadisticas');
    const contentEl = document.getElementById('estadisticas-globales-content');
    const metaEl = document.getElementById('stats-glob-meta');
    if (!contentEl) return;

    if (!equipoIdActivo) {
        if (msgNoEquipo) msgNoEquipo.classList.remove('hidden');
        contentEl.classList.add('hidden');
        contentEl.innerHTML = '';
        if (metaEl) metaEl.innerText = 'Selecciona un equipo para analizar su rendimiento acumulado.';
        if (chartGlobalGolesInstance) {
            chartGlobalGolesInstance.destroy();
            chartGlobalGolesInstance = null;
        }
        return;
    }

    if (msgNoEquipo) msgNoEquipo.classList.add('hidden');
    contentEl.classList.remove('hidden');

    const myVersion = ++renderVersion;

    if (forceLoading || !lastComputedDataset || lastComputedDataset.equipoObj?.id !== equipoIdActivo) {
        contentEl.innerHTML = `
            <div class="bg-white rounded-xl border border-slate-200 py-14 flex flex-col items-center justify-center text-slate-400">
                <i class="fa-solid fa-circle-notch fa-spin text-2xl text-emerald-600 mb-3"></i>
                <p class="text-sm font-medium text-slate-600">Analizando partidos, convocatorias y registros...</p>
            </div>
        `;
    }

    try {
        const data = await calcularDatosGlobales(equipoIdActivo);
        if (myVersion !== renderVersion) return;

        lastComputedDataset = data;
        const eq = data.equipoObj;
        const r = data.resumen;
        if (metaEl) {
            const parts = [
                eq.nombre || 'Equipo activo',
                eq.modalidad || '',
                eq.temporada || '',
                `${r.disputados} partido${r.disputados === 1 ? '' : 's'} disputado${r.disputados === 1 ? '' : 's'}`,
                `${data.jugadoresLista.length} jugador${data.jugadoresLista.length === 1 ? '' : 'es'}`
            ].filter(Boolean);
            metaEl.innerText = parts.join(' · ');
        }

        renderContenidoCompleto(data);
    } catch (err) {
        console.error('Error cargando estadísticas globales:', err);
        contentEl.innerHTML = `
            <div class="bg-white rounded-xl border border-rose-200 p-8 text-center">
                <i class="fa-solid fa-triangle-exclamation text-2xl text-rose-500 mb-2"></i>
                <p class="text-sm font-bold text-slate-800">No se pudieron calcular las estadísticas globales</p>
                <p class="text-xs text-slate-500 mt-1">Comprueba tu conexión y vuelve a intentarlo.</p>
            </div>
        `;
    }
}

function renderContenidoCompleto(data) {
    const contentEl = document.getElementById('estadisticas-globales-content');
    if (!contentEl) return;

    const { resumen: r, jugadoresLista, seriePartidos } = data;
    const pj = Math.max(1, r.disputados);
    const efectividadPct = r.disputados > 0 ? Math.round((r.puntos / (r.disputados * 3)) * 100) : 0;
    const difGoles = r.golesFavor - r.golesContra;
    const difGolesStr = difGoles > 0 ? `+${difGoles}` : `${difGoles}`;
    const tirosTotales = r.tirosPuerta + r.tirosFuera;
    const punteriaPct = tirosTotales > 0 ? Math.round((r.tirosPuerta / tirosTotales) * 100) : 0;
    const totalPases = r.pasesCorrectos + r.pasesFallados;
    const precisionPasePct = totalPases > 0 ? Math.round((r.pasesCorrectos / totalPases) * 100) : null;

    if (r.disputados === 0 && r.partidosConConvocatoria === 0 && jugadoresLista.length === 0) {
        contentEl.innerHTML = `
            <div class="bg-white rounded-xl border border-slate-200 py-14 px-6 text-center text-slate-400">
                <i class="fa-solid fa-chart-simple text-4xl text-slate-200 mb-3"></i>
                <p class="text-base font-bold text-slate-700">Todavía no hay datos suficientes para este equipo</p>
                <p class="text-xs text-slate-500 mt-1 max-w-md mx-auto">Añade jugadores a tu plantilla y registra partidos o convocatorias para ver los acumulados de la temporada.</p>
            </div>
        `;
        return;
    }

    contentEl.innerHTML = `
        <!-- 1. KPIs GLOBALES DE LA TEMPORADA -->
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div class="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between">
                <div class="flex items-center justify-between text-xs font-semibold text-slate-500">
                    <span>Balance de Partidos</span>
                    <i class="fa-solid fa-trophy text-amber-500"></i>
                </div>
                <div class="mt-3 flex items-baseline gap-2 tabular-nums">
                    <span class="text-2xl font-black text-slate-900">${r.victorias}V · ${r.empates}E · ${r.derrotas}D</span>
                </div>
                <div class="mt-2 text-xs text-slate-500 tabular-nums">
                    ${r.disputados} disputados · <span class="font-semibold text-slate-700">${r.puntos} pts</span> (${efectividadPct}% efect.)
                </div>
            </div>

            <div class="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between">
                <div class="flex items-center justify-between text-xs font-semibold text-slate-500">
                    <span>Balance Goleador</span>
                    <i class="fa-solid fa-futbol text-emerald-600"></i>
                </div>
                <div class="mt-3 flex items-baseline gap-2 tabular-nums">
                    <span class="text-2xl font-black text-emerald-700">${r.golesFavor}</span>
                    <span class="text-sm font-semibold text-slate-400">GF /</span>
                    <span class="text-2xl font-black text-rose-600">${r.golesContra}</span>
                    <span class="text-sm font-semibold text-slate-400">GC</span>
                    <span class="ml-auto text-xs font-bold ${difGoles >= 0 ? 'text-emerald-700' : 'text-rose-600'}">(${difGolesStr})</span>
                </div>
                <div class="mt-2 text-xs text-slate-500 tabular-nums">
                    Media: <span class="font-semibold text-slate-700">${(r.golesFavor / pj).toFixed(2)}</span> a favor · <span class="font-semibold text-slate-700">${(r.golesContra / pj).toFixed(2)}</span> en contra
                </div>
            </div>

            <div class="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between">
                <div class="flex items-center justify-between text-xs font-semibold text-slate-500">
                    <span>Ataque y Balón Parado</span>
                    <i class="fa-solid fa-bullseye text-blue-600"></i>
                </div>
                <div class="mt-3 flex items-baseline gap-2 tabular-nums">
                    <span class="text-2xl font-black text-slate-900">${tirosTotales}</span>
                    <span class="text-xs font-semibold text-slate-500">tiros (${r.tirosPuerta} a puerta · ${punteriaPct}%)</span>
                </div>
                <div class="mt-2 text-xs text-slate-500 tabular-nums">
                    Córners: <span class="font-semibold text-emerald-700">${r.cornersFavor} favor</span> / <span class="font-semibold text-slate-700">${r.cornersContra} contra</span>${precisionPasePct !== null ? ` · Pase ${precisionPasePct}%` : ''}
                </div>
            </div>

            <div class="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between">
                <div class="flex items-center justify-between text-xs font-semibold text-slate-500">
                    <span>Disciplina y Entrenos</span>
                    <i class="fa-solid fa-clipboard-check text-purple-600"></i>
                </div>
                <div class="mt-3 flex items-baseline gap-2 tabular-nums">
                    <span class="text-2xl font-black text-slate-900">${r.asistenciaMediaSesionesPct !== null ? `${r.asistenciaMediaSesionesPct}%` : '—'}</span>
                    <span class="text-xs font-semibold text-slate-500">asistencia (${r.totalSesiones} sesiones)</span>
                </div>
                <div class="mt-2 text-xs text-slate-500 tabular-nums">
                    Tarjetas: <span class="font-semibold text-amber-700">${r.amarillas}A</span> / <span class="font-semibold text-rose-600">${r.rojas}R</span> · Media conv.: <span class="font-semibold text-slate-700">${r.mediaConvocadosPorPartido || '—'}</span>
                </div>
            </div>
        </div>

        <!-- 2. LISTA COMPLETA DE DESCONVOCADOS (ORDENADA DE MAYOR A MENOR) -->
        <section class="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div class="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <h4 class="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
                        <i class="fa-solid fa-user-xmark text-rose-600"></i> Lista Completa de Desconvocados
                    </h4>
                    <p class="text-xs text-slate-500 mt-0.5 tabular-nums">
                        Ordenada de mayor a menor nº de desconvocatorias · Evaluados <span class="font-semibold text-slate-700">${r.partidosConConvocatoria}</span> partido${r.partidosConConvocatoria === 1 ? '' : 's'} con convocatoria registrada
                    </p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                    <div class="relative flex-1 sm:flex-none">
                        <i class="fa-solid fa-magnifying-glass text-slate-400 text-xs absolute left-3 top-1/2 -translate-y-1/2"></i>
                        <input type="text" id="input-search-desconvocados" value="${escapeHtml(searchDesconvocados)}" placeholder="Buscar jugador..." class="w-full sm:w-48 pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500">
                    </div>
                    <div class="flex bg-slate-100 p-0.5 rounded-lg text-xs">
                        <button type="button" id="btn-desc-filtro-todos" class="px-2.5 py-1 rounded-md font-medium transition-colors ${filtroEstadoDesc === 'todos' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}">Todos</button>
                        <button type="button" id="btn-desc-filtro-disp" class="px-2.5 py-1 rounded-md font-medium transition-colors ${filtroEstadoDesc === 'disponibles' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}">Solo Disponibles</button>
                    </div>
                    <label class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer select-none px-2 py-1">
                        <input type="checkbox" id="chk-solo-con-desconvocatorias" ${soloConDesconvocatorias ? 'checked' : ''} class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500">
                        <span>Ocultar con 0</span>
                    </label>
                </div>
            </div>
            <div id="tabla-desconvocados-wrapper" class="overflow-x-auto">
                <!-- Renderizado dinámico de la tabla de desconvocados -->
            </div>
        </section>

        <!-- 3. TENDENCIA POR PARTIDO Y BALANCE CASA / FUERA + RATIOS COLECTIVOS -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 flex flex-col">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-100">
                    <div>
                        <h4 class="text-base font-bold text-slate-800 flex items-center gap-2">
                            <i class="fa-solid fa-chart-column text-emerald-600"></i> Evolución de Goles por Partido
                        </h4>
                        <p class="text-xs text-slate-500 mt-0.5">Comparativa cronológica de goles a favor y goles en contra</p>
                    </div>
                    <span class="text-xs font-medium text-slate-500 tabular-nums">${seriePartidos.length} partido${seriePartidos.length === 1 ? '' : 's'}</span>
                </div>
                <div class="relative flex-1 min-h-[260px]">
                    ${seriePartidos.length > 0
                        ? '<canvas id="chart-global-goles-partidos"></canvas>'
                        : '<div class="h-full flex flex-col items-center justify-center text-slate-400 py-10"><i class="fa-regular fa-calendar text-2xl mb-2 opacity-60"></i><span class="text-xs">Sin partidos disputados para graficar</span></div>'
                    }
                </div>
            </div>

            <div class="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between space-y-5">
                <div>
                    <h4 class="text-base font-bold text-slate-800 flex items-center gap-2 pb-3 mb-3 border-b border-slate-100">
                        <i class="fa-solid fa-house-flag text-blue-600"></i> Local vs Visitante
                    </h4>
                    <div class="overflow-x-auto">
                        <table class="w-full text-xs text-slate-600 tabular-nums">
                            <thead>
                                <tr class="border-b border-slate-100 text-slate-400 uppercase text-[10px]">
                                    <th class="py-1.5 text-left font-semibold">Condición</th>
                                    <th class="py-1.5 text-center font-semibold">PJ</th>
                                    <th class="py-1.5 text-center font-semibold">V-E-D</th>
                                    <th class="py-1.5 text-right font-semibold">GF-GC</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                <tr>
                                    <td class="py-2.5 font-semibold text-slate-800"><i class="fa-solid fa-house text-emerald-600 mr-1.5 text-[11px]"></i>Local</td>
                                    <td class="py-2.5 text-center font-bold">${r.casa.pj}</td>
                                    <td class="py-2.5 text-center">${r.casa.v}-${r.casa.e}-${r.casa.d}</td>
                                    <td class="py-2.5 text-right font-semibold">${r.casa.gf}-${r.casa.gc}</td>
                                </tr>
                                <tr>
                                    <td class="py-2.5 font-semibold text-slate-800"><i class="fa-solid fa-plane-departure text-blue-500 mr-1.5 text-[11px]"></i>Visitante</td>
                                    <td class="py-2.5 text-center font-bold">${r.fuera.pj}</td>
                                    <td class="py-2.5 text-center">${r.fuera.v}-${r.fuera.e}-${r.fuera.d}</td>
                                    <td class="py-2.5 text-right font-semibold">${r.fuera.gf}-${r.fuera.gc}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div>
                    <h5 class="text-xs font-bold text-slate-700 uppercase tracking-wider pb-2 mb-2 border-b border-slate-100">Métricas Colectivas</h5>
                    <dl class="space-y-2 text-xs tabular-nums">
                        <div class="flex justify-between items-center">
                            <dt class="text-slate-500">Tiros rival / Paradas</dt>
                            <dd class="font-bold text-slate-800">${r.tirosRival + r.paradas} tiros · ${r.paradas} paradas</dd>
                        </div>
                        <div class="flex justify-between items-center">
                            <dt class="text-slate-500">Faltas (Recibidas / Cometidas)</dt>
                            <dd class="font-bold text-slate-800">${r.faltasRecibidas} / ${r.faltasCometidas}</dd>
                        </div>
                        <div class="flex justify-between items-center">
                            <dt class="text-slate-500">Recuperaciones / Pérdidas</dt>
                            <dd class="font-bold text-slate-800">${r.recuperaciones} / ${r.perdidas}</dd>
                        </div>
                        <div class="flex justify-between items-center">
                            <dt class="text-slate-500">Pases (Correctos / Fallados)</dt>
                            <dd class="font-bold text-slate-800">${r.pasesCorrectos} / ${r.pasesFallados}</dd>
                        </div>
                        <div class="flex justify-between items-center">
                            <dt class="text-slate-500">Tarjetas Rival (A / R)</dt>
                            <dd class="font-bold text-slate-800">${r.amarillasRival} / ${r.rojasRival}</dd>
                        </div>
                    </dl>
                </div>
            </div>
        </div>

        <!-- 4. RENDIMIENTO COMPLETO DE LA PLANTILLA (ORDENABLE) -->
        <section class="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div class="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h4 class="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
                        <i class="fa-solid fa-table-list text-blue-600"></i> Rendimiento Global de la Plantilla
                    </h4>
                    <p class="text-xs text-slate-500 mt-0.5">Pulsa cualquier cabecera de columna para ordenar · Incluye participación, goles, disciplina, entrenos y valoración</p>
                </div>
                <div class="relative w-full sm:w-56">
                    <i class="fa-solid fa-magnifying-glass text-slate-400 text-xs absolute left-3 top-1/2 -translate-y-1/2"></i>
                    <input type="text" id="input-search-stats-plantilla" value="${escapeHtml(searchPlantilla)}" placeholder="Filtrar jugador o posición..." class="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                </div>
            </div>
            <div id="tabla-plantilla-global-wrapper" class="overflow-x-auto">
                <!-- Renderizado dinámico de tabla de plantilla -->
            </div>
        </section>
    `;

    // Bind controles internos
    document.getElementById('input-search-desconvocados')?.addEventListener('input', (e) => {
        searchDesconvocados = e.target.value;
        renderTablaDesconvocados(data);
    });
    document.getElementById('btn-desc-filtro-todos')?.addEventListener('click', () => {
        filtroEstadoDesc = 'todos';
        renderContenidoCompleto(data);
    });
    document.getElementById('btn-desc-filtro-disp')?.addEventListener('click', () => {
        filtroEstadoDesc = 'disponibles';
        renderContenidoCompleto(data);
    });
    document.getElementById('chk-solo-con-desconvocatorias')?.addEventListener('change', (e) => {
        soloConDesconvocatorias = e.target.checked;
        renderTablaDesconvocados(data);
    });
    document.getElementById('input-search-stats-plantilla')?.addEventListener('input', (e) => {
        searchPlantilla = e.target.value;
        renderTablaPlantillaGlobal(data);
    });

    renderTablaDesconvocados(data);
    renderTablaPlantillaGlobal(data);
    renderChartGlobalGoles(seriePartidos);
}

function renderTablaDesconvocados(data) {
    const wrapper = document.getElementById('tabla-desconvocados-wrapper');
    if (!wrapper) return;

    const { jugadoresLista, resumen } = data;
    const term = searchDesconvocados.trim().toLowerCase();

    // Orden estricto: mayor a menor número de desconvocatorias, desempate por dorsal ascendente y nombre
    let lista = [...jugadoresLista].sort((a, b) => {
        if (b.desconvocatorias !== a.desconvocatorias) return b.desconvocatorias - a.desconvocatorias;
        const da = parseInt(a.dorsal, 10) || 999;
        const db = parseInt(b.dorsal, 10) || 999;
        if (da !== db) return da - db;
        return (a.nombre || '').localeCompare(b.nombre || '');
    });

    if (filtroEstadoDesc === 'disponibles') {
        lista = lista.filter(j => j.estado === 'Disponible');
    }
    if (soloConDesconvocatorias) {
        lista = lista.filter(j => j.desconvocatorias > 0);
    }
    if (term) {
        lista = lista.filter(j =>
            (j.nombre || '').toLowerCase().includes(term) ||
            String(j.dorsal || '').includes(term) ||
            (j.posicion || '').toLowerCase().includes(term)
        );
    }

    if (jugadoresLista.length === 0) {
        wrapper.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">No hay jugadores dados de alta en este equipo.</div>`;
        return;
    }

    if (resumen.partidosConConvocatoria === 0) {
        wrapper.innerHTML = `<div class="p-8 text-center text-xs text-slate-500">Aún no hay partidos con convocatoria registrada en el alcance seleccionado.</div>`;
        return;
    }

    if (lista.length === 0) {
        wrapper.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">Ningún jugador coincide con los filtros actuales.</div>`;
        return;
    }

    const maxDesc = Math.max(1, ...jugadoresLista.map(j => j.desconvocatorias));

    wrapper.innerHTML = `
        <table class="w-full text-left text-xs sm:text-sm text-slate-700">
            <thead class="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] uppercase">
                <tr>
                    <th class="px-4 py-3 font-semibold w-12 text-center">#</th>
                    <th class="px-4 py-3 font-semibold">Jugador</th>
                    <th class="px-4 py-3 font-semibold">Estado</th>
                    <th class="px-4 py-3 font-semibold text-right">Desconvocado</th>
                    <th class="px-4 py-3 font-semibold text-right">Convocado</th>
                    <th class="px-4 py-3 font-semibold text-right">% Ausencia</th>
                    <th class="px-4 py-3 font-semibold">Última desconvocatoria</th>
                    <th class="px-4 py-3 font-semibold text-right">Detalle</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 tabular-nums">
                ${lista.map((j, idx) => {
                    const barPct = Math.round((j.desconvocatorias / maxDesc) * 100);
                    const estadoCls = j.estado === 'Lesionado'
                        ? 'text-rose-700'
                        : (j.estado === 'Tocado' ? 'text-amber-700' : 'text-emerald-700');
                    const estadoIcon = j.estado === 'Lesionado'
                        ? 'fa-truck-medical'
                        : (j.estado === 'Tocado' ? 'fa-bandage' : 'fa-circle-check');

                    const ultima = j.partidosDesconvocados[0];
                    const ultimaTxt = ultima
                        ? `${formatFechaCorta(ultima.fecha)} · ${ultima.esLocal ? 'vs' : '@'} ${escapeHtml(ultima.rival)}`
                        : 'Pleno de convocatorias';

                    const isExpanded = expandedDescPlayers.has(j.id);

                    const rowHtml = `
                        <tr class="hover:bg-slate-50/80 transition-colors">
                            <td class="px-4 py-3 text-center font-bold text-slate-400">${idx + 1}</td>
                            <td class="px-4 py-3">
                                <div class="flex items-center gap-2.5 min-w-0">
                                    <span class="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-700 shrink-0">${j.dorsal || '-'}</span>
                                    <div class="min-w-0">
                                        <div class="font-bold text-slate-800 truncate">${escapeHtml(j.nombre)}</div>
                                        <div class="text-[11px] text-slate-400 truncate">${escapeHtml(j.posicion)}</div>
                                    </div>
                                </div>
                            </td>
                            <td class="px-4 py-3 whitespace-nowrap">
                                <span class="inline-flex items-center gap-1.5 text-xs font-medium ${estadoCls}">
                                    <i class="fa-solid ${estadoIcon} text-[11px]"></i>
                                    ${escapeHtml(j.estado)}
                                </span>
                            </td>
                            <td class="px-4 py-3 text-right">
                                <div class="flex items-center justify-end gap-2.5">
                                    <div class="hidden sm:block w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div class="h-full ${j.desconvocatorias > 0 ? 'bg-rose-500' : 'bg-emerald-500'}" style="width: ${j.desconvocatorias > 0 ? Math.max(8, barPct) : 0}%"></div>
                                    </div>
                                    <span class="font-black text-base ${j.desconvocatorias > 0 ? 'text-rose-600' : 'text-emerald-600'}">${j.desconvocatorias}</span>
                                </div>
                            </td>
                            <td class="px-4 py-3 text-right text-slate-600 font-medium">
                                ${j.convocatorias} / ${j.partidosEvaluadosConv}
                            </td>
                            <td class="px-4 py-3 text-right font-semibold ${j.pctDesconvocado > 0 ? 'text-slate-700' : 'text-slate-400'}">
                                ${j.pctDesconvocado}%
                            </td>
                            <td class="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                                ${ultimaTxt}
                            </td>
                            <td class="px-4 py-3 text-right whitespace-nowrap">
                                ${j.desconvocatorias > 0 ? `
                                    <button type="button" class="btn-toggle-desc-detail px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-medium transition-colors" data-player-id="${j.id}">
                                        ${isExpanded ? 'Ocultar' : `Ver (${j.desconvocatorias})`}
                                    </button>
                                ` : '<span class="text-xs text-slate-300">—</span>'}
                            </td>
                        </tr>
                    `;

                    const detailHtml = (isExpanded && j.desconvocatorias > 0) ? `
                        <tr class="bg-slate-50/70">
                            <td colspan="8" class="px-6 py-3 border-t border-slate-100">
                                <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Partidos en los que no fue convocado (${j.desconvocatorias})</div>
                                <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
                                    ${j.partidosDesconvocados.map(pd => `
                                        <span>${formatFechaCorta(pd.fecha)} · <span class="font-semibold">${pd.esLocal ? 'vs' : '@'} ${escapeHtml(pd.rival)}</span></span>
                                    `).join('<span class="text-slate-300">|</span>')}
                                </div>
                            </td>
                        </tr>
                    ` : '';

                    return rowHtml + detailHtml;
                }).join('')}
            </tbody>
        </table>
    `;

    wrapper.querySelectorAll('.btn-toggle-desc-detail').forEach(btn => {
        btn.addEventListener('click', () => {
            const pId = btn.getAttribute('data-player-id');
            if (!pId) return;
            if (expandedDescPlayers.has(pId)) expandedDescPlayers.delete(pId);
            else expandedDescPlayers.add(pId);
            renderTablaDesconvocados(data);
        });
    });
}

function renderTablaPlantillaGlobal(data) {
    const wrapper = document.getElementById('tabla-plantilla-global-wrapper');
    if (!wrapper) return;

    const term = searchPlantilla.trim().toLowerCase();
    let lista = [...data.jugadoresLista];

    if (term) {
        lista = lista.filter(j =>
            (j.nombre || '').toLowerCase().includes(term) ||
            String(j.dorsal || '').includes(term) ||
            (j.posicion || '').toLowerCase().includes(term)
        );
    }

    const getSortVal = (j, col) => {
        switch (col) {
            case 'nombre': return (j.nombre || '').toLowerCase();
            case 'jugados': return j.jugados;
            case 'titularidades': return j.titularidades;
            case 'desconvocatorias': return j.desconvocatorias;
            case 'minutos': return j.minutos;
            case 'goles': return j.goles;
            case 'asistencias': return j.asistencias;
            case 'golesAsistencias': return j.golesAsistencias;
            case 'tirosPuerta': return j.tirosPuerta;
            case 'paradas': return j.paradas;
            case 'amarillas': return j.amarillas + j.rojas * 3;
            case 'asistSesionesPct': return j.asistSesionesPct ?? -1;
            case 'valoracionMedia': return j.valoracionMedia ?? -9999;
            default: return j.jugados;
        }
    };

    lista.sort((a, b) => {
        const va = getSortVal(a, sortPlantillaCol);
        const vb = getSortVal(b, sortPlantillaCol);
        if (typeof va === 'string' && typeof vb === 'string') {
            return sortPlantillaDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        if (va !== vb) return sortPlantillaDir === 'asc' ? va - vb : vb - va;
        return (parseInt(a.dorsal, 10) || 999) - (parseInt(b.dorsal, 10) || 999);
    });

    const thSort = (col, label, align = 'text-center', title = '') => {
        const active = sortPlantillaCol === col;
        const icon = active
            ? (sortPlantillaDir === 'asc' ? 'fa-sort-up text-blue-600' : 'fa-sort-down text-blue-600')
            : 'fa-sort text-slate-300';
        return `
            <th class="px-3 py-3 font-semibold ${align} cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap" data-sort="${col}" title="${title}">
                <span class="inline-flex items-center gap-1">${label} <i class="fa-solid ${icon} text-[10px]"></i></span>
            </th>
        `;
    };

    if (lista.length === 0) {
        wrapper.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">No hay jugadores que coincidan con el filtro.</div>`;
        return;
    }

    wrapper.innerHTML = `
        <table class="w-full text-left text-xs text-slate-700">
            <thead class="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] uppercase">
                <tr>
                    ${thSort('nombre', 'Jugador', 'text-left', 'Ordenar alfabéticamente')}
                    ${thSort('jugados', 'PJ', 'text-center', 'Partidos jugados')}
                    ${thSort('titularidades', 'Tit / Sup', 'text-center', 'Titularidades / Suplencias')}
                    ${thSort('desconvocatorias', 'Desc.', 'text-center', 'Veces desconvocado')}
                    ${thSort('minutos', 'Min.', 'text-right', 'Minutos jugados')}
                    ${thSort('goles', 'Goles', 'text-center', 'Goles anotados')}
                    ${thSort('asistencias', 'Asist.', 'text-center', 'Asistencias')}
                    ${thSort('tirosPuerta', 'Tiros', 'text-center', 'Tiros a puerta / totales')}
                    ${thSort('paradas', 'Paradas', 'text-center', 'Paradas realizadas')}
                    ${thSort('amarillas', 'Tarj.', 'text-center', 'Tarjetas amarillas / rojas')}
                    ${thSort('asistSesionesPct', 'Entrenos', 'text-center', 'Asistencia a entrenamientos')}
                    ${thSort('valoracionMedia', 'Val. Media', 'text-right', 'Valoración media por partido')}
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 tabular-nums whitespace-nowrap">
                ${lista.map(j => {
                    const valStr = j.valoracionMedia !== null
                        ? (j.valoracionMedia > 0 ? `+${j.valoracionMedia.toFixed(1)}` : j.valoracionMedia.toFixed(1))
                        : '—';
                    const valCls = j.valoracionMedia === null
                        ? 'text-slate-400'
                        : (j.valoracionMedia > 0 ? 'text-emerald-700 font-bold' : (j.valoracionMedia < 0 ? 'text-rose-600 font-bold' : 'text-slate-700 font-bold'));
                    const entrenosTxt = j.asistSesionesPct !== null
                        ? `${j.asistSesiones}/${j.totalSesiones} (${j.asistSesionesPct}%)`
                        : '—';

                    return `
                        <tr class="hover:bg-slate-50/80 transition-colors">
                            <td class="px-3 py-2.5">
                                <div class="flex items-center gap-2">
                                    <span class="font-bold text-slate-400 w-6 text-right">#${j.dorsal || '-'}</span>
                                    <div>
                                        <div class="font-bold text-slate-800">${escapeHtml(j.nombre)}</div>
                                        <div class="text-[10px] text-slate-400">${escapeHtml(j.posicion)}</div>
                                    </div>
                                </div>
                            </td>
                            <td class="px-3 py-2.5 text-center font-bold text-slate-800">${j.jugados}</td>
                            <td class="px-3 py-2.5 text-center text-slate-500">${j.titularidades} / ${j.suplencias}</td>
                            <td class="px-3 py-2.5 text-center font-bold ${j.desconvocatorias > 0 ? 'text-rose-600' : 'text-slate-400'}">${j.desconvocatorias}</td>
                            <td class="px-3 py-2.5 text-right font-medium text-slate-700">${j.minutos}'</td>
                            <td class="px-3 py-2.5 text-center font-bold ${j.goles > 0 ? 'text-emerald-700' : 'text-slate-400'}">${j.goles}</td>
                            <td class="px-3 py-2.5 text-center font-bold ${j.asistencias > 0 ? 'text-blue-600' : 'text-slate-400'}">${j.asistencias}</td>
                            <td class="px-3 py-2.5 text-center text-slate-600">${j.tirosPuerta} / ${j.tirosTotales}</td>
                            <td class="px-3 py-2.5 text-center font-semibold ${j.paradas > 0 ? 'text-emerald-700' : 'text-slate-400'}">${j.paradas}</td>
                            <td class="px-3 py-2.5 text-center">
                                <span class="${j.amarillas > 0 ? 'text-amber-600 font-bold' : 'text-slate-300'}">${j.amarillas}</span>
                                <span class="text-slate-300">/</span>
                                <span class="${j.rojas > 0 ? 'text-rose-600 font-bold' : 'text-slate-300'}">${j.rojas}</span>
                            </td>
                            <td class="px-3 py-2.5 text-center text-slate-600">${entrenosTxt}</td>
                            <td class="px-3 py-2.5 text-right ${valCls}">${valStr}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;

    wrapper.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.getAttribute('data-sort');
            if (!col) return;
            if (sortPlantillaCol === col) {
                sortPlantillaDir = sortPlantillaDir === 'desc' ? 'asc' : 'desc';
            } else {
                sortPlantillaCol = col;
                sortPlantillaDir = col === 'nombre' ? 'asc' : 'desc';
            }
            renderTablaPlantillaGlobal(data);
        });
    });
}

function renderChartGlobalGoles(seriePartidos) {
    if (chartGlobalGolesInstance) {
        chartGlobalGolesInstance.destroy();
        chartGlobalGolesInstance = null;
    }

    const canvas = document.getElementById('chart-global-goles-partidos');
    if (!canvas || !window.Chart || !seriePartidos || seriePartidos.length === 0) return;

    const ultimos = seriePartidos.slice(-14);
    const labels = ultimos.map(p => `${formatFechaCorta(p.fecha).slice(0, 5)} ${p.esLocal ? 'vs' : '@'} ${p.rival}`);

    chartGlobalGolesInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Goles a favor',
                    data: ultimos.map(p => p.gf),
                    backgroundColor: 'rgba(16, 185, 129, 0.85)',
                    borderColor: 'rgb(5, 150, 105)',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: 'Goles en contra',
                    data: ultimos.map(p => p.gc),
                    backgroundColor: 'rgba(244, 63, 94, 0.78)',
                    borderColor: 'rgb(225, 29, 72)',
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { boxWidth: 12, font: { size: 11, weight: '600' } }
                },
                tooltip: {
                    callbacks: {
                        afterBody: (items) => {
                            const idx = items?.[0]?.dataIndex;
                            const p = idx !== undefined ? ultimos[idx] : null;
                            if (!p) return '';
                            const res = p.resultadoLetra === 'V' ? 'Victoria' : (p.resultadoLetra === 'E' ? 'Empate' : 'Derrota');
                            return `Resultado: ${p.gf} - ${p.gc} (${res})`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1, precision: 0 }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { size: 10 },
                        maxRotation: 30,
                        minRotation: 0
                    }
                }
            }
        }
    });
}
