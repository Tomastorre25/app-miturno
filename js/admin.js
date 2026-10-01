import { db, auth } from './firebase-config.js';
import { 
  collection, addDoc, getDocs, query, where, doc, getDoc, updateDoc, deleteDoc, orderBy, onSnapshot, setDoc 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
  enviarEmailConfirmacion, enviarEmailCancelacion, crearNotificacion, programarRecordatorios 
} from './notifications.js';
import { iniciarCampana } from './notif-ui.js';

// Variables de estado
let listaUsuarios = [];
let clienteSeleccionado = null;
let barberia = { profesionales: [], servicios: {} };
let turnosGlobales = [];

const ADMIN_EMAIL = 'tomasdelatorre15@gmail.com';
const DIAS_SEMANA = [
  { key: 'lunes', label: 'Lunes' },
  { key: 'martes', label: 'Martes' },
  { key: 'miercoles', label: 'Miércoles' },
  { key: 'jueves', label: 'Jueves' },
  { key: 'viernes', label: 'Viernes' },
  { key: 'sabado', label: 'Sábado' },
  { key: 'domingo', label: 'Domingo' }
];

document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = './auth.html';
      return;
    }

    // Verificar si es administrador
    const esAdmin = (user.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
    if (!esAdmin) {
      const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
      if (!userDoc.exists() || !userDoc.data().esAdmin) {
        alert('Acceso no autorizado.');
        window.location.href = '../index.html';
        return;
      }
    }

    // Iniciar campanita de notificaciones
    iniciarCampana(user.uid, true);

    // Configurar botón cerrar sesión
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
      btnLogout.addEventListener('click', async () => {
        await signOut(auth);
        window.location.href = './auth.html';
      });
    }

    // Cargar datos e inicializar
    inicializarAdmin();
  });
});

async function inicializarAdmin() {
  configurarNavegacionPestanas();
  await cargarUsuarios();
  await cargarDatosBarberia();
  configurarBuscadorClientes();
  cargarTurnosAdmin();
  configurarFormularioReservaAdmin();
  configurarGestionProfesionales();
  configurarGestionServicios();
  configurarGestionHorarios();
}

// -------------------------------------------------------------------
// 0. NAVEGACIÓN ENTRE PESTAÑAS DEL PANEL ADMIN
// -------------------------------------------------------------------
function configurarNavegacionPestanas() {
  const btnTurnos = document.getElementById('btnSeccionTurnos');
  const btnUsuarios = document.getElementById('btnSeccionUsuarios');
  const btnProfesionales = document.getElementById('btnSeccionProfesionales');
  const btnServicios = document.getElementById('btnSeccionServicios');
  const btnHorarios = document.getElementById('btnSeccionHorarios');

  const secTurnos = document.getElementById('seccionTurnos');
  const secUsuarios = document.getElementById('seccionUsuarios');
  const secProfesionales = document.getElementById('seccionProfesionales');
  const secServicios = document.getElementById('seccionServicios');
  const secHorarios = document.getElementById('seccionHorarios');

  const todosBotones = [btnTurnos, btnUsuarios, btnProfesionales, btnServicios, btnHorarios];
  const todasSecciones = [secTurnos, secUsuarios, secProfesionales, secServicios, secHorarios];

  function activarPestana(botonActivo, seccionActiva) {
    todasSecciones.forEach(sec => { if (sec) sec.classList.add('ocultar'); });
    todosBotones.forEach(btn => {
      if (btn) {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
      }
    });

    if (seccionActiva) seccionActiva.classList.remove('ocultar');
    if (botonActivo) {
      botonActivo.classList.remove('btn-secondary');
      botonActivo.classList.add('btn-primary');
    }
  }

  if (btnTurnos) btnTurnos.addEventListener('click', () => activarPestana(btnTurnos, secTurnos));
  if (btnUsuarios) btnUsuarios.addEventListener('click', () => {
    activarPestana(btnUsuarios, secUsuarios);
    renderizarUsuariosAdmin();
  });
  if (btnProfesionales) btnProfesionales.addEventListener('click', () => {
    activarPestana(btnProfesionales, secProfesionales);
    renderizarProfesionalesAdmin();
  });
  if (btnServicios) btnServicios.addEventListener('click', () => {
    activarPestana(btnServicios, secServicios);
    poblarSelectProfesionalesServicios();
  });
  if (btnHorarios) btnHorarios.addEventListener('click', () => {
    activarPestana(btnHorarios, secHorarios);
    poblarSelectProfesionalesHorarios();
  });
}

