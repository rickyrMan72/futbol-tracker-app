import { db, collection, addDoc, onSnapshot, getDocs, deleteDoc, doc, updateDoc, query, where, auth, getDoc } from './firebase-config.js';
import { mostrarNotificacion, bindModal, confirmarAccion, extraerTiempoEfemeride, compararEfemeridesAsc, compararEfemeridesDesc, formatearTiempoAnotado, renderTop3CardHTML } from './ui.js';
import { todosLosJugadores, equipoIdActivo } from './mod-jugadores.js';
import { todosLosEquipos } from './mod-equipos.js';
import { DEFAULT_ACCIONES, DEFAULT_ACCIONES_RIVAL, calcularJugadoresEnCampo } from './mod-directo.js';
import { getGlobalAcciones } from './mod-configuracion.js';

export let todosLosPartidos = [];
let unsubPartidos = null;
const contenedor = document.getElementById('lista-partidos-container');

let mostrarHistoricos = false;
let viewModePartidos = localStorage.getItem('partidosViewMode') || 'cards';
let partidosEventsBound = false;

let currentShareText = "";
let currentStatsPartido = null;
let currentStatsEfemerides = [];
let currentStatsJugadores = {};
let currentStatsConfigAcc = [];
let currentStatsResumen = {};
let currentStatsChartPayload = null;

