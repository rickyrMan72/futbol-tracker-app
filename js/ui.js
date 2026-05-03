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
    document.getElementById(idBtnOpen).addEventListener('click', openModal);
    document.getElementById(idBtnClose).addEventListener('click', closeModal);
    document.getElementById(idBtnCancel).addEventListener('click', closeModal);
    return closeModal;
}

export function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const views = document.querySelectorAll('.app-view');
    const headerTitle = document.getElementById('header-title');
    const titulos = { 'view-dashboard': 'Panel de Control', 'view-plantilla': 'Plantilla', 'view-ejercicios': 'Ejercicios', 'view-sesiones': 'Sesiones', 'view-partidos': 'Partidos', 'view-pizarra': 'Pizarra' };

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
            navLinks.forEach(l => l.className = 'nav-link hover:bg-slate-800 hover:text-white border-r-4 border-transparent flex items-center px-6 py-3 transition-colors');
            link.className = 'nav-link bg-emerald-600 text-white border-r-4 border-emerald-400 flex items-center px-6 py-3 transition-colors';
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
    const ctx = document.getElementById('rendimientoChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
            datasets: [
                { label: 'Distancia (Km)', data: [4.2, 7.8, 8.5, 5.1, 3.2], backgroundColor: 'rgba(16, 185, 129, 0.8)', borderRadius: 4 },
                { type: 'line', label: 'Carga (RPE)', data: [3, 8, 7, 5, 2], borderColor: 'rgba(59, 130, 246, 1)', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderWidth: 2, tension: 0.3, fill: true }
            ]
        },
        options: { maintainAspectRatio: false, responsive: true, scales: { y: { beginAtZero: true } } }
    });
}