// -------------------------------------------------------------------
// 1. CARGAR Y BUSCAR CLIENTES (AUTOCOMPLETE)
// -------------------------------------------------------------------
async function cargarUsuarios() {
  try {
    const snap = await getDocs(collection(db, 'usuarios'));
    listaUsuarios = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    document.getElementById('statUsuarios').textContent = listaUsuarios.length;
  } catch (error) {
    console.error('Error al cargar usuarios:', error);
  }
}

function renderizarUsuariosAdmin() {
  const container = document.getElementById('usuariosContainer');
  const filtroInput = document.getElementById('filtroUsuario');
  if (!container) return;

  const queryStr = (filtroInput?.value || '').toLowerCase().trim();
  const filtrados = listaUsuarios.filter(u => {
    const nom = `${u.nombre || ''} ${u.apellido || ''}`.toLowerCase();
    const mail = (u.email || '').toLowerCase();
    const tel = (u.telefono || '').toLowerCase();
    return nom.includes(queryStr) || mail.includes(queryStr) || tel.includes(queryStr);
  });

  if (filtrados.length === 0) {
    container.innerHTML = '<p style="padding:15px; color:#888;">No se encontraron usuarios registrados.</p>';
    return;
  }

  container.innerHTML = `
    <div style="background:#fff; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.05); overflow-x:auto;">
      <table style="width:100%; border-collapse:collapse; text-align:left; font-size:14px;">
        <thead>
          <tr style="background:#f8f9fa; border-bottom:2px solid #e9ecef;">
            <th style="padding:12px;">Nombre</th>
            <th style="padding:12px;">Email</th>
            <th style="padding:12px;">Teléfono</th>
            <th style="padding:12px;">Estado</th>
            <th style="padding:12px;">Acción</th>
          </tr>
        </thead>
        <tbody>
          ${filtrados.map(u => `
            <tr style="border-bottom:1px solid #eee;">
              <td style="padding:12px;"><strong>${u.nombre || ''} ${u.apellido || ''}</strong></td>
              <td style="padding:12px;">${u.email || '-'}</td>
              <td style="padding:12px;">${u.telefono || '-'}</td>
              <td style="padding:12px;">
                <span style="background:${u.bloqueado ? '#e74c3c' : '#2ecc71'}; color:#fff; padding:3px 8px; border-radius:12px; font-size:12px;">
                  ${u.bloqueado ? 'Bloqueado' : 'Activo'}
                </span>
              </td>
              <td style="padding:12px;">
                <button onclick="toggleBloqueoUsuario('${u.id}', ${!u.bloqueado})" style="background:${u.bloqueado ? '#2ecc71' : '#e74c3c'}; color:#fff; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:12px;">
                  ${u.bloqueado ? 'Desbloquear' : 'Bloquear'}
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  if (filtroInput && !filtroInput.dataset.listener) {
    filtroInput.dataset.listener = 'true';
    filtroInput.addEventListener('input', renderizarUsuariosAdmin);
  }
}

window.toggleBloqueoUsuario = async function(uid, bloquear) {
  try {
    await updateDoc(doc(db, 'usuarios', uid), { bloqueado: bloquear });
    const idx = listaUsuarios.findIndex(u => u.id === uid);
    if (idx !== -1) listaUsuarios[idx].bloqueado = bloquear;
    renderizarUsuariosAdmin();
    alert(`Usuario ${bloquear ? 'bloqueado' : 'desbloqueado'} con éxito.`);
  } catch(e) {
    console.error('Error al cambiar estado del usuario:', e);
    alert('Error al actualizar el usuario.');
  }
};