// Helper to draw Font Awesome icon on canvas for scatter charts
function getIconCanvas(iconClass, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 24;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    try {
        const el = document.createElement('i');
        el.className = `fa-solid ${iconClass || 'fa-circle'}`;
        el.style.display = 'none';
        document.body.appendChild(el);
        let unicode = window.getComputedStyle(el, '::before').getPropertyValue('content');
        document.body.removeChild(el);

        if (unicode && unicode !== 'none') {
            unicode = unicode.replace(/['"]/g, '');
            ctx.font = '900 16px "Font Awesome 6 Free"';
            ctx.fillStyle = color || '#2563eb';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(unicode, 12, 12);
        } else {
            ctx.fillStyle = color || '#2563eb';
            ctx.beginPath();
            ctx.arc(12, 12, 6, 0, Math.PI * 2);
            ctx.fill();
        }
    } catch (e) {
        ctx.fillStyle = color || '#2563eb';
        ctx.beginPath();
        ctx.arc(12, 12, 6, 0, Math.PI * 2);
        ctx.fill();
    }
    return canvas;
}

function actualizarBotonHistoricos() {
    const btn = document.getElementById('btn-toggle-historicos');
    if (!btn) return;
    if (mostrarHistoricos) {
        btn.innerHTML = '<i class="fa-solid fa-eye-slash mr-2"></i> Ocultar Históricos';
        btn.classList.add('bg-slate-200', 'text-slate-800');
        btn.classList.remove('bg-slate-100', 'text-slate-700');
    } else {
        btn.innerHTML = '<i class="fa-solid fa-clock-rotate-left mr-2"></i> Ver Históricos';
        btn.classList.remove('bg-slate-200', 'text-slate-800');
        btn.classList.add('bg-slate-100', 'text-slate-700');
    }
}

export function initPartidos() {
    const btnViewCards = document.getElementById('btn-partidos-view-cards');
    const btnViewList = document.getElementById('btn-partidos-view-list');

    const updateViewButtons = () => {
        if (!btnViewCards || !btnViewList) return;
        if (viewModePartidos === 'cards') {
            btnViewCards.className = 'flex-1 sm:flex-none px-3 py-1.5 bg-white shadow-sm text-slate-800 rounded-md text-sm font-medium transition-all';
            btnViewList.className = 'flex-1 sm:flex-none px-3 py-1.5 text-slate-500 hover:text-slate-700 rounded-md text-sm font-medium transition-all';
        } else {
            btnViewList.className = 'flex-1 sm:flex-none px-3 py-1.5 bg-white shadow-sm text-slate-800 rounded-md text-sm font-medium transition-all';
            btnViewCards.className = 'flex-1 sm:flex-none px-3 py-1.5 text-slate-500 hover:text-slate-700 rounded-md text-sm font-medium transition-all';
        }
    };

    updateViewButtons();

    if (!partidosEventsBound) {
        partidosEventsBound = true;

        if (btnViewCards) {
            btnViewCards.addEventListener('click', () => {
                viewModePartidos = 'cards';
                localStorage.setItem('partidosViewMode', 'cards');
                updateViewButtons();
                dibujarPartidos();
            });
        }

        if (btnViewList) {
            btnViewList.addEventListener('click', () => {
                viewModePartidos = 'list';
                localStorage.setItem('partidosViewMode', 'list');
                updateViewButtons();
                dibujarPartidos();
            });
        }

        document.getElementById('btn-toggle-historicos')?.addEventListener('click', () => {
            mostrarHistoricos = !mostrarHistoricos;
            actualizarBotonHistoricos();
            dibujarPartidos();
        });
    }
    
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

    function buildPdfExportElement() {
        const par = currentStatsPartido || {};
        const efemerides = currentStatsEfemerides || [];
        const statsJugadores = currentStatsJugadores || {};
        const configAcc = currentStatsConfigAcc || DEFAULT_ACCIONES;
        const resumen = currentStatsResumen || {};

        const wrapper = document.createElement('div');
        wrapper.id = 'pdf-export-wrapper';
        wrapper.style.width = '100%';
        wrapper.style.maxWidth = '100%';
        wrapper.style.backgroundColor = '#ffffff';
        wrapper.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        wrapper.style.color = '#1e293b';
        wrapper.style.boxSizing = 'border-box';

        // 1. Obtener imágenes base64 de los gráficos a alta resolución y ancho completo (1400px)
        let chart1Img = '';
        let chart2Img = '';

        if (currentStatsChartPayload && window.Chart) {
            // Distribución de Acciones en canvas offscreen de 1400px de ancho
            try {
                const offCanvas1 = document.createElement('canvas');
                offCanvas1.width = 1400;
                offCanvas1.height = 420;
                const ctx1 = offCanvas1.getContext('2d');
                ctx1.fillStyle = '#ffffff';
                ctx1.fillRect(0, 0, 1400, 420);

                const c1 = new Chart(offCanvas1, {
                    type: 'bar',
                    data: {
                        labels: currentStatsChartPayload.distribucionLabels,
                        datasets: [{
                            label: 'Número de acciones',
                            data: currentStatsChartPayload.distribucionData,
                            backgroundColor: 'rgba(56, 189, 248, 0.75)',
                            borderColor: 'rgb(14, 165, 233)',
                            borderWidth: 1.5,
                            borderRadius: 6
                        }]
                    },
                    options: {
                        responsive: false,
                        maintainAspectRatio: false,
                        animation: false,
                        layout: {
                            padding: { left: 10, right: 15, top: 10, bottom: 5 }
                        },
                        plugins: { legend: { display: false } },
                        scales: {
                            x: { ticks: { font: { size: 12, weight: 'bold' }, color: '#334155' }, grid: { display: false } },
                            y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 }, color: '#475569' }, grid: { color: '#f1f5f9' } }
                        }
                    }
                });
                chart1Img = offCanvas1.toDataURL('image/png');
                c1.destroy();
            } catch (e) {
                console.warn("Error generando offscreen chart 1:", e);
            }

            // Evolución de Acciones en canvas offscreen ocupando todo el ancho sin márgenes vacíos
            try {
                const offCanvas2 = document.createElement('canvas');
                offCanvas2.width = 1400;
                offCanvas2.height = 460;
                const ctx2 = offCanvas2.getContext('2d');
                ctx2.fillStyle = '#ffffff';
                ctx2.fillRect(0, 0, 1400, 460);

                const tData = currentStatsChartPayload.temporalData;
                const cByAcc = currentStatsChartPayload.colorByAcc;
                const iByAcc = currentStatsChartPayload.iconByAcc;
                const mFinal = currentStatsChartPayload.minFinal > 0 ? currentStatsChartPayload.minFinal : 90;

                const tDatasets = Object.keys(tData).map(accKey => {
                    const color = cByAcc[accKey] || '#2563eb';
                    return {
                        label: accKey,
                        data: tData[accKey],
                        pointStyle: getIconCanvas(iByAcc[accKey], color),
                        pointRadius: 9,
                        pointBorderWidth: 0,
                        backgroundColor: color,
                        borderColor: color,
                        showLine: false
                    };
                });

                const c2 = new Chart(offCanvas2, {
                    type: 'scatter',
                    data: { datasets: tDatasets },
                    options: {
                        responsive: false,
                        maintainAspectRatio: false,
                        animation: false,
                        layout: {
                            padding: { left: 10, right: 25, top: 12, bottom: 6 }
                        },
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: {
                                    usePointStyle: true,
                                    boxWidth: 10,
                                    font: { size: 12, weight: 'bold' },
                                    padding: 14
                                }
                            }
                        },
                        scales: {
                            x: {
                                type: 'linear',
                                min: 0,
                                max: mFinal,
                                title: {
                                    display: true,
                                    text: "Minutos del Partido (0' a " + mFinal + "')",
                                    font: { size: 13, weight: 'bold' },
                                    color: '#1e293b'
                                },
                                ticks: {
                                    stepSize: 5,
                                    font: { size: 11, weight: '600' },
                                    color: '#475569'
                                },
                                grid: { color: '#f1f5f9' }
                            },
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    stepSize: 1,
                                    font: { size: 11, weight: '600' },
                                    color: '#475569'
                                },
                                title: {
                                    display: true,
                                    text: 'Nº Acciones Acumuladas',
                                    font: { size: 13, weight: 'bold' },
                                    color: '#1e293b'
                                },
                                grid: { color: '#f1f5f9' }
                            }
                        }
                    }
                });
                chart2Img = offCanvas2.toDataURL('image/png');
                c2.destroy();
            } catch (e) {
                console.warn("Error generando offscreen chart 2:", e);
            }
        }

        if (!chart1Img && window.statsChartInstance) {
            try { chart1Img = window.statsChartInstance.toBase64Image(); } catch (e) { console.warn(e); }
        }
        if (!chart1Img) {
            const c1 = document.getElementById('stats-chart');
            if (c1 && c1.width > 0) { try { chart1Img = c1.toDataURL('image/png'); } catch (e) {} }
        }

        if (!chart2Img && window.temporalChartInstance) {
            try { chart2Img = window.temporalChartInstance.toBase64Image(); } catch (e) { console.warn(e); }
        }
        if (!chart2Img) {
            const c2 = document.getElementById('stats-temporal-chart');
            if (c2 && c2.width > 0) { try { chart2Img = c2.toDataURL('image/png'); } catch (e) {} }
        }

        const validPlayerIds = Object.keys(statsJugadores).filter(id => id && id !== 'undefined' && id !== 'null');

        // 2. Top 3 para Página 1
        const getTop3 = (metricKey) => {
            return validPlayerIds.map(id => {
                const jug = todosLosJugadores.find(j => j.id === id);
                const efJug = efemerides.find(e => e.jugadorId === id);
                let jugNombre = jug?.nombre || efJug?.jugadorNombre || statsJugadores[id]?.nombre || '';
                if (!jugNombre || jugNombre === 'undefined') jugNombre = 'Jugador';
                let jugDorsal = (jug?.dorsal !== undefined && jug?.dorsal !== null) ? jug.dorsal : (efJug?.jugadorDorsal ?? (statsJugadores[id]?.dorsal ?? ''));
                if (jugDorsal === 'undefined') jugDorsal = '';
                return {
                    id,
                    nombre: jugNombre,
                    dorsal: jugDorsal,
                    valor: statsJugadores[id][metricKey] || 0
                };
            }).filter(p => p.valor > 0).sort((a, b) => b.valor - a.valor).slice(0, 3);
        };

        // Totales de faltas y tiros calculados de forma exhaustiva para mostrar entre paréntesis
        let totalFRec = 0;
        let totalFCom = 0;
        let totalTPuerta = 0;
        let totalTFuera = 0;

        efemerides.forEach(ef => {
            const eTipo = (ef.tipo || ef.accionId || '').toLowerCase();
            const accNom = (ef.nombre || '').toLowerCase();
            if (eTipo === 'falta-recibida' || accNom.includes('falta recibida')) totalFRec++;
            if (eTipo === 'falta-cometida' || accNom.includes('falta cometida')) totalFCom++;
            if ((eTipo === 'tiro-puerta' || accNom.includes('tiro a puerta') || eTipo.startsWith('gol-')) && !ef.rival && eTipo !== 'gol-rival') totalTPuerta++;
            if ((eTipo === 'tiro-fuera' || accNom.includes('tiro fuera')) && !ef.rival) totalTFuera++;
        });

        const sumFRec = validPlayerIds.reduce((sum, id) => sum + (statsJugadores[id]?.faltasRecibidas || 0), 0);
        const sumFCom = validPlayerIds.reduce((sum, id) => sum + (statsJugadores[id]?.faltasCometidas || 0), 0);
        const sumTPuerta = validPlayerIds.reduce((sum, id) => sum + (statsJugadores[id]?.tPuerta || 0), 0);
        const sumTFuera = validPlayerIds.reduce((sum, id) => sum + (statsJugadores[id]?.tFuera || 0), 0);

        totalFRec = Math.max(totalFRec, sumFRec, resumen.totalFaltasRecibidas || 0);
        totalFCom = Math.max(totalFCom, sumFCom, resumen.totalFaltasCometidas || 0);
        totalTPuerta = Math.max(totalTPuerta, sumTPuerta, resumen.totalTirosPuerta || 0);
        totalTFuera = Math.max(totalTFuera, sumTFuera, resumen.totalTirosFuera || 0);

        const top3FaltasRec = renderTop3CardHTML(`Faltas Recibidas (${totalFRec})`, 'fa-shield-halved', 'text-blue-500', 'bg-blue-50', getTop3('faltasRecibidas'));
        const top3FaltasCom = renderTop3CardHTML(`Faltas Cometidas (${totalFCom})`, 'fa-gavel', 'text-amber-600', 'bg-amber-50', getTop3('faltasCometidas'));
        const top3TPuerta = renderTop3CardHTML(`Tiros a Puerta (${totalTPuerta})`, 'fa-bullseye', 'text-emerald-500', 'bg-emerald-50', getTop3('tPuerta'));
        const top3TFuera = renderTop3CardHTML(`Tiros Fuera (${totalTFuera})`, 'fa-xmark', 'text-slate-500', 'bg-slate-100', getTop3('tFuera'));

        // 3. Filas tabla de jugadores para Página 3
        const filasJugadoresHtml = validPlayerIds.map(id => {
            const jug = todosLosJugadores.find(j => j.id === id);
            const efJug = efemerides.find(e => e.jugadorId === id);
            let jugNombre = jug?.nombre || efJug?.jugadorNombre || statsJugadores[id]?.nombre || '';
            if (!jugNombre || jugNombre === 'undefined') jugNombre = 'Jugador';
            let jugDorsal = (jug?.dorsal !== undefined && jug?.dorsal !== null) ? jug.dorsal : (efJug?.jugadorDorsal ?? (statsJugadores[id]?.dorsal ?? '-'));
            if (jugDorsal === 'undefined') jugDorsal = '-';
            const st = statsJugadores[id] || {};
            const mins = st.mins || 0;
            const goles = st.goles || 0;
            const asis = st.asis || 0;
            const tPuerta = st.tPuerta || 0;
            const tFuera = st.tFuera || 0;
            const fRec = st.faltasRecibidas || 0;
            const fCom = st.faltasCometidas || 0;
            const amarillas = st.amarillas || 0;
            const rojas = st.rojas || 0;
            const scoreVal = (typeof st.scoreValor === 'number' && !isNaN(st.scoreValor)) ? st.scoreValor : 0;
            const val = Number(scoreVal % 1 === 0 ? scoreVal : scoreVal.toFixed(2));
            const valColor = val > 0 ? '#10b981' : (val < 0 ? '#ef4444' : '#94a3b8');
            const valSign = val > 0 ? '+' : '';
            return `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 8px 10px; font-weight: 600; color: #1e293b;">
                        #${jugDorsal} ${jugNombre}
                    </td>
                    <td style="padding: 8px 6px; text-align: center; color: #475569; font-weight: 600;">${mins}'</td>
                    <td style="padding: 8px 6px; text-align: center; color: #10b981; font-weight: 700;">${goles}</td>
                    <td style="padding: 8px 6px; text-align: center; color: #f59e0b; font-weight: 700;">${asis}</td>
                    <td style="padding: 8px 6px; text-align: center; color: #0284c7; font-weight: 600;">${tPuerta}</td>
                    <td style="padding: 8px 6px; text-align: center; color: #64748b; font-weight: 600;">${tFuera}</td>
                    <td style="padding: 8px 6px; text-align: center; color: #2563eb; font-weight: 600;">${fRec}</td>
                    <td style="padding: 8px 6px; text-align: center; color: #d97706; font-weight: 600;">${fCom}</td>
                    <td style="padding: 8px 6px; text-align: center;">
                        ${amarillas > 0 ? `<span style="display: inline-block; padding: 1px 4px; background-color: #fef3c7; color: #92400e; border: 1px solid #fde68a; border-radius: 3px; font-size: 10px; font-weight: bold; margin-right: 2px;">${amarillas}A</span>` : ''}
                        ${rojas > 0 ? `<span style="display: inline-block; padding: 1px 4px; background-color: #ffe4e6; color: #9f1239; border: 1px solid #fecdd3; border-radius: 3px; font-size: 10px; font-weight: bold;">${rojas}R</span>` : ''}
                        ${amarillas === 0 && rojas === 0 ? '<span style="color: #cbd5e1;">-</span>' : ''}
                    </td>
                    <td style="padding: 8px 8px; text-align: center; font-weight: 700; color: ${valColor};">${valSign}${val}</td>
                </tr>
            `;
        }).join('');

        // 4. Eventos del timeline para Página 4+
        const ordenTimeline = localStorage.getItem('statsTimelineOrder') || 'asc';
        const sortedEfems = [...efemerides].sort(ordenTimeline === 'desc' ? compararEfemeridesDesc : compararEfemeridesAsc);

        const eventosTimelineHtml = sortedEfems.length === 0
            ? '<div style="padding: 40px; text-align: center; color: #94a3b8; font-style: italic;">No hay acciones registradas en el partido.</div>'
            : sortedEfems.map(ef => {
                const eTipo = ef.tipo || ef.accionId;
                const acc = configAcc.find(a => a.id === eTipo);
                const icon = ef.icon || (acc ? acc.icon : 'fa-bolt');
                const cl = ef.color || (acc ? acc.color : 'text-blue-500');
                const nom = ef.nombre || (acc ? acc.nombre : eTipo);
                const tInfo = extraerTiempoEfemeride(ef);
                const displayTiempo = ef.tiempoAnotado || formatearTiempoAnotado(tInfo.min, tInfo.sec);
                const isSust = (eTipo === 'sustitucion' || eTipo === 'sustitucion-lesion');

                let jugadorDesc = ef.jugadorNombre ? `#${ef.jugadorDorsal || ''} ${ef.jugadorNombre}` : (ef.rival ? 'Rival' : 'Equipo');
                if (isSust) {
                    jugadorDesc = `<span style="color: #e11d48; font-weight: bold;">Sale: #${ef.jugadorDorsal || ''} ${ef.jugadorNombre || ''}</span> <i class="fa-solid fa-arrow-right-long" style="margin: 0 6px; color: #94a3b8;"></i> <span style="color: #16a34a; font-weight: bold;">Entra: #${ef.jugadorEntraDorsal || ''} ${ef.jugadorEntraNombre || ''}</span>`;
                }

                return `
                    <div class="pdf-avoid-break" style="break-inside: avoid; page-break-inside: avoid; display: flex; align-items: center; gap: 12px; padding: 9px 12px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 7px;">
                        <div style="width: 60px; text-align: center; border-right: 1px solid #f1f5f9; padding-right: 6px; flex-shrink: 0;">
                            <span style="display: block; font-weight: 800; font-size: 13px; color: #0f172a;">${displayTiempo}</span>
                            <span style="display: block; font-size: 9px; color: #94a3b8; text-transform: uppercase; font-weight: 700;">${ef.periodo || '1ª Parte'}</span>
                        </div>
                        <div style="width: 30px; height: 30px; border-radius: 50%; background: #f8fafc; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <i class="fa-solid ${icon} ${cl}" style="font-size: 13px;"></i>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-weight: 700; font-size: 13px; color: #1e293b;">${nom}</div>
                            <div style="font-size: 12px; color: #475569; margin-top: 1px;">${jugadorDesc}</div>
                            ${ef.nota ? `<div style="font-size: 10px; color: #64748b; font-style: italic; margin-top: 2px;"><i class="fa-regular fa-comment" style="margin-right: 4px;"></i>${ef.nota}</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('');

        const resultadoTexto = par.resultado || `${resumen.golesMios || 0} - ${resumen.golesRival || 0}`;
        const totAcc = resumen.totalAcciones || 0;
        const pctPos = totAcc > 0 ? Math.round(((resumen.positivas || 0) / totAcc) * 100) : 0;

        wrapper.innerHTML = `
            <!-- ======================= PÁGINA 1: RESUMEN Y LÍDERES ======================= -->
            <div class="pdf-page" style="padding: 18px 22px; box-sizing: border-box;">
                <!-- Header Info Partido -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 18px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        ${resumen.eqIzdaEscudo || ''}
                        <span style="font-size: 17px; font-weight: 800; color: #1e293b;">${resumen.eqIzdaNombre || 'Mi Equipo'}</span>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: center;">
                        <span style="font-size: 11px; font-weight: 700; color: #64748b; background: #ffffff; border: 1px solid #e2e8f0; padding: 2px 10px; border-radius: 9999px;">
                            ${resumen.fechaHora || ''}
                        </span>
                        <span style="font-size: 22px; font-weight: 900; color: #0f172a; margin-top: 3px;">${resultadoTexto}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px; text-align: right;">
                        <span style="font-size: 17px; font-weight: 800; color: #1e293b;">${resumen.eqDchaNombre || 'Rival'}</span>
                        ${resumen.eqDchaEscudo || ''}
                    </div>
                </div>

                <!-- Resumen Superior (3 tarjetas) -->
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px;">
                    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px; text-align: center;">
                        <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Resultado Final</div>
                        <div style="font-size: 24px; font-weight: 900; color: #1e293b; margin-top: 2px;">${resultadoTexto}</div>
                    </div>
                    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px; text-align: center;">
                        <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Total Acciones</div>
                        <div style="font-size: 24px; font-weight: 900; color: #2563eb; margin-top: 2px;">${totAcc}</div>
                    </div>
                    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px; text-align: center;">
                        <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">% Acciones Positivas</div>
                        <div style="font-size: 24px; font-weight: 900; color: #8b5cf6; margin-top: 2px;">${pctPos}%</div>
                    </div>
                </div>

                <!-- Líderes del Partido (Top 3): Faltas arriba, Tiros abajo para que quepan bien los nombres y números totales -->
                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px;">
                    <h4 style="font-size: 13px; font-weight: 800; color: #1e293b; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin: 0 0 12px 0; display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-trophy" style="color: #f59e0b;"></i> Líderes del Partido (Top 3)
                    </h4>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                        <div>${top3FaltasRec}</div>
                        <div>${top3FaltasCom}</div>
                        <div>${top3TPuerta}</div>
                        <div>${top3TFuera}</div>
                    </div>
                </div>
            </div>

            <!-- ======================= PÁGINA 2: GRÁFICOS (ANCHO COMPLETO) ======================= -->
            <div class="pdf-page pdf-page-break-before" style="page-break-before: always; break-before: page; padding: 18px 22px; box-sizing: border-box;">
                <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 12px;">
                    <h3 style="font-size: 15px; font-weight: 800; color: #1e293b; margin: 0; display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-chart-pie" style="color: #2563eb;"></i> Análisis Gráfico del Partido
                    </h3>
                </div>

                <!-- Primera mitad: Distribución de Acciones ocupando todo el ancho -->
                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; margin-bottom: 12px;">
                    <h4 style="font-size: 12px; font-weight: 800; color: #334155; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; margin: 0 0 8px 0; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-chart-column" style="color: #0284c7;"></i> Distribución de Acciones
                    </h4>
                    <div style="width: 100%; border-radius: 8px; overflow: hidden; background: #ffffff;">
                        ${chart1Img ? `<img src="${chart1Img}" width="1400" height="420" style="width: 100%; height: 230px; display: block; object-fit: fill;" alt="Distribución">` : '<div style="padding: 30px; text-align: center; color: #94a3b8; font-style: italic;">Sin datos registrados</div>'}
                    </div>
                </div>

                <!-- Segunda mitad: Evolución de Acciones ocupando todo el ancho -->
                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px;">
                    <h4 style="font-size: 12px; font-weight: 800; color: #334155; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; margin: 0 0 8px 0; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-timeline" style="color: #6366f1;"></i> Evolución de Acciones en el Tiempo
                    </h4>
                    <div style="width: 100%; border-radius: 8px; overflow: hidden; background: #ffffff;">
                        ${chart2Img ? `<img src="${chart2Img}" width="1400" height="460" style="width: 100%; height: 255px; display: block; object-fit: fill;" alt="Evolución">` : '<div style="padding: 30px; text-align: center; color: #94a3b8; font-style: italic;">Sin datos registrados</div>'}
                    </div>
                </div>
            </div>

            <!-- ======================= PÁGINA 3: RENDIMIENTO POR JUGADOR (ANCHO COMPLETO) ======================= -->
            <div class="pdf-page pdf-page-break-before" style="page-break-before: always; break-before: page; padding: 18px 22px; box-sizing: border-box;">
                <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 12px;">
                    <h3 style="font-size: 15px; font-weight: 800; color: #1e293b; margin: 0; display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-users" style="color: #2563eb;"></i> Rendimiento por Jugador
                    </h3>
                    <p style="font-size: 11px; color: #64748b; margin: 3px 0 0 0;">Desglose completo de acciones individuales de cada jugador en el partido.</p>
                </div>

                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; width: 100%;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
                        <thead style="background: #f8fafc; color: #475569; font-weight: 700; text-transform: uppercase; border-bottom: 1px solid #e2e8f0;">
                            <tr>
                                <th style="padding: 9px 10px;">Jugador</th>
                                <th style="padding: 9px 6px; text-align: center; color: #2563eb;">Min</th>
                                <th style="padding: 9px 6px; text-align: center; color: #10b981;">Gol</th>
                                <th style="padding: 9px 6px; text-align: center; color: #f59e0b;">Asis</th>
                                <th style="padding: 9px 6px; text-align: center; color: #0284c7;">T.Puerta</th>
                                <th style="padding: 9px 6px; text-align: center; color: #64748b;">T.Fuera</th>
                                <th style="padding: 9px 6px; text-align: center; color: #2563eb;">F.Recib.</th>
                                <th style="padding: 9px 6px; text-align: center; color: #d97706;">F.Comet.</th>
                                <th style="padding: 9px 6px; text-align: center; color: #e11d48;">Tarjetas</th>
                                <th style="padding: 9px 8px; text-align: center; color: #6366f1;">Valoración</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filasJugadoresHtml || '<tr><td colspan="10" style="padding: 20px; text-align: center; color: #94a3b8;">No hay datos disponibles</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- ======================= PÁGINA 4+: TIMELINE COMPLETO ======================= -->
            <div class="pdf-page pdf-page-break-before" style="page-break-before: always; break-before: page; padding: 18px 22px; box-sizing: border-box;">
                <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
                    <div>
                        <h3 style="font-size: 15px; font-weight: 800; color: #1e293b; margin: 0; display: flex; align-items: center; gap: 8px;">
                            <i class="fa-solid fa-clock-rotate-left" style="color: #2563eb;"></i> Timeline del Partido (Cronología Completa)
                        </h3>
                        <p style="font-size: 11px; color: #64748b; margin: 3px 0 0 0;">Todas las acciones registradas en orden cronológico detallado.</p>
                    </div>
                    <span style="font-size: 11px; font-weight: 800; background: #f1f5f9; color: #334155; padding: 4px 10px; border-radius: 9999px;">
                        ${sortedEfems.length} acciones
                    </span>
                </div>

                <div style="width: 100%;">
                    ${eventosTimelineHtml}
                </div>
            </div>
        `;

        return wrapper;
    }

    document.getElementById('btn-export-pdf')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-export-pdf');
        if (!currentStatsPartido) {
            mostrarNotificacion("No hay estadísticas activas para exportar", true);
            return;
        }

        const originalBtnHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Generando PDF...';
        }

        mostrarNotificacion("Generando PDF estructurado del partido...", false);

        try {
            // Asegurar disponibilidad de html2pdf
            if (typeof window.html2pdf === 'undefined') {
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
                    s.onload = resolve;
                    s.onerror = () => reject(new Error("No se pudo cargar el módulo generador de PDF"));
                    document.head.appendChild(s);
                });
            }

            const rivalSlug = (currentStatsPartido?.rival || 'rival').toLowerCase().replace(/[^a-z0-9]/g, '-');
            const fechaSlug = currentStatsPartido?.fecha || new Date().toISOString().split('T')[0];
            const filename = `estadisticas-${rivalSlug}-${fechaSlug}.pdf`;

            const printWrapper = buildPdfExportElement();

            // Esperar a que todas las imágenes en printWrapper estén completamente decodificadas antes del layout de html2pdf
            const imgs = Array.from(printWrapper.querySelectorAll('img'));
            await Promise.all(imgs.map(img => {
                if (img.complete && img.naturalHeight > 0) return Promise.resolve();
                return new Promise(res => {
                    img.onload = res;
                    img.onerror = res;
                    if (img.decode) {
                        img.decode().then(res).catch(res);
                    } else {
                        setTimeout(res, 80);
                    }
                });
            }));

            const opt = {
                margin:       [8, 8, 8, 8],
                filename:     filename,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  {
                    scale: 2,
                    useCORS: true,
                    allowTaint: false,
                    letterRendering: true,
                    scrollX: 0,
                    scrollY: 0,
                    logging: false
                },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak:    { mode: ['css', 'legacy'], before: '.pdf-page-break-before', avoid: '.pdf-avoid-break' }
            };

            let pdfBlob = null;
            try {
                pdfBlob = await window.html2pdf().set(opt).from(printWrapper).outputPdf('blob');
            } catch (blobErr) {
                console.warn("outputPdf blob falló, intentando descarga directa con html2pdf.save():", blobErr);
                await window.html2pdf().set(opt).from(printWrapper).save();
                mostrarNotificacion("PDF descargado con éxito");
                return;
            }

            if (!pdfBlob) {
                throw new Error("No se pudo generar el archivo PDF");
            }

            const file = new File([pdfBlob], filename, { type: "application/pdf" });
            let compartido = false;

            // Intentar compartir vía Web Share API si el navegador y contexto lo soportan
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        title: `Estadísticas: ${currentStatsPartido?.rival || 'Partido'}`,
                        text: `Resumen de estadísticas del partido contra ${currentStatsPartido?.rival || 'el rival'}`,
                        files: [file]
                    });
                    compartido = true;
                    mostrarNotificacion("PDF compartido con éxito");
                } catch (shareErr) {
                    console.log("Compartir no disponible o cancelado por el usuario, procediendo a descarga directa:", shareErr);
                }
            }

            // Si no se compartió (navegador en escritorio, iframe o usuario canceló share), descargar automáticamente
            if (!compartido) {
                const url = window.URL.createObjectURL(pdfBlob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    window.URL.revokeObjectURL(url);
                    a.remove();
                }, 1500);
                mostrarNotificacion("PDF descargado con éxito");
            }
        } catch (err) {
            console.error("Error al exportar PDF:", err);
            mostrarNotificacion("Error al generar PDF: " + (err.message || "desconocido"), true);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalBtnHtml;
            }
        }
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
        partidoEnEdicion = null;
        prepPartido();
    });
    
    document.getElementById('btn-open-modal-partido').addEventListener('click', prepPartido);
    
    document.getElementById('btn-save-modal-partido').addEventListener('click', async () => {
        const eqIdDestino = (partidoEnEdicion && partidoEnEdicion.equipoId) || equipoIdActivo;
        if (!eqIdDestino) {
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
            equipoId: eqIdDestino
        };

        if (!data.rival || !data.fecha || !data.hora) return alert("Faltan campos obligatorios");

        try { 
            const editId = document.getElementById('form-partido').dataset.editId;
            if (editId) {
                const existingPartido = (partidoEnEdicion && partidoEnEdicion.id === editId ? partidoEnEdicion : null) || 
                                       todosLosPartidos.find(p => p.id === editId) || {};
                
                // Cargar efemérides existentes del partido para mantener las sustituciones exactas
                let efemerides = [];
                try {
                    const efSnap = await getDocs(collection(db, 'partidos', editId, 'efemerides'));
                    efSnap.forEach(d => efemerides.push({ id: d.id, ...d.data() }));
                } catch(err) {
                    console.warn("No se pudieron cargar efemérides:", err);
                }

                const partidoParaCalculo = {
                    ...existingPartido,
                    ...data,
                    titulares,
                    convocados
                };

                data.enCampo = calcularJugadoresEnCampo(partidoParaCalculo, efemerides);
                data.equipoId = existingPartido.equipoId || eqIdDestino;

                await updateDoc(doc(db, 'partidos', editId), data);
                mostrarNotificacion("Partido y alineación actualizados"); 
            } else {
                // Initialize match state (Fútbol 11 max 11, Fútbol 7 max 7)
                const equipo = todosLosEquipos.find(eq => eq.id === data.equipoId);
                const maxJug = ((equipo && equipo.modalidad === 'Fútbol 7') || data.modalidad === 'Fútbol 7') ? 7 : 11;
                data.enCampo = titulares.slice(0, maxJug);
                data.cronometro = {
                    estado: 'pausado',
                    ultimoInicioTimer: 0,
                    tiempoAcumulado: 0,
                    periodo: '1ª Parte'
                };
                data.configAcciones = getGlobalAcciones();
                if (!auth.currentUser) throw new Error("No autenticado");
                await addDoc(collection(db, 'partidos'), data); 
                mostrarNotificacion("Partido guardado"); 
            }
            closeModPartido(); 
        } catch(e) { mostrarNotificacion("Error al guardar", true); }
    });
}

