import { db, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, where, auth } from './firebase-config.js';
import { mostrarNotificacion, bindModal, confirmarAccion } from './ui.js';
import { obtenerEstadisticasJugador } from './mod-partidos.js';

export let todosLosJugadores = [];
export let equipoIdActivo = null;
let unsubJugadores = null;
let radarChartInstance = null;
let jugadorEvolucionChartInstance = null;
let jugadorActivoModal = null;
let statsCargadasJugadorId = null;

const contenedor = document.getElementById('lista-jugadores-container');
let viewMode = localStorage.getItem('plantillaViewMode') || 'cards';

function cambiarTabFichaJugador(tab) {
    const btnPerfil = document.getElementById('btn-tab-jug-perfil');
    const btnStats = document.getElementById('btn-tab-jug-stats');
    const contentPerfil = document.getElementById('tab-content-jug-perfil');
    const contentStats = document.getElementById('tab-content-jug-stats');
    const btnSave = document.getElementById('btn-save-modal-jugador');

    if (!btnPerfil || !btnStats || !contentPerfil || !contentStats) return;

    if (tab === 'stats') {
        btnStats.className = 'pb-2.5 border-b-2 border-emerald-600 text-emerald-700 font-bold flex items-center gap-2 transition-colors';
        btnPerfil.className = 'pb-2.5 border-b-2 border-transparent text-slate-500 hover:text-slate-800 font-medium flex items-center gap-2 transition-colors';
        contentPerfil.classList.add('hidden');
        contentStats.classList.remove('hidden');
        if (btnSave) btnSave.classList.add('hidden');

        if (jugadorActivoModal && statsCargadasJugadorId !== jugadorActivoModal.id) {
            cargarYRenderizarStatsJugador(jugadorActivoModal);
        }
    } else {
        btnPerfil.className = 'pb-2.5 border-b-2 border-emerald-600 text-emerald-700 font-bold flex items-center gap-2 transition-colors';
        btnStats.className = 'pb-2.5 border-b-2 border-transparent text-slate-500 hover:text-slate-800 font-medium flex items-center gap-2 transition-colors';
        contentStats.classList.add('hidden');
        contentPerfil.classList.remove('hidden');
        if (btnSave) btnSave.classList.remove('hidden');
        actualizarRadarChart();
    }
}

