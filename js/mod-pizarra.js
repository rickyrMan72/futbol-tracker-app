import { equipoIdActivo } from './mod-jugadores.js';
import { todosLosEquipos } from './mod-equipos.js';
import { svgF11Vertical, svgF11Horizontal, svgF7Vertical, svgF7Horizontal } from './components/pizarra-svgs.js';
import { mostrarNotificacion as mostrarAlerta, confirmarAccion } from './ui.js';
import { db, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, where, auth } from './firebase-config.js';

let draggedFichaPizarra = null;
let currentFormacion = "1-2-1-2-1";
let isPizarraRotated = false;

// Estado de la Jugada actual
let currentJugadaId = null;
let currentStep = 1;
let jugadaPasos = { 1: {} }; // 1: { "p1": {left: 50, top: 85}, ... }
let isPlaying = false;
let playInterval = null;

let unsubscribeJugadas = null;
let jugadasDelEquipo = [];

// Manejador de errores Firestore
function handleFsError(error, operationType, path) {
    if (error.code === 'permission-denied' && !auth.currentUser) return;
    console.error('Firestore Error:', error);
    mostrarAlerta('Error de permisos o base de datos. ' + (error.message || ''), 'error');
}

// --------------------- TÁCTICAS DINÁMICAS ---------------------
export const tacticasF7 = [
    { id: "f7-t1", nombre: "1-2-3-1", posiciones: [
        { id: "p1", lbl: "POR", top: 85, left: 50 },
        { id: "p2", lbl: "LI", top: 70, left: 25 },
        { id: "p3", lbl: "LD", top: 70, left: 75 },
        { id: "p4", lbl: "MC", top: 50, left: 50 },
        { id: "p5", lbl: "EI", top: 35, left: 20 },
        { id: "p6", lbl: "ED", top: 35, left: 80 },
        { id: "p7", lbl: "DC", top: 15, left: 50 },
        { id: "bal", lbl: "⚽", top: 55, left: 50 }
    ]},
    { id: "f7-t2", nombre: "1-3-2-1", posiciones: [
        { id: "p1", lbl: "POR", top: 85, left: 50 },
        { id: "p2", lbl: "LI", top: 70, left: 20 },
        { id: "p3", lbl: "CT", top: 75, left: 50 },
        { id: "p4", lbl: "LD", top: 70, left: 80 },
        { id: "p5", lbl: "MC", top: 45, left: 35 },
        { id: "p6", lbl: "MC", top: 45, left: 65 },
        { id: "p7", lbl: "DC", top: 20, left: 50 },
        { id: "bal", lbl: "⚽", top: 55, left: 50 }
    ]},
    { id: "f7-t3", nombre: "1-2-2-2", posiciones: [
        { id: "p1", lbl: "POR", top: 85, left: 50 },
        { id: "p2", lbl: "LI", top: 70, left: 30 },
        { id: "p3", lbl: "LD", top: 70, left: 70 },
        { id: "p4", lbl: "MI", top: 45, left: 30 },
        { id: "p5", lbl: "MD", top: 45, left: 70 },
        { id: "p6", lbl: "DI", top: 20, left: 30 },
        { id: "p7", lbl: "DD", top: 20, left: 70 },
        { id: "bal", lbl: "⚽", top: 55, left: 50 }
    ]}
];

