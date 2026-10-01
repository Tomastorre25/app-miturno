import { auth, db } from './firebase-config.js';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendEmailVerification, 
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let usuarioPendienteVerificacion = null;
const ADMIN_EMAIL = 'tomasdelatorre15@gmail.com';

document.addEventListener('DOMContentLoaded', () => {
  // Elementos de Pestañas / Cambio de formulario
  const tabLogin = document.getElementById('tabLogin') || document.getElementById('btnToggleLogin');
  const tabRegistro = document.getElementById('tabRegistro') || document.getElementById('btnToggleRegistro');
  
  const formLoginBox = document.getElementById('formLogin') || document.getElementById('sectionLogin');
  const formRegistroBox = document.getElementById('formRegistro') || document.getElementById('sectionRegistro');

  const btnLogin = document.getElementById('btnLogin') || document.querySelector('#formLogin button');
  const btnRegistro = document.getElementById('btnRegistro') || document.querySelector('#formRegistro button');
  const btnReenviar = document.getElementById('btnReenviar') || document.getElementById('btnReenviarVerificacion');
  const btnOlvidarPassword = document.getElementById('btnOlvidarPassword');

  const errorLogin = document.getElementById('loginError') || document.getElementById('msgErrorLogin');
  const errorRegistro = document.getElementById('regError') || document.getElementById('msgErrorRegistro');
  const successRegistro = document.getElementById('msgSuccessRegistro');

  // -------------------------------------------------------------
  // 0. VERIFICAR SESIÓN ACTIVA AL CARGAR
  // -------------------------------------------------------------
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      let esAdmin = false;
      if (user.email === ADMIN_EMAIL) {
        esAdmin = true;
      } else {
        try {
          const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
          if (userDoc.exists() && userDoc.data().esAdmin) {
            esAdmin = true;
          }
        } catch(e) {}
      }

      if (user.emailVerified || esAdmin) {
        if (esAdmin) {
          window.location.href = './admin.html';
        } else {
          window.location.href = '../index.html';
        }
      }
    }
  });

  // -------------------------------------------------------------
  // 1. ALTERNAR PESTAÑAS (INGRESAR / CREAR CUENTA)
  // -------------------------------------------------------------
  if (tabLogin) {
    tabLogin.addEventListener('click', (e) => {
      e.preventDefault();
      ocultarMensajes();
      if (tabLogin.classList.contains('tab-btn')) {
        tabLogin.classList.add('tab-active');
        if (tabRegistro) tabRegistro.classList.remove('tab-active');
      }
      if (formRegistroBox) formRegistroBox.classList.add('ocultar');
      if (formLoginBox) formLoginBox.classList.remove('ocultar');
    });
  }

  if (tabRegistro) {
    tabRegistro.addEventListener('click', (e) => {
      e.preventDefault();
      ocultarMensajes();
      if (tabRegistro.classList.contains('tab-btn')) {
        tabRegistro.classList.add('tab-active');
        if (tabLogin) tabLogin.classList.remove('tab-active');
      }
      if (formLoginBox) formLoginBox.classList.add('ocultar');
      if (formRegistroBox) formRegistroBox.classList.remove('ocultar');
    });
  }

  function ocultarMensajes() {
    if (errorLogin) { errorLogin.style.display = 'none'; errorLogin.textContent = ''; }
    if (errorRegistro) { errorRegistro.style.display = 'none'; errorRegistro.textContent = ''; }
  }

  // -------------------------------------------------------------
  // 2. INICIO DE SESIÓN UNIFICADO (CLIENTE Y ADMIN)
  // -------------------------------------------------------------
  async function ejecutarLogin() {
    ocultarMensajes();

    const emailInput = document.getElementById('loginEmail');
    const passInput = document.getElementById('loginPass') || document.getElementById('loginPassword');

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passInput ? passInput.value : '';

    if (!email || !password) {
      mostrarMensaje(errorLogin, 'Por favor completá tu correo y contraseña.', true);
      return;
    }

    if (btnLogin) {
      btnLogin.disabled = true;
      btnLogin.textContent = 'Iniciando sesión...';
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      usuarioPendienteVerificacion = user;

      // Verificar si tiene permisos de Administrador
      let esAdmin = false;
      if (user.email === ADMIN_EMAIL) {
        esAdmin = true;
      } else {
        try {
          const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
          if (userDoc.exists() && userDoc.data().esAdmin) {
            esAdmin = true;
          }
        } catch (e) {
          console.error('Error verificando admin:', e);
        }
      }

      // Validar correo verificado (se omite para administradores)
      if (!user.emailVerified && !esAdmin) {
        mostrarMensaje(errorLogin, 'Tu correo electrónico aún no ha sido verificado. Revisá tu casilla de correo.', true);
        const reenviarBox = document.getElementById('reenviarVerificacion');
        if (reenviarBox) reenviarBox.classList.remove('ocultar');
        const reenviarEmailTxt = document.getElementById('reenviarEmail');
        if (reenviarEmailTxt) reenviarEmailTxt.textContent = email;

        if (btnLogin) {
          btnLogin.disabled = false;
          btnLogin.textContent = 'Ingresar';
        }
        return;
      }

      // Validar si la cuenta está bloqueada (solo clientes)
      if (!esAdmin) {
        const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
        if (userDoc.exists() && userDoc.data().bloqueado) {
          await signOut(auth);
          mostrarMensaje(errorLogin, 'Esta cuenta ha sido bloqueada. Contactá con la barbería.', true);
          if (btnLogin) {
            btnLogin.disabled = false;
            btnLogin.textContent = 'Ingresar';
          }
          return;
        }
      }

      // REDIRECCIÓN UNIFICADA SEGÚN EL ROL DEL USUARIO
      if (esAdmin) {
        window.location.href = './admin.html';
      } else {
        window.location.href = '../index.html';
      }

    } catch (error) {
      console.error('Error al iniciar sesión:', error);
      let mensaje = 'Error al iniciar sesión. Verificá tus credenciales.';
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        mensaje = 'Correo electrónico o contraseña incorrectos.';
      } else if (error.code === 'auth/too-many-requests') {
        mensaje = 'Demasiados intentos fallidos. Intentá de nuevo más tarde.';
      }
      mostrarMensaje(errorLogin, mensaje, true);

      if (btnLogin) {
        btnLogin.disabled = false;
        btnLogin.textContent = 'Ingresar';
      }
    }
  }

  // Escuchar clic en botón e Inserción con tecla Enter
  if (btnLogin) {
    btnLogin.addEventListener('click', (e) => {
      e.preventDefault();
      ejecutarLogin();
    });
  }

  const passInput = document.getElementById('loginPass') || document.getElementById('loginPassword');
  if (passInput) {
    passInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        ejecutarLogin();
      }
    });
  }

  // -------------------------------------------------------------
  // 3. REENVIAR EMAIL DE VERIFICACIÓN
  // -------------------------------------------------------------
  if (btnReenviar) {
    btnReenviar.addEventListener('click', async (e) => {
      e.preventDefault();
      ocultarMensajes();
      btnReenviar.disabled = true;
      btnReenviar.textContent = 'Enviando email...';

      try {
        let userParaEnviar = usuarioPendienteVerificacion || auth.currentUser;
        if (!userParaEnviar) {
          const email = document.getElementById('loginEmail')?.value.trim();
          const password = (document.getElementById('loginPass') || document.getElementById('loginPassword'))?.value;
          if (email && password) {
            const cred = await signInWithEmailAndPassword(auth, email, password);
            userParaEnviar = cred.user;
          }
        }

        if (userParaEnviar) {
          await sendEmailVerification(userParaEnviar);
          mostrarMensaje(errorLogin, '✅ Email de verificación enviado. Revisá tu casilla de correo.', false);
        } else {
          mostrarMensaje(errorLogin, 'Ingresá tu email y contraseña para reenviar la verificación.', true);
        }
      } catch (error) {
        console.error('Error al reenviar email de verificación:', error);
        mostrarMensaje(errorLogin, 'Error al reenviar el correo. Intentá de nuevo en un minuto.', true);
      } finally {
        btnReenviar.disabled = false;
        btnReenviar.textContent = 'Reenviar email de verificación';
      }
    });
  }

  // -------------------------------------------------------------
  // 4. CREAR CUENTA / REGISTRO
  // -------------------------------------------------------------
  async function ejecutarRegistro() {
    ocultarMensajes();

    const nombre = document.getElementById('regNombre')?.value.trim();
    const apellido = document.getElementById('regApellido')?.value.trim();
    const telefono = document.getElementById('regTelefono')?.value.trim();
    const email = document.getElementById('regEmail')?.value.trim();
    const pass = (document.getElementById('regPass') || document.getElementById('regPassword'))?.value;
    const pass2 = document.getElementById('regPass2')?.value;

    if (!nombre || !apellido || !telefono || !email || !pass) {
      mostrarMensaje(errorRegistro, 'Por favor completá todos los campos obligatorios.', true);
      return;
    }

    if (pass2 !== undefined && pass !== pass2) {
      mostrarMensaje(errorRegistro, 'Las contraseñas no coinciden.', true);
      return;
    }

    if (pass.length < 6) {
      mostrarMensaje(errorRegistro, 'La contraseña debe tener al menos 6 caracteres.', true);
      return;
    }

    if (btnRegistro) {
      btnRegistro.disabled = true;
      btnRegistro.textContent = 'Creando cuenta...';
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const user = userCredential.user;

      await setDoc(doc(db, 'usuarios', user.uid), {
        nombre,
        apellido,
        telefono,
        email,
        bloqueado: false,
        esAdmin: false,
        creadoEn: new Date().toISOString()
      });

      await sendEmailVerification(user);

      mostrarMensaje(successRegistro || errorRegistro, '¡Cuenta creada! Te enviamos un enlace de verificación a tu email.', false);

      if (tabLogin) tabLogin.click();
      const loginEmailInput = document.getElementById('loginEmail');
      if (loginEmailInput) loginEmailInput.value = email;

    } catch (error) {
      console.error('Error al registrar usuario:', error);
      let mensaje = 'Error al crear la cuenta.';
      if (error.code === 'auth/email-already-in-use') {
        mensaje = 'El correo electrónico ya está registrado.';
      } else if (error.code === 'auth/invalid-email') {
        mensaje = 'El correo electrónico no es válido.';
      } else if (error.code === 'auth/weak-password') {
        mensaje = 'La contraseña debe tener al menos 6 caracteres.';
      }
      mostrarMensaje(errorRegistro, mensaje, true);
    } finally {
      if (btnRegistro) {
        btnRegistro.disabled = false;
        btnRegistro.textContent = 'Crear Cuenta';
      }
    }
  }

  if (btnRegistro) {
    btnRegistro.addEventListener('click', (e) => {
      e.preventDefault();
      ejecutarRegistro();
    });
  }

  // -------------------------------------------------------------
  // 5. RECUPERAR CONTRASEÑA
  // -------------------------------------------------------------
  if (btnOlvidarPassword) {
    btnOlvidarPassword.addEventListener('click', async (e) => {
      e.preventDefault();
      ocultarMensajes();
      const email = document.getElementById('loginEmail')?.value.trim();
      if (!email) {
        mostrarMensaje(errorLogin, 'Ingresá tu correo electrónico para enviarte el enlace de recuperación.', true);
        return;
      }
      try {
        await sendPasswordResetEmail(auth, email);
        mostrarMensaje(errorLogin, 'Te enviamos un enlace para restablecer tu contraseña a tu correo.', false);
      } catch (error) {
        console.error('Error al enviar recuperación:', error);
        mostrarMensaje(errorLogin, 'No se pudo enviar el correo de recuperación. Verificá tu email.', true);
      }
    });
  }

  function mostrarMensaje(elemento, mensaje, esError) {
    if (elemento) {
      elemento.textContent = mensaje;
      elemento.style.display = 'block';
      elemento.style.color = esError ? '#e74c3c' : '#2ecc71';
    } else {
      alert(mensaje);
    }
  }
});