async function cargarYRenderizarStatsJugador(jug) {
    const statsBody = document.getElementById('jugador-stats-body');
    if (!statsBody) return;

    statsBody.innerHTML = `
        <div class="py-12 flex flex-col items-center justify-center text-slate-400">
            <i class="fa-solid fa-circle-notch fa-spin text-2xl text-emerald-500 mb-3"></i>
            <span class="text-sm font-medium">Calculando rendimiento en partidos disputados...</span>
        </div>
    `;

    try {
        const res = await obtenerEstadisticasJugador(jug.id, jug.equipoId || equipoIdActivo);
        statsCargadasJugadorId = jug.id;

        if (!res || res.totales.partidosEquipo === 0) {
            statsBody.innerHTML = `
                <div class="py-12 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400">
                    <i class="fa-regular fa-futbol text-3xl mb-2 opacity-60"></i>
                    <p class="font-bold text-slate-600 text-sm">Aún no hay partidos disputados</p>
                    <p class="text-xs mt-1">Las estadísticas aparecerán aquí conforme el equipo dispute partidos.</p>
                </div>
            `;
            return;
        }

        const t = res.totales;
        const hist = res.historial || [];
        const pj = t.jugados;
        const divPJ = Math.max(1, pj);
        const esPortero = (jug.posicion || '').toLowerCase().includes('porter');

        const mediaMin = pj > 0 ? Math.round(t.minutos / divPJ) : 0;
        const mediaVal = pj > 0 ? (t.valoracionTotal / divPJ).toFixed(1) : '0.0';
        const tirosTotales = t.tirosPuerta + t.tirosFuera;
        const punteriaPct = tirosTotales > 0 ? Math.round((t.tirosPuerta / tirosTotales) * 100) : 0;

        // KPI 3 adaptado según sea Portero o Jugador de Campo
        const kpi3Html = esPortero ? `
            <div class="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 flex flex-col justify-between">
                <div class="flex items-center justify-between text-xs font-bold text-emerald-800 uppercase">
                    <span>Paradas</span>
                    <i class="fa-solid fa-hand text-emerald-600"></i>
                </div>
                <div class="mt-2">
                    <span class="text-2xl font-black text-emerald-900">${t.paradas}</span>
                    <span class="text-xs font-semibold text-emerald-700 ml-1">(${(t.paradas / divPJ).toFixed(1)}/p)</span>
                </div>
                <div class="text-[11px] text-emerald-700/80 mt-1">
                    Encajados en campo: <strong>${t.golesEncajadosEnCampo}</strong> (${(t.golesEncajadosEnCampo / divPJ).toFixed(1)}/p)
                </div>
            </div>
        ` : `
            <div class="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 flex flex-col justify-between">
                <div class="flex items-center justify-between text-xs font-bold text-emerald-800 uppercase">
                    <span>Goles + Asist.</span>
                    <i class="fa-solid fa-futbol text-emerald-600"></i>
                </div>
                <div class="mt-2">
                    <span class="text-2xl font-black text-emerald-900">${t.goles}G</span>
                    <span class="text-sm font-bold text-blue-700 ml-1.5">+ ${t.asistencias}A</span>
                </div>
                <div class="text-[11px] text-emerald-700/80 mt-1">
                    Media: <strong>${((t.goles + t.asistencias) / divPJ).toFixed(2)}</strong> G+A / part.
                </div>
            </div>
        `;

        // Helper para celdas de desglose (Total + Media/partido)
        const statItemHTML = (label, icon, colorCls, val, highlight = false) => `
            <div class="flex items-center justify-between p-2.5 rounded-lg ${highlight ? 'bg-emerald-50/60 border border-emerald-200' : 'bg-slate-50 border border-slate-200/80'}">
                <div class="flex items-center gap-2 min-w-0">
                    <i class="fa-solid ${icon} ${colorCls} w-4 text-center text-xs"></i>
                    <span class="text-xs font-semibold text-slate-700 truncate">${label}</span>
                </div>
                <div class="flex items-center gap-1.5 shrink-0 ml-2">
                    <span class="font-black text-sm text-slate-900">${val}</span>
                    <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white text-slate-500 border border-slate-200">${(val / divPJ).toFixed(1)}/p</span>
                </div>
            </div>
        `;

        // Aviso disciplinario
        let alertaTarjetas = '';
        if (t.amarillas === 4) {
            alertaTarjetas = `<span class="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[10px] font-bold animate-pulse"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Apercibido (4 amarillas)</span>`;
        } else if (t.amarillas >= 5) {
            alertaTarjetas = `<span class="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[10px] font-bold">Ciclo cumplido (${Math.floor(t.amarillas / 5)})</span>`;
        }

        // Filas historial (más recientes primero en la tabla)
        const histDesc = [...hist].reverse();
        const filasHistorialHtml = histDesc.length === 0 ? `
            <tr>
                <td colspan="7" class="px-4 py-6 text-center text-xs text-slate-400 italic">No ha entrado aún en ninguna convocatoria de partido jugado.</td>
            </tr>
        ` : histDesc.map(h => {
            const fechaFmt = h.fecha ? h.fecha.split('-').reverse().slice(0, 2).join('/') : '-';
            const rolBadge = h.rol === 'Titular'
                ? '<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">Titular</span>'
                : (h.rol === 'Suplente'
                    ? '<span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold text-[10px]">Suplente</span>'
                    : '<span class="px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px]">Convocado</span>');

            const aporte = esPortero
                ? `<span class="font-bold text-emerald-700" title="Paradas"><i class="fa-solid fa-hand mr-0.5 text-[10px]"></i>${h.paradas}</span> <span class="text-slate-400 text-[11px] ml-1">(${h.golesEncajados} enc.)</span>`
                : `<span class="font-bold text-emerald-700">${h.goles}G</span> <span class="text-slate-300">|</span> <span class="font-semibold text-blue-600">${h.asistencias}A</span> <span class="text-slate-400 text-[11px] ml-1">(${h.tirosTotal} tir.)</span>`;

            const tarjetasHtml = (h.amarillas === 0 && h.rojas === 0)
                ? '<span class="text-slate-300">-</span>'
                : `
                    <div class="inline-flex items-center gap-1">
                        ${h.amarillas > 0 ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]"><span class="w-2 h-2.5 bg-amber-400 rounded-xs mr-1 inline-block"></span>${h.amarillas}</span>` : ''}
                        ${h.rojas > 0 ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[10px]"><span class="w-2 h-2.5 bg-rose-600 rounded-xs mr-1 inline-block"></span>${h.rojas}</span>` : ''}
                    </div>
                `;

            const valColor = h.valoracion > 0 ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : (h.valoracion < 0 ? 'text-rose-600 bg-rose-50 border-rose-200' : 'text-slate-600 bg-slate-50 border-slate-200');

            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-3 py-2 text-xs text-slate-500 font-medium whitespace-nowrap">${fechaFmt}</td>
                    <td class="px-3 py-2 text-xs font-bold text-slate-800 truncate max-w-[140px]" title="${h.rival}">
                        ${h.esLocal ? 'vs' : '@'} ${h.rival}
                        <span class="text-[10px] font-normal text-slate-400 ml-1">(${h.resultado})</span>
                    </td>
                    <td class="px-3 py-2 text-center whitespace-nowrap">${rolBadge}</td>
                    <td class="px-3 py-2 text-center text-xs font-bold text-slate-700 whitespace-nowrap">${h.jugo ? h.minutos + "'" : "0'"}</td>
                    <td class="px-3 py-2 text-center text-xs whitespace-nowrap">${aporte}</td>
                    <td class="px-3 py-2 text-center whitespace-nowrap">${tarjetasHtml}</td>
                    <td class="px-3 py-2 text-right whitespace-nowrap">
                        <span class="px-1.5 py-0.5 rounded border text-[11px] font-bold ${valColor}">
                            ${h.valoracion > 0 ? '+' + h.valoracion : h.valoracion}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');

        statsBody.innerHTML = `
            <!-- BLOQUE A: KPIs DE PARTICIPACIÓN -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div class="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
                    <div class="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
                        <span>Participación</span>
                        <i class="fa-solid fa-shirt text-blue-500"></i>
                    </div>
                    <div class="mt-2">
                        <span class="text-2xl font-black text-slate-800">${t.jugados}</span>
                        <span class="text-xs font-semibold text-slate-400">/ ${t.convocatorias} conv.</span>
                    </div>
                    <div class="text-[11px] text-slate-500 mt-1">
                        <strong>${t.titularidades}</strong> Titular · <strong>${t.suplencias}</strong> Suplente
                    </div>
                </div>

                <div class="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
                    <div class="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
                        <span>Minutos</span>
                        <i class="fa-solid fa-stopwatch text-indigo-500"></i>
                    </div>
                    <div class="mt-2">
                        <span class="text-2xl font-black text-slate-800">${t.minutos}'</span>
                    </div>
                    <div class="text-[11px] text-slate-500 mt-1">
                        Media: <strong>${mediaMin} min</strong> / partido
                    </div>
                </div>

                ${kpi3Html}

                <div class="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 flex flex-col justify-between">
                    <div class="flex items-center justify-between text-xs font-bold text-amber-900 uppercase">
                        <span>Valoración</span>
                        <i class="fa-solid fa-star text-amber-500"></i>
                    </div>
                    <div class="mt-2">
                        <span class="text-2xl font-black text-amber-900">${Number(mediaVal) > 0 ? '+' + mediaVal : mediaVal}</span>
                        <span class="text-xs font-semibold text-amber-700 ml-1">pts/p</span>
                    </div>
                    <div class="text-[11px] text-amber-800/80 mt-1">
                        Total acum.: <strong>${t.valoracionTotal.toFixed(1)}</strong> pts
                    </div>
                </div>
            </div>

            <!-- BLOQUE B: DESGLOSE TÉCNICO (TOTAL Y MEDIA POR PARTIDO JUGADO) -->
            <div class="bg-white rounded-xl border border-slate-200 p-4">
                <div class="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-100">
                    <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <i class="fa-solid fa-sliders text-emerald-600"></i> Desglose Técnico (Total y Media en ${pj} part. jugados)
                    </h4>
                    <div class="flex items-center gap-2">
                        ${!esPortero && tirosTotales > 0 ? `<span class="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Puntería tiro: <strong>${punteriaPct}%</strong></span>` : ''}
                        ${alertaTarjetas}
                    </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    ${esPortero ? statItemHTML('Paradas realizadas', 'fa-hand', 'text-emerald-600', t.paradas, true) : ''}
                    ${statItemHTML('Goles propios', 'fa-futbol', 'text-emerald-500', t.goles)}
                    ${statItemHTML('Asistencias', 'fa-handshake', 'text-blue-500', t.asistencias)}
                    ${statItemHTML('Tiros propios', 'fa-bullseye', 'text-teal-500', tirosTotales)}
                    ${statItemHTML('Tiros a puerta', 'fa-crosshairs', 'text-emerald-500', t.tirosPuerta)}
                    ${statItemHTML('Tiros fuera', 'fa-xmark', 'text-slate-400', t.tirosFuera)}
                    ${!esPortero && t.paradas > 0 ? statItemHTML('Paradas', 'fa-hand', 'text-emerald-600', t.paradas) : ''}
                    ${statItemHTML('Faltas recibidas', 'fa-shield-halved', 'text-blue-400', t.faltasRecibidas)}
                    ${statItemHTML('Faltas cometidas', 'fa-gavel', 'text-amber-600', t.faltasCometidas)}
                    ${statItemHTML('T. Amarillas', 'fa-square', 'text-amber-400', t.amarillas)}
                    ${statItemHTML('T. Rojas', 'fa-square', 'text-rose-600', t.rojas)}
                </div>
            </div>

            <!-- BLOQUE C: GRÁFICO DE EVOLUCIÓN RECIENTE -->
            <div id="jugador-evolucion-card" class="bg-white rounded-xl border border-slate-200 p-4 ${hist.filter(x => x.jugo).length === 0 ? 'hidden' : ''}">
                <div class="flex items-center justify-between mb-3">
                    <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <i class="fa-solid fa-chart-column text-blue-600"></i> Evolución Reciente (Últimos 10 partidos jugados)
                    </h4>
                </div>
                <div class="w-full h-44 relative">
                    <canvas id="jugador-evolucion-chart"></canvas>
                </div>
            </div>

            <!-- BLOQUE D: HISTORIAL PARTIDO A PARTIDO -->
            <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <i class="fa-solid fa-clock-rotate-left text-slate-500"></i> Registro Partido a Partido
                    </h4>
                    <span class="text-[11px] text-slate-400 font-medium">${t.partidosEquipo} partidos del equipo</span>
                </div>
                <div class="overflow-x-auto max-h-56">
                    <table class="w-full text-left border-collapse">
                        <thead class="bg-slate-50/70 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-100 sticky top-0">
                            <tr>
                                <th class="px-3 py-2">Fecha</th>
                                <th class="px-3 py-2">Rival</th>
                                <th class="px-3 py-2 text-center">Rol</th>
                                <th class="px-3 py-2 text-center">Min</th>
                                <th class="px-3 py-2 text-center">${esPortero ? 'Paradas' : 'Aporte'}</th>
                                <th class="px-3 py-2 text-center">Tarj.</th>
                                <th class="px-3 py-2 text-right">Val.</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${filasHistorialHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Renderizar gráfico de evolución con los últimos 10 partidos en los que participó
        const jugadosRecientes = hist.filter(h => h.jugo).slice(-10);
        if (jugadosRecientes.length > 0 && window.Chart) {
            if (jugadorEvolucionChartInstance) {
                jugadorEvolucionChartInstance.destroy();
                jugadorEvolucionChartInstance = null;
            }
            const canvasEvo = document.getElementById('jugador-evolucion-chart');
            if (canvasEvo) {
                jugadorEvolucionChartInstance = new window.Chart(canvasEvo, {
                    type: 'bar',
                    data: {
                        labels: jugadosRecientes.map(h => {
                            const f = h.fecha ? h.fecha.split('-').reverse().slice(0, 2).join('/') : '';
                            const r = (h.rival || '').substring(0, 10);
                            return `${r} (${f})`;
                        }),
                        datasets: [
                            {
                                label: 'Minutos',
                                data: jugadosRecientes.map(h => h.minutos),
                                backgroundColor: 'rgba(99, 102, 241, 0.22)',
                                borderColor: 'rgb(99, 102, 241)',
                                borderWidth: 1.5,
                                borderRadius: 4,
                                yAxisID: 'yMin',
                                order: 2
                            },
                            {
                                label: esPortero ? 'Paradas' : 'Valoración',
                                data: jugadosRecientes.map(h => esPortero ? h.paradas : h.valoracion),
                                type: 'line',
                                borderColor: 'rgb(16, 185, 129)',
                                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                pointBackgroundColor: 'rgb(16, 185, 129)',
                                borderWidth: 2,
                                pointRadius: 4,
                                tension: 0.25,
                                yAxisID: 'yVal',
                                order: 1
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: true,
                                position: 'top',
                                labels: { boxWidth: 10, font: { size: 11 } }
                            }
                        },
                        scales: {
                            yMin: {
                                type: 'linear',
                                position: 'left',
                                beginAtZero: true,
                                title: { display: true, text: 'Min', font: { size: 10 } },
                                grid: { color: 'rgba(226, 232, 240, 0.6)' }
                            },
                            yVal: {
                                type: 'linear',
                                position: 'right',
                                beginAtZero: esPortero,
                                title: { display: true, text: esPortero ? 'Paradas' : 'Pts', font: { size: 10 } },
                                grid: { drawOnChartArea: false }
                            },
                            x: {
                                grid: { display: false },
                                ticks: { font: { size: 10 } }
                            }
                        }
                    }
                });
            }
        }
    } catch (err) {
        console.error("Error cargando estadísticas del jugador:", err);
        statsBody.innerHTML = `<div class="py-8 text-center text-rose-500 text-sm">No se pudieron cargar las estadísticas del jugador.</div>`;
    }
}

export function actualizarRadarChart(stats = null) {
    setTimeout(() => {
        const canvas = document.getElementById('jugador-radar-chart');
        if (!canvas || !window.Chart) return;

        const ritmo = stats && stats.ritmo !== undefined ? parseInt(stats.ritmo) : (parseInt(document.getElementById('input-jugador-ritmo')?.value) || 50);
        const tiro = stats && stats.tiro !== undefined ? parseInt(stats.tiro) : (parseInt(document.getElementById('input-jugador-tiro')?.value) || 50);
        const pase = stats && stats.pase !== undefined ? parseInt(stats.pase) : (parseInt(document.getElementById('input-jugador-pase')?.value) || 50);
        const regate = stats && stats.regate !== undefined ? parseInt(stats.regate) : (parseInt(document.getElementById('input-jugador-regate')?.value) || 50);
        const defensa = stats && stats.defensa !== undefined ? parseInt(stats.defensa) : (parseInt(document.getElementById('input-jugador-defensa')?.value) || 50);
        const fisico = stats && stats.fisico !== undefined ? parseInt(stats.fisico) : (parseInt(document.getElementById('input-jugador-fisico')?.value) || 50);

        const dataValues = [ritmo, tiro, pase, regate, defensa, fisico];
        const labels = ['Ritmo', 'Tiro', 'Pase', 'Regate', 'Defensa', 'Físico'];

        if (radarChartInstance) {
            radarChartInstance.data.datasets[0].data = dataValues;
            radarChartInstance.update();
            return;
        }

        const ctx = canvas.getContext('2d');
        radarChartInstance = new window.Chart(ctx, {
            type: 'radar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Capacidades',
                    data: dataValues,
                    backgroundColor: 'rgba(16, 185, 129, 0.25)',
                    borderColor: '#10b981',
                    borderWidth: 2,
                    pointBackgroundColor: '#10b981',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: '#ffffff',
                    pointHoverBorderColor: '#10b981'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 350
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => ` ${context.label}: ${context.raw}`
                        }
                    }
                },
                scales: {
                    r: {
                        min: 0,
                        max: 100,
                        beginAtZero: true,
                        ticks: {
                            stepSize: 20,
                            display: false,
                            backdropColor: 'transparent'
                        },
                        grid: {
                            color: 'rgba(148, 163, 184, 0.25)',
                            circular: false
                        },
                        angleLines: {
                            color: 'rgba(148, 163, 184, 0.35)'
                        },
                        pointLabels: {
                            font: {
                                size: 11,
                                weight: 'bold',
                                family: 'system-ui, -apple-system, sans-serif'
                            },
                            color: '#334155'
                        }
                    }
                }
            }
        });
    }, 40);
}