export const tacticasF11 = [
    { id: "f11-t1", nombre: "1-4-3-3", posiciones: [
        { id: "p1", lbl: "POR", top: 85, left: 50 },
        { id: "p2", lbl: "LI", top: 70, left: 15 },
        { id: "p3", lbl: "CT", top: 75, left: 35 },
        { id: "p4", lbl: "CT", top: 75, left: 65 },
        { id: "p5", lbl: "LD", top: 70, left: 85 },
        { id: "p6", lbl: "MCD", top: 55, left: 50 },
        { id: "p7", lbl: "MC", top: 45, left: 30 },
        { id: "p8", lbl: "MC", top: 45, left: 70 },
        { id: "p9", lbl: "EI", top: 25, left: 20 },
        { id: "p10", lbl: "ED", top: 25, left: 80 },
        { id: "p11", lbl: "DC", top: 15, left: 50 },
        { id: "bal", lbl: "⚽", top: 55, left: 50 }
    ]},
    { id: "f11-t2", nombre: "1-4-4-2", posiciones: [
        { id: "p1", lbl: "POR", top: 85, left: 50 },
        { id: "p2", lbl: "LI", top: 70, left: 15 },
        { id: "p3", lbl: "CT", top: 75, left: 35 },
        { id: "p4", lbl: "CT", top: 75, left: 65 },
        { id: "p5", lbl: "LD", top: 70, left: 85 },
        { id: "p6", lbl: "MI", top: 45, left: 20 },
        { id: "p7", lbl: "MC", top: 50, left: 40 },
        { id: "p8", lbl: "MC", top: 50, left: 60 },
        { id: "p9", lbl: "MD", top: 45, left: 80 },
        { id: "p10", lbl: "DC", top: 20, left: 40 },
        { id: "p11", lbl: "DC", top: 20, left: 60 },
        { id: "bal", lbl: "⚽", top: 55, left: 50 }
    ]},
    { id: "f11-t3", nombre: "1-3-5-2", posiciones: [
        { id: "p1", lbl: "POR", top: 85, left: 50 },
        { id: "p2", lbl: "CT", top: 75, left: 25 },
        { id: "p3", lbl: "CT", top: 75, left: 50 },
        { id: "p4", lbl: "CT", top: 75, left: 75 },
        { id: "p5", lbl: "CARR", top: 55, left: 15 },
        { id: "p6", lbl: "MCD", top: 60, left: 40 },
        { id: "p7", lbl: "MCD", top: 60, left: 60 },
        { id: "p8", lbl: "CARR", top: 55, left: 85 },
        { id: "p9", lbl: "MCO", top: 40, left: 50 },
        { id: "p10", lbl: "DC", top: 20, left: 35 },
        { id: "p11", lbl: "DC", top: 20, left: 65 },
        { id: "bal", lbl: "⚽", top: 55, left: 50 }
    ]}
];

export function getTacticasParaEquipoActivo() {
    let equipo = todosLosEquipos.find(eq => eq.id === equipoIdActivo);
    if (!equipo && todosLosEquipos.length > 0) equipo = todosLosEquipos[0];
    const esF7 = equipo && equipo.modalidad === 'Fútbol 7';
    return esF7 ? tacticasF7 : tacticasF11;
}

export function getTactica(id) {
    const todas = [...tacticasF7, ...tacticasF11];
    return todas.find(t => t.id === id) || todas[0];
}

// -------------- LÓGICA DE PASOS E ANIMACIÓN --------------

function saveCurrentPositions() {
    const campo = document.getElementById('pizarra-campo');
    if (!campo) return;
    
    if (!jugadaPasos[currentStep]) jugadaPasos[currentStep] = {};
    
    const fichas = campo.querySelectorAll('.ficha-pizarra');
    fichas.forEach(ficha => {
        const id = ficha.dataset.fichaId;
        // Obtenemos su left/top exacto en % o podemos extraerlo de `ficha.style` pero cuidado con rotation
        // Si isPizarraRotated es true, visualLeft = 100 - baseTop, visualTop = baseLeft
        // Por ende, baseLeft = visualTop, baseTop = 100 - visualLeft
        let visualLeft = parseFloat(ficha.style.left);
        let visualTop = parseFloat(ficha.style.top);
        
        if (isPizarraRotated) {
            jugadaPasos[currentStep][id] = { left: visualTop, top: 100 - visualLeft };
        } else {
            jugadaPasos[currentStep][id] = { left: visualLeft, top: visualTop };
        }
    });
}

function getPosForStep(fichaId, step) {
    if (jugadaPasos[step] && jugadaPasos[step][fichaId]) {
        return jugadaPasos[step][fichaId];
    }
    // Buscar hacia atrás
    for (let s = step - 1; s >= 1; s--) {
        if (jugadaPasos[s] && jugadaPasos[s][fichaId]) return jugadaPasos[s][fichaId];
    }
    // Fallback: buscar formación actual
    const tact = getTactica(currentFormacion);
    const pos = tact.posiciones.find(p => p.id === fichaId);
    return pos ? { left: pos.left, top: pos.top } : { left: 50, top: 50 };
}