function añadirEventosCheckboxes() {
    // Si se desmarca convocado, se desmarca titular
    // Si se marca titular, se marca y habilita automáticamente convocado
    const rows = document.querySelectorAll('#partido-jugadores-list label');
    rows.forEach(row => {
        const convChk = row.querySelector('.chk-convocado');
        const titChk = row.querySelector('.chk-titular');
        if (!convChk || !titChk) return;

        convChk.addEventListener('change', (e) => {
            titChk.disabled = !e.target.checked;
            if (!e.target.checked) {
                titChk.checked = false;
            }
        });

        titChk.addEventListener('change', (e) => {
            if (e.target.checked) {
                convChk.checked = true;
                titChk.disabled = false;
            }
        });
    });
}

export function renderizarPartidos() {
    const msgNoEquipo = document.getElementById('msg-no-equipo-partido');
    const btnAddPartido = document.getElementById('btn-open-modal-partido');
    
    if (unsubPartidos) {
        unsubPartidos();
        unsubPartidos = null;
    }

    if (!equipoIdActivo) {
        todosLosPartidos = [];
        contenedor.classList.add('hidden');
        if (msgNoEquipo) msgNoEquipo.classList.remove('hidden');
        if (btnAddPartido) btnAddPartido.disabled = true;
        const elProxPartido = document.getElementById('dash-proximo-partido');
        const elProxPartidoSub = document.getElementById('dash-proximo-partido-sub');
        if (elProxPartido) elProxPartido.innerText = "Sin programar";
        if (elProxPartidoSub) elProxPartidoSub.innerText = "Selecciona un equipo";
        const badgePartidos = document.getElementById('dash-partidos-count-badge');
        if (badgePartidos) badgePartidos.innerText = "0 partidos jugados";
        return;
    }
    
    if (auth.currentUser) {
        const q = query(collection(db, 'partidos'), where('equipoId', '==', equipoIdActivo));
        unsubPartidos = onSnapshot(q, (snapshot) => {
            todosLosPartidos = [];
            snapshot.forEach((doc) => todosLosPartidos.push({ id: doc.id, ...doc.data() }));
            todosLosPartidos.sort((a, b) => {
                const dateA = new Date(`${a.fecha}T${a.hora}`);
                const dateB = new Date(`${b.fecha}T${b.hora}`);
                return dateA - dateB;
            });
            dibujarPartidos();
        }, (err) => { if (err.code !== 'permission-denied' || auth.currentUser) console.error(err); });
    }
}

function bindPartidoEvents(el, par, isFinalizadoMatch) {
    el.querySelector('.btn-del-par')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (await confirmarAccion('¿Eliminar partido?')) {
            try {
                await deleteDoc(doc(db, 'partidos', par.id));
                mostrarNotificacion("Partido eliminado");
            } catch(err) {
                mostrarNotificacion("Error al eliminar", true);
            }
        }
    });

    el.querySelector('.btn-play-par')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const event = new CustomEvent('open-directo', { detail: par.id });
        document.dispatchEvent(event);
    });

    if (isFinalizadoMatch) {
        const statsBtnEl = el.querySelector('.btn-stats-par');
        if (statsBtnEl) {
            statsBtnEl.addEventListener('click', (e) => {
                e.stopPropagation();
                abrirEstadisticas(par);
            });
        }
    }

    el.querySelector('.btn-edit-par')?.addEventListener('click', (e) => {
        e.stopPropagation();
        abrirEdicionPartido(par);
    });
}

let partidoEnEdicion = null;

export function abrirEdicionPartido(par) {
    partidoEnEdicion = par;
    if (!par) return;
    document.getElementById('input-partido-rival').value = par.rival || '';
    document.getElementById('input-partido-local').checked = par.esLocal !== false;
    document.getElementById('input-partido-escudo-rival').value = par.escudoRival || '';
    document.getElementById('input-partido-fecha').value = par.fecha || '';
    document.getElementById('input-partido-hora').value = par.hora || '';
    document.getElementById('input-partido-lugar').value = par.lugar || '';
    document.getElementById('input-partido-comentarios').value = par.comentarios || '';
    
    const eqId = par.equipoId || equipoIdActivo;
    const jugadoresEquipo = todosLosJugadores.filter(j => j.equipoId === eqId);
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
    document.querySelector('#modal-partido h3').innerText = "Editar Partido / Convocatoria";
    document.getElementById('modal-partido').classList.remove('hidden');
}