export function abrirFichaJugador(jug, tabInicial = 'perfil') {
    jugadorActivoModal = jug;
    statsCargadasJugadorId = null;

    const tabsNav = document.getElementById('jugador-modal-tabs');
    if (tabsNav) tabsNav.classList.remove('hidden');

    document.getElementById('input-jugador-nombre').value = jug.nombre || '';
    document.getElementById('input-jugador-posicion').value = jug.posicion || 'Delantero';
    document.getElementById('input-jugador-dorsal').value = jug.dorsal ?? '';
    document.getElementById('input-jugador-estado').value = jug.estado || 'Disponible';
    
    const stats = jug.stats || { media: 50, ritmo: 50, tiro: 50, pase: 50, regate: 50, defensa: 50, fisico: 50 };
    document.getElementById('input-jugador-media').value = stats.media ?? 50;
    document.getElementById('input-jugador-ritmo').value = stats.ritmo ?? 50;
    document.getElementById('input-jugador-tiro').value = stats.tiro ?? 50;
    document.getElementById('input-jugador-pase').value = stats.pase ?? 50;
    document.getElementById('input-jugador-regate').value = stats.regate ?? 50;
    document.getElementById('input-jugador-defensa').value = stats.defensa ?? 50;
    document.getElementById('input-jugador-fisico').value = stats.fisico ?? 50;

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
    const modalTitle = document.querySelector('#modal-jugador h3');
    if (modalTitle) {
        modalTitle.innerHTML = `<i class="fa-solid fa-address-card text-emerald-600 mr-2"></i> Ficha del Jugador: <span class="text-slate-800 ml-1">#${jug.dorsal ?? ''} ${jug.nombre}</span>`;
    }
    document.getElementById('modal-jugador').classList.remove('hidden');

    cambiarTabFichaJugador(tabInicial);
    if (tabInicial === 'perfil') {
        actualizarRadarChart(stats);
    }
}

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

    const btnTabPerfil = document.getElementById('btn-tab-jug-perfil');
    const btnTabStats = document.getElementById('btn-tab-jug-stats');
    if (btnTabPerfil && btnTabStats) {
        btnTabPerfil.addEventListener('click', () => cambiarTabFichaJugador('perfil'));
        btnTabStats.addEventListener('click', () => cambiarTabFichaJugador('stats'));
    }

    const btnViewCards = document.getElementById('btn-view-cards');
    const btnViewTable = document.getElementById('btn-view-table');

    if (btnViewCards && btnViewTable) {
        const updateViewButtons = () => {
            if (viewMode === 'cards') {
                btnViewCards.className = 'flex-1 sm:flex-none px-3 py-1.5 bg-white shadow-sm text-slate-800 rounded-md text-sm font-medium transition-all';
                btnViewTable.className = 'flex-1 sm:flex-none px-3 py-1.5 text-slate-500 hover:text-slate-700 rounded-md text-sm font-medium transition-all';
            } else {
                btnViewTable.className = 'flex-1 sm:flex-none px-3 py-1.5 bg-white shadow-sm text-slate-800 rounded-md text-sm font-medium transition-all';
                btnViewCards.className = 'flex-1 sm:flex-none px-3 py-1.5 text-slate-500 hover:text-slate-700 rounded-md text-sm font-medium transition-all';
            }
        };

        updateViewButtons();

        btnViewCards.addEventListener('click', () => {
            viewMode = 'cards';
            localStorage.setItem('plantillaViewMode', 'cards');
            updateViewButtons();
            renderizar();
        });

        btnViewTable.addEventListener('click', () => {
            viewMode = 'table';
            localStorage.setItem('plantillaViewMode', 'table');
            updateViewButtons();
            renderizar();
        });
    }

    const closeModJug = bindModal('modal-jugador', 'btn-open-modal-jugador', 'btn-close-modal-jugador', 'btn-cancel-modal-jugador', () => {
        jugadorActivoModal = null;
        statsCargadasJugadorId = null;
        document.getElementById('form-jugador').reset();
        document.getElementById('input-jugador-foto-base64').value = "";
        document.getElementById('preview-jugador-foto').src = "";
        document.getElementById('preview-jugador-foto').classList.add('hidden');
        document.getElementById('icon-jugador-foto').classList.remove('hidden');
        delete document.getElementById('form-jugador').dataset.editId;
        const modalTitle = document.querySelector('#modal-jugador h3');
        if (modalTitle) modalTitle.innerHTML = `<i class="fa-solid fa-address-card text-emerald-600 mr-2"></i> Ficha del Jugador`;
        if (radarChartInstance) {
            radarChartInstance.destroy();
            radarChartInstance = null;
        }
        if (jugadorEvolucionChartInstance) {
            jugadorEvolucionChartInstance.destroy();
            jugadorEvolucionChartInstance = null;
        }
    });

    // Actualización en tiempo real del gráfico radar cuando se modifican los atributos
    ['input-jugador-ritmo', 'input-jugador-tiro', 'input-jugador-pase', 'input-jugador-regate', 'input-jugador-defensa', 'input-jugador-fisico'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                actualizarRadarChart();
            });
        }
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
        jugadorActivoModal = null;
        statsCargadasJugadorId = null;
        const tabsNav = document.getElementById('jugador-modal-tabs');
        if (tabsNav) tabsNav.classList.add('hidden');
        cambiarTabFichaJugador('perfil');

        document.getElementById('form-jugador').reset();
        document.getElementById('input-jugador-foto-base64').value = "";
        document.getElementById('preview-jugador-foto').src = "";
        document.getElementById('preview-jugador-foto').classList.add('hidden');
        document.getElementById('icon-jugador-foto').classList.remove('hidden');
        delete document.getElementById('form-jugador').dataset.editId;
        const modalTitle = document.querySelector('#modal-jugador h3');
        if (modalTitle) modalTitle.innerHTML = `<i class="fa-solid fa-user-plus text-emerald-600 mr-2"></i> Añadir Jugador`;
        actualizarRadarChart({ ritmo: 50, tiro: 50, pase: 50, regate: 50, defensa: 50, fisico: 50 });
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
        const stats = jug.stats || { media: 50, ritmo: 50, tiro: 50, pase: 50, regate: 50, defensa: 50, fisico: 50 };
        
        if (viewMode === 'table') {
            contenedor.className = 'w-full overflow-x-auto bg-white rounded-xl border border-slate-200 shadow-sm';
            
            if (!contenedor.querySelector('table')) {
                contenedor.innerHTML = `
                    <table class="w-full text-left text-sm text-slate-600">
                        <thead class="bg-slate-50 border-b border-slate-200 text-slate-800">
                            <tr>
                                <th class="px-4 py-3 font-semibold">Dorsal</th>
                                <th class="px-4 py-3 font-semibold">Jugador</th>
                                <th class="px-4 py-3 font-semibold">Posición</th>
                                <th class="px-4 py-3 font-semibold text-center">Media</th>
                                <th class="px-4 py-3 font-semibold">Estado</th>
                                <th class="px-4 py-3 font-semibold text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="table-jugadores-body" class="divide-y divide-slate-100">
                        </tbody>
                    </table>
                `;
            }

            const tbody = contenedor.querySelector('#table-jugadores-body');
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition-colors group cursor-pointer';
            tr.innerHTML = `
                <td class="px-4 py-3 font-medium text-slate-900 w-16">#${jug.dorsal}</td>
                <td class="px-4 py-3">
                    <div class="flex items-center">
                        <div class="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center mr-3 overflow-hidden shrink-0">
                            ${jug.foto ? `<img src="${jug.foto}" class="w-full h-full object-cover">` : `<i class="fa-solid fa-user text-slate-400 text-xs"></i>`}
                        </div>
                        <span class="font-bold text-slate-800">${jug.nombre}</span>
                    </div>
                </td>
                <td class="px-4 py-3">
                    <span class="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-medium border border-slate-200">${jug.posicion}</span>
                </td>
                <td class="px-4 py-3 text-center">
                    <span class="inline-flex items-center justify-center w-7 h-7 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200">${stats.media}</span>
                </td>
                <td class="px-4 py-3">
                    <div class="flex items-center">
                        <div class="w-2.5 h-2.5 ${color} rounded-full mr-2"></div>
                        <span class="text-xs font-medium">${jug.estado}</span>
                    </div>
                </td>
                <td class="px-4 py-3 text-right">
                    <div class="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button class="btn-radar-jug w-8 h-8 bg-white hover:bg-emerald-50 text-emerald-600 rounded-lg border border-slate-200 shadow-sm transition-colors flex items-center justify-center" data-id="${jug.id}" title="Ficha y Capacidades"><i class="fa-solid fa-chart-pie text-xs"></i></button>
                        <button class="require-editor btn-edit-jug w-8 h-8 bg-white hover:bg-slate-100 text-blue-600 rounded-lg border border-slate-200 shadow-sm transition-colors flex items-center justify-center" data-id="${jug.id}" title="Editar"><i class="fa-solid fa-pen text-xs"></i></button>
                        <button class="require-editor btn-del-jug w-8 h-8 bg-white hover:bg-red-50 text-red-600 rounded-lg border border-slate-200 shadow-sm transition-colors flex items-center justify-center" data-id="${jug.id}" title="Eliminar"><i class="fa-solid fa-trash text-xs"></i></button>
                    </div>
                </td>
            `;

            bindCardEvents(tr, jug, stats);
            tbody.appendChild(tr);

        } else {
            contenedor.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6';

            const card = document.createElement('div');
            card.className = 'w-full max-w-[200px] mx-auto bg-gradient-to-br from-amber-200 via-amber-300 to-amber-500 rounded-2xl shadow-lg border border-amber-400 p-3 flex flex-col items-center relative transition-all duration-300 hover:-translate-y-2 hover:shadow-xl group font-sans overflow-hidden cursor-pointer';
            card.innerHTML = `
                <div class="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none"></div>
                <div class="absolute top-2 right-2 flex gap-1 z-[20]">
                    <button class="btn-radar-jug w-7 h-7 bg-white/90 hover:bg-white text-emerald-600 rounded-full shadow transition-colors flex items-center justify-center" data-id="${jug.id}" title="Ficha y Capacidades"><i class="fa-solid fa-chart-pie text-xs"></i></button>
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
            
            bindCardEvents(card, jug, stats);
            contenedor.appendChild(card);
        }
    });

    // Re-apply roles visibility if needed
    document.dispatchEvent(new Event('rolesUpdated'));
}

function bindCardEvents(element, jug, stats) {
    // Abrir ficha al hacer clic en el botón de radar o editar
    const btnRadar = element.querySelector('.btn-radar-jug');
    if (btnRadar) {
        btnRadar.addEventListener('click', (e) => {
            e.stopPropagation();
            abrirFichaJugador(jug);
        });
    }

    const btnEdit = element.querySelector('.btn-edit-jug');
    if (btnEdit) {
        btnEdit.addEventListener('click', (e) => {
            e.stopPropagation();
            abrirFichaJugador(jug);
        });
    }

    // Abrir ficha al hacer clic en la tarjeta o fila completa
    element.addEventListener('click', (e) => {
        if (e.target.closest('.btn-del-jug') || e.target.closest('.btn-edit-jug') || e.target.closest('.btn-radar-jug')) return;
        abrirFichaJugador(jug);
    });

    const btnDel = element.querySelector('.btn-del-jug');
    if (btnDel) {
        btnDel.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (await confirmarAccion('¿Eliminar jugador de forma permanente?')) {
                try {
                    await deleteDoc(doc(db, 'jugadores', jug.id));
                    mostrarNotificacion("Jugador eliminado");
                } catch(err) {
                    mostrarNotificacion("Error al eliminar", true);
                }
            }
        });
    }
}