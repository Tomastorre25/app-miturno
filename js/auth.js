import { auth, db } from './firebase-config.js';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut, 
  sendEmailVerification 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const ADMIN_EMAIL = 'tomasdelatorre15@gmail.com';

// Tabs
const tabLogin = document.getElementById('tabLogin');
const tabRegistro = document.getElementById('tabRegistro');
const formLogin = document.getElementById('formLogin');
const formRegistro = document.getElementById('formRegistro');

if (tabLogin && tabRegistro && formLogin && formRegistro) {
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
}

// Redirección centralizada según el rol del usuario
async function redirigirSegunRol(user) {
  if (!user) return;

  try {
    const userDocRef = doc(db, 'usuarios', user.uid);
    const userDoc = await getDoc(userDocRef);
    const userData = userDoc.exists() ? userDoc.data() : null;

    // Verificar si está bloqueado
    if (userData && userData.bloqueado) {
      await signOut(auth);
      mostrarError('loginError', 'Tu cuenta está bloqueada. Contactá al administrador.');
      return;
    }

    // Comprobar si es Administrador
    const esAdmin = (user.email === ADMIN_EMAIL) || (userData && (userData.esAdmin || userData.rol === 'admin'));

    if (esAdmin) {
      // Redirigir directamente al panel de administración
      window.location.href = './admin.html';
      return;
    }

    // Si es cliente, verificar si el email fue verificado
    if (!user.emailVerified) {
      await signOut(auth);
      mostrarError('loginError', 'Verificá tu email antes de ingresar. Revisá tu bandeja de entrada o SPAM.');
      const reenviarElem = document.getElementById('reenviarVerificacion');
      if (reenviarElem) {
        reenviarElem.classList.remove('ocultar');
        const emailSpan = document.getElementById('reenviarEmail');
        if (emailSpan) emailSpan.textContent = user.email;
      }
      return;
    }

    // Cliente verificado: redirigir
    const redirectParam = new URLSearchParams(window.location.search).get('redirect');
    window.location.href = redirectParam || '../index.html';

  } catch (error) {
    console.error('Error al verificar rol:', error);
    mostrarError('loginError', 'Error al procesar el inicio de sesión.');
  }
}

// Escuchar cambios de sesión al cargar la página
onAuthStateChanged(auth, async (user) => {
  if (user) {
    await redirigirSegunRol(user);
  }
});

// LOGIN
const btnLogin = document.getElementById('btnLogin');
if (btnLogin) {
  btnLogin.addEventListener('click', async () => {
    const emailInput = document.getElementById('loginEmail');
    const passInput = document.getElementById('loginPass');
    const email = emailInput ? emailInput.value.trim() : '';
    const pass = passInput ? passInput.value.trim() : '';

    limpiarError('loginError');

    if (!email || !pass) {
      mostrarError('loginError', 'Completá email y contraseña.');
      return;
    }

    btnLogin.disabled = true;
    btnLogin.textContent = 'Ingresando...';

    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      await redirigirSegunRol(cred.user);
    } catch (e) {
      console.error('Error al iniciar sesión:', e);
      let msg = 'Email o contraseña incorrectos.';
      if (e.code === 'auth/too-many-requests') {
        msg = 'Demasiados intentos fallidos. Intentá más tarde.';
      }
      mostrarError('loginError', msg);
    } finally {
      btnLogin.disabled = false;
      btnLogin.textContent = 'Ingresar';
    }
  });
}

// Enter en contraseña de login
const loginPassElem = document.getElementById('loginPass');
if (loginPassElem) {
  loginPassElem.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btnLogin').click();
    }
  });
}

// WhatsApp checkbox
const regWppCheck = document.getElementById('regWppCheck');
if (regWppCheck) {
  regWppCheck.addEventListener('change', (e) => {
    const container = document.getElementById('wppActivarContainer');
    if (container) container.classList.toggle('ocultar', !e.target.checked);
  });
}