function dibujarPartidos() {
    const msgNoEquipo = document.getElementById('msg-no-equipo-partido');
    const btnAddPartido = document.getElementById('btn-open-modal-partido');

    if (!contenedor) return;

    contenedor.classList.remove('hidden');
    if (msgNoEquipo) msgNoEquipo.classList.add('hidden');
    if (btnAddPartido) btnAddPartido.disabled = false;

    const equipoActual = todosLosEquipos.find(eq => eq.id === equipoIdActivo);
    const partidosEquipo = todosLosPartidos || [];

    const ahora = new Date();
    const hoyStr = ahora.toISOString().split('T')[0];
    
    // Convertir fechas para saber cual es el próximo
    const partidosFuturos = partidosEquipo.filter(p => {
        if (!p.fecha) return false;
        const horaStr = p.hora || '00:00';
        return new Date(`${p.fecha}T${horaStr}`) >= ahora;
    });
    const idProximo = partidosFuturos.length > 0 ? partidosFuturos[0].id : null;

    try {
        actualizarEstadisticasDashboard(partidosEquipo, ahora);
    } catch(e) {
        console.warn("Error al actualizar dashboard:", e);
    }

    let partidosToShow = partidosEquipo;
    if (!mostrarHistoricos) {
        partidosToShow = partidosEquipo.filter(p => {
             if (!p.fecha) return true;
             const horaStr = p.hora || '00:00';
             const fechaPartido = new Date(`${p.fecha}T${horaStr}`);
             const isPast = fechaPartido < ahora;
             const isToday = p.fecha === hoyStr;
             return !isPast || isToday;
        });
    }

    if (partidosToShow.length === 0) {
        contenedor.className = 'space-y-4 flex-1 overflow-y-auto overflow-x-hidden pb-6 px-3 -mx-3';
        if (partidosEquipo.length > 0 && !mostrarHistoricos) {
            contenedor.innerHTML = `
                <div class="col-span-full py-12 text-center text-slate-400">
                    <i class="fa-solid fa-clock-rotate-left text-4xl mb-3 text-slate-300 block"></i>
                    <p class="text-base font-medium text-slate-600">No hay partidos próximos programados</p>
                    <p class="text-xs text-slate-400 mt-1">Tienes ${partidosEquipo.length} partido(s) en el historial de este equipo.</p>
                    <button id="btn-empty-ver-historicos" class="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-sm">
                        <i class="fa-solid fa-eye"></i> Ver Partidos Históricos
                    </button>
                </div>
            `;
            document.getElementById('btn-empty-ver-historicos')?.addEventListener('click', () => {
                mostrarHistoricos = true;
                actualizarBotonHistoricos();
                dibujarPartidos();
            });
        } else {
            contenedor.innerHTML = `<div class="col-span-full py-10 text-center text-slate-400">No hay partidos para mostrar</div>`;
        }
        return;
    }

    if (viewModePartidos === 'list') {
        contenedor.className = 'w-full flex-1 overflow-y-auto overflow-x-auto pb-6 px-1';
        contenedor.innerHTML = `
            <div class="min-w-full inline-block align-middle">
                <div class="overflow-hidden border border-slate-200 rounded-xl shadow-sm bg-white">
                    <table class="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-600">
                        <thead class="bg-slate-50 text-slate-700 uppercase text-[11px] font-bold tracking-wider">
                            <tr>
                                <th scope="col" class="px-4 py-3 text-center">Estado</th>
                                <th scope="col" class="px-4 py-3">Fecha / Hora</th>
                                <th scope="col" class="px-4 py-3">Partido</th>
                                <th scope="col" class="px-4 py-3 text-center">Resultado</th>
                                <th scope="col" class="px-4 py-3">Lugar / Condición</th>
                                <th scope="col" class="px-4 py-3 text-center">Plantilla</th>
                                <th scope="col" class="px-4 py-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="table-partidos-body" class="divide-y divide-slate-100 bg-white">
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        const tbody = contenedor.querySelector('#table-partidos-body');

        partidosToShow.forEach(par => {
            try {
                const horaStr = par.hora || '00:00';
                const fechaStr = par.fecha || '';
                const fechaValida = fechaStr ? new Date(`${fechaStr}T${horaStr}`) : null;
                const isPast = fechaValida ? fechaValida < ahora : false;
                const isToday = fechaStr === hoyStr;
                const isNext = par.id === idProximo;
                const isFinalizadoMatch = par.cronometro?.periodo === 'Finalizado' || (isPast && !isToday);

                let actionIcon = '<i class="fa-solid fa-play ml-0.5"></i>';
                let actionTitle = 'Jugar / Ver Directo';
                let actionColorClass = 'bg-emerald-500 hover:bg-emerald-600';

                if (isFinalizadoMatch) {
                    actionIcon = '<i class="fa-solid fa-clipboard-list"></i>';
                    actionTitle = 'Planilla Original';
                    actionColorClass = 'bg-blue-500 hover:bg-blue-600';
                }

                let statusBadge = '';
                let rowClasses = 'hover:bg-slate-50 transition-colors group';

                if (isPast && !isToday) {
                    rowClasses += ' opacity-75 bg-slate-50/40';
                    statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap"><i class="fa-solid fa-flag-checkered mr-1 text-[10px]"></i> Finalizado</span>';
                } else if (isNext) {
                    rowClasses += ' bg-amber-50/20 border-l-4 border-l-amber-500 font-medium';
                    statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-sm whitespace-nowrap"><i class="fa-solid fa-star mr-1 text-[10px] text-amber-600"></i> Próximo</span>';
                } else if (isToday) {
                    rowClasses += ' bg-blue-50/20 border-l-4 border-l-blue-500 font-medium';
                    statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300 whitespace-nowrap"><i class="fa-solid fa-bell mr-1 text-[10px] text-blue-600"></i> Hoy</span>';
                } else {
                    statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap"><i class="fa-regular fa-calendar-check mr-1 text-[10px]"></i> Programado</span>';
                }

                const escudoLocalSm = equipoActual?.escudo ? `<img src="${equipoActual.escudo}" class="w-6 h-6 object-contain rounded-full shrink-0" alt="Local">` : `<div class="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-xs shrink-0"><i class="fa-solid fa-shield"></i></div>`;
                const escudoRivalSm = par.escudoRival ? `<img src="${par.escudoRival}" class="w-6 h-6 object-contain rounded-full shrink-0" alt="Rival">` : `<div class="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-xs shrink-0"><i class="fa-solid fa-shield"></i></div>`;

                const nomLocal = equipoActual?.nombre || 'Mi Equipo';
                const nomRival = par.rival || 'Rival';

                let eqIzdaSm = par.esLocal === false ? escudoRivalSm : escudoLocalSm;
                let eqIzdaNm = par.esLocal === false ? nomRival : nomLocal;
                let eqDchaSm = par.esLocal === false ? escudoLocalSm : escudoRivalSm;
                let eqDchaNm = par.esLocal === false ? nomLocal : nomRival;

                let fechaFormatted = '-';
                if (par.fecha) {
                    if (par.fecha.includes('-')) {
                        fechaFormatted = par.fecha.split('-').reverse().join('/');
                    } else {
                        fechaFormatted = par.fecha;
                    }
                }

                const numConvocados = Array.isArray(par.convocados) ? par.convocados.length : 0;
                const numTitulares = Array.isArray(par.titulares) ? par.titulares.length : 0;

                const tr = document.createElement('tr');
                tr.className = rowClasses;
                tr.innerHTML = `
                    <td class="px-4 py-3 text-center whitespace-nowrap">
                        ${statusBadge}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <div class="font-bold text-slate-800 flex items-center gap-1.5"><i class="fa-regular fa-calendar text-slate-400 text-xs"></i> ${fechaFormatted}</div>
                        <div class="text-xs text-slate-500 font-medium flex items-center gap-1.5 mt-0.5"><i class="fa-regular fa-clock text-slate-400 text-xs"></i> ${par.hora || '--:--'}</div>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <div class="flex items-center gap-2">
                            <div class="flex items-center gap-1.5 ${par.esLocal !== false ? 'text-slate-900 font-extrabold' : 'text-slate-600 font-medium'}">
                                ${eqIzdaSm}
                                <span class="truncate max-w-[130px] sm:max-w-[170px]" title="${eqIzdaNm}">${eqIzdaNm}</span>
                            </div>
                            <span class="text-xs font-bold text-slate-400 px-0.5">vs</span>
                            <div class="flex items-center gap-1.5 ${par.esLocal === false ? 'text-slate-900 font-extrabold' : 'text-slate-600 font-medium'}">
                                ${eqDchaSm}
                                <span class="truncate max-w-[130px] sm:max-w-[170px]" title="${eqDchaNm}">${eqDchaNm}</span>
                            </div>
                        </div>
                    </td>
                    <td class="px-4 py-3 text-center whitespace-nowrap">
                        ${par.resultado ? `<span class="inline-block px-2.5 py-1 bg-blue-50 text-blue-700 font-black rounded-lg border border-blue-200 text-sm">${par.resultado}</span>` : `<span class="text-slate-300 font-bold text-xs">-</span>`}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <div>
                            ${par.esLocal !== false ? '<span class="inline-flex items-center text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded"><i class="fa-solid fa-house text-[10px] mr-1"></i> Local</span>' : '<span class="inline-flex items-center text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded"><i class="fa-solid fa-bus text-[10px] mr-1"></i> Visitante</span>'}
                        </div>
                        ${par.lugar ? `<div class="text-xs text-slate-500 truncate max-w-[160px] mt-0.5" title="${par.lugar}"><i class="fa-solid fa-location-dot text-slate-400 mr-1 text-[10px]"></i>${par.lugar}</div>` : ''}
                    </td>
                    <td class="px-4 py-3 text-center whitespace-nowrap">
                        <div class="inline-flex items-center justify-center gap-3 text-xs text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                            <span title="Convocados" class="flex items-center gap-1"><i class="fa-solid fa-clipboard-user text-amber-500"></i> <b>${numConvocados}</b></span>
                            <span class="text-slate-300">|</span>
                            <span title="Titulares" class="flex items-center gap-1"><i class="fa-solid fa-users text-rose-500"></i> <b>${numTitulares}</b></span>
                        </div>
                    </td>
                    <td class="px-4 py-3 text-right whitespace-nowrap">
                        <div class="flex items-center justify-end gap-1.5">
                            <button class="btn-play-par w-8 h-8 ${actionColorClass} text-white rounded-lg transition-colors shadow-sm flex items-center justify-center text-xs" data-id="${par.id}" title="${actionTitle}">
                                ${actionIcon}
                            </button>
                            ${isFinalizadoMatch ? `<button class="btn-stats-par w-8 h-8 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors shadow-sm flex items-center justify-center text-xs" data-id="${par.id}" title="Estadísticas"><i class="fa-solid fa-chart-simple"></i></button>` : ''}
                            <button class="require-editor btn-edit-par w-8 h-8 bg-white hover:bg-slate-100 text-blue-600 rounded-lg border border-slate-200 shadow-sm transition-colors flex items-center justify-center text-xs" data-id="${par.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
                            <button class="require-editor btn-del-par w-8 h-8 bg-white hover:bg-red-50 text-red-600 rounded-lg border border-slate-200 shadow-sm transition-colors flex items-center justify-center text-xs" data-id="${par.id}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                `;

                bindPartidoEvents(tr, par, isFinalizadoMatch);
                tbody.appendChild(tr);
            } catch(errPar) {
                console.error("Error al renderizar fila de partido:", par, errPar);
            }
        });

    } else {
        // CARDS MODE
        contenedor.className = 'space-y-4 flex-1 overflow-y-auto overflow-x-hidden pb-6 px-3 -mx-3';
        contenedor.innerHTML = '';

        partidosToShow.forEach(par => {
            try {
                const horaStr = par.hora || '00:00';
                const fechaStr = par.fecha || '';
                const fechaValida = fechaStr ? new Date(`${fechaStr}T${horaStr}`) : null;
                const isPast = fechaValida ? fechaValida < ahora : false;
                const isToday = fechaStr === hoyStr;
                const isNext = par.id === idProximo;

                const isFinalizadoMatch = par.cronometro?.periodo === 'Finalizado' || (isPast && !isToday);

                let actionIcon = '<i class="fa-solid fa-play ml-0.5"></i>';
                let actionTitle = 'Jugar / Ver Directo';
                let actionColorClass = 'bg-emerald-500 hover:bg-emerald-600';

                let cardClasses = 'bg-white rounded-xl border p-5 mt-3 relative flex flex-col group transition-all duration-300 hover:shadow-md';
                let statusBadge = '';

                const statsBtn = isFinalizadoMatch ? `<button class="btn-stats-par w-8 h-8 bg-purple-500 hover:bg-purple-600 text-white rounded-full transition-colors shadow-sm focus:outline-none" data-id="${par.id}" title="Estadísticas"><i class="fa-solid fa-chart-simple"></i></button>` : '';

                if (isFinalizadoMatch) {
                    actionIcon = '<i class="fa-solid fa-clipboard-list"></i>';
                    actionTitle = 'Planilla Original';
                    actionColorClass = 'bg-blue-500 hover:bg-blue-600';
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

                let fechaFormatted = '-';
                if (par.fecha) {
                    if (par.fecha.includes('-')) {
                        fechaFormatted = par.fecha.split('-').reverse().join('/');
                    } else {
                        fechaFormatted = par.fecha;
                    }
                }

                const numConvocados = Array.isArray(par.convocados) ? par.convocados.length : 0;
                const numTitulares = Array.isArray(par.titulares) ? par.titulares.length : 0;

                const card = document.createElement('div');
                card.className = cardClasses;
                card.innerHTML = `
                    ${statusBadge}
                    <div class="absolute top-2 left-2 flex gap-1 z-20">
                        <button class="btn-play-par w-8 h-8 ${actionColorClass} text-white rounded-full transition-colors shadow-sm focus:outline-none" data-id="${par.id}" title="${actionTitle}">${actionIcon}</button>
                        ${statsBtn}
                    </div>
                    <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 z-20">
                        <button class="require-editor btn-edit-par w-8 h-8 bg-blue-50 hover:bg-blue-100 text-blue-500 rounded-full transition-colors" data-id="${par.id}" title="Editar Partido"><i class="fa-solid fa-pen"></i></button>
                        <button class="require-editor btn-del-par w-8 h-8 bg-red-50 hover:bg-red-100 text-red-500 rounded-full transition-colors" data-id="${par.id}" title="Eliminar Partido"><i class="fa-solid fa-trash"></i></button>
                    </div>
                    
                    <div class="text-center font-bold text-slate-500 mb-4 mt-2 text-sm flex justify-center items-center gap-2">
                        <i class="fa-regular fa-calendar"></i> ${fechaFormatted} &nbsp;|&nbsp; <i class="fa-regular fa-clock"></i> ${par.hora || '--:--'}
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
                        <span><i class="fa-solid fa-clipboard-user border rounded p-1 mb-1 bg-slate-50"></i> Conv: <b>${numConvocados}</b></span>
                        <span><i class="fa-solid fa-users border rounded p-1 mb-1 bg-slate-50"></i> Tit: <b>${numTitulares}</b></span>
                    </div>
                `;
                
                bindPartidoEvents(card, par, isFinalizadoMatch);
                contenedor.appendChild(card);
            } catch(errPar) {
                console.error("Error al renderizar tarjeta de partido:", par, errPar);
            }
        });
    }
}