function configurarBuscadorClientes() {
  const inputNombre = document.getElementById('adminClienteNombre');
  const inputApellido = document.getElementById('adminClienteApellido');

  if (!inputNombre) return;

  let dropdown = document.getElementById('listaClientesAutocomplete');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.id = 'listaClientesAutocomplete';
    dropdown.style.cssText = 'position:absolute; top:100%; left:0; right:0; background:#fff; border:1px solid #ccc; max-height:180px; overflow-y:auto; z-index:1000; box-shadow:0 4px 8px rgba(0,0,0,0.1); display:none; border-radius:4px;';
    inputNombre.parentElement.style.position = 'relative';
    inputNombre.parentElement.appendChild(dropdown);
  }

  const buscar = (texto) => {
    const q = texto.toLowerCase().trim();
    if (q.length < 2) {
      dropdown.style.display = 'none';
      return;
    }
    const matches = listaUsuarios.filter(u => {
      const nom = `${u.nombre || ''} ${u.apellido || ''}`.toLowerCase();
      const mail = (u.email || '').toLowerCase();
      const tel = (u.telefono || '').toLowerCase();
      return nom.includes(q) || mail.includes(q) || tel.includes(q);
    });

    if (matches.length === 0) {
      dropdown.innerHTML = '<div style="padding:10px; color:#888; font-size:13px;">No se encontraron clientes</div>';
      dropdown.style.display = 'block';
      return;
    }

    dropdown.innerHTML = matches.map(u => `
      <div class="ac-item" data-id="${u.id}" style="padding:10px; cursor:pointer; border-bottom:1px solid #eee;">
        <strong>${u.nombre || ''} ${u.apellido || ''}</strong><br>
        <small style="color:#666;">📧 ${u.email || 'Sin mail'} | 📞 ${u.telefono || 'Sin tel'}</small>
      </div>
    `).join('');

    dropdown.querySelectorAll('.ac-item').forEach(el => {
      el.addEventListener('click', () => {
        const u = matches.find(item => item.id === el.dataset.id);
        if (u) {
          clienteSeleccionado = u;
          if (document.getElementById('adminClienteNombre')) document.getElementById('adminClienteNombre').value = u.nombre || '';
          if (document.getElementById('adminClienteApellido')) document.getElementById('adminClienteApellido').value = u.apellido || '';
          if (document.getElementById('adminClienteTelefono')) document.getElementById('adminClienteTelefono').value = u.telefono || '';
          if (document.getElementById('adminClienteEmail')) document.getElementById('adminClienteEmail').value = u.email || '';
        }
        dropdown.style.display = 'none';
      });
    });

    dropdown.style.display = 'block';
  };

  inputNombre.addEventListener('input', (e) => buscar(e.target.value));
  if (inputApellido) {
    inputApellido.addEventListener('input', () => buscar(`${inputNombre.value} ${inputApellido.value}`));
  }

  document.addEventListener('click', (e) => {
    if (dropdown && !dropdown.contains(e.target) && e.target !== inputNombre) {
      dropdown.style.display = 'none';
    }
  });
}

// -------------------------------------------------------------------
// 2. TURNOS: MOSTRAR, CALENDARIO, FILTROS Y ESTADÍSTICAS DEL MES
// -------------------------------------------------------------------
function cargarTurnosAdmin() {
  const container = document.getElementById('turnosListaContainer');
  if (!container) return;

  container.innerHTML = '<p style="text-align:center; padding:20px; color:#666;">Cargando turnos...</p>';

  onSnapshot(collection(db, 'turnos'), (snapshot) => {
    turnosGlobales = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // Ordenar turnos por fecha y hora
    turnosGlobales.sort((a, b) => {
      const fechaA = `${a.fecha || ''} ${a.horario || ''}`;
      const fechaB = `${b.fecha || ''} ${b.horario || ''}`;
      return fechaA.localeCompare(fechaB);
    });

    actualizarEstadisticas();
    renderizarListaTurnos();
    configurarVistaCalendario();
  }, (error) => {
    console.error('Error escuchando turnos:', error);
    container.innerHTML = '<p class="error">Error al cargar turnos.</p>';
  });

  // Filtros de lista
  const filtroProf = document.getElementById('filtroProfesional');
  const filtroFecha = document.getElementById('filtroFecha');
  if (filtroProf) filtroProf.addEventListener('change', renderizarListaTurnos);
  if (filtroFecha) filtroFecha.addEventListener('change', renderizarListaTurnos);
}

function actualizarEstadisticas() {
  const ahora = new Date();
  const anioActual = ahora.getFullYear();
  const mesActual = String(ahora.getMonth() + 1).padStart(2, '0');
  const mesKey = `${anioActual}-${mesActual}`;
  const hoyStr = `${anioActual}-${mesActual}-${String(ahora.getDate()).padStart(2, '0')}`;

  // 1. Total turnos exclusivamente del mes actual
  const turnosMes = turnosGlobales.filter(t => (t.fecha || '').startsWith(mesKey) && t.estado !== 'cancelado');
  document.getElementById('statTotal').textContent = turnosMes.length;

  // 2. Próximos
  const proximos = turnosGlobales.filter(t => t.fecha >= hoyStr && t.estado !== 'cancelado');
  document.getElementById('statProximos').textContent = proximos.length;

  // 3. Hoy
  const hoy = turnosGlobales.filter(t => t.fecha === hoyStr && t.estado !== 'cancelado');
  document.getElementById('statHoy').textContent = hoy.length;
}