function applyStep(step) {
    const campo = document.getElementById('pizarra-campo');
    if (!campo) return;
    const fichas = campo.querySelectorAll('.ficha-pizarra');
    fichas.forEach(ficha => {
        const id = ficha.dataset.fichaId;
        const pos = getPosForStep(id, step);
        
        let finalLeft = pos.left;
        let finalTop = pos.top;
        if (isPizarraRotated) {
            finalLeft = 100 - pos.top;
            finalTop = pos.left;
        }
        ficha.style.left = finalLeft + '%';
        ficha.style.top = finalTop + '%';
    });
}

function updatePasosUI() {
    const maxSteps = Math.max(...Object.keys(jugadaPasos).map(Number));
    const btnDel = document.getElementById('pizarra-btn-del');
    const stepDisplay = document.getElementById('pizarra-step-display');
    const playIcon = document.querySelector('#pizarra-btn-play i');

    if (stepDisplay) stepDisplay.innerText = `Paso ${currentStep}`;
    if (btnDel) {
        if (currentStep > 1 && currentStep === maxSteps && !isPlaying) {
            btnDel.classList.remove('hidden');
        } else {
            btnDel.classList.add('hidden');
        }
    }
    if (playIcon) {
        playIcon.className = isPlaying ? "fa-solid fa-stop" : "fa-solid fa-play ml-1";
    }
}

// -----------------------------------------------------

// ---------------------- BASE DE DATOS JUGADAS -------------------
function cargarJugadasEquipo() {
    const sel = document.getElementById('pizarra-jugada-selector');
    if (!sel) return;

    // Reset select
    sel.innerHTML = '<option value="">-- Nueva --</option>';
    jugadasDelEquipo = [];

    if (unsubscribeJugadas) {
        unsubscribeJugadas();
        unsubscribeJugadas = null;
    }

    if (!equipoIdActivo) return;

    try {
        if (!auth.currentUser) return;
        const q = query(
            collection(db, 'jugadas'), 
            where('equipoId', '==', equipoIdActivo),
            where('ownerId', '==', auth.currentUser.uid)
        );
        unsubscribeJugadas = onSnapshot(q, (snapshot) => {
            jugadasDelEquipo = [];
            sel.innerHTML = '<option value="">-- Nueva --</option>'; // reset on update
            
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                data.id = docSnap.id;
                jugadasDelEquipo.push(data);
                
                const opt = document.createElement('option');
                opt.value = data.id;
                opt.textContent = data.nombre;
                sel.appendChild(opt);
            });
            
            if (currentJugadaId) {
                sel.value = currentJugadaId;
            }

            // if currentJugadaId was deleted
            if (currentJugadaId && !jugadasDelEquipo.find(j => j.id === currentJugadaId)) {
                currentJugadaId = null;
                resetJugada();
            }
        }, (error) => {
            handleFsError(error, 'list', 'jugadas');
        });
    } catch (error) {
        handleFsError(error, 'list', 'jugadas');
    }
}

async function guardarJugada() {
    if (!equipoIdActivo) {
        mostrarAlerta("Selecciona un equipo primero", true);
        return;
    }
    
    // Save current before saving
    saveCurrentPositions();
    
    if (currentJugadaId) {
        // Update
        const nombreInput = document.getElementById('pizarra-jugada-nombre');
        const nombre = nombreInput ? nombreInput.value.trim() : "";
        if (!nombre) {
            mostrarAlerta("Introduce un nombre para la jugada", true);
            return;
        }

        try {
            await updateDoc(doc(db, 'jugadas', currentJugadaId), {
                nombre: nombre,
                tacticaId: currentFormacion,
                pasos: jugadaPasos,
                updatedAt: new Date()
            });
            mostrarAlerta("Jugada actualizada", false);
        } catch (error) {
             handleFsError(error, 'update', 'jugadas');
        }
    } else {
        // Create
        const nombreInput = document.getElementById('pizarra-jugada-nombre');
        const nombre = nombreInput ? nombreInput.value.trim() : "";
        if (!nombre) {
            mostrarAlerta("Introduce un nombre para la jugada", true);
            return;
        }
        
        try {
            const data = {
                equipoId: equipoIdActivo,
                nombre: nombre,
                tacticaId: currentFormacion,
                pasos: jugadaPasos,
                createdAt: new Date(),
                updatedAt: new Date(),
                ownerId: auth.currentUser?.uid || ''
            };
            const dataref = await addDoc(collection(db, 'jugadas'), data);
            currentJugadaId = dataref.id;
            const btnDel = document.getElementById('btn-pizarra-delete-jugada');
            if (btnDel) btnDel.classList.remove('hidden');
            mostrarAlerta("Jugada guardada", false);
        } catch(error) {
            handleFsError(error, 'create', 'jugadas');
        }
    }
}

