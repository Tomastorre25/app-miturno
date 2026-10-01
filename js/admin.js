import { db, auth } from './firebase-config.js';
import { iniciarCalendario, actualizarTurnos } from './calendario.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
  collection, getDocs, deleteDoc, doc, query, orderBy, updateDoc, getDoc, addDoc, setDoc, where 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { 
  crearNotificacion, mostrarNotifPush, solicitarPermisoPush, enviarEmailCancelacion, enviarEmailModificacion 
} from './notifications.js';
import { iniciarCampana } from './notif-ui.js';

let todosLosTurnos = [];
let todosLosUsuarios = [];
let profesionales = [];
let vistaActual = 'lista';
let mesActual = new Date();

const ADMIN_EMAIL = 'tomasdelatorre15@gmail.com';

// Verificación de autenticación y permisos de Administrador
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Si no está autenticado, redirigir al formulario de inicio de sesión único
    window.location.href = './auth.html';
    return;
  }

  // Comprobar si el usuario posee permisos de administrador
  let esAdmin = (user.email === ADMIN_EMAIL);

  if (!esAdmin) {
    try {
      const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
      if (userDoc.exists() && (userDoc.data().esAdmin || userDoc.data().rol === 'admin')) {
        esAdmin = true;
      }
    } catch (e) {
      console.error('Error al verificar permisos de admin:', e);
    }
  }

  if (!esAdmin) {
    alert('Acceso no autorizado. Redirigiendo...');
    window.location.href = '../index.html';
    return;
  }

  // Usuario verificado como administrador: Mostrar panel y cargar datos
  mostrarPanel();
  await Promise.all([cargarTurnos(), cargarUsuarios(), cargarProfesionales()]);
  iniciarCampana(user.uid, true);
});

document.getElementById('btnLogout')?.addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = './auth.html';
});

// Navegación secciones
['Turnos', 'Usuarios', 'Profesionales', 'Servicios', 'Horarios'].forEach(seccion => {
  const btn = document.getElementById(`btnSeccion${seccion}`);
  if (btn) {
    btn.addEventListener('click', () => cambiarSeccion(seccion.toLowerCase()));
  }
});

function cambiarSeccion(seccion) {
  ['turnos', 'usuarios', 'profesionales', 'servicios', 'horarios'].forEach(s => {
    const secElem = document.getElementById(`seccion${s.charAt(0).toUpperCase() + s.slice(1)}`);
    if (secElem) secElem.classList.toggle('ocultar', s !== seccion);
    
    const btn = document.getElementById(`btnSeccion${s.charAt(0).toUpperCase() + s.slice(1)}`);
    if (btn) {
      btn.classList.toggle('btn-primary', s === seccion);
      btn.classList.toggle('btn-secondary', s !== seccion);
    }
  });

  if (seccion === 'servicios') renderizarSelectorProfesionalServicios();
  if (seccion === 'horarios') renderizarSelectorProfesionalHorarios();
}

function mostrarLogin() {
  const loginSec = document.getElementById('loginSection');
  const panelSec = document.getElementById('panelSection');
  if (loginSec) loginSec.classList.remove('ocultar');
  if (panelSec) panelSec.classList.add('ocultar');
}

function mostrarPanel() {
  const loginSec = document.getElementById('loginSection');
  const panelSec = document.getElementById('panelSection');
  if (loginSec) loginSec.classList.add('ocultar');
  if (panelSec) panelSec.classList.remove('ocultar');
}

// ===================== TURNOS =====================
document.getElementById('btnVista')?.addEventListener('click', () => {
  vistaActual = vistaActual === 'lista' ? 'calendario' : 'lista';
  const btnVista = document.getElementById('btnVista');
  if (btnVista) btnVista.textContent = vistaActual === 'lista' ? 'Ver Calendario' : 'Ver Lista';
  
  document.getElementById('vistaLista')?.classList.toggle('ocultar', vistaActual !== 'lista');
  document.getElementById('vistaCalendario')?.classList.toggle('ocultar', vistaActual !== 'calendario');
  document.getElementById('filtrosLista')?.classList.toggle('ocultar', vistaActual !== 'lista');

  if (vistaActual === 'calendario') {
    iniciarCalendario(todosLosTurnos, eliminarTurnoAdmin, abrirModalTurno);
  }
});