function renderizarListaTurnos() {
  const container = document.getElementById('turnosListaContainer');
  if (!container) return;

  const profFiltro = document.getElementById('filtroProfesional')?.value || '';
  const fechaFiltro = document.getElementById('filtroFecha')?.value || '';

  const filtrados = turnosGlobales.filter(t => {
    if (profFiltro && t.profesional !== profFiltro) return false;
    if (fechaFiltro && t.fecha !== fechaFiltro) return false;
    return true;
  });

  if (filtrados.length === 0) {
    container.innerHTML = '<p style="padding:20px; text-align:center; color:#888;">No se encontraron turnos con los filtros seleccionados.</p>';
    return;
  }

  container.innerHTML = filtrados.map(t => `
    <div style="background:#fff; border-left:4px solid ${t.estado === 'cancelado' ? '#e74c3c' : '#3498db'}; padding:15px; margin-bottom:12px; border-radius:6px; box-shadow:0 2px 4px rgba(0,0,0,0.05); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
      <div>
        <h4 style="margin:0 0 5px; color:#2c3e50;">📅 ${t.fechaFormato || t.fecha} - ⏰ ${t.horario}</h4>
        <p style="margin:2px 0; font-size:14px;"><strong>Cliente:</strong> ${t.clienteNombre || 'Cliente'} (${t.clienteTelefono || 'Sin tel'}) - 📧 ${t.clienteEmail || 'Sin email'}</p>
        <p style="margin:2px 0; font-size:13px; color:#666;"><strong>Servicio:</strong> ${t.servicio} con <strong>${t.profesional}</strong></p>
      </div>
      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
        <span style="background:${t.estado === 'cancelado' ? '#e74c3c' : '#2ecc71'}; color:#fff; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:bold;">
          ${t.estado || 'confirmado'}
        </span>
        ${t.estado !== 'cancelado' ? `
          <button onclick="cancelarTurnoAdmin('${t.id}')" style="background:#e74c3c; color:#fff; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:13px;">
            Cancelar Turno
          </button>
        ` : ''}
      </div>
    </div>
  `).join('');
}

// Cancelación de turno con envío de correos a cliente y admin
window.cancelarTurnoAdmin = async function(turnoId) {
  if (!confirm('¿Seguro que querés cancelar este turno?')) return;
  try {
    const turnoRef = doc(db, 'turnos', turnoId);
    const snap = await getDoc(turnoRef);
    if (snap.exists()) {
      const turnoData = { id: snap.id, ...snap.data() };
      await updateDoc(turnoRef, { estado: 'cancelado' });

      // Enviar correos de cancelación a cliente y admin
      await enviarEmailCancelacion(turnoData, 'admin');

      // Notificaciones in-app
      if (turnoData.usuarioId) {
        await crearNotificacion({
          para: turnoData.usuarioId,
          tipo: 'cancelacion',
          mensaje: `Tu turno con ${turnoData.profesional} del ${turnoData.fechaFormato || turnoData.fecha} a las ${turnoData.horario} fue cancelado por el administrador.`,
          turnoId
        });
      }
      await crearNotificacion({
        para: 'admin',
        tipo: 'cancelacion',
        mensaje: `Cancelaste el turno de ${turnoData.clienteNombre || 'Cliente'} (${turnoData.fechaFormato || turnoData.fecha} ${turnoData.horario}).`,
        turnoId
      });
    }

    alert('Turno cancelado y notificaciones enviadas.');
  } catch (error) {
    console.error('Error al cancelar turno:', error);
    alert('Error al cancelar el turno.');
  }
};

// -------------------------------------------------------------------
// 3. CALENDARIO INTERACTIVO ("VER CALENDARIO")
// -------------------------------------------------------------------
let fechaCalendario = new Date();

function configurarVistaCalendario() {
  const btnVista = document.getElementById('btnVista');
  const vistaLista = document.getElementById('vistaLista');
  const vistaCalendario = document.getElementById('vistaCalendario');
  const filtrosLista = document.getElementById('filtrosLista');

  if (!btnVista || !vistaLista || !vistaCalendario) return;

  btnVista.onclick = () => {
    const esCalendario = !vistaCalendario.classList.contains('ocultar');
    if (esCalendario) {
      vistaCalendario.classList.add('ocultar');
      vistaLista.classList.remove('ocultar');
      if (filtrosLista) filtrosLista.style.display = 'flex';
      btnVista.textContent = '📅 Ver Calendario';
    } else {
      vistaLista.classList.add('ocultar');
      vistaCalendario.classList.remove('ocultar');
      if (filtrosLista) filtrosLista.style.display = 'none';
      btnVista.textContent = '📋 Ver Lista';
      renderizarCalendarioAdmin();
    }
  };
}

