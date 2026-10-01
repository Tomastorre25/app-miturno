import { db, auth } from './firebase-config.js';
import {
    collection, query, where, getDocs, deleteDoc, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
    onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { crearNotificacion, mostrarNotifPush } from './notifications.js';
import { iniciarCampana } from './notif-ui.js';

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = './auth.html?redirect=turnos.html';
        return;
    }
    const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
    const userData = userDoc.data();
    if (userData?.bloqueado) {
        await signOut(auth);
        window.location.href = './auth.html';
        return;
    }
    actualizarNav(userData);
    mostrarTurnos(user.uid);
    iniciarCampana(user.uid, false);
});

function actualizarNav(userData) {
    const navbar = document.querySelector('.navbar');
    const liPerfil = document.createElement('li');
    liPerfil.innerHTML = `<a class="nav-item" href="./perfil.html">${userData.nombre}</a>`;
    const liSalir = document.createElement('li');
    liSalir.innerHTML = `<a class="nav-item" href="#" id="btnSalir">Salir</a>`;
    navbar.appendChild(liPerfil);
    navbar.appendChild(liSalir);
    document.getElementById('btnSalir').addEventListener('click', async (e) => {
        e.preventDefault();
        await signOut(auth);
        window.location.href = './auth.html';
    });
}

async function mostrarTurnos(uid) {
    const container = document.getElementById('turnosContainer');
    const mensajeVacio = document.getElementById('mensajeVacio');
    container.innerHTML = '<p class="light-text text-center" style="padding:20px;">Cargando tus turnos...</p>';

    const q = query(collection(db, "turnos"), where("usuarioId", "==", uid));
    const snapshot = await getDocs(q);
    const turnos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // Ordenar por fecha y horario
    turnos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.horario.localeCompare(b.horario));

    container.innerHTML = '';

    if (turnos.length === 0) {
        container.classList.add('ocultar');
        mensajeVacio.classList.remove('ocultar');
        return;
    }

    mensajeVacio.classList.add('ocultar');
    container.classList.remove('ocultar');

    const hoy = new Date().toISOString().split('T')[0];

    turnos.forEach(turno => {
        const pasado = turno.fecha < hoy;
        const tarjeta = document.createElement('div');
        tarjeta.className = `turno-card ${pasado ? 'turno-pasado' : ''}`;

        const info = document.createElement('div');
        info.className = 'turno-info';

        const campos = [
            ['Profesional', turno.profesional],
            ['Servicio', turno.servicio],
            ['Fecha', turno.fechaFormato],
            ['Horario', turno.horario]
        ];

        campos.forEach(([label, value]) => {
            const field = document.createElement('div');
            field.className = 'turno-field';
            field.innerHTML = `<span class="turno-label">${label}:</span> <span class="turno-value">${value}</span>`;
            info.appendChild(field);
        });

        const actions = document.createElement('div');
        actions.className = 'turno-actions';

        if (!pasado) {
            const btn = document.createElement('button');
            btn.className = 'btn btn-secondary';
            btn.textContent = 'Cancelar Turno';
            btn.addEventListener('click', () => cancelarTurno(turno.id, uid));
            actions.appendChild(btn);
        } else {
            const badge = document.createElement('span');
            badge.className = 'badge-pasado';
            badge.textContent = 'Finalizado';
            actions.appendChild(badge);
        }

        tarjeta.appendChild(info);
        tarjeta.appendChild(actions);
        container.appendChild(tarjeta);
    });
}

async function cancelarTurno(id, uid) {
    if (confirm('¿Estás seguro de que querés cancelar este turno?')) {
        // Get turno data before deleting
        const turnoDoc = await getDoc(doc(db, 'turnos', id));
        const turno = turnoDoc.exists() ? turnoDoc.data() : null;

        await deleteDoc(doc(db, "turnos", id));

        if (turno) {
            // Notificar al admin
            await crearNotificacion({
                para: 'admin',
                tipo: 'cancelacion',
                mensaje: `Turno cancelado: ${turno.clienteNombre} - ${turno.profesional} - ${turno.fechaFormato} ${turno.horario}`,
                turnoId: id
            });
            // Notif push al cliente
            mostrarNotifPush('Turno cancelado', `${turno.profesional} - ${turno.fechaFormato} a las ${turno.horario}`);
        }

        mostrarTurnos(uid);
    }
}