function loadJugada(id) {
    if (!id) {
        resetJugada();
        return;
    }
    const jugada = jugadasDelEquipo.find(j => j.id === id);
    if (!jugada) return;
    
    currentJugadaId = jugada.id;
    currentFormacion = jugada.tacticaId || getTacticasParaEquipoActivo()[0].id;
    
    document.getElementById('pizarra-formacion').value = currentFormacion;
    document.getElementById('pizarra-jugada-selector').value = jugada.id;
    const nombreInput = document.getElementById('pizarra-jugada-nombre');
    if (nombreInput) nombreInput.value = jugada.nombre;
    
    const btnDel = document.getElementById('btn-pizarra-delete-jugada');
    if (btnDel) btnDel.classList.remove('hidden');
    
    jugadaPasos = JSON.parse(JSON.stringify(jugada.pasos || { 1: {} })); // clone
    currentStep = 1;
    renderPizarra();
}

function resetJugada() {
    currentJugadaId = null;
    jugadaPasos = { 1: {} };
    currentStep = 1;
    document.getElementById('pizarra-jugada-selector').value = "";
    const nombreInput = document.getElementById('pizarra-jugada-nombre');
    if (nombreInput) nombreInput.value = "";
    const btnDel = document.getElementById('btn-pizarra-delete-jugada');
    if (btnDel) btnDel.classList.add('hidden');
    renderPizarra();
}

async function eliminarJugadaActual() {
    if (!currentJugadaId) return;
    if (await confirmarAccion("¿Seguro que deseas eliminar esta jugada?")) {
        try {
            await deleteDoc(doc(db, 'jugadas', currentJugadaId));
            mostrarAlerta("Jugada eliminada", false);
            resetJugada();
        } catch(e) {
            handleFsError(e, 'delete', 'jugadas');
        }
    }
}
// ----------------------------------------------------------------

function actualizarSelectorTacticas() {
    const selector = document.getElementById('pizarra-formacion');
    if (!selector) return;
    const tacticas = getTacticasParaEquipoActivo();
    
    if (!tacticas.find(t => t.id === currentFormacion)) {
        currentFormacion = tacticas[0].id;
        jugadaPasos = { 1: {} };
        currentStep = 1;
    }
    
    selector.innerHTML = '';
    tacticas.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.nombre;
        selector.appendChild(opt);
    });
    
    selector.value = currentFormacion;
}

