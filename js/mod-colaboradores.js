import { auth, db, collection, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc, arrayUnion } from './firebase-config.js';
import { mostrarNotificacion, bindModal, confirmarAccion } from './ui.js';
import { equipoIdActivo } from './mod-jugadores.js';
import { todosLosEquipos, getRolActual } from './mod-equipos.js';

export function initColaboradores() {
    // Modal Unirse a Equipo
    bindModal('modal-unirse-equipo', 'btn-open-modal-unirse', 'btn-close-modal-unirse', 'btn-cancel-modal-unirse');
    
    document.getElementById('btn-save-modal-unirse').addEventListener('click', async () => {
        const codigoInput = document.getElementById('input-codigo-invitacion').value.trim().toUpperCase();
        if (codigoInput.length !== 6) {
            alert('El código debe tener 6 caracteres.');
            return;
        }

        try {
            document.getElementById('btn-save-modal-unirse').disabled = true;
            document.getElementById('btn-save-modal-unirse').innerText = "Uniéndose...";

            // Buscar invitacion (como su ID es el codigo)
            const invRef = doc(db, 'invitaciones', codigoInput);
            const invSnap = await getDoc(invRef);

            if (!invSnap.exists()) {
                alert('Código de invitación no válido o ya ha sido utilizado.');
                return;
            }

            const invData = invSnap.data();
            const { equipoId, rol } = invData;

            // Actualizar equipo
            const equipoRef = doc(db, 'equipos', equipoId);
            
            // Usamos el invitacion_code para pasar la validación en Firestore rules
            await updateDoc(equipoRef, {
                miembros: arrayUnion(auth.currentUser.uid),
                [`roles.${auth.currentUser.uid}`]: rol,
                invitacion_code: codigoInput 
            });

            // Borrar la invitación para que sea de un solo uso
            try {
                await deleteDoc(invRef);
            } catch (e) {
                console.warn("No se pudo borrar la invitación:", e);
            }

            mostrarNotificacion("¡Te has unido al equipo correctamente!");
            document.getElementById('modal-unirse-equipo').classList.add('hidden');
            document.getElementById('input-codigo-invitacion').value = '';

        } catch (err) {
            console.error("Error al unirse al equipo:", err);
            alert("Hubo un error al intentar unirte al equipo.");
        } finally {
            document.getElementById('btn-save-modal-unirse').disabled = false;
            document.getElementById('btn-save-modal-unirse').innerText = "Unirse";
        }
    });

    // Modal Miembros
    bindModal('modal-miembros-equipo', 'btn-team-members', 'btn-close-modal-miembros');

    document.getElementById('btn-team-members').addEventListener('click', () => {
        if (!equipoIdActivo) {
            alert("Selecciona un equipo primero.");
            return;
        }
        
        // Comprobar si es admin
        const equipoActual = todosLosEquipos.find(eq => eq.id === equipoIdActivo);
        if (!equipoActual) return;
        
        const myRole = getRolActual();
        const isAdmin = myRole === 'admin' || myRole === 'superadmin';

        // Ocultar sección de invitar si no es admin
        const sectionInvitar = document.getElementById('btn-generar-invitacion').parentElement.parentElement;
        if (isAdmin) {
            sectionInvitar.classList.remove('hidden');
        } else {
            sectionInvitar.classList.add('hidden');
        }

        renderListaMiembros(equipoActual);
    });

    document.getElementById('btn-generar-invitacion').addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            const selectEquipo = document.getElementById('select-equipo');
            const currentEquipoId = equipoIdActivo || (selectEquipo ? selectEquipo.value : null);

            if (!currentEquipoId) {
                alert("Selecciona un equipo primero.");
                return;
            }
            
            const rol = document.getElementById('select-rol-invitacion').value;
            const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let codigo = '';
            for (let i = 0; i < 6; i++) {
                codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
            }

            const btnGenerar = document.getElementById('btn-generar-invitacion');
            btnGenerar.disabled = true;
            btnGenerar.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-1"></i> Generando...';
            
            const invRef = doc(db, 'invitaciones', codigo);
            await setDoc(invRef, {
                equipoId: currentEquipoId,
                rol: rol,
                creadoPor: auth.currentUser.uid,
                createdAt: new Date().toISOString()
            });

            const container = document.getElementById('container-codigo-generado');
            const display = document.getElementById('display-codigo-generado');
            
            display.innerText = codigo;
            container.classList.remove('hidden');
            
            mostrarNotificacion("Código de un solo uso generado.");

            btnGenerar.disabled = false;
            btnGenerar.innerHTML = '<i class="fa-solid fa-ticket mr-1"></i> Generar Código';
        } catch (err) {
            console.error("Error generando código:", err);
            alert("Error al generar: " + err.message);
            const btnGenerar = document.getElementById('btn-generar-invitacion');
            btnGenerar.disabled = false;
            btnGenerar.innerHTML = '<i class="fa-solid fa-ticket mr-1"></i> Generar Código';
        }
    });

    document.getElementById('btn-copy-codigo').addEventListener('click', () => {
        const codigo = document.getElementById('display-codigo-generado').innerText;
        navigator.clipboard.writeText(codigo).then(() => {
            mostrarNotificacion("Código copiado al portapapeles");
        });
    });
}

