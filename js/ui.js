export function mostrarNotificacion(mensaje, esError = false) {
    const alerta = document.createElement('div');
    alerta.className = `fixed bottom-4 right-4 text-white px-6 py-3 rounded-lg shadow-xl fade-in z-[70] ${esError ? 'bg-red-500' : 'bg-slate-800'}`;
    alerta.innerHTML = `<i class="fa-solid ${esError ? 'fa-triangle-exclamation' : 'fa-check-circle'} mr-2"></i> ${mensaje}`;
    document.body.appendChild(alerta);
    setTimeout(() => alerta.remove(), 3000);
}

export function confirmarAccion(mensaje, textoConfirmar = "Eliminar", colorConfirmar = "text-red-600") {
    // Prevent multiple modals if the user clicks quickly
    document.querySelectorAll('.confirm-overlay-dialog').forEach(el => el.remove());

    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay-dialog fixed inset-0 bg-slate-900 bg-opacity-50 z-[70] flex items-center justify-center p-4 fade-in';
        overlay.innerHTML = `
            <div class="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
                <div class="p-5 flex flex-col items-center text-center">
                    <div class="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center text-2xl mb-4">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                    </div>
                    <h3 class="text-lg font-bold text-slate-800 mb-2">Confirmación</h3>
                    <p class="text-slate-600 text-sm">${mensaje}</p>
                </div>
                <div class="flex border-t border-slate-100 bg-slate-50">
                    <button id="btn-cancel-confirm" class="flex-1 py-3 text-slate-600 font-medium hover:bg-slate-100 transition-colors">Cancelar</button>
                    <button id="btn-accept-confirm" class="flex-1 py-3 ${colorConfirmar} font-bold hover:bg-slate-100 border-l border-slate-100 transition-colors">${textoConfirmar}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = (result) => {
            overlay.remove();
            resolve(result);
        };

        // We use {once: true} to avoid any double triggers
        overlay.querySelector('#btn-cancel-confirm').addEventListener('click', () => close(false), {once: true});
        overlay.querySelector('#btn-accept-confirm').addEventListener('click', () => close(true), {once: true});
    });
}

export function bindModal(idModal, idBtnOpen, idBtnClose, idBtnCancel, funcExtraOpen = null) {
    const modal = document.getElementById(idModal);
    const openModal = () => { if(funcExtraOpen) funcExtraOpen(); modal.classList.remove('hidden'); };
    const closeModal = () => modal.classList.add('hidden');
    
    const btnOpen = document.getElementById(idBtnOpen);
    if (btnOpen) btnOpen.addEventListener('click', openModal);
    
    const btnClose = document.getElementById(idBtnClose);
    if (btnClose) btnClose.addEventListener('click', closeModal);
    
    if (idBtnCancel) {
        const btnCancel = document.getElementById(idBtnCancel);
        if (btnCancel) btnCancel.addEventListener('click', closeModal);
    }
    return closeModal;
}

export function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const views = document.querySelectorAll('.app-view');
    const headerTitle = document.getElementById('header-title');
    const titulos = { 'view-dashboard': 'Panel de Control', 'view-plantilla': 'Plantilla', 'view-ejercicios': 'Ejercicios', 'view-sesiones': 'Sesiones', 'view-partidos': 'Partidos', 'view-pizarra': 'Pizarra', 'view-configuracion': 'Configuración' };

    const btnMobileMenu = document.getElementById('btn-mobile-menu');
    const sidebar = document.getElementById('sidebar');

    if (btnMobileMenu && sidebar) {
        // Asegurar clases base para control manual
        sidebar.classList.add('absolute', 'md:relative', 'inset-y-0', 'left-0', 'h-full', 'z-50');
        
        btnMobileMenu.addEventListener('click', () => {
            if (window.innerWidth >= 768) {
                // Modo Desktop
                if (sidebar.classList.contains('md:flex')) {
                    sidebar.classList.remove('md:flex');
                    sidebar.classList.add('hidden'); // Ocultar
                } else {
                    sidebar.classList.add('md:flex');
                    sidebar.classList.remove('hidden'); // Mostrar
                }
            } else {
                // Modo Mobile
                sidebar.classList.toggle('hidden');
                sidebar.classList.toggle('flex');
            }
        });
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navLinks.forEach(l => {
                l.classList.remove('bg-emerald-600', 'border-emerald-400');
                l.classList.add('hover:bg-slate-800', 'hover:text-white', 'border-transparent');
            });
            link.classList.remove('hover:bg-slate-800', 'hover:text-white', 'border-transparent');
            link.classList.add('bg-emerald-600', 'text-white', 'border-emerald-400');
            const targetId = link.getAttribute('data-target');
            views.forEach(v => v.classList.add('hidden'));
            document.getElementById(targetId).classList.remove('hidden');
            headerTitle.textContent = titulos[targetId];

            if (sidebar) {
                if (window.innerWidth < 768) {
                    // Hide sidebar after click on mobile
                    sidebar.classList.add('hidden');
                    sidebar.classList.remove('flex');
                } else if (targetId === 'view-directo' || targetId === 'view-pizarra') {
                    // Auto-hide on desktop for fullscreen views
                    sidebar.classList.remove('md:flex');
                    sidebar.classList.add('hidden');
                } else {
                    // Make sure it is visible for standard views
                    sidebar.classList.add('md:flex');
                    sidebar.classList.remove('hidden');
                }
            }
        });
    });
}

export function initChart() {
    // Chart initialization will be dynamic based on last match
}

export function getPeriodoOrder(periodo, minuto = 0) {
    if (!periodo) {
        if (minuto > 90) return 4;
        if (minuto > 45) return 3;
        return 1;
    }
    const p = String(periodo).toLowerCase().trim();
    if (p.includes('1') && (p.includes('parte') || p.includes('tiempo'))) return 1;
    if (p.includes('descanso')) return 2;
    if (p.includes('2') && (p.includes('parte') || p.includes('tiempo'))) return 3;
    if (p.includes('prórroga 1') || p.includes('prorroga 1') || (p.includes('prórroga') && p.includes('1')) || (p.includes('prorroga') && p.includes('1'))) return 4;
    if (p.includes('prórroga 2') || p.includes('prorroga 2') || (p.includes('prórroga') && p.includes('2')) || (p.includes('prorroga') && p.includes('2'))) return 5;
    if (p.includes('penalti')) return 6;
    if (p.includes('finalizado')) return 7;
    return 1;
}

export function formatearTiempoAnotado(min, sec) {
    const m = String(Math.max(0, parseInt(min, 10) || 0)).padStart(2, '0');
    const s = String(Math.max(0, Math.min(59, parseInt(sec, 10) || 0))).padStart(2, '0');
    return `${m}:${s}`;
}

export function extraerTiempoEfemeride(ef) {
    if (!ef) return { min: 0, sec: 0, totalSegundos: 0, periodoOrder: 1 };
    
    let min = 0;
    let sec = 0;
    
    if (ef.minuto !== undefined && ef.minuto !== null && !isNaN(ef.minuto)) {
        min = parseInt(ef.minuto, 10) || 0;
    } else if (ef.tiempoAnotado && typeof ef.tiempoAnotado === 'string' && ef.tiempoAnotado.includes(':')) {
        const parts = ef.tiempoAnotado.split(':');
        min = parseInt(parts[0], 10) || 0;
    } else if (ef.minutoMs !== undefined && ef.minutoMs !== null && !isNaN(ef.minutoMs)) {
        min = Math.floor(ef.minutoMs / 60000);
    }
    
    if (ef.segundo !== undefined && ef.segundo !== null && !isNaN(ef.segundo)) {
        sec = parseInt(ef.segundo, 10) || 0;
    } else if (ef.tiempoAnotado && typeof ef.tiempoAnotado === 'string' && ef.tiempoAnotado.includes(':')) {
        const parts = ef.tiempoAnotado.split(':');
        sec = parseInt(parts[1], 10) || 0;
    } else if (ef.minutoMs !== undefined && ef.minutoMs !== null && !isNaN(ef.minutoMs)) {
        sec = Math.floor((ef.minutoMs % 60000) / 1000);
    }
    
    const periodoOrder = getPeriodoOrder(ef.periodo, min);
    const totalSegundos = (min * 60) + sec;
    
    return { min, sec, totalSegundos, periodoOrder };
}

export function compararEfemeridesAsc(a, b) {
    const tA = extraerTiempoEfemeride(a);
    const tB = extraerTiempoEfemeride(b);
    
    // Comparar por orden de periodo
    if (tA.periodoOrder !== tB.periodoOrder) {
        return tA.periodoOrder - tB.periodoOrder;
    }
    
    // Si están en el mismo periodo, comparar por segundos totales dentro del partido
    if (tA.totalSegundos !== tB.totalSegundos) {
        return tA.totalSegundos - tB.totalSegundos;
    }
    
    // Desempate por timestamp
    return (a.timestamp || 0) - (b.timestamp || 0);
}

export function compararEfemeridesDesc(a, b) {
    return compararEfemeridesAsc(b, a);
}