const regTelefonoInput = document.getElementById('regTelefono');
if (regTelefonoInput) {
  regTelefonoInput.addEventListener('input', () => {
    const tel = regTelefonoInput.value.trim().replace(/[^0-9+]/g, '');
    const mensaje = encodeURIComponent('I allow callmebot to send me messages');
    const btnActivar = document.getElementById('btnActivarWpp');
    if (btnActivar) btnActivar.href = `https://wa.me/34644604991?text=${mensaje}`;
  });
}

// REGISTRO DE CLIENTES
const btnRegistro = document.getElementById('btnRegistro');
if (btnRegistro) {
  btnRegistro.addEventListener('click', async () => {
    const nombre = document.getElementById('regNombre')?.value.trim();
    const apellido = document.getElementById('regApellido')?.value.trim();
    const telefono = document.getElementById('regTelefono')?.value.trim();
    const email = document.getElementById('regEmail')?.value.trim();
    const pass = document.getElementById('regPass')?.value.trim();
    const pass2 = document.getElementById('regPass2')?.value.trim();

    limpiarError('regError');

    if (!nombre || !apellido || !telefono || !email || !pass || !pass2) {
      mostrarError('regError', 'Completá todos los campos.');
      return;
    }

    if (pass !== pass2) {
      mostrarError('regError', 'Las contraseñas no coinciden.');
      return;
    }

    if (pass.length < 6) {
      mostrarError('regError', 'La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    btnRegistro.disabled = true;
    btnRegistro.textContent = 'Creando cuenta...';

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      const regWppElem = document.getElementById('regWpp');
      const wppActivadoElem = document.getElementById('wppActivado');
      const wppActivado = regWppElem?.checked && wppActivadoElem?.checked;

      await setDoc(doc(db, 'usuarios', cred.user.uid), {
        nombre,
        apellido,
        telefono,
        email,
        bloqueado: false,
        wppActivado: !!wppActivado,
        creadoEn: new Date().toISOString()
      });

      await sendEmailVerification(cred.user);
      await signOut(auth);

      mostrarError('regError', '¡Cuenta creada con éxito! Se envió un correo de verificación. Revisá tu email antes de ingresar.');
      document.getElementById('formRegistro')?.reset();
    } catch (e) {
      console.error('Error al registrar:', e);
      let msg = 'Error al crear la cuenta.';
      if (e.code === 'auth/email-already-in-use') msg = 'Ya existe una cuenta con ese email.';
      if (e.code === 'auth/invalid-email') msg = 'El email no es válido.';
      mostrarError('regError', msg);
    } finally {
      btnRegistro.disabled = false;
      btnRegistro.textContent = 'Crear Cuenta';
    }
  });
}

const regPass2Elem = document.getElementById('regPass2');
if (regPass2Elem) {
  regPass2Elem.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btnRegistro').click();
    }
  });
}

// Reenviar email de verificación
const btnReenviar = document.getElementById('btnReenviar');
if (btnReenviar) {
  btnReenviar.addEventListener('click', async () => {
    const email = document.getElementById('loginEmail')?.value.trim();
    const pass = document.getElementById('loginPass')?.value.trim();

    if (!email || !pass) {
      mostrarError('loginError', 'Ingresá email y contraseña para reenviar.');
      return;
    }

    try {
      btnReenviar.disabled = true;
      btnReenviar.textContent = 'Enviando...';
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      await sendEmailVerification(cred.user);
      await signOut(auth);
      mostrarError('loginError', 'Email de verificación reenviado. Revisá tu bandeja.');
      document.getElementById('reenviarVerificacion')?.classList.add('ocultar');
    } catch (e) {
      console.error('Error al reenviar:', e);
      mostrarError('loginError', 'Error al reenviar. Verificá tus datos.');
    } finally {
      btnReenviar.disabled = false;
      btnReenviar.textContent = 'Reenviar email de verificación';
    }
  });
}

function mostrarError(id, msg) {
  const elem = document.getElementById(id);
  if (elem) elem.textContent = msg;
}

function limpiarError(id) {
  const elem = document.getElementById(id);
  if (elem) elem.textContent = '';
}