function renderListaMiembros(equipo) {
    const ul = document.getElementById('lista-miembros');
    ul.innerHTML = '';

    if (!equipo.miembros) return;

    equipo.miembros.forEach(uid => {
        const rol = (equipo.roles && equipo.roles[uid]) ? equipo.roles[uid] : 'viewer';
        
        let colorRol = 'bg-slate-100 text-slate-600';
        let nombreRol = 'Observador';
        
        if (rol === 'admin') {
            colorRol = 'bg-purple-100 text-purple-700';
            nombreRol = 'Admin';
        } else if (rol === 'editor') {
            colorRol = 'bg-blue-100 text-blue-700';
            nombreRol = 'Editor';
        }

        const isMe = uid === auth.currentUser.uid;
        
        const li = document.createElement('li');
        li.className = 'px-6 py-4 flex items-center justify-between';
        
        li.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold">
                    <i class="fa-solid fa-user"></i>
                </div>
                <div>
                    <p class="font-bold text-sm text-slate-800">${uid.substring(0,6)}...${uid.substring(uid.length-4)} ${isMe ? '<span class="text-xs font-normal text-slate-500">(Tú)</span>' : ''}</p>
                    <span class="text-xs font-medium px-2 py-0.5 rounded ${colorRol}">${nombreRol}</span>
                </div>
            </div>
            ${!isMe ? `<button class="require-admin w-8 h-8 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors btn-remove-member" data-uid="${uid}" title="Expulsar"><i class="fa-solid fa-user-minus"></i></button>` : ''}
        `;
        
        ul.appendChild(li);
    });

    // Añadir eventos a los botones de expulsar
    const btnsRemove = ul.querySelectorAll('.btn-remove-member');
    btnsRemove.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const myRole = getRolActual();
            if (myRole !== 'admin' && myRole !== 'superadmin') {
                alert("Solo los administradores pueden expulsar miembros.");
                return;
            }

            const targetUid = e.currentTarget.getAttribute('data-uid');
            if (await confirmarAccion("¿Seguro que quieres expulsar a este usuario?")) {
                try {
                    const equipoRef = doc(db, 'equipos', equipo.id);
                    
                    // Tenemos que copiar los roles, borrar el que quitamos y guardar (o se puede hacer con FieldValue.delete())
                    // Sin embargo, las reglas restringen, así que actualizamos roles con lo que queda.
                    const nuevosMiembros = equipo.miembros.filter(m => m !== targetUid);
                    const nuevosRoles = { ...equipo.roles };
                    delete nuevosRoles[targetUid];

                    await updateDoc(equipoRef, {
                        miembros: nuevosMiembros,
                        roles: nuevosRoles
                    });

                    mostrarNotificacion("Miembro expulsado");
                    // Ocultar modal para que no se raye o recargarlo
                    document.getElementById('modal-miembros-equipo').classList.add('hidden');
                } catch (err) {
                    console.error("Error al expulsar", err);
                    alert("Error al expulsar al miembro.");
                }
            }
        });
    });
}