async function abrirEstadisticas(par) {
    const modal = document.getElementById('modal-estadisticas');
    if (!modal) return;
    
    currentStatsPartido = par;

    // Fetch efemerides
    modal.classList.remove('hidden');
    document.getElementById('stats-timeline-container').innerHTML = '<div class="text-center p-4"><i class="fa-solid fa-spinner fa-spin text-2xl text-slate-400"></i></div>';
    document.getElementById('stats-global-container').innerHTML = '';
    document.getElementById('stats-players-list').innerHTML = '';
    
    // Match info for PDF and summary
    const equipoActual = todosLosEquipos.find(eq => eq.id === par.equipoId) || { nombre: 'Mi Equipo', escudo: '' };
    const escudoLocal = equipoActual.escudo ? `<img src="${equipoActual.escudo}" class="w-10 h-10 object-contain" alt="Local" crossorigin="anonymous">` : `<div class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><i class="fa-solid fa-shield"></i></div>`;
    const escudoRivalImg = par.escudoRival ? `<img src="${par.escudoRival}" class="w-10 h-10 object-contain" alt="Rival" crossorigin="anonymous">` : `<div class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><i class="fa-solid fa-shield"></i></div>`;
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
        const q = collection(db, 'partidos', par.id, 'efemerides');
        const snap = await getDocs(q);
        snap.forEach(d => efemerides.push({id: d.id, ...d.data()}));
    } catch (e) {
        console.error("Error fetching efemerides:", e);
    }
    
    efemerides.sort(compararEfemeridesAsc);
    const configAcc = par.configAcciones || DEFAULT_ACCIONES;
    
    // Procesar estadisticas
    let golesMios = 0;
    let golesRival = 0;
    let totalAcciones = efemerides.length;
    let positivas = 0;
    
    let statsJugadores = {};
    
    const titulares = (par.titulares || []).filter(id => id && id !== 'undefined' && id !== 'null');
    titulares.forEach(id => {
        statsJugadores[id] = { mins: 0, goles: 0, asis: 0, tPuerta: 0, tFuera: 0, faltasRecibidas: 0, faltasCometidas: 0, amarillas: 0, rojas: 0, pos: 0, neg: 0, scoreValor: 0, entrada: 0, salida: null };
    });
    
    const minFinal = par.cronometro && par.cronometro.tiempoAcumulado ? Math.floor(par.cronometro.tiempoAcumulado / 60000) : 90;
    let distribucion = {};
    let temporalData = {};
    let colorByAcc = {};
    let iconByAcc = {};
    
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
        if (ef.jugadorId && ef.jugadorId !== 'undefined' && ef.jugadorId !== 'null') {
            if (!statsJugadores[ef.jugadorId]) {
                statsJugadores[ef.jugadorId] = { mins: 0, goles: 0, asis: 0, tPuerta: 0, tFuera: 0, faltasRecibidas: 0, faltasCometidas: 0, amarillas: 0, rojas: 0, pos: 0, neg: 0, scoreValor: 0, entrada: null, salida: null };
            }
            if (ef.jugadorNombre && ef.jugadorNombre !== 'undefined') statsJugadores[ef.jugadorId].nombre = ef.jugadorNombre;
            if (ef.jugadorDorsal !== undefined && ef.jugadorDorsal !== null && ef.jugadorDorsal !== 'undefined') statsJugadores[ef.jugadorId].dorsal = ef.jugadorDorsal;
        }

        const eTipoStr = (eTipo || '').toLowerCase();
        const accNomStr = (accNombre || '').toLowerCase();

        if (eTipo === 'asistencia') {
            if (ef.jugadorId && statsJugadores[ef.jugadorId]) statsJugadores[ef.jugadorId].asis++;
        }
        if (eTipoStr === 'tiro-puerta' || accNomStr.includes('tiro a puerta')) {
            if (ef.jugadorId && statsJugadores[ef.jugadorId]) statsJugadores[ef.jugadorId].tPuerta++;
        }
        if (eTipoStr === 'tiro-fuera' || accNomStr.includes('tiro fuera')) {
            if (ef.jugadorId && statsJugadores[ef.jugadorId]) statsJugadores[ef.jugadorId].tFuera++;
        }
        if (eTipoStr === 'falta-recibida' || accNomStr.includes('falta recibida')) {
            if (ef.jugadorId && statsJugadores[ef.jugadorId]) statsJugadores[ef.jugadorId].faltasRecibidas++;
        }
        if (eTipoStr === 'falta-cometida' || accNomStr.includes('falta cometida')) {
            if (ef.jugadorId && statsJugadores[ef.jugadorId]) statsJugadores[ef.jugadorId].faltasCometidas++;
        }
        if (eTipoStr === 'amarilla' || eTipoStr === 'tarjeta-amarilla' || accNomStr.includes('amarilla')) {
            if (ef.jugadorId && statsJugadores[ef.jugadorId]) statsJugadores[ef.jugadorId].amarillas++;
        }
        if (eTipoStr === 'roja' || eTipoStr === 'tarjeta-roja' || accNomStr.includes('roja')) {
            if (ef.jugadorId && statsJugadores[ef.jugadorId]) statsJugadores[ef.jugadorId].rojas++;
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
                    statsJugadores[ef.jugadorEntraId] = { mins: 0, goles: 0, asis: 0, tPuerta: 0, tFuera: 0, faltasRecibidas: 0, faltasCometidas: 0, amarillas: 0, rojas: 0, pos: 0, neg: 0, scoreValor: 0, entrada: minParse, salida: null };
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
    
    currentStatsEfemerides = efemerides;
    currentStatsJugadores = statsJugadores;
    currentStatsConfigAcc = configAcc;
    currentStatsResumen = {
        eqIzdaEscudo,
        eqIzdaNombre,
        eqDchaEscudo,
        eqDchaNombre,
        fechaHora,
        headerHtml,
        golesMios,
        golesRival,
        totalAcciones,
        positivas,
        minFinal
    };

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

    const validPlayerIds = Object.keys(statsJugadores).filter(id => id && id !== 'undefined' && id !== 'null');

    // Totales de tiros y faltas para el partido
    let totalFaltasRecibidas = 0;
    let totalFaltasCometidas = 0;
    let totalTirosPuerta = 0;
    let totalTirosFuera = 0;

    efemerides.forEach(ef => {
        const eTipo = ef.tipo || ef.accionId || '';
        const eTipoStr = (eTipo || '').toLowerCase();
        const accNomStr = (ef.nombre || '').toLowerCase();

        if (eTipoStr === 'falta-recibida' || accNomStr.includes('falta recibida')) totalFaltasRecibidas++;
        if (eTipoStr === 'falta-cometida' || accNomStr.includes('falta cometida')) totalFaltasCometidas++;
        if ((eTipoStr === 'tiro-puerta' || accNomStr.includes('tiro a puerta') || eTipoStr.startsWith('gol-')) && !ef.rival && eTipo !== 'gol-rival') totalTirosPuerta++;
        if ((eTipoStr === 'tiro-fuera' || accNomStr.includes('tiro fuera')) && !ef.rival) totalTirosFuera++;
    });

    const sumFRec = validPlayerIds.reduce((sum, id) => sum + (statsJugadores[id]?.faltasRecibidas || 0), 0);
    const sumFCom = validPlayerIds.reduce((sum, id) => sum + (statsJugadores[id]?.faltasCometidas || 0), 0);
    const sumTPuerta = validPlayerIds.reduce((sum, id) => sum + (statsJugadores[id]?.tPuerta || 0), 0);
    const sumTFuera = validPlayerIds.reduce((sum, id) => sum + (statsJugadores[id]?.tFuera || 0), 0);

    totalFaltasRecibidas = Math.max(totalFaltasRecibidas, sumFRec);
    totalFaltasCometidas = Math.max(totalFaltasCometidas, sumFCom);
    totalTirosPuerta = Math.max(totalTirosPuerta, sumTPuerta);
    totalTirosFuera = Math.max(totalTirosFuera, sumTFuera);

    currentStatsResumen.totalFaltasRecibidas = totalFaltasRecibidas;
    currentStatsResumen.totalFaltasCometidas = totalFaltasCometidas;
    currentStatsResumen.totalTirosPuerta = totalTirosPuerta;
    currentStatsResumen.totalTirosFuera = totalTirosFuera;

    currentStatsChartPayload = {
        distribucionLabels: Object.keys(distribucion),
        distribucionData: Object.values(distribucion),
        temporalData,
        colorByAcc,
        iconByAcc,
        minFinal
    };

    const getTop3Partido = (metricKey) => {
        return validPlayerIds.map(id => {
            const jug = todosLosJugadores.find(j => j.id === id);
            const efJug = efemerides.find(e => e.jugadorId === id);
            let jugNombre = jug?.nombre || efJug?.jugadorNombre || statsJugadores[id]?.nombre || '';
            if (!jugNombre || jugNombre === 'undefined') jugNombre = 'Jugador';
            let jugDorsal = (jug?.dorsal !== undefined && jug?.dorsal !== null) ? jug.dorsal : (efJug?.jugadorDorsal ?? (statsJugadores[id]?.dorsal ?? ''));
            if (jugDorsal === 'undefined') jugDorsal = '';
            return {
                id,
                nombre: jugNombre,
                dorsal: jugDorsal,
                valor: statsJugadores[id][metricKey] || 0
            };
        }).filter(p => p.valor > 0).sort((a,b) => b.valor - a.valor).slice(0, 3);
    };

    const containerTop3Stats = document.getElementById('stats-top3-container');
    if (containerTop3Stats) {
        containerTop3Stats.innerHTML = [
            renderTop3CardHTML(`Faltas Recibidas (${totalFaltasRecibidas})`, 'fa-shield-halved', 'text-blue-500', 'bg-blue-50', getTop3Partido('faltasRecibidas')),
            renderTop3CardHTML(`Faltas Cometidas (${totalFaltasCometidas})`, 'fa-gavel', 'text-amber-600', 'bg-amber-50', getTop3Partido('faltasCometidas')),
            renderTop3CardHTML(`Tiros a Puerta (${totalTirosPuerta})`, 'fa-bullseye', 'text-emerald-500', 'bg-emerald-50', getTop3Partido('tPuerta')),
            renderTop3CardHTML(`Tiros Fuera (${totalTirosFuera})`, 'fa-xmark', 'text-slate-500', 'bg-slate-100', getTop3Partido('tFuera'))
        ].join('');
    }
    
    const jugListHTML = validPlayerIds.map(id => {
        const jug = todosLosJugadores.find(j => j.id === id);
        const efJug = efemerides.find(e => e.jugadorId === id);
        let jugNombre = jug?.nombre || efJug?.jugadorNombre || statsJugadores[id]?.nombre || '';
        if (!jugNombre || jugNombre === 'undefined') jugNombre = 'Jugador';
        let jugDorsal = (jug?.dorsal !== undefined && jug?.dorsal !== null) ? jug.dorsal : (efJug?.jugadorDorsal ?? (statsJugadores[id]?.dorsal ?? '-'));
        if (jugDorsal === 'undefined') jugDorsal = '-';
        const st = statsJugadores[id] || {};
        const mins = st.mins || 0;
        const goles = st.goles || 0;
        const asis = st.asis || 0;
        const tPuerta = st.tPuerta || 0;
        const tFuera = st.tFuera || 0;
        const fRec = st.faltasRecibidas || 0;
        const fCom = st.faltasCometidas || 0;
        const amarillas = st.amarillas || 0;
        const rojas = st.rojas || 0;
        const scoreVal = (typeof st.scoreValor === 'number' && !isNaN(st.scoreValor)) ? st.scoreValor : 0;
        const val = Number(scoreVal % 1 === 0 ? scoreVal : scoreVal.toFixed(2));
        let pColor = val > 0 ? 'text-emerald-500 font-bold' : (val < 0 ? 'text-red-500 font-bold' : 'text-slate-400');
        return `
            <tr class="hover:bg-slate-50 border-b border-slate-50 last:border-0 md:table-row">
                <td class="px-3 py-2 font-medium">#${jugDorsal} ${jugNombre}</td>
                <td class="px-2 py-2 text-center text-slate-600 font-bold">${mins}'</td>
                <td class="px-2 py-2 text-center text-emerald-600 font-bold">${goles}</td>
                <td class="px-2 py-2 text-center text-amber-600 font-bold">${asis}</td>
                <td class="px-2 py-2 text-center text-slate-600 font-bold">${tPuerta}</td>
                <td class="px-2 py-2 text-center text-slate-600 font-bold">${tFuera}</td>
                <td class="px-2 py-2 text-center text-blue-600 font-bold">${fRec}</td>
                <td class="px-2 py-2 text-center text-amber-700 font-bold">${fCom}</td>
                <td class="px-2 py-2 text-center font-bold">
                    ${amarillas > 0 ? `<span class="inline-block px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] mr-1">${amarillas}A</span>` : ''}
                    ${rojas > 0 ? `<span class="inline-block px-1.5 py-0.5 bg-rose-100 text-rose-800 rounded text-[10px]">${rojas}R</span>` : ''}
                    ${amarillas === 0 && rojas === 0 ? '<span class="text-slate-300">-</span>' : ''}
                </td>
                <td class="px-2 py-2 text-center font-bold ${pColor}" title="Valoración: ${val}">${val > 0 ? '+'+val : val}</td>
            </tr>
        `;
    }).join('');
    document.getElementById('stats-players-list').innerHTML = jugListHTML || `<tr><td colspan="10" class="p-4 text-center text-slate-500 text-sm">No hay datos de jugadores</td></tr>`;
    
    let ordenTimelineStats = localStorage.getItem('statsTimelineOrder') || 'asc';

    const renderStatsTimeline = () => {
        const statsTlContainer = document.getElementById('stats-timeline-container');
        if (!statsTlContainer) return;
        
        const sortedEfems = [...efemerides].sort(ordenTimelineStats === 'desc' ? compararEfemeridesDesc : compararEfemeridesAsc);

        const tlHTML = sortedEfems.map(ef => {
             const eTipo = ef.tipo || ef.accionId;
             const acc = configAcc.find(a => a.id === eTipo);
             const icon = ef.icon || (acc ? acc.icon : 'fa-bolt');
             const cl = ef.color || (acc ? acc.color : 'text-slate-500');
             const text = ef.nombre || (acc ? acc.nombre : eTipo);
             
             const tInfo = extraerTiempoEfemeride(ef);
             const minText = formatearTiempoAnotado(tInfo.min, tInfo.sec);
             const periodoBadge = ef.periodo ? `<span class="text-[10px] font-semibold text-slate-400 ml-1.5 uppercase tracking-wider">(${ef.periodo})</span>` : '';
             
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
                    <div class="bg-white border rounded-lg p-2 text-sm shadow-sm hover:shadow transition-shadow flex items-start justify-between">
                        <div class="flex-1 min-w-0 pr-2">
                            <span class="font-bold text-slate-700">${minText}</span>${periodoBadge} - <span class="font-semibold ${cl}">${text}</span>
                            ${subText ? `<div class="text-xs text-slate-500 mt-1"><i class="fa-regular fa-user mr-1"></i> ${subText}</div>` : ''}
                            ${ef.nota ? `<div class="text-xs text-slate-400 italic mt-0.5"><i class="fa-regular fa-comment mr-1"></i> ${ef.nota}</div>` : ''}
                        </div>
                        <div class="flex items-center gap-1 shrink-0">
                            <button class="require-editor btn-edit-efemeride-stats text-slate-400 hover:text-blue-600 p-1.5 rounded hover:bg-slate-100 transition-colors" data-id="${ef.id}" title="Editar Acción"><i class="fa-solid fa-pen text-xs"></i></button>
                            <button class="require-editor btn-del-efemeride-stats text-slate-400 hover:text-rose-600 p-1.5 rounded hover:bg-slate-100 transition-colors" data-id="${ef.id}" title="Eliminar Acción"><i class="fa-solid fa-trash text-xs"></i></button>
                        </div>
                    </div>
                 </div>
             `;
        }).join('');
        
        statsTlContainer.innerHTML = tlHTML || `<div class="text-slate-500 text-sm text-center mt-4">No hay eventos registrados</div>`;

        statsTlContainer.querySelectorAll('.btn-edit-efemeride-stats').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const id = ev.currentTarget.getAttribute('data-id');
                const efTarget = efemerides.find(e => e.id === id);
                if (efTarget) {
                    abrirModalAccionPartido(par, efTarget, () => abrirEstadisticas(par));
                }
            });
        });

        statsTlContainer.querySelectorAll('.btn-del-efemeride-stats').forEach(btn => {
            btn.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                const id = ev.currentTarget.getAttribute('data-id');
                if (await confirmarAccion("¿Eliminar este registro de acción?")) {
                    try {
                        await deleteDoc(doc(db, 'partidos', par.id, 'efemerides', id));
                        await recalcularResultadoPartido(par.id);
                        mostrarNotificacion("Acción eliminada");
                        abrirEstadisticas(par);
                    } catch(err) {
                        console.error("Error al eliminar acción:", err);
                        mostrarNotificacion("Error al eliminar acción", true);
                    }
                }
            });
        });
    };

    renderStatsTimeline();

    const btnToggleOrden = document.getElementById('btn-toggle-orden-stats');
    const lblOrden = document.getElementById('lbl-orden-stats');
    const iconOrden = document.getElementById('icon-orden-stats');
    const updateToggleUI = () => {
        if (lblOrden) lblOrden.innerText = ordenTimelineStats === 'desc' ? "90' ➔ 1'" : "1' ➔ 90'";
        if (iconOrden) {
            iconOrden.className = ordenTimelineStats === 'desc' ? "fa-solid fa-arrow-down-9-1 text-blue-600" : "fa-solid fa-arrow-down-1-9 text-blue-600";
        }
    };
    updateToggleUI();
    if (btnToggleOrden) {
        btnToggleOrden.onclick = () => {
            ordenTimelineStats = ordenTimelineStats === 'asc' ? 'desc' : 'asc';
            localStorage.setItem('statsTimelineOrder', ordenTimelineStats);
            updateToggleUI();
            renderStatsTimeline();
        };
    }

    const btnAddStats = document.getElementById('btn-add-accion-stats');
    if (btnAddStats) {
        btnAddStats.onclick = () => {
            abrirModalAccionPartido(par, null, () => abrirEstadisticas(par));
        };
    }
    
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
            
            if (temporalCanvas && Object.keys(temporalData).length > 0) {
                try {
                    const tDatasets = Object.keys(temporalData).map(accKey => {
                        const color = colorByAcc[accKey] || '#2563eb';
                        return {
                            label: accKey,
                            data: temporalData[accKey],
                            pointStyle: getIconCanvas(iconByAcc[accKey] || 'fa-circle', color),
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
                } catch (tempErr) {
                    console.error("Error inicializando temporalChartInstance:", tempErr);
                }
            }
        }
    } else {
        wrapper.classList.add('hidden');
        if (temporalWrapper) temporalWrapper.classList.add('hidden');
    }
}

export async function recalcularResultadoPartido(partidoId) {
    try {
        const snap = await getDocs(collection(db, 'partidos', partidoId, 'efemerides'));
        let golesMios = 0;
        let golesRival = 0;
        snap.forEach(d => {
            const data = d.data();
            const tipo = data.tipo || data.accionId;
            if (tipo && typeof tipo === 'string' && tipo.startsWith('gol-')) {
                if (tipo === 'gol-rival') {
                    golesRival++;
                } else {
                    golesMios++;
                }
            }
        });

        const parEnMemoria = todosLosPartidos.find(p => p.id === partidoId);
        let esLocal = true;
        if (parEnMemoria) {
            esLocal = parEnMemoria.esLocal !== false;
        } else {
            const pDoc = await getDoc(doc(db, 'partidos', partidoId));
            if (pDoc.exists()) esLocal = pDoc.data().esLocal !== false;
        }

        const resultadoStr = esLocal ? `${golesMios} - ${golesRival}` : `${golesRival} - ${golesMios}`;
        await updateDoc(doc(db, 'partidos', partidoId), { resultado: resultadoStr });
        if (parEnMemoria) parEnMemoria.resultado = resultadoStr;
    } catch(err) {
        console.error("Error al recalcular resultado:", err);
    }
}

export function abrirModalAccionPartido(par, efemeride = null, onSaved = null) {
    const modal = document.getElementById('modal-accion-partido');
    if (!modal || !par) return;

    const tituloEl = document.getElementById('titulo-modal-accion-partido');
    const btnEquipoMio = document.getElementById('btn-accion-equipo-mio');
    const btnEquipoRival = document.getElementById('btn-accion-equipo-rival');
    const selectTipo = document.getElementById('select-accion-tipo');
    const containerJugPrincipal = document.getElementById('container-accion-jugador-principal');
    const selectJugador = document.getElementById('select-accion-jugador');
    const containerJugRival = document.getElementById('container-accion-jugador-rival');
    const inputJugRival = document.getElementById('input-accion-jugador-rival');
    const containerSustitucion = document.getElementById('container-accion-sustitucion');
    const selectJugSale = document.getElementById('select-accion-jugador-sale');
    const selectJugEntra = document.getElementById('select-accion-jugador-entra');
    const containerAsistencia = document.getElementById('container-accion-asistencia');
    const selectAsistente = document.getElementById('select-accion-asistente');
    const inputMinuto = document.getElementById('input-accion-minuto');
    const inputSegundo = document.getElementById('input-accion-segundo');
    const selectPeriodo = document.getElementById('select-accion-periodo');
    const inputNota = document.getElementById('input-accion-nota');

    const configAcc = par.configAcciones || DEFAULT_ACCIONES;
    const configRival = par.configAccionesRival || DEFAULT_ACCIONES_RIVAL;

    const eqId = par.equipoId || equipoIdActivo;
    const jugadoresEquipo = todosLosJugadores.filter(j => j.equipoId === eqId);
    jugadoresEquipo.sort((a,b) => (parseInt(a.dorsal)||0) - (parseInt(b.dorsal)||0));
    const convocados = par.convocados || [];

    const populateJugadoresSelect = (selectEl, defaultId = '', includeEmpty = false, emptyText = '-- Seleccionar jugador --') => {
        let opts = includeEmpty ? `<option value="">${emptyText}</option>` : '';
        jugadoresEquipo.forEach(j => {
            const esConv = convocados.includes(j.id);
            const tag = esConv ? ' (Convocado)' : '';
            opts += `<option value="${j.id}" ${j.id === defaultId ? 'selected' : ''}>#${j.dorsal || '?'} ${j.nombre}${tag}</option>`;
        });
        selectEl.innerHTML = opts;
    };

    let ambitoEquipo = 'mio';

    if (efemeride) {
        const eTipo = efemeride.tipo || efemeride.accionId || '';
        if (eTipo.includes('rival') || (!efemeride.jugadorId && !efemeride.jugadorNombre)) {
            ambitoEquipo = 'rival';
        } else {
            ambitoEquipo = 'mio';
        }
    }

    const updateAccionesSelect = () => {
        if (ambitoEquipo === 'mio') {
            btnEquipoMio.className = "py-2 text-xs font-bold rounded-md transition-all bg-white text-slate-800 shadow-sm border border-slate-200";
            btnEquipoRival.className = "py-2 text-xs font-bold rounded-md transition-all text-slate-600 hover:text-slate-800";
            containerJugPrincipal.classList.remove('hidden');
            containerJugRival.classList.add('hidden');

            selectTipo.innerHTML = configAcc.filter(a => a.isActive !== false).map(a => `
                <option value="${a.id}">${a.nombre}</option>
            `).join('');
        } else {
            btnEquipoRival.className = "py-2 text-xs font-bold rounded-md transition-all bg-white text-rose-700 shadow-sm border border-slate-200";
            btnEquipoMio.className = "py-2 text-xs font-bold rounded-md transition-all text-slate-600 hover:text-slate-800";
            containerJugPrincipal.classList.add('hidden');
            containerJugRival.classList.remove('hidden');

            const rivalIds = configRival.map(r => r.id);
            let combinedRival = [...configRival];
            [
                { id: 'gol-rival', nombre: 'Gol Rival' },
                { id: 'tiro-rival', nombre: 'Tiro Rival' },
                { id: 'falta-rival', nombre: 'Falta Rival' },
                { id: 'amarilla-rival', nombre: 'Tarjeta Amarilla Rival' },
                { id: 'roja-rival', nombre: 'Tarjeta Roja Rival' }
            ].forEach(defR => {
                if (!rivalIds.includes(defR.id)) combinedRival.push(defR);
            });

            selectTipo.innerHTML = combinedRival.map(a => `
                <option value="${a.id}">${a.nombre}</option>
            `).join('');
        }
        updateFormVisibility();
    };

    const updateFormVisibility = () => {
        const t = selectTipo.value;
        const isSust = (t === 'sustitucion' || t === 'sustitucion-lesion');
        const isGolMio = ambitoEquipo === 'mio' && typeof t === 'string' && t.startsWith('gol-') && t !== 'gol-rival';

        if (ambitoEquipo === 'mio') {
            if (isSust) {
                containerSustitucion.classList.remove('hidden');
                containerJugPrincipal.classList.add('hidden');
            } else {
                containerSustitucion.classList.add('hidden');
                containerJugPrincipal.classList.remove('hidden');
            }

            if (isGolMio) {
                containerAsistencia.classList.remove('hidden');
            } else {
                containerAsistencia.classList.add('hidden');
            }
        } else {
            containerSustitucion.classList.add('hidden');
            containerAsistencia.classList.add('hidden');
        }
    };

    btnEquipoMio.onclick = () => {
        ambitoEquipo = 'mio';
        updateAccionesSelect();
    };
    btnEquipoRival.onclick = () => {
        ambitoEquipo = 'rival';
        updateAccionesSelect();
    };
    selectTipo.onchange = updateFormVisibility;

    populateJugadoresSelect(selectJugador, efemeride?.jugadorId || '');
    populateJugadoresSelect(selectJugSale, efemeride?.jugadorId || '', true, '-- Jugador que sale --');
    populateJugadoresSelect(selectJugEntra, efemeride?.jugadorEntraId || '', true, '-- Jugador que entra --');
    populateJugadoresSelect(selectAsistente, efemeride?.asistenteId || '', true, '-- Sin asistencia / Jugada individual --');

    updateAccionesSelect();

    if (efemeride) {
        tituloEl.innerHTML = `<i class="fa-solid fa-pen-to-square mr-2 text-blue-600"></i> Editar Acción`;
        modal.dataset.editId = efemeride.id;
        
        const eTipo = efemeride.tipo || efemeride.accionId;
        if (eTipo) {
            selectTipo.value = eTipo;
        }
        updateFormVisibility();

        if (efemeride.jugadorId) {
            selectJugador.value = efemeride.jugadorId;
            selectJugSale.value = efemeride.jugadorId;
        }
        if (efemeride.jugadorEntraId) {
            selectJugEntra.value = efemeride.jugadorEntraId;
        }
        if (efemeride.asistenteId) {
            selectAsistente.value = efemeride.asistenteId;
        }
        if (efemeride.jugadorRival || efemeride.jugadorNombre) {
            inputJugRival.value = efemeride.jugadorRival || (ambitoEquipo === 'rival' ? efemeride.jugadorNombre : '');
        } else {
            inputJugRival.value = '';
        }

        const tInfo = extraerTiempoEfemeride(efemeride);
        inputMinuto.value = tInfo.min;
        if (inputSegundo) inputSegundo.value = String(tInfo.sec).padStart(2, '0');
        selectPeriodo.value = efemeride.periodo || (tInfo.min > 45 ? '2ª Parte' : '1ª Parte');
        inputNota.value = efemeride.nota || '';
    } else {
        tituloEl.innerHTML = `<i class="fa-solid fa-bolt mr-2 text-blue-600"></i> Añadir Acción`;
        delete modal.dataset.editId;
        inputJugRival.value = '';
        inputNota.value = '';
        
        let minSugerido = 0;
        let secSugerido = 0;
        let perSugerido = '1ª Parte';
        if (par.cronometro) {
            if (par.cronometro.periodo) perSugerido = par.cronometro.periodo;
            let msActuales = par.cronometro.tiempoAcumulado || 0;
            if (par.cronometro.estado === 'corriendo' && par.cronometro.ultimoInicioTimer) {
                msActuales += (Date.now() - par.cronometro.ultimoInicioTimer);
            }
            if (msActuales > 0) {
                const totalSecs = Math.floor(msActuales / 1000);
                minSugerido = Math.floor(totalSecs / 60);
                secSugerido = totalSecs % 60;
            }
        }
        inputMinuto.value = minSugerido;
        if (inputSegundo) inputSegundo.value = String(secSugerido).padStart(2, '0');
        selectPeriodo.value = perSugerido;
        updateFormVisibility();
    }

    inputMinuto.oninput = () => {
        const val = parseInt(inputMinuto.value, 10);
        if (val > 45 && selectPeriodo.value === '1ª Parte') {
            selectPeriodo.value = '2ª Parte';
        } else if (val <= 45 && selectPeriodo.value === '2ª Parte' && !efemeride) {
            selectPeriodo.value = '1ª Parte';
        }
    };

    if (inputSegundo) {
        inputSegundo.onchange = () => {
            let val = parseInt(inputSegundo.value, 10) || 0;
            if (val < 0) val = 0;
            if (val > 59) val = 59;
            inputSegundo.value = String(val).padStart(2, '0');
        };
    }

    const closeModalAccion = () => {
        modal.classList.add('hidden');
        delete modal.dataset.editId;
    };

    document.getElementById('btn-close-modal-accion-partido').onclick = closeModalAccion;
    document.getElementById('btn-cancel-modal-accion-partido').onclick = closeModalAccion;

    document.getElementById('btn-save-modal-accion-partido').onclick = async () => {
        const tipoId = selectTipo.value;
        if (!tipoId) return alert("Selecciona un tipo de acción.");

        const isSust = (tipoId === 'sustitucion' || tipoId === 'sustitucion-lesion');
        const minVal = Math.max(0, parseInt(inputMinuto.value, 10) || 0);
        let segVal = inputSegundo ? parseInt(inputSegundo.value, 10) || 0 : 0;
        if (isNaN(segVal) || segVal < 0) segVal = 0;
        if (segVal > 59) segVal = 59;
        if (inputSegundo) inputSegundo.value = String(segVal).padStart(2, '0');

        const tiempoStr = formatearTiempoAnotado(minVal, segVal);
        const totalMs = (minVal * 60 + segVal) * 1000;
        const periodoVal = selectPeriodo.value || '1ª Parte';
        const notaVal = inputNota.value.trim();

        const allAccs = [...configAcc, ...configRival, ...DEFAULT_ACCIONES, ...DEFAULT_ACCIONES_RIVAL];
        const accDef = allAccs.find(a => a.id === tipoId) || {
            id: tipoId,
            nombre: tipoId,
            icon: tipoId.includes('gol') ? 'fa-futbol' : (tipoId.includes('tarjeta') || tipoId.includes('amarilla') || tipoId.includes('roja') ? 'fa-square' : 'fa-bolt'),
            color: tipoId.includes('gol') ? 'text-emerald-500' : (tipoId.includes('roja') ? 'text-red-500' : (tipoId.includes('amarilla') ? 'text-amber-500' : 'text-slate-500'))
        };

        const eData = {
            tipo: tipoId,
            nombre: accDef.nombre,
            icon: accDef.icon || 'fa-bolt',
            color: accDef.color || 'text-slate-500',
            periodo: periodoVal,
            minuto: minVal,
            segundo: segVal,
            minutoMs: totalMs,
            tiempoAnotado: tiempoStr,
            creadoPor: auth.currentUser ? auth.currentUser.uid : 'anon',
            timestamp: efemeride?.timestamp || Date.now()
        };

        if (notaVal) eData.nota = notaVal;

        if (ambitoEquipo === 'mio') {
            if (isSust) {
                const jSaleId = selectJugSale.value;
                const jEntraId = selectJugEntra.value;
                if (!jSaleId || !jEntraId) return alert("Selecciona el jugador que sale y el jugador que entra.");
                if (jSaleId === jEntraId) return alert("El jugador que sale no puede ser el mismo que entra.");

                const jSale = todosLosJugadores.find(j => j.id === jSaleId);
                const jEntra = todosLosJugadores.find(j => j.id === jEntraId);

                eData.jugadorId = jSaleId;
                eData.jugadorNombre = jSale?.nombre || '';
                eData.jugadorDorsal = jSale?.dorsal || '';
                eData.jugadorEntraId = jEntraId;
                eData.jugadorEntraNombre = jEntra?.nombre || '';
                eData.jugadorEntraDorsal = jEntra?.dorsal || '';
            } else {
                const jId = selectJugador.value;
                if (!jId) return alert("Selecciona un jugador.");
                const jInfo = todosLosJugadores.find(j => j.id === jId);
                eData.jugadorId = jId;
                eData.jugadorNombre = jInfo?.nombre || '';
                eData.jugadorDorsal = jInfo?.dorsal || '';

                if (accDef.isPositive !== undefined) eData.isPositive = accDef.isPositive;
                if (accDef.score !== undefined) eData.score = accDef.score;

                const asisId = selectAsistente.value;
                if (asisId && typeof tipoId === 'string' && tipoId.startsWith('gol-')) {
                    const asisJug = todosLosJugadores.find(j => j.id === asisId);
                    eData.asistenteId = asisId;
                    eData.asistenteNombre = asisJug?.nombre || '';
                }
            }
        } else {
            const nomRivalJug = inputJugRival.value.trim();
            if (nomRivalJug) {
                eData.jugadorNombre = nomRivalJug;
                eData.jugadorRival = nomRivalJug;
            } else {
                eData.jugadorNombre = 'Rival';
            }
        }

        try {
            const editId = modal.dataset.editId;
            if (editId) {
                await updateDoc(doc(db, 'partidos', par.id, 'efemerides', editId), eData);
                mostrarNotificacion("Acción actualizada");
            } else {
                await addDoc(collection(db, 'partidos', par.id, 'efemerides'), eData);
                
                if (eData.asistenteId && typeof tipoId === 'string' && tipoId.startsWith('gol-')) {
                    const asisJug = todosLosJugadores.find(j => j.id === eData.asistenteId);
                    const asisDef = allAccs.find(a => a.id === 'asistencia') || { nombre: 'Asistencia', icon: 'fa-handshake', color: 'text-blue-500', isPositive: true, score: 2 };
                    await addDoc(collection(db, 'partidos', par.id, 'efemerides'), {
                        tipo: 'asistencia',
                        nombre: asisDef.nombre,
                        icon: asisDef.icon,
                        color: asisDef.color,
                        periodo: periodoVal,
                        minuto: minVal,
                        segundo: segVal,
                        minutoMs: totalMs,
                        tiempoAnotado: tiempoStr,
                        jugadorId: asisJug?.id,
                        jugadorNombre: asisJug?.nombre || '',
                        jugadorDorsal: asisJug?.dorsal || '',
                        timestamp: Date.now() + 10,
                        creadoPor: auth.currentUser ? auth.currentUser.uid : 'anon',
                        nota: `Para el gol de ${eData.jugadorNombre}`
                    });
                }

                mostrarNotificacion("Acción añadida");
            }

            await recalcularResultadoPartido(par.id);

            closeModalAccion();

            if (typeof onSaved === 'function') {
                onSaved();
            }
        } catch(err) {
            console.error("Error al guardar acción:", err);
            mostrarNotificacion("Error al guardar acción", true);
        }
    };

    modal.classList.remove('hidden');
}

