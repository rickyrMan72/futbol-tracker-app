import { auth, signInAnonymously } from './firebase-config.js';
import { initNavigation, initChart } from './ui.js';
import { initEjercicios } from './mod-ejercicios.js';
import { initEquipos } from './mod-equipos.js';
import { initJugadores } from './mod-jugadores.js';
import { initSesiones } from './mod-sesiones.js';
import { initPartidos } from './mod-partidos.js';
import { initDirecto } from './mod-directo.js';
import { initPizarra } from './mod-pizarra.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Iniciar elementos visuales
    initNavigation();
    initChart();

    const statusBadge = document.getElementById('db-status');

    // 2. Conectar a Firebase y arrancar los módulos
    signInAnonymously(auth).then(() => {
        statusBadge.innerHTML = '<i class="fa-solid fa-cloud text-emerald-500 mr-1"></i> BD Conectada';
        statusBadge.classList.replace('text-slate-500', 'text-emerald-700');
        statusBadge.classList.replace('bg-slate-100', 'bg-emerald-100');
        
        initEjercicios();
        initEquipos();
        initJugadores();
        initSesiones();
        initPartidos();
        initDirecto();
        initPizarra();
        
    }).catch((error) => {
        console.error("Error Firebase:", error);
        statusBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-red-500 mr-1"></i> Error de Red';
    });
});