export function initPizarra() {
    const selector = document.getElementById('pizarra-formacion');
    const campo = document.getElementById('pizarra-campo');
    const btnReset = document.getElementById('btn-pizarra-reset');
    const btnRotate = document.getElementById('btn-pizarra-rotate');
    const btnFullscreen = document.getElementById('btn-pizarra-fullscreen');

    // UI de Animación
    const btnPlay = document.getElementById('pizarra-btn-play');
    const btnPrev = document.getElementById('pizarra-btn-prev');
    const btnNext = document.getElementById('pizarra-btn-next');
    const btnAdd = document.getElementById('pizarra-btn-add');
    const btnDel = document.getElementById('pizarra-btn-del');

    if (!selector || !campo) return;
    
    actualizarSelectorTacticas();

    btnRotate.addEventListener('click', () => {
        isPizarraRotated = !isPizarraRotated;
        renderPizarra();
    });

    selector.addEventListener('change', async (e) => {
        if (Object.keys(jugadaPasos).length > 1) {
            const conf = await confirmarAccion("Cambiar la formación borrará los pasos actuales. ¿Continuar?", "Continuar", "text-red-600");
            if (!conf) {
                selector.value = currentFormacion;
                return;
            }
        }
        currentFormacion = e.target.value;
        jugadaPasos = { 1: {} };
        currentStep = 1;
        renderPizarra();
    });

    btnReset.addEventListener('click', async () => {
        if (Object.keys(jugadaPasos).length > 1) {
             const conf = await confirmarAccion("Esto reiniciará y borrará todo. ¿Continuar?", "Continuar", "text-red-600");
             if (!conf) return;
        }
        jugadaPasos = { 1: {} };
        currentStep = 1;
        renderPizarra();
    });

    // Controladores de pasos
    if (btnPrev) btnPrev.addEventListener('click', () => {
        if (currentStep > 1 && !isPlaying) {
            currentStep--;
            applyStep(currentStep);
            updatePasosUI();
        }
    });

    if (btnNext) btnNext.addEventListener('click', () => {
        const maxSteps = Math.max(...Object.keys(jugadaPasos).map(Number));
        if (currentStep < maxSteps && !isPlaying) {
            currentStep++;
            applyStep(currentStep);
            updatePasosUI();
        }
    });

    if (btnAdd) btnAdd.addEventListener('click', () => {
        if (isPlaying) return;
        const maxSteps = Math.max(...Object.keys(jugadaPasos).map(Number));
        if (currentStep < maxSteps) {
            mostrarAlerta("Solo puedes agregar pasos al final.", true);
            return;
        }
        saveCurrentPositions();
        currentStep++;
        jugadaPasos[currentStep] = JSON.parse(JSON.stringify(jugadaPasos[currentStep - 1])); // clonar
        updatePasosUI();
        mostrarAlerta(`Paso ${currentStep} creado. Mueve los jugadores.`, false);
    });

    if (btnDel) btnDel.addEventListener('click', async () => {
        if (isPlaying) return;
        const maxSteps = Math.max(...Object.keys(jugadaPasos).map(Number));
        if (currentStep === maxSteps && maxSteps > 1) {
            if (await confirmarAccion(`¿Borrar paso ${currentStep}?`, "Borrar", "text-red-600")) {
                delete jugadaPasos[currentStep];
                currentStep--;
                applyStep(currentStep);
                updatePasosUI();
            }
        }
    });

    if (btnPlay) btnPlay.addEventListener('click', () => {
        if (isPlaying) {
            clearInterval(playInterval);
            isPlaying = false;
            updatePasosUI();
            if (window.pizarraAnimations) {
                window.pizarraAnimations.forEach(a => {
                    try { a.cancel(); } catch(e){}
                });
                window.pizarraAnimations = null;
            }
            document.querySelectorAll('.ficha-pizarra').forEach(el => {
                el.style.transition = '';
            });
            applyStep(currentStep);
            return;
        }
        
        saveCurrentPositions();
        const maxSteps = Math.max(...Object.keys(jugadaPasos).map(Number));
        if (maxSteps <= 1) {
            mostrarAlerta("Agrega más pasos para reproducir", false);
            return;
        }
        
        isPlaying = true;
        currentStep = 1;
        applyStep(1);
        updatePasosUI();
        
        // Remove CSS transitions during sequence
        document.querySelectorAll('.ficha-pizarra').forEach(el => {
            el.style.transition = 'none';
        });

        window.pizarraAnimations = [];
        const stepDuration = 1500;

        document.querySelectorAll('.ficha-pizarra').forEach(ficha => {
            const id = ficha.dataset.fichaId;
            const keyframes = [];

            for (let s = 1; s <= maxSteps; s++) {
                const pos = getPosForStep(id, s);
                let visualLeft = pos.left;
                let visualTop = pos.top;
                if (isPizarraRotated) {
                    visualLeft = pos.top;
                    visualTop = 100 - pos.left;
                }
                keyframes.push({
                    left: `${visualLeft}%`,
                    top: `${visualTop}%`
                });
            }

            const anim = ficha.animate(keyframes, {
                duration: stepDuration * (maxSteps - 1),
                easing: 'linear',
                fill: 'forwards'
            });
            window.pizarraAnimations.push(anim);
        });

        playInterval = setInterval(() => {
            if (currentStep < maxSteps) {
                currentStep++;
                updatePasosUI();
            }
            
            if (currentStep >= maxSteps) {
                clearInterval(playInterval);
                isPlaying = false;
                updatePasosUI();
                
                applyStep(maxSteps);
                if (window.pizarraAnimations) {
                    window.pizarraAnimations.forEach(a => {
                        try { a.cancel(); } catch(e){}
                    });
                    window.pizarraAnimations = null;
                }
                document.querySelectorAll('.ficha-pizarra').forEach(el => {
                    el.style.transition = '';
                });
            }
        }, stepDuration);
    });

    if (btnFullscreen) {
        btnFullscreen.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                const viewPizarra = document.getElementById('view-pizarra');
                if (viewPizarra.requestFullscreen) {
                    viewPizarra.requestFullscreen();
                } else if (viewPizarra.webkitRequestFullscreen) { /* Safari */
                    viewPizarra.webkitRequestFullscreen();
                } else if (viewPizarra.msRequestFullscreen) { /* IE11 */
                    viewPizarra.msRequestFullscreen();
                }
                viewPizarra.classList.add('bg-slate-50', 'p-4'); // padding para modo fullscreen
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) { /* Safari */
                    document.webkitExitFullscreen();
                } else if (document.msExitFullscreen) { /* IE11 */
                    document.msExitFullscreen();
                }
            }
        });
        
        document.addEventListener('fullscreenchange', () => {
             const viewPizarra = document.getElementById('view-pizarra');
             if (!document.fullscreenElement) {
                 viewPizarra.classList.remove('bg-slate-50', 'p-4');
                 btnFullscreen.innerHTML = '<i class="fa-solid fa-expand"></i>';
                 btnFullscreen.title = "Pantalla completa";
             } else {
                 btnFullscreen.innerHTML = '<i class="fa-solid fa-compress"></i>';
                 btnFullscreen.title = "Salir de pantalla completa";
             }
        });
    }

    // We are using pointer events directly on the tokens now

    // Escuchar el evento personalizado de set_equipo_activo para repintar 
    // y elegir el campo adecuado (F11 o F7)
    document.addEventListener('equipoModificado', () => {
         actualizarSelectorTacticas();
         cargarJugadasEquipo();
         resetJugada();
    });

    const btnSave = document.getElementById('btn-pizarra-save');
    const btnDelete = document.getElementById('btn-pizarra-delete-jugada');
    const selJugada = document.getElementById('pizarra-jugada-selector');
    
    if (btnSave) {
        btnSave.addEventListener('click', guardarJugada);
    }
    if (btnDelete) {
        btnDelete.addEventListener('click', eliminarJugadaActual);
    }
    if (selJugada) {
        selJugada.addEventListener('change', (e) => {
            loadJugada(e.target.value);
        });
    }

    cargarJugadasEquipo();
    renderPizarra();
}

