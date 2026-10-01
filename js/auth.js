import { auth, db } from './firebase-config.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    doc, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Tabs
const tabLogin = document.getElementById('tabLogin');
const tabRegistro = document.getElementById('tabRegistro');
const formLogin = document.getElementById('formLogin');
const formRegistro = document.getElementById('formRegistro');

tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('tab-active');
    tabRegistro.classList.remove('tab-active');
    formLogin.classList.remove('ocultar');
    formRegistro.classList.add('ocultar');
});

tabRegistro.addEventListener('click', () => {
    tabRegistro.classList.add('tab-active');
    tabLogin.classList.remove('tab-active');
    formRegistro.classList.remove('ocultar');
    formLogin.classList.add('ocultar');
});

// Si ya está logueado, redirigir
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
        const userData = userDoc.data();
        if (userData?.bloqueado) {
            await signOut(auth);
            mostrarError('loginError', 'Tu cuenta está bloqueada. Contactá al administrador.');
            return;
        }
        const redirect = new URLSearchParams(window.location.search).get('redirect') || '../index.html';
        window.location.href = redirect;
    }
});

// LOGIN
document.getElementById('btnLogin').addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    limpiarError('loginError');

    if (!email || !pass) { mostrarError('loginError', 'Completá todos los campos.'); return; }

    const btn = document.getElementById('btnLogin');
    btn.disabled = true; btn.textContent = 'Ingresando...';

    try {
        const cred = await signInWithEmailAndPassword(auth, email, pass);
        if (!cred.user.emailVerified) {
            await signOut(auth);
            mostrarError('loginError', 'Verificá tu email antes de ingresar. Revisá tu bandeja de entrada.');
            // Show resend option
            document.getElementById('reenviarVerificacion').classList.remove('ocultar');
            document.getElementById('reenviarEmail').textContent = email;
            btn.disabled = false; btn.textContent = 'Ingresar';
            return;
        }
    } catch (e) {
        mostrarError('loginError', 'Email o contraseña incorrectos.');
        btn.disabled = false; btn.textContent = 'Ingresar';
    }
});

// WhatsApp checkbox
document.getElementById('regWppCheck').addEventListener('change', (e) => {
    const container = document.getElementById('wppActivarContainer');
    container.classList.toggle('ocultar', !e.target.checked);
});

document.getElementById('regTelefono').addEventListener('input', () => {
    const tel = document.getElementById('regTelefono').value.trim().replace(/[^0-9+]/g, '');
    const mensaje = encodeURIComponent('I allow callmebot to send me messages');
    document.getElementById('btnActivarWpp').href = `https://wa.me/34644604991?text=${mensaje}`;
});

// REGISTRO
document.getElementById('btnRegistro').addEventListener('click', async () => {
    const nombre = document.getElementById('regNombre').value.trim();
    const apellido = document.getElementById('regApellido').value.trim();
    const telefono = document.getElementById('regTelefono').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPass').value.trim();
    const pass2 = document.getElementById('regPass2').value.trim();
    limpiarError('regError');

    if (!nombre || !apellido || !telefono || !email || !pass || !pass2) {
        mostrarError('regError', 'Completá todos los campos.'); return;
    }
    if (pass !== pass2) { mostrarError('regError', 'Las contraseñas no coinciden.'); return; }
    if (pass.length < 6) { mostrarError('regError', 'La contraseña debe tener al menos 6 caracteres.'); return; }

    const btn = document.getElementById('btnRegistro');
    btn.disabled = true; btn.textContent = 'Creando cuenta...';

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        const wppActivado = document.getElementById('regWpp').checked && document.getElementById('wppActivado').checked;
        await setDoc(doc(db, 'usuarios', cred.user.uid), {
            nombre,
            apellido,
            telefono,
            email,
            bloqueado: false,
            wppActivado,
            creadoEn: new Date().toISOString()
        });
    } catch (e) {
        let msg = 'Error al crear la cuenta.';
        if (e.code === 'auth/email-already-in-use') msg = 'Ya existe una cuenta con ese email.';
        if (e.code === 'auth/invalid-email') msg = 'El email no es válido.';
        mostrarError('regError', msg);
        btn.disabled = false; btn.textContent = 'Crear Cuenta';
    }
});

// Enter
document.getElementById('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btnLogin').click(); });
document.getElementById('regPass2').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btnRegistro').click(); });

// Reenviar email de verificacion
document.getElementById('btnReenviar').addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    if (!email || !pass) { mostrarError('loginError', 'Ingresa email y contraseña para reenviar.'); return; }
    try {
        const cred = await signInWithEmailAndPassword(auth, email, pass);
        await sendEmailVerification(cred.user);
        await signOut(auth);
        mostrarError('loginError', 'Email de verificacion reenviado. Revisá tu bandeja.');
        document.getElementById('reenviarVerificacion').classList.add('ocultar');
    } catch(e) {
        mostrarError('loginError', 'Error al reenviar. Verificá tus datos.');
    }
});

function mostrarError(id, msg) { document.getElementById(id).textContent = msg; }
function limpiarError(id) { document.getElementById(id).textContent = ''; }
