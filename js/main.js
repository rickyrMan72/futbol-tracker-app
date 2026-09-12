import { auth, GoogleAuthProvider, signInWithPopup, linkWithPopup, signOut, onAuthStateChanged, signInAnonymously } from './firebase-config.js';
import { initNavigation, initChart } from './ui.js';
import { initEjercicios } from './mod-ejercicios.js';
import { initEquipos } from './mod-equipos.js';
import { initJugadores } from './mod-jugadores.js';
import { initSesiones } from './mod-sesiones.js';
import { initPartidos } from './mod-partidos.js';
import { initDirecto } from './mod-directo.js';
import { initPizarra } from './mod-pizarra.js';
import { initConfiguracion } from './mod-configuracion.js';
import { exportarDatos, importarDatos } from './backup.js';

let appInitialized = false;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Iniciar elementos visuales
    initNavigation();
    initChart();

    const statusBadge = document.getElementById('db-status');
    const authLoading = document.getElementById('auth-loading');
    const authLoggedOut = document.getElementById('auth-logged-out');
    const authLoggedIn = document.getElementById('auth-logged-in');
    
    // Auth UI Handlers
    document.getElementById('btn-login-google')?.addEventListener('click', async () => {
        const provider = new GoogleAuthProvider();
        // Since we are in an iframe, we might need to inform users if popup fails
        try {
            if (auth.currentUser && auth.currentUser.isAnonymous) {
                try {
                    await linkWithPopup(auth.currentUser, provider);
                } catch(error) {
                    if (error.code === 'auth/credential-already-in-use') {
                        // Account already exists with this Google email
                        await signInWithPopup(auth, provider);
                    } else {
                        throw error;
                    }
                }
            } else {
                await signInWithPopup(auth, provider);
            }
        } catch (error) {
            console.error("Error logging in:", error);
            if(error.code === 'auth/popup-blocked') {
                alert("El navegador bloqueó la ventana emergente. Por favor, permite las ventanas emergentes (popups) para este sitio.");
            } else if (error.code === 'auth/unauthorized-domain') {
                 alert("El dominio no está autorizado en Google Firebase. Por favor, contacta con soporte.");
            } else {
                alert("No se pudo iniciar sesión. Es posible que las políticas del navegador lo impidan (si estás en Firefox/Safari, prueba Chrome, o abriendo la app en ventana nueva).");
            }
        }
    });

    document.getElementById('btn-logout')?.addEventListener('click', async () => {
        try {
            await signOut(auth);
            window.location.reload();
        } catch (error) {
            console.error("Error signing out:", error);
            window.location.reload();
        }
    });

    document.getElementById('btn-export-data')?.addEventListener('click', exportarDatos);
    document.getElementById('input-import-data')?.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            importarDatos(e.target.files[0]);
        }
    });

    // 2. Conectar a Firebase y esperar estado de auth
    onAuthStateChanged(auth, async (user) => {
        if (authLoading) authLoading.classList.add('hidden');
        
        if (user) {
            statusBadge.innerHTML = '<i class="fa-solid fa-cloud text-emerald-500 mr-1"></i> BD Conectada';
            statusBadge.classList.replace('text-slate-500', 'text-emerald-700');
            statusBadge.classList.replace('bg-slate-100', 'bg-emerald-100');
            
            // Update Auth UI
            if (user.isAnonymous) {
                if (authLoggedOut) authLoggedOut.classList.remove('hidden');
                if (authLoggedIn) authLoggedIn.classList.add('hidden');
                document.getElementById('migration-container')?.classList.add('hidden');
            } else {
                if (authLoggedOut) authLoggedOut.classList.add('hidden');
                if (authLoggedIn) authLoggedIn.classList.remove('hidden');
                document.getElementById('migration-container')?.classList.remove('hidden');
                
                document.getElementById('auth-user-name').innerText = user.displayName || "Usuario";
                document.getElementById('auth-user-email').innerText = user.email || "";
                
                if (user.photoURL) {
                    document.getElementById('auth-user-photo').src = user.photoURL;
                    document.getElementById('auth-user-photo').classList.remove('hidden');
                    document.getElementById('auth-user-avatar').classList.add('hidden');
                } else {
                    document.getElementById('auth-user-photo').classList.add('hidden');
                    document.getElementById('auth-user-avatar').classList.remove('hidden');
                    document.getElementById('auth-user-avatar').innerText = (user.displayName || "U")[0].toUpperCase();
                }
            }

            // Always initialize/re-initialize modules when user state becomes valid
            initEjercicios();
            initEquipos();
            initJugadores();
            initSesiones();
            initPartidos();
            initDirecto();
            initPizarra();
            initConfiguracion();
            appInitialized = true;
        } else {
            statusBadge.innerHTML = '<i class="fa-solid fa-cloud-arrow-down text-slate-500 mr-1"></i> Desconectado';
            statusBadge.classList.replace('text-emerald-700', 'text-slate-500');
            statusBadge.classList.replace('bg-emerald-100', 'bg-slate-100');
            
            if (authLoggedOut) authLoggedOut.classList.remove('hidden');
            if (authLoggedIn) authLoggedIn.classList.add('hidden');

            // Do not init DB modules here if there is no user! App will prompt for login.
            if (!appInitialized) {
                appInitialized = true;
                // Just init UI configuration parts that don't need DB
                initConfiguracion();
            }
        }
    });
});