function renderPizarra() {
    const campo = document.getElementById('pizarra-campo');
    if (!campo) return;

    // Determinar la modalidad del equipo activo
    let equipo = todosLosEquipos.find(eq => eq.id === equipoIdActivo);
    if (!equipo && todosLosEquipos.length > 0) equipo = todosLosEquipos[0]; // Fallback to first team if none
    const esF7 = equipo && equipo.modalidad === 'Fútbol 7';

    // Inyectar el SVG correcto y actualizar aspect-ratio
    const svgWrapper = document.getElementById('pizarra-svg-wrapper');
    if (svgWrapper) {
        if (esF7) {
            svgWrapper.innerHTML = isPizarraRotated ? svgF7Horizontal : svgF7Vertical;
            campo.style.aspectRatio = isPizarraRotated ? "65/45" : "45/65";
        } else {
            svgWrapper.innerHTML = isPizarraRotated ? svgF11Horizontal : svgF11Vertical;
            campo.style.aspectRatio = isPizarraRotated ? "105/68" : "68/105";
        }
    }

    // Actualizar título
    const titulo = document.getElementById('pizarra-titulo-campo');
    if (titulo) {
        titulo.innerText = `Pizarra Táctica (${esF7 ? 'Fútbol 7' : 'Fútbol 11'})`;
    }

    // Limpiar jugadores actuales
    const fichas = campo.querySelectorAll('.ficha-pizarra');
    fichas.forEach(f => f.remove());

    const tactica = getTactica(currentFormacion);
    const posiciones = tactica.posiciones;

    // Inicializar paso 1 si está vacío
    if (Object.keys(jugadaPasos[1] || {}).length === 0) {
        jugadaPasos = { 1: {} };
        posiciones.forEach(pos => {
            jugadaPasos[1][pos.id] = { left: pos.left, top: pos.top };
        });
        currentStep = 1;
        updatePasosUI();
    }

    posiciones.forEach(pos => {
        const ficha = document.createElement('div');
        ficha.id = `ficha-${pos.id}`;
        ficha.dataset.fichaId = pos.id;
        
        let baseClasses = 'ficha-pizarra absolute w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm text-white cursor-grab select-none z-10 hover:scale-110 object-contain touch-none transition-all duration-500 ease-in-out outline-none';
        
        let bgColor = 'bg-red-600 shadow-lg border border-red-700';
        if (pos.lbl === 'POR') bgColor = 'bg-amber-500 shadow-lg border border-amber-600';
        if (pos.id === 'bal') {
            baseClasses = 'ficha-pizarra absolute w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center text-xl sm:text-2xl cursor-grab select-none z-[15] hover:scale-110 object-contain touch-none transition-all duration-500 ease-in-out outline-none';
            bgColor = 'bg-transparent shadow-none border-none text-black drop-shadow-md';
        }
        
        ficha.className = `${baseClasses} ${bgColor}`;
        
        let currentStatePos = jugadaPasos[currentStep] && jugadaPasos[currentStep][pos.id];
        let baseLeft = currentStatePos ? currentStatePos.left : pos.left;
        let baseTop = currentStatePos ? currentStatePos.top : pos.top;
        
        let finalLeft = baseLeft;
        let finalTop = baseTop;
        if (isPizarraRotated) {
            finalLeft = 100 - baseTop;
            finalTop = baseLeft;
        }

        ficha.style.left = finalLeft + '%';
        ficha.style.top = finalTop + '%';
        ficha.style.transform = 'translate(-50%, -50%)';
        ficha.innerText = pos.lbl;

        // Eventos arrastrar con Pointer Events para soporte móvil y desktop
        let isDragging = false;
        
        ficha.addEventListener('pointerdown', (e) => {
            isDragging = true;
            draggedFichaPizarra = ficha;
            ficha.setPointerCapture(e.pointerId);
            ficha.classList.remove('transition-all', 'duration-500'); // Disable animation for instant follow
            ficha.classList.add('opacity-75', 'scale-110');
            ficha.classList.remove('cursor-grab');
            ficha.classList.add('cursor-grabbing');
        });

        ficha.addEventListener('pointermove', (e) => {
            if (!isDragging || draggedFichaPizarra !== ficha) return;
            e.preventDefault();

            const rect = campo.getBoundingClientRect();
            let leftPct = ((e.clientX - rect.left) / rect.width) * 100;
            let topPct = ((e.clientY - rect.top) / rect.height) * 100;

            leftPct = Math.max(0, Math.min(leftPct, 100));
            topPct = Math.max(0, Math.min(topPct, 100));

            ficha.style.left = leftPct + '%';
            ficha.style.top = topPct + '%';
        });

        ficha.addEventListener('pointerup', (e) => {
            isDragging = false;
            if (draggedFichaPizarra === ficha) {
                draggedFichaPizarra = null;
                saveCurrentPositions(); // Guardar automático al dejar de arrastrar
            }
            ficha.releasePointerCapture(e.pointerId);
            ficha.classList.add('transition-all', 'duration-500');
            ficha.classList.remove('opacity-75', 'scale-110', 'cursor-grabbing');
            ficha.classList.add('cursor-grab');
        });
        
        ficha.addEventListener('pointercancel', (e) => {
            isDragging = false;
            if (draggedFichaPizarra === ficha) draggedFichaPizarra = null;
            ficha.releasePointerCapture(e.pointerId);
            ficha.classList.add('transition-all', 'duration-500');
            ficha.classList.remove('opacity-75', 'scale-110', 'cursor-grabbing');
            ficha.classList.add('cursor-grab');
        });

        campo.appendChild(ficha);
    });
}