export async function actualizarEstadisticasDashboard(partidos, ahora = new Date()) {
    const cardChart = document.getElementById('dash-chart-card');
    const badgePartidos = document.getElementById('dash-partidos-count-badge');
    const containerTop3 = document.getElementById('dash-top3-container');
    const containerTarjetas = document.getElementById('dash-tarjetas-container');

    const ahoraMs = ahora.getTime();
    const hoyStr = ahora.toISOString().split('T')[0];

    // 1. Actualizar ficha de PRÓXIMO PARTIDO en el Dashboard
    const elProxPartido = document.getElementById('dash-proximo-partido');
    const elProxPartidoSub = document.getElementById('dash-proximo-partido-sub');
    const partidosFuturos = (partidos || []).filter(p => {
        if (!p.fecha) return false;
        const horaStr = p.hora || '00:00';
        return new Date(`${p.fecha}T${horaStr}`) >= ahora;
    }).sort((a, b) => new Date(`${a.fecha}T${a.hora || '00:00'}`) - new Date(`${b.fecha}T${b.hora || '00:00'}`));

    if (elProxPartido) {
        if (partidosFuturos.length > 0) {
            const prox = partidosFuturos[0];
            const eqAct = todosLosEquipos.find(eq => eq.id === (prox.equipoId || equipoIdActivo));
            const nomMiEquipo = eqAct?.nombre || 'Mi Equipo';
            const nomRival = prox.rival || 'Rival';
            const esLoc = prox.esLocal !== false;
            const vsTexto = esLoc ? `${nomMiEquipo} vs ${nomRival}` : `${nomRival} vs ${nomMiEquipo}`;
            const fechaFormateada = prox.fecha.split('-').reverse().join('/');
            
            elProxPartido.innerText = prox.rival ? (esLoc ? `vs ${nomRival}` : `@ ${nomRival}`) : vsTexto;
            elProxPartido.setAttribute('title', vsTexto);
            if (elProxPartidoSub) {
                elProxPartidoSub.innerHTML = `<i class="fa-regular fa-clock mr-1 text-amber-500"></i>${fechaFormateada} - ${prox.hora || 'Por definir'}${prox.lugar ? ` (${prox.lugar})` : ''}`;
            }
        } else {
            elProxPartido.innerText = "Sin programar";
            if (elProxPartidoSub) elProxPartidoSub.innerText = "No hay partidos futuros";
        }
    }

    // 2. Filtrar partidos jugados hasta la fecha (finalizados o cuya fecha/hora ya ha pasado)
    const partidosJugados = (partidos || []).filter(p => {
        if (p.cronometro?.periodo === 'Finalizado') return true;
        if (!p.fecha) return false;
        const hStr = p.hora || '00:00';
        const d = new Date(`${p.fecha}T${hStr}`);
        return d < ahora;
    });

    const numPartidosJugados = partidosJugados.length;
    if (badgePartidos) {
        badgePartidos.innerText = `${numPartidosJugados} partido${numPartidosJugados === 1 ? '' : 's'} jugado${numPartidosJugados === 1 ? '' : 's'}`;
    }

    // Inicializar acumulación global de jugadores del equipo activo
    const eqId = equipoIdActivo;
    const jugadoresEquipo = todosLosJugadores.filter(j => j.equipoId === eqId);
    let statsGlobales = {};
    jugadoresEquipo.forEach(j => {
        statsGlobales[j.id] = {
            id: j.id,
            nombre: j.nombre,
            dorsal: j.dorsal || '',
            posicion: j.posicion || '',
            faltasRecibidas: 0,
            faltasCometidas: 0,
            tPuerta: 0,
            tFuera: 0,
            amarillas: 0,
            rojas: 0
        };
    });

    try {
        // Fetch efemérides de los partidos jugados hasta la fecha
        const efemPromises = partidosJugados.map(p => getDocs(collection(db, 'partidos', p.id, 'efemerides')));
        const snaps = await Promise.all(efemPromises);

        let distribucionUltimo = {};
        let distribucionTodos = {};

        // Identificar último partido finalizado para el gráfico
        const finalizadosOrdenados = [...partidosJugados].sort((a,b) => new Date(`${b.fecha}T${b.hora || '00:00'}`) - new Date(`${a.fecha}T${a.hora || '00:00'}`));
        const ultimoPartido = finalizadosOrdenados[0];

        snaps.forEach((snap, idx) => {
            const partidoActual = partidosJugados[idx];
            const esUltimo = ultimoPartido && partidoActual.id === ultimoPartido.id;
            const pConfigAcc = partidoActual.configAcciones || DEFAULT_ACCIONES;

            snap.forEach(d => {
                const data = d.data();
                const jId = data.jugadorId;
                const eTipo = (data.tipo || data.accionId || '').toLowerCase();
                const accInfo = pConfigAcc ? pConfigAcc.find(a => a.id === eTipo) : null;
                const accNombre = data.nombre || (accInfo ? accInfo.nombre : eTipo);

                if (accInfo || accNombre) {
                    if (esUltimo) {
                        distribucionUltimo[accNombre] = (distribucionUltimo[accNombre] || 0) + 1;
                    }
                    distribucionTodos[accNombre] = (distribucionTodos[accNombre] || 0) + 1;
                }

                if (jId) {
                    if (!statsGlobales[jId]) {
                        const jug = todosLosJugadores.find(x => x.id === jId);
                        statsGlobales[jId] = {
                            id: jId,
                            nombre: data.jugadorNombre || jug?.nombre || 'Desconocido',
                            dorsal: data.jugadorDorsal || jug?.dorsal || '',
                            posicion: jug?.posicion || '',
                            faltasRecibidas: 0,
                            faltasCometidas: 0,
                            tPuerta: 0,
                            tFuera: 0,
                            amarillas: 0,
                            rojas: 0
                        };
                    }

                    const sg = statsGlobales[jId];
                    const nomStr = (data.nombre || '').toLowerCase();

                    if (eTipo === 'falta-recibida' || nomStr.includes('falta recibida')) {
                        sg.faltasRecibidas++;
                    } else if (eTipo === 'falta-cometida' || nomStr.includes('falta cometida')) {
                        sg.faltasCometidas++;
                    } else if (eTipo === 'tiro-puerta' || nomStr.includes('tiro a puerta')) {
                        sg.tPuerta++;
                    } else if (eTipo === 'tiro-fuera' || nomStr.includes('tiro fuera')) {
                        sg.tFuera++;
                    } else if (eTipo === 'amarilla' || eTipo === 'tarjeta-amarilla' || nomStr.includes('amarilla')) {
                        sg.amarillas++;
                    } else if (eTipo === 'roja' || eTipo === 'tarjeta-roja' || nomStr.includes('roja')) {
                        sg.rojas++;
                    }
                }
            });
        });

        // 1. Render TOP 5 Líderes en Dashboard con total y media por partidos jugados
        if (containerTop3) {
            const divisorPartidos = Math.max(1, numPartidosJugados);
            const getTop5 = (key) => Object.values(statsGlobales)
                .filter(p => p[key] > 0)
                .sort((a, b) => b[key] - a[key])
                .slice(0, 5)
                .map(p => ({
                    id: p.id,
                    nombre: p.nombre,
                    dorsal: p.dorsal,
                    valor: p[key],
                    media: (p[key] / divisorPartidos).toFixed(1)
                }));

            containerTop3.innerHTML = [
                renderTop3CardHTML('Faltas Recibidas', 'fa-shield-halved', 'text-blue-500', 'bg-blue-50', getTop5('faltasRecibidas')),
                renderTop3CardHTML('Faltas Cometidas', 'fa-gavel', 'text-amber-600', 'bg-amber-50', getTop5('faltasCometidas')),
                renderTop3CardHTML('Tiros a Puerta', 'fa-bullseye', 'text-emerald-500', 'bg-emerald-50', getTop5('tPuerta')),
                renderTop3CardHTML('Tiros Fuera', 'fa-xmark', 'text-slate-500', 'bg-slate-100', getTop5('tFuera'))
            ].join('');
        }

        // 2. Render Tabla de Tarjetas y Disciplina en Dashboard
        if (containerTarjetas) {
            const jugadoresConTarjetas = Object.values(statsGlobales)
                .filter(p => p.amarillas > 0 || p.rojas > 0)
                .sort((a, b) => (b.rojas * 3 + b.amarillas) - (a.rojas * 3 + a.amarillas));

            if (jugadoresConTarjetas.length === 0) {
                containerTarjetas.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        <div class="w-12 h-12 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center text-xl mb-2">
                            <i class="fa-solid fa-shield-heart"></i>
                        </div>
                        <p class="font-bold text-slate-700 text-sm">¡Fair Play Impecable!</p>
                        <p class="text-xs text-slate-500 mt-0.5">Ningún jugador tiene tarjetas amarillas o rojas registradas en los partidos del equipo.</p>
                    </div>
                `;
            } else {
                containerTarjetas.innerHTML = `
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm text-left">
                            <thead class="text-xs text-slate-500 uppercase bg-slate-50 whitespace-nowrap">
                                <tr>
                                    <th class="px-4 py-2.5 rounded-l-lg font-bold">Jugador</th>
                                    <th class="px-3 py-2.5 text-center font-bold">
                                        <span class="inline-flex items-center gap-1.5 text-amber-600">
                                            <span class="w-3 h-4 bg-amber-400 rounded-xs border border-amber-500 shadow-xs inline-block"></span> Amarillas
                                        </span>
                                    </th>
                                    <th class="px-3 py-2.5 text-center font-bold">
                                        <span class="inline-flex items-center gap-1.5 text-rose-600">
                                            <span class="w-3 h-4 bg-rose-600 rounded-xs border border-rose-700 shadow-xs inline-block"></span> Rojas
                                        </span>
                                    </th>
                                    <th class="px-3 py-2.5 text-center font-bold text-slate-700">Total Tarjetas</th>
                                    <th class="px-4 py-2.5 rounded-r-lg text-center font-bold">Estado / Sanción</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 whitespace-nowrap">
                                ${jugadoresConTarjetas.map(j => {
                                    let badgeEstado = '<span class="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[11px] font-medium">Activo</span>';
                                    if (j.amarillas >= 5) {
                                        badgeEstado = `<span class="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md text-[11px] font-bold">Ciclo cumplido (${Math.floor(j.amarillas / 5)})</span>`;
                                    } else if (j.amarillas === 4) {
                                        badgeEstado = '<span class="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-md text-[11px] font-bold animate-pulse">Apercibido (4)</span>';
                                    } else if (j.rojas > 0) {
                                        badgeEstado = `<span class="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-md text-[11px] font-bold">Expulsión (${j.rojas})</span>`;
                                    }
                                    return `
                                        <tr class="hover:bg-slate-50 transition-colors">
                                            <td class="px-4 py-2.5">
                                                <div class="flex items-center gap-2">
                                                    <span class="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                                                        ${j.dorsal || '-'}
                                                    </span>
                                                    <div>
                                                        <span class="font-bold text-slate-800 text-sm">${j.nombre}</span>
                                                        ${j.posicion ? `<span class="text-xs text-slate-400 ml-1">(${j.posicion})</span>` : ''}
                                                    </div>
                                                </div>
                                            </td>
                                            <td class="px-3 py-2.5 text-center">
                                                <span class="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full ${j.amarillas > 0 ? 'bg-amber-100 text-amber-800 font-black' : 'text-slate-400'} text-xs">
                                                    ${j.amarillas}
                                                </span>
                                            </td>
                                            <td class="px-3 py-2.5 text-center">
                                                <span class="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full ${j.rojas > 0 ? 'bg-rose-100 text-rose-800 font-black' : 'text-slate-400'} text-xs">
                                                    ${j.rojas}
                                                </span>
                                            </td>
                                            <td class="px-3 py-2.5 text-center font-black text-slate-800 text-sm">
                                                ${j.amarillas + j.rojas}
                                            </td>
                                            <td class="px-4 py-2.5 text-center">
                                                ${badgeEstado}
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }
        }

        // 3. Render Gráfico de Rendimiento (si hay último partido)
        if (!cardChart) return;
        if (!ultimoPartido) {
            cardChart.classList.add('hidden');
            return;
        }

        document.getElementById('dash-chart-title').innerText = `Último Partido: ${ultimoPartido.esLocal === false ? ultimoPartido.rival + ' - Mi Eq.' : 'Mi Eq. - ' + ultimoPartido.rival}`;

        const numPartidosMedia = finalizados.slice(0, 20).length || 1;
        let allKeys = Array.from(new Set([...Object.keys(distribucionUltimo), ...Object.keys(distribucionTodos)]));
        allKeys = allKeys.filter(k => (distribucionUltimo[k] || 0) > 0 || ((distribucionTodos[k] || 0) / numPartidosMedia) >= 0.5);

        if (allKeys.length > 0) {
            cardChart.classList.remove('hidden');
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
                        labels: allKeys,
                        datasets: [
                            {
                                label: 'Último partido',
                                data: allKeys.map(k => distribucionUltimo[k] || 0),
                                backgroundColor: 'rgba(16, 185, 129, 0.7)',
                                borderColor: 'rgb(5, 150, 105)',
                                borderWidth: 1,
                                borderRadius: 4,
                                order: 2
                            },
                            {
                                label: `Media (${numPartidosMedia} part.)`,
                                data: allKeys.map(k => Number(((distribucionTodos[k] || 0) / numPartidosMedia).toFixed(1))),
                                type: 'line',
                                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                borderColor: 'rgb(59, 130, 246)',
                                borderWidth: 2,
                                pointBackgroundColor: 'rgb(59, 130, 246)',
                                pointRadius: 4,
                                borderDash: [5, 5],
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
                                labels: { boxWidth: 12, font: { size: 11 } }
                            } 
                        },
                        scales: { y: { beginAtZero: true } }
                    }
                });
            }
        } else {
            cardChart.classList.add('hidden');
        }
    } catch (e) {
        console.error("No se pudieron cargar estadisticas del dashboard:", e);
        if (cardChart) cardChart.classList.add('hidden');
    }
}