document.getElementById('filtroProfesional')?.addEventListener('change', renderizarVista);
document.getElementById('filtroFecha')?.addEventListener('change', renderizarVista);
document.getElementById('filtroUsuario')?.addEventListener('input', renderizarUsuarios);

async function cargarTurnos() {
  const loading = document.getElementById('loadingMsg');
  if (loading) loading.classList.remove('ocultar');

  try {
    const q = query(collection(db, "turnos"), orderBy("fecha"), orderBy("horario"));
    const snapshot = await getDocs(q);
    todosLosTurnos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('Error cargando turnos:', e);
    // Fallback sin ordenamiento en Firestore por si faltan índices
    const snapshot = await getDocs(collection(db, "turnos"));
    todosLosTurnos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    todosLosTurnos.sort((a, b) => `${a.fecha} ${a.horario}`.localeCompare(`${b.fecha} ${b.horario}`));
  }

  if (loading) loading.classList.add('ocultar');
  actualizarEstadisticas();
  renderizarVista();
  if (vistaActual === 'calendario') actualizarTurnos(todosLosTurnos);
}

function actualizarEstadisticas() {
  const hoy = new Date().toISOString().split('T')[0];
  const statTotal = document.getElementById('statTotal');
  const statProximos = document.getElementById('statProximos');
  const statHoy = document.getElementById('statHoy');
  const statUsuarios = document.getElementById('statUsuarios');

  if (statTotal) statTotal.textContent = todosLosTurnos.length;
  if (statProximos) statProximos.textContent = todosLosTurnos.filter(t => t.fecha >= hoy).length;
  if (statHoy) statHoy.textContent = todosLosTurnos.filter(t => t.fecha === hoy).length;
  if (statUsuarios) statUsuarios.textContent = todosLosUsuarios.length;
}

function getFiltrados() {
  const prof = document.getElementById('filtroProfesional')?.value;
  const fecha = document.getElementById('filtroFecha')?.value;
  return todosLosTurnos.filter(t => {
    if (prof && t.profesional !== prof) return false;
    if (fecha && t.fecha !== fecha) return false;
    return true;
  });
}

function renderizarVista() {
  if (vistaActual === 'lista') {
    document.getElementById('vistaLista')?.classList.remove('ocultar');
    document.getElementById('vistaCalendario')?.classList.add('ocultar');
    document.getElementById('filtrosLista')?.classList.remove('ocultar');
    renderizarLista();
  } else {
    document.getElementById('vistaLista')?.classList.add('ocultar');
    document.getElementById('vistaCalendario')?.classList.remove('ocultar');
    document.getElementById('filtrosLista')?.classList.add('ocultar');
    iniciarCalendario(todosLosTurnos, eliminarTurnoAdmin, abrirModalTurno);
  }
}

