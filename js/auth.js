import { auth, db } from './firebase-config.js';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendEmailVerification, 
  signOut,
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const ADMIN_EMAIL = 'tomasdelatorre15@gmail.com';

// Función para determinar si el usuario es Administrador
async function esUsuarioAdmin(user) {
  if (!user) return false;
  if (user.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    return true;
  }
  try {
    const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      if (data.esAdmin === true || data.rol === 'admin') {
        return true;
      }
    }
  } catch (e) {
    console.error('Error al verificar rol admin:', e);
  }
  return false;
}

// Redirección centralizada según el rol del usuario
async function redirigirSegunRol(user) {
  if (!user) return;
  try {
    const isAdmin = await esUsuarioAdmin(user);

    // 1. SI ES ADMINISTRADOR -> Redirigir directamente al panel Admin sin pedir verificación de email
    if (isAdmin) {
      window.location.href = './admin.html';
      return;
    }

    // 2. SI ES CLIENTE -> Verificar si está bloqueado
    const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
    if (userDoc.exists() && userDoc.data().bloqueado) {
      await signOut(auth);
      mostrarError('loginError', 'Tu cuenta está bloqueada. Contactá con la barbería.');
      return;
    }

    // 3. SI ES CLIENTE -> Verificar si el email fue verificado
    if (!user.emailVerified) {
      await signOut(auth);
      mostrarError('loginError', 'Verificá tu correo electrónico antes de ingresar. Revisá tu casilla de correo o SPAM.');
      const reenviarElem = document.getElementById('reenviarVerificacion');
      if (reenviarElem) {
        reenviarElem.classList.remove('ocultar');
        const emailSpan = document.getElementById('reenviarEmail');
        if (emailSpan) emailSpan.textContent = user.email;
      }
      return;
    }

    // 4. CLIENTE VERIFICADO -> Redirigir a la pantalla principal
    const redirectParam = new URLSearchParams(window.location.search).get('redirect');
    window.location.href = redirectParam || '../index.html';

  } catch (error) {
    console.error('Error al verificar rol:', error);
    mostrarError('loginError', 'Error al procesar el inicio de sesión.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Tabs Login / Registro
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
      limpiarError('loginError');
    });

    tabRegistro.addEventListener('click', () => {
      tabRegistro.classList.add('tab-active');
      tabLogin.classList.remove('tab-active');
      formRegistro.classList.remove('ocultar');
      formLogin.classList.add('ocultar');
      limpiarError('regError');
    });
  }

  // Escuchar cambios de sesión al cargar la página
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      await redirigirSegunRol(user);
    }
  });

  // BOTÓN DE INICIO DE SESIÓN
  const btnLogin = document.getElementById('btnLogin');
  if (btnLogin) {
    btnLogin.addEventListener('click', async (e) => {
      e.preventDefault();
      limpiarError('loginError');

      const emailInput = document.getElementById('loginEmail');
      const passInput = document.getElementById('loginPass');
      const email = emailInput ? emailInput.value.trim() : '';
      const pass = passInput ? passInput.value.trim() : '';

      if (!email || !pass) {
        mostrarError('loginError', 'Completá tu email y contraseña.');
        return;
      }

      btnLogin.disabled = true;
      btnLogin.textContent = 'Iniciando sesión...';

      try {
        const cred = await signInWithEmailAndPassword(auth, email, pass);
        await redirigirSegunRol(cred.user);
      } catch (e) {
        console.error('Error al iniciar sesión:', e);
        let msg = 'Email o contraseña incorrectos.';
        if (e.code === 'auth/too-many-requests') {
          msg = 'Demasiados intentos fallidos. Intentá más tarde.';
        } else if (e.code === 'auth/invalid-credential' || e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password') {
          msg = 'Correo electrónico o contraseña incorrectos.';
        }
        mostrarError('loginError', msg);
        btnLogin.disabled = false;
        btnLogin.textContent = 'Ingresar';
      }
    });
  }

  // Enter en campos de login
  const loginPassElem = document.getElementById('loginPass');
  if (loginPassElem) {
    loginPassElem.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btnLogin')?.click();
      }
    });
  }

  // REGISTRO DE CLIENTES
  const btnRegistro = document.getElementById('btnRegistro');
  if (btnRegistro) {
    btnRegistro.addEventListener('click', async (e) => {
      e.preventDefault();
      limpiarError('regError');

      const nombre = document.getElementById('regNombre')?.value.trim();
      const apellido = document.getElementById('regApellido')?.value.trim();
      const telefono = document.getElementById('regTelefono')?.value.trim();
      const email = document.getElementById('regEmail')?.value.trim();
      const pass = document.getElementById('regPass')?.value.trim();
      const pass2 = document.getElementById('regPass2')?.value.trim();

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
        await setDoc(doc(db, 'usuarios', cred.user.uid), {
          nombre,
          apellido,
          telefono,
          email,
          bloqueado: false,
          creadoEn: new Date().toISOString()
        });

        await sendEmailVerification(cred.user);
        await signOut(auth);

        mostrarError('regError', '¡Cuenta creada con éxito! Te enviamos un email para verificar tu correo. Revisá tu casilla antes de ingresar.');
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

  // Enter en registro
  const regPass2Elem = document.getElementById('regPass2');
  if (regPass2Elem) {
    regPass2Elem.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btnRegistro')?.click();
      }
    });
  }

  // REENVIAR EMAIL DE VERIFICACIÓN
  const btnReenviar = document.getElementById('btnReenviar');
  if (btnReenviar) {
    btnReenviar.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail')?.value.trim();
      const pass = document.getElementById('loginPass')?.value.trim();

      if (!email || !pass) {
        mostrarError('loginError', 'Ingresá tu email y contraseña para reenviar el correo.');
        return;
      }

      try {
        btnReenviar.disabled = true;
        btnReenviar.textContent = 'Enviando...';
        const cred = await signInWithEmailAndPassword(auth, email, pass);
        await sendEmailVerification(cred.user);
        await signOut(auth);
        mostrarError('loginError', '✅ Email de verificación enviado. Por favor revisá tu casilla o SPAM.');
        document.getElementById('reenviarVerificacion')?.classList.add('ocultar');
      } catch (e) {
        console.error('Error al reenviar:', e);
        mostrarError('loginError', 'Error al reenviar. Verificá tu contraseña.');
      } finally {
        btnReenviar.disabled = false;
        btnReenviar.textContent = 'Reenviar email de verificacion';
      }
    });
  }

  function mostrarError(id, msg) {
    const elem = document.getElementById(id);
    if (elem) {
      elem.textContent = msg;
      elem.style.display = 'block';
    }
  }

  function limpiarError(id) {
    const elem = document.getElementById(id);
    if (elem) {
      elem.textContent = '';
    }
  }
});
