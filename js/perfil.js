import { db, auth } from './firebase-config.js';
import {
    doc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
    onAuthStateChanged, signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = './auth.html';
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
    cargarPerfil(user, userData);
});

function actualizarNav(userData) {
    const navbar = document.querySelector('.navbar');
    const liSalir = document.createElement('li');
    liSalir.innerHTML = `<a class="nav-item" href="#" id="btnSalir">Salir</a>`;
    navbar.appendChild(liSalir);
    document.getElementById('btnSalir').addEventListener('click', async (e) => {
        e.preventDefault();
        await signOut(auth);
        window.location.href = './auth.html';
    });
}

function cargarPerfil(user, userData) {
    document.getElementById('perfilNombre').value = userData.nombre || '';
    document.getElementById('perfilApellido').value = userData.apellido || '';
    document.getElementById('perfilTelefono').value = userData.telefono || '';
    document.getElementById('perfilEmail').value = userData.email || '';

    // WhatsApp setup
    const perfilWpp = document.getElementById('perfilWpp');
    const perfilWppBox = document.getElementById('perfilWppBox');
    perfilWpp.checked = userData.wppActivado || false;
    perfilWppBox.classList.toggle('ocultar', !perfilWpp.checked);

    perfilWpp.addEventListener('change', () => {
        perfilWppBox.classList.toggle('ocultar', !perfilWpp.checked);
        const tel = document.getElementById('perfilTelefono').value.trim().replace(/[^0-9+]/g, '');
        const msg = encodeURIComponent('I allow callmebot to send me messages');
        document.getElementById('btnActivarWppPerfil').href = `https://wa.me/34644604991?text=${msg}`;
    });
    document.getElementById('perfilCreadoEn').textContent = userData.creadoEn
        ? new Date(userData.creadoEn).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })
        : '-';

    // Guardar datos
    document.getElementById('btnGuardarPerfil').addEventListener('click', async () => {
        const nombre = document.getElementById('perfilNombre').value.trim();
        const apellido = document.getElementById('perfilApellido').value.trim();
        const telefono = document.getElementById('perfilTelefono').value.trim();
        const msg = document.getElementById('perfilMsg');

        if (!nombre || !apellido || !telefono) {
            mostrarMsg(msg, 'Completá todos los campos.', 'error'); return;
        }

        const btn = document.getElementById('btnGuardarPerfil');
        btn.disabled = true; btn.textContent = 'Guardando...';

        const wppActivado = document.getElementById('perfilWpp').checked;
        await updateDoc(doc(db, 'usuarios', user.uid), { nombre, apellido, telefono, wppActivado });
        mostrarMsg(msg, 'Datos actualizados correctamente.', 'success');
        btn.disabled = false; btn.textContent = 'Guardar Cambios';
    });

    // Cambiar contraseña
    document.getElementById('btnCambiarPass').addEventListener('click', async () => {
        const actual = document.getElementById('passActual').value.trim();
        const nueva = document.getElementById('passNueva').value.trim();
        const nueva2 = document.getElementById('passNueva2').value.trim();
        const msg = document.getElementById('passMsg');

        if (!actual || !nueva || !nueva2) { mostrarMsg(msg, 'Completá todos los campos.', 'error'); return; }
        if (nueva !== nueva2) { mostrarMsg(msg, 'Las contraseñas nuevas no coinciden.', 'error'); return; }
        if (nueva.length < 6) { mostrarMsg(msg, 'La contraseña debe tener al menos 6 caracteres.', 'error'); return; }

        const btn = document.getElementById('btnCambiarPass');
        btn.disabled = true; btn.textContent = 'Actualizando...';

        try {
            const credential = EmailAuthProvider.credential(user.email, actual);
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, nueva);
            mostrarMsg(msg, 'Contraseña actualizada correctamente.', 'success');
            document.getElementById('passActual').value = '';
            document.getElementById('passNueva').value = '';
            document.getElementById('passNueva2').value = '';
        } catch (e) {
            if (e.code === 'auth/wrong-password') {
                mostrarMsg(msg, 'La contraseña actual es incorrecta.', 'error');
            } else {
                mostrarMsg(msg, 'Error al actualizar la contraseña.', 'error');
            }
        }
        btn.disabled = false; btn.textContent = 'Actualizar Contraseña';
    });
}

function mostrarMsg(el, texto, tipo) {
    el.textContent = texto;
    el.className = tipo === 'success' ? 'form-success' : 'form-error';
    setTimeout(() => { el.textContent = ''; }, 4000);
}