function renderizarLista() {
  const container = document.getElementById('turnosListaContainer');
  if (!container) return;

  const turnos = getFiltrados();
  container.innerHTML = '';

  if (turnos.length === 0) {
    container.innerHTML = '<p style="padding:20px; text-align:center; color:#666;">No hay turnos para mostrar.</p>';
    return;
  }

  const porFecha = {};
  turnos.forEach(t => {
    if (!porFecha[t.fecha]) porFecha[t.fecha] = [];
    porFecha[t.fecha].push(t);
  });

  Object.keys(porFecha).sort().forEach(fecha => {
    const grupo = document.createElement('div');
    grupo.className = 'grupo-fecha';
    const titulo = document.createElement('div');
    titulo.className = 'grupo-fecha-titulo';
    titulo.textContent = new Date(fecha + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    grupo.appendChild(titulo);

    porFecha[fecha].sort((a, b) => (a.horario || '').localeCompare(b.horario || '')).forEach(turno => {
      grupo.appendChild(crearCardTurno(turno));
    });

    container.appendChild(grupo);
  });
}

function crearCardTurno(turno) {
  const hoy = new Date().toISOString().split('T')[0];
  const pasado = turno.fecha < hoy;
  const card = document.createElement('div');
  card.className = `turno-card admin-turno-card ${pasado ? 'turno-pasado' : ''}`;
  card.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
      <strong>⏰ ${turno.horario}</strong>
      <span style="font-size:12px; color:#888;">${turno.profesional}</span>
    </div>
    <p><strong>Servicio:</strong> ${turno.servicio}</p>
    <p><strong>Cliente:</strong> ${turno.clienteNombre || 'Sin nombre'}</p>
    <p><strong>Teléfono:</strong> ${turno.clienteTelefono || '-'} | <strong>Email:</strong> ${turno.clienteEmail || '-'}</p>
    <div style="margin-top:10px; display:flex; gap:10px;">
      <button class="btn btn-secondary btn-sm btn-editar-admin">Editar</button>
      <button class="btn btn-danger btn-sm btn-eliminar-admin" style="background:#e74c3c; color:#fff;">Eliminar</button>
    </div>
  `;

  card.querySelector('.btn-editar-admin')?.addEventListener('click', () => abrirModalTurno(turno));
  card.querySelector('.btn-eliminar-admin')?.addEventListener('click', () => eliminarTurnoAdmin(turno.id));
  return card;
}

async function eliminarTurnoAdmin(id) {
  if (confirm('¿Eliminar este turno?')) {
    const turnoDoc = await getDoc(doc(db, 'turnos', id));
    const turno = turnoDoc.exists() ? turnoDoc.data() : null;

    await deleteDoc(doc(db, "turnos", id));

    if (turno) {
      if (turno.usuarioId) {
        await crearNotificacion({
          para: turno.usuarioId,
          tipo: 'cancelacion_admin',
          mensaje: `Tu turno fue cancelado: ${turno.profesional} - ${turno.fechaFormato || turno.fecha} a las ${turno.horario}`,
          turnoId: id
        });
      }

      try {
        await enviarEmailCancelacion(turno);
      } catch(e) {
        console.error('Error enviando email de cancelación:', e);
      }
    }

    await cargarTurnos();
  }
}

document.getElementById('modalCerrar')?.addEventListener('click', () => document.getElementById('modalDia')?.classList.add('ocultar'));

// ===================== USUARIOS =====================
async function cargarUsuarios() {
  try {
    const snapshot = await getDocs(collection(db, "usuarios"));
    todosLosUsuarios = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    actualizarEstadisticas();
    renderizarUsuarios();
  } catch (e) {
    console.error('Error al cargar usuarios:', e);
  }
}

function renderizarUsuarios() {
  const container = document.getElementById('usuariosContainer');
  if (!container) return;

  const filtro = document.getElementById('filtroUsuario')?.value.toLowerCase() || '';
  const filtrados = todosLosUsuarios.filter(u => !filtro || (u.nombre + ' ' + u.apellido + ' ' + u.email + ' ' + (u.telefono||'')).toLowerCase().includes(filtro));
  container.innerHTML = '';

  if (filtrados.length === 0) {
    container.innerHTML = '<p style="padding:20px; color:#666;">No hay usuarios para mostrar.</p>';
    return;
  }

  filtrados.forEach(usuario => {
    const turnosUsuario = todosLosTurnos.filter(t => t.usuarioId === usuario.id || t.clienteEmail === usuario.email);
    const hoy = new Date().toISOString().split('T')[0];
    const turnosProximos = turnosUsuario.filter(t => t.fecha >= hoy);
    const turnosPasados = turnosUsuario.filter(t => t.fecha < hoy);

    const card = document.createElement('div');
    card.className = `usuario-card-collapsible ${usuario.bloqueado ? 'usuario-bloqueado' : ''}`;

    const header = document.createElement('div');
    header.className = 'usuario-header';
    header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:12px; background:#fff; border:1px solid #ddd; border-radius:6px; margin-bottom:6px;';

    const headerInfo = document.createElement('div');
    headerInfo.innerHTML = `
      <strong>${usuario.nombre || ''} ${usuario.apellido || ''}</strong> ${usuario.bloqueado ? '<span style="color:red; font-size:12px;">(BLOQUEADO)</span>' : ''}<br>
      <small style="color:#666;">📧 ${usuario.email || '-'} | 📞 ${usuario.telefono || '-'}</small>