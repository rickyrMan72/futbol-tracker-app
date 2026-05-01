import { equipoIdActivo } from './mod-jugadores.js';

let draggedFichaPizarra = null;
let currentFormacion = "1-2-1-2-1";

const formaciones = {
    "1-2-1-2-1": [
        { id: "p1", lbl: "POR", top: 85, left: 50 },
        { id: "p2", lbl: "LI", top: 70, left: 25 },
        { id: "p3", lbl: "LD", top: 70, left: 75 },
        { id: "p4", lbl: "MC", top: 50, left: 50 },
        { id: "p5", lbl: "EI", top: 30, left: 20 },
        { id: "p6", lbl: "ED", top: 30, left: 80 },
        { id: "p7", lbl: "DC", top: 15, left: 50 }
    ],
    "1-3-2-1": [
        { id: "p1", lbl: "POR", top: 85, left: 50 },
        { id: "p2", lbl: "LI", top: 70, left: 20 },
        { id: "p3", lbl: "CT", top: 75, left: 50 },
        { id: "p4", lbl: "LD", top: 70, left: 80 },
        { id: "p5", lbl: "MC", top: 45, left: 35 },
        { id: "p6", lbl: "MC", top: 45, left: 65 },
        { id: "p7", lbl: "DC", top: 20, left: 50 }
    ],
    "1-2-3-1": [
        { id: "p1", lbl: "POR", top: 85, left: 50 },
        { id: "p2", lbl: "LI", top: 70, left: 30 },
        { id: "p3", lbl: "LD", top: 70, left: 70 },
        { id: "p4", lbl: "MI", top: 45, left: 20 },
        { id: "p5", lbl: "MC", top: 50, left: 50 },
        { id: "p6", lbl: "MD", top: 45, left: 80 },
        { id: "p7", lbl: "DC", top: 20, left: 50 }
    ],
    "1-3-1-2": [
        { id: "p1", lbl: "POR", top: 85, left: 50 },
        { id: "p2", lbl: "LI", top: 70, left: 20 },
        { id: "p3", lbl: "CT", top: 75, left: 50 },
        { id: "p4", lbl: "LD", top: 70, left: 80 },
        { id: "p5", lbl: "MC", top: 50, left: 50 },
        { id: "p6", lbl: "DI", top: 25, left: 35 },
        { id: "p7", lbl: "DD", top: 25, left: 65 }
    ],
    "1-2-2-2": [
        { id: "p1", lbl: "POR", top: 85, left: 50 },
        { id: "p2", lbl: "LI", top: 70, left: 30 },
        { id: "p3", lbl: "LD", top: 70, left: 70 },
        { id: "p4", lbl: "MI", top: 45, left: 30 },
        { id: "p5", lbl: "MD", top: 45, left: 70 },
        { id: "p6", lbl: "DI", top: 20, left: 30 },
        { id: "p7", lbl: "DD", top: 20, left: 70 }
    ]
};

export function initPizarra() {
    const selector = document.getElementById('pizarra-formacion');
    const campo = document.getElementById('pizarra-campo');
    const btnReset = document.getElementById('btn-pizarra-reset');

    if (!selector || !campo) return;

    selector.addEventListener('change', (e) => {
        currentFormacion = e.target.value;
        renderPizarra();
    });

    btnReset.addEventListener('click', () => {
        renderPizarra();
    });

    // Permitir arrastrar sobre el campo
    campo.addEventListener('dragover', e => {
        e.preventDefault();
    });

    campo.addEventListener('drop', e => {
        e.preventDefault();
        if (!draggedFichaPizarra) return;

        const rect = campo.getBoundingClientRect();
        
        // Calcular porcentaje
        let leftPct = ((e.clientX - rect.left) / rect.width) * 100;
        let topPct = ((e.clientY - rect.top) / rect.height) * 100;

        // Mantener dentro de los límites
        leftPct = Math.max(0, Math.min(leftPct, 100));
        topPct = Math.max(0, Math.min(topPct, 100));

        draggedFichaPizarra.style.left = leftPct + '%';
        draggedFichaPizarra.style.top = topPct + '%';
        draggedFichaPizarra.style.transform = 'translate(-50%, -50%)';
    });

    // Escuchar el evento personalizado de set_equipo_activo para repintar 
    // Aunque en la pizarra táctica genérica los colores son fijos,
    // es bueno refrescar.
    document.addEventListener('equipoModificado', renderPizarra);

    renderPizarra();
}

function renderPizarra() {
    const campo = document.getElementById('pizarra-campo');
    if (!campo) return;

    // Limpiar jugadores actuales
    const fichas = campo.querySelectorAll('.ficha-pizarra');
    fichas.forEach(f => f.remove());

    const posiciones = formaciones[currentFormacion] || formaciones["1-2-1-2-1"];

    posiciones.forEach(pos => {
        const ficha = document.createElement('div');
        ficha.className = 'ficha-pizarra absolute w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm text-white shadow-lg cursor-grab select-none z-10 transition-transform hover:scale-110 object-contain';
        ficha.draggable = true;
        
        const bgColor = pos.lbl === 'POR' ? 'bg-amber-500' : 'bg-red-600';
        ficha.classList.add(...bgColor.split(' '));
        ficha.style.left = pos.left + '%';
        ficha.style.top = pos.top + '%';
        ficha.style.transform = 'translate(-50%, -50%)';
        ficha.innerText = pos.lbl;

        // Eventos arrastrar
        ficha.addEventListener('dragstart', (e) => {
            draggedFichaPizarra = ficha;
            setTimeout(() => ficha.classList.add('opacity-50'), 0);
        });

        ficha.addEventListener('dragend', () => {
            if (draggedFichaPizarra) {
                draggedFichaPizarra.classList.remove('opacity-50');
            }
            draggedFichaPizarra = null;
        });

        campo.appendChild(ficha);
    });
}