function renderizarCalendarioAdmin() {
  const container = document.getElementById('calendarioContainer');
  if (!container) return;

  const anio = fechaCalendario.getFullYear();
  const mes = fechaCalendario.getMonth();
  const primerDiaMes = new Date(anio, mes, 1);
  const ultimoDiaMes = new Date(anio, mes + 1, 0);

  const nombreMes = fechaCalendario.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  // Agrupar turnos por fecha
  const turnosPorFecha = {};
  turnosGlobales.forEach(t => {
    if (t.estado === 'cancelado') return;
    if (!turnosPorFecha[t.fecha]) turnosPorFecha[t.fecha] = [];
    turnosPorFecha[t.fecha].push(t);
  });

  let html = `
    <div style="background:#fff; padding:20px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <button id="calPrevMes" class="btn btn-secondary btn-sm">&lt; Anterior</button>
        <h3 style="margin:0; text-transform:capitalize;">${nombreMes}</h3>
        <button id="calNextMes" class="btn btn-secondary btn-sm">Siguiente &gt;</button>
      </div>

      <div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:5px; text-align:center; font-weight:bold; margin-bottom:10px; font-size:13px; color:#7f8c8d;">
        <div>Dom</div><div>Lun</div><div>Mar</div><div>Mié</div><div>Jue</div><div>Vie</div><div>Sáb</div>
      </div>
      <div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:5px;">
  `;

  // Espacios en blanco para el primer día
  for (let i = 0; i < primerDiaMes.getDay(); i++) {
    html += `<div style="background:#f8f9fa; border-radius:4px; min-height:80px;"></div>`;
  }

  const hoyStr = new Date().toISOString().split('T')[0];

  // Días del mes
  for (let d = 1; d <= ultimoDiaMes.getDate(); d++) {
    const mm = String(mes + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    const fKey = `${anio}-${mm}-${dd}`;
    const turnosDia = turnosPorFecha[fKey] || [];
    const esHoy = fKey === hoyStr;

    html += `
      <div class="cal-dia-cell" data-fecha="${fKey}" style="background:${esHoy ? '#e8f4f8' : '#fff'}; border:1px solid ${esHoy ? '#3498db' : '#e0e0e0'}; border-radius:4px; min-height:80px; padding:5px; font-size:12px; cursor:pointer; overflow:hidden;">
        <div style="font-weight:bold; color:${esHoy ? '#2980b9' : '#333'}; margin-bottom:4px;">${d}</div>
        ${turnosDia.length > 0 ? `
          <div style="background:#2ecc71; color:#fff; padding:2px 4px; border-radius:3px; font-size:10px; font-weight:bold; text-align:center; margin-bottom:2px;">
            ${turnosDia.length} turno(s)
          </div>
          ${turnosDia.slice(0, 2).map(t => `<div style="font-size:10px; color:#555; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">• ${t.horario} ${t.clienteNombre || ''}</div>`).join('')}
          ${turnosDia.length > 2 ? `<div style="font-size:9px; color:#888;">+${turnosDia.length - 2} más</div>` : ''}
        ` : ''}
      </div>
    `;
  }

  html += `</div></div>`;
  container.innerHTML = html;

  document.getElementById('calPrevMes').onclick = () => {
    fechaCalendario.setMonth(fechaCalendario.getMonth() - 1);
    renderizarCalendarioAdmin();
  };
  document.getElementById('calNextMes').onclick = () => {
    fechaCalendario.setMonth(fechaCalendario.getMonth() + 1);
    renderizarCalendarioAdmin();
  };

  container.querySelectorAll('.cal-dia-cell').forEach(cell => {
    cell.onclick = () => {
      const f = cell.dataset.fecha;
      document.getElementById('filtroFecha').value = f;
      document.getElementById('btnVista').click(); // Volver a lista filtrada
    };
  });
}

// -------------------------------------------------------------------
// 4. FORMULARIO RESERVA DESDE ADMIN (BOTÓN DESPLEGABLE)
// -------------------------------------------------------------------
function configurarFormularioReservaAdmin() {
  const formAdminReserva = document.getElementById('formAdminReserva');
  const btnToggleForm = document.getElementById('btnToggleFormReserva');
  const btnCerrarForm = document.getElementById('btnCerrarFormReserva');
  const btnCancelarForm = document.getElementById('btnCancelarFormReserva');
  const seccionReserva = document.getElementById('seccionNuevaReserva');

  if (!formAdminReserva || !seccionReserva) return;

  const ocultarForm = () => seccionReserva.classList.add('ocultar');
  const mostrarForm = () => seccionReserva.classList.remove('ocultar');

  if (btnToggleForm) btnToggleForm.addEventListener('click', () => {
    seccionReserva.classList.contains('ocultar') ? mostrarForm() : ocultarForm();
  });
  if (btnCerrarForm) btnCerrarForm.addEventListener('click', ocultarForm);
  if (btnCancelarForm) btnCancelarForm.addEventListener('click', ocultarForm);

  formAdminReserva.addEventListener('submit', async (e) => {
    e.preventDefault();

    const profesional = document.getElementById('adminSelectProfesional')?.value;
    const servicio = document.getElementById('adminSelectServicio')?.value;
    const fecha = document.getElementById('adminInputFecha')?.value;
    const horario = document.getElementById('adminSelectHorario')?.value;

    const nombre = document.getElementById('adminClienteNombre')?.value.trim();
    const apellido = document.getElementById('adminClienteApellido')?.value.trim();
    const telefono = document.getElementById('adminClienteTelefono')?.value.trim();
    const email = document.getElementById('adminClienteEmail')?.value.trim();

    if (!profesional || !servicio || !fecha || !horario || !nombre) {
      alert('Por favor completá todos los campos obligatorios.');
      return;
    }

    const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const fechaFormato = new Date(fecha + 'T00:00:00').toLocaleDateString('es-ES', opciones);

    const nuevoTurno = {
      profesional,
      servicio,
      fecha,
      fechaFormato,
      horario,
      clienteNombre: `${nombre} ${apellido}`.trim(),
      clienteTelefono: telefono,
      clienteEmail: email,
      usuarioId: clienteSeleccionado ? clienteSeleccionado.id : null,
      creadoPorAdmin: true,
      creadoEn: new Date().toISOString()
    };

    try {
      const btnSubmit = formAdminReserva.querySelector('button[type="submit"]');
      if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.textContent = 'Guardando...'; }

      const docRef = await addDoc(collection(db, "turnos"), nuevoTurno);

      if (email) {
        await enviarEmailConfirmacion(nuevoTurno);
      }

      if (clienteSeleccionado && clienteSeleccionado.id) {
        await crearNotificacion({
          para: clienteSeleccionado.id,
          tipo: 'confirmacion',
          mensaje: `El administrador te reservó un turno: ${profesional} - ${fechaFormato} a las ${horario}`,
          turnoId: docRef.id
        });
      }

      await programarRecordatorios({ ...nuevoTurno, id: docRef.id });

      alert('¡Turno reservado con éxito y notificación enviada al cliente!');
      formAdminReserva.reset();
      clienteSeleccionado = null;
      ocultarForm();

      if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = 'Guardar Reserva'; }

    } catch (error) {
      console.error('Error al guardar reserva admin:', error);
      alert('Error al guardar la reserva.');
    }
  });
}

// -------------------------------------------------------------------
// 5. GESTIÓN DE PROFESIONALES
// -------------------------------------------------------------------
function configurarGestionProfesionales() {
  const formProf = document.getElementById('formAgregarProfesional');
  if (!formProf) return;

  formProf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('profNombreInput').value.trim();
    const orden = parseInt(document.getElementById('profOrdenInput').value) || 1;

    if (!nombre) return;

    try {
      await addDoc(collection(db, 'profesionales'), {
        nombre,
        orden,
        creadoEn: new Date().toISOString()
      });
      alert('Profesional agregado con éxito.');
      formProf.reset();
      await cargarDatosBarberia();
      renderizarProfesionalesAdmin();
    } catch(err) {
      console.error('Error al agregar profesional:', err);
      alert('Error al guardar profesional.');
    }
  });
}

function renderizarProfesionalesAdmin() {
  const container = document.getElementById('profesionalesAdminContainer');
  if (!container) return;

  if (barberia.profesionales.length === 0) {
    container.innerHTML = '<p style="padding:15px; color:#888;">No hay profesionales configurados.</p>';
    return;
  }

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:15px;">
      ${barberia.profesionales.map(p => `
        <div style="background:#fff; padding:15px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.05); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h4 style="margin:0 0 5px;">${p.nombre}</h4>
            <small style="color:#7f8c8d;">Orden: ${p.orden || 1}</small>
          </div>
          <button onclick="eliminarProfesionalAdmin('${p.id}')" style="background:#e74c3c; color:#fff; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">
            Eliminar
          </button>
        </div>
      `).join('')}
    </div>
  `;
}

window.eliminarProfesionalAdmin = async function(profId) {
  if (!confirm('¿Seguro que querés eliminar este profesional y sus servicios asociados?')) return;
  try {
    await deleteDoc(doc(db, 'profesionales', profId));
    alert('Profesional eliminado.');
    await cargarDatosBarberia();
    renderizarProfesionalesAdmin();
  } catch(e) {
    console.error('Error al eliminar profesional:', e);
    alert('Error al eliminar.');
  }
};

// -------------------------------------------------------------------
// 6. GESTIÓN DE SERVICIOS
// -------------------------------------------------------------------
function configurarGestionServicios() {
  const selectProf = document.getElementById('servProfSelect');
  const formServ = document.getElementById('formAgregarServicio');

  if (selectProf) {
    selectProf.addEventListener('change', (e) => {
      cargarServiciosDelProfesional(e.target.value);
    });
  }

  if (formServ) {
    formServ.addEventListener('submit', async (e) => {
      e.preventDefault();
      const profId = selectProf.value;
      if (!profId) {
        alert('Por favor seleccioná un profesional primero.');
        return;
      }

      const nombre = document.getElementById('servNombreInput').value.trim();
      const precio = parseFloat(document.getElementById('servPrecioInput').value) || 0;
      const duracion = document.getElementById('servDuracionInput').value.trim();
      const orden = parseInt(document.getElementById('servOrdenInput').value) || 1;

      try {
        await addDoc(collection(db, `profesionales/${profId}/servicios`), {
          nombre,
          precio,
          duracion,
          orden
        });
        alert('Servicio agregado con éxito.');
        formServ.reset();
        cargarServiciosDelProfesional(profId);
      } catch(err) {
        console.error('Error al agregar servicio:', err);
        alert('Error al guardar el servicio.');
      }
    });
  }
}

function poblarSelectProfesionalesServicios() {
  const selectProf = document.getElementById('servProfSelect');
  if (!selectProf) return;
  selectProf.innerHTML = '<option value="">Seleccionar profesional...</option>' + 
    barberia.profesionales.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
  document.getElementById('serviciosAdminContainer').innerHTML = '';
}

async function cargarServiciosDelProfesional(profId) {
  const container = document.getElementById('serviciosAdminContainer');
  if (!container) return;

  if (!profId) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '<p style="padding:10px; color:#888;">Cargando servicios...</p>';

  try {
    const snap = await getDocs(query(collection(db, `profesionales/${profId}/servicios`), orderBy('orden')));
    const servicios = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (servicios.length === 0) {
      container.innerHTML = '<p style="padding:15px; color:#888;">Este profesional aún no tiene servicios configurados.</p>';
      return;
    }

    container.innerHTML = `
      <div style="background:#fff; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.05); padding:15px;">
        <table style="width:100%; border-collapse:collapse; font-size:14px;">
          <thead>
            <tr style="border-bottom:2px solid #eee; text-align:left;">
              <th style="padding:10px;">Servicio</th>
              <th style="padding:10px;">Precio</th>
              <th style="padding:10px;">Duración</th>
              <th style="padding:10px;">Acción</th>
            </tr>
          </thead>
          <tbody>
            ${servicios.map(s => `
              <tr style="border-bottom:1px solid #f9f9f9;">
                <td style="padding:10px;"><strong>${s.nombre}</strong></td>
                <td style="padding:10px;">$${s.precio}</td>
                <td style="padding:10px;">${s.duracion}</td>
                <td style="padding:10px;">
                  <button onclick="eliminarServicioAdmin('${profId}', '${s.id}')" style="background:#e74c3c; color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:12px;">
                    Eliminar
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch(e) {
    console.error('Error cargando servicios:', e);
    container.innerHTML = '<p class="error">Error al cargar servicios.</p>';
  }
}

window.eliminarServicioAdmin = async function(profId, servId) {
  if (!confirm('¿Seguro que querés eliminar este servicio?')) return;
  try {
    await deleteDoc(doc(db, `profesionales/${profId}/servicios`, servId));
    alert('Servicio eliminado.');
    cargarServiciosDelProfesional(profId);
  } catch(e) {
    console.error('Error al eliminar servicio:', e);
    alert('Error al eliminar.');
  }
};

// -------------------------------------------------------------------
// 7. GESTIÓN DE HORARIOS
// -------------------------------------------------------------------
function configurarGestionHorarios() {
  const selectProf = document.getElementById('horariosProfSelect');
  const formHorarios = document.getElementById('formConfigHorarios');

  if (selectProf) {
    selectProf.addEventListener('change', (e) => {
      cargarHorariosDelProfesional(e.target.value);
    });
  }

  if (formHorarios) {
    formHorarios.addEventListener('submit', async (e) => {
      e.preventDefault();
      const profId = selectProf.value;
      if (!profId) {
        alert('Por favor seleccioná un profesional.');
        return;
      }

      try {
        const btnSubmit = formHorarios.querySelector('button[type="submit"]');
        if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.textContent = 'Guardando...'; }

        for (const dia of DIAS_SEMANA) {
          const activo = document.getElementById(`horario_activo_${dia.key}`)?.checked ?? true;
          const horaInicio = document.getElementById(`horario_inicio_${dia.key}`)?.value || '09:00';
          const horaFin = document.getElementById(`horario_fin_${dia.key}`)?.value || '19:00';

          await setDoc(doc(db, `profesionales/${profId}/horarios`, dia.key), {
            activo,
            horaInicio,
            horaFin,
            intervaloMin: 30
          }, { merge: true });
        }

        alert('¡Horarios actualizados con éxito!');
        if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = 'Guardar Horarios'; }
      } catch(err) {
        console.error('Error al guardar horarios:', err);
        alert('Error al guardar los horarios.');
      }
    });
  }
}

function poblarSelectProfesionalesHorarios() {
  const selectProf = document.getElementById('horariosProfSelect');
  if (!selectProf) return;
  selectProf.innerHTML = '<option value="">Seleccionar profesional...</option>' + 
    barberia.profesionales.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
  document.getElementById('horariosDiasContainer').innerHTML = '';
}

async function cargarHorariosDelProfesional(profId) {
  const container = document.getElementById('horariosDiasContainer');
  if (!container) return;

  if (!profId) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '<p style="grid-column:1/-1; padding:10px; color:#888;">Cargando horarios...</p>';

  try {
    const horariosMap = {};
    for (const dia of DIAS_SEMANA) {
      const snap = await getDoc(doc(db, `profesionales/${profId}/horarios`, dia.key));
      horariosMap[dia.key] = snap.exists() ? snap.data() : { activo: true, horaInicio: '09:00', horaFin: '19:00' };
    }

    container.innerHTML = DIAS_SEMANA.map(d => {
      const h = horariosMap[d.key];
      return `
        <div style="background:#f8f9fa; padding:15px; border-radius:6px; border:1px solid #e0e0e0;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <strong style="font-size:15px; color:#2c3e50;">${d.label}</strong>
            <label style="font-size:13px; cursor:pointer;">
              <input type="checkbox" id="horario_activo_${d.key}" ${h.activo ? 'checked' : ''}> Habilitado
            </label>
          </div>
          <div style="display:flex; gap:10px;">
            <div style="flex:1;">
              <small style="color:#666;">Desde:</small>
              <input type="time" id="horario_inicio_${d.key}" class="form-control" value="${h.horaInicio || '09:00'}">
            </div>
            <div style="flex:1;">
              <small style="color:#666;">Hasta:</small>
              <input type="time" id="horario_fin_${d.key}" class="form-control" value="${h.horaFin || '19:00'}">
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch(e) {
    console.error('Error al cargar horarios:', e);
    container.innerHTML = '<p class="error">Error al cargar horarios.</p>';
  }
}

// -------------------------------------------------------------------
// Cargar Datos Globales de Barbería
// -------------------------------------------------------------------
async function cargarDatosBarberia() {
  try {
    const profSnap = await getDocs(query(collection(db, 'profesionales'), orderBy('orden')));
    barberia.profesionales = profSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    barberia.servicios = {};
    for (const prof of barberia.profesionales) {
      const servSnap = await getDocs(query(collection(db, `profesionales/${prof.id}/servicios`), orderBy('orden')));
      barberia.servicios[prof.id] = servSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    // Poblar select de profesionales en formulario de reserva admin
    const selectProfAdmin = document.getElementById('adminSelectProfesional');
    const filtroProf = document.getElementById('filtroProfesional');

    if (selectProfAdmin) {
      selectProfAdmin.innerHTML = '<option value="">Seleccionar...</option>' + 
        barberia.profesionales.map(p => `<option value="${p.nombre}">${p.nombre}</option>`).join('');
    }

    if (filtroProf) {
      filtroProf.innerHTML = '<option value="">Todos los profesionales</option>' + 
        barberia.profesionales.map(p => `<option value="${p.nombre}">${p.nombre}</option>`).join('');
    }

    // Poblar select de servicios dinámicamente al cambiar el profesional en el formulario de reserva
    if (selectProfAdmin) {
      selectProfAdmin.addEventListener('change', (e) => {
        const profNombre = e.target.value;
        const profObj = barberia.profesionales.find(p => p.nombre === profNombre);
        const selectServAdmin = document.getElementById('adminSelectServicio');

        if (selectServAdmin && profObj) {
          const servicios = barberia.servicios[profObj.id] || [];
          selectServAdmin.innerHTML = '<option value="">Seleccionar...</option>' + 
            servicios.map(s => `<option value="${s.nombre}">${s.nombre} ($${s.precio})</option>`).join('');
        }
      });
    }

  } catch(e) {
    console.error('Error cargando datos de barbería:', e);
  }
}
