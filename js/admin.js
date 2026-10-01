import { db, auth } from './firebase-config.js';
import { 
  collection, addDoc, getDocs, query, where, doc, getDoc, updateDoc, deleteDoc, orderBy, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
  enviarEmailConfirmacion, crearNotificacion, programarRecordatorios 
} from './notifications.js';

// Variables de estado global
let listaUsuarios = [];
let todosLosTurnos = [];
let clienteSeleccionado = null;
let barberia = { profesionales: [], servicios: {} };

let vistaActual = 'lista'; // 'lista' o 'calendario'
let calAnio = new Date().getFullYear();
let calMes = new Date().getMonth(); // 0 - 11

const ADMIN_EMAIL = 'tomasdelatorre15@gmail.com';

document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = './auth.html';
      return;
    }

    // Verificar si es administrador
    if (user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
      if (!userDoc.exists() || !userDoc.data().esAdmin) {
        alert('Acceso no autorizado.');
        window.location.href = '../index.html';
        return;
      }
    }

    // Cargar datos e inicializar la interfaz
    inicializarAdmin();
  });
});

async function inicializarAdmin() {
  configurarBotonLogout();
  configurarNavegacionTabs();
  configurarToggleFormularioReserva();
  configurarVistaCalendario();
  
  await cargarUsuarios();
  await cargarDatosBarberia();
  
  configurarBuscadorClientes();
  configurarFiltrosTurnos();
  cargarTurnosAdmin();
  configurarFormularioReservaAdmin();
}

// -------------------------------------------------------------------
// 1. NAVEGACIÓN Y TABS
// -------------------------------------------------------------------
function configurarBotonLogout() {
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      await signOut(auth);
      window.location.href = './auth.html';
    });
  }
}

function configurarNavegacionTabs() {
  const tabs = [
    { btnId: 'btnSeccionTurnos', secId: 'seccionTurnos' },
    { btnId: 'btnSeccionUsuarios', secId: 'seccionUsuarios' },
    { btnId: 'btnSeccionProfesionales', secId: 'seccionProfesionales' },
    { btnId: 'btnSeccionServicios', secId: 'seccionServicios' },
    { btnId: 'btnSeccionHorarios', secId: 'seccionHorarios' }
  ];

  tabs.forEach(tab => {
    const btn = document.getElementById(tab.btnId);
    if (btn) {
      btn.addEventListener('click', () => {
        tabs.forEach(t => {
          const b = document.getElementById(t.btnId);
          const s = document.getElementById(t.secId);
          if (b) {
            if (t.btnId === tab.btnId) {
              b.classList.remove('btn-secondary');
              b.classList.add('btn-primary');
            } else {
              b.classList.remove('btn-primary');
              b.classList.add('btn-secondary');
            }
          }
          if (s) {
            if (t.secId === tab.secId) {
              s.classList.remove('ocultar');
            } else {
              s.classList.add('ocultar');
            }
          }
        });
      });
    }
  });
}

function configurarToggleFormularioReserva() {
  const btnToggle = document.getElementById('btnToggleNuevoTurno');
  const btnCerrar = document.getElementById('btnCerrarFormAdmin');
  const btnCancelar = document.getElementById('btnCancelarFormReserva');
  const seccionForm = document.getElementById('seccionNuevaReserva');

  const ocultarForm = () => {
    if (seccionForm) seccionForm.classList.add('ocultar');
  };

  if (btnToggle && seccionForm) {
    btnToggle.addEventListener('click', () => {
      seccionForm.classList.toggle('ocultar');
      if (!seccionForm.classList.contains('ocultar')) {
        seccionForm.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  if (btnCerrar) btnCerrar.addEventListener('click', ocultarForm);
  if (btnCancelar) btnCancelar.addEventListener('click', ocultarForm);
}

// -------------------------------------------------------------------
// 2. CARGAR Y BUSCAR CLIENTES (AUTOCOMPLETE)
// -------------------------------------------------------------------
async function cargarUsuarios() {
  try {
    const snap = await getDocs(collection(db, 'usuarios'));
    listaUsuarios = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderizarListaUsuarios(listaUsuarios);
    configurarBuscadorUsuarios();
  } catch (error) {
    console.error('Error al cargar usuarios:', error);
  }
}

function renderizarListaUsuarios(usuarios) {
  const container = document.getElementById('usuariosContainer');
  const elStat = document.getElementById('statUsuarios');
  if (elStat) elStat.textContent = usuarios.length;

  if (!container) return;

  if (usuarios.length === 0) {
    container.innerHTML = '<p style="color:#666;">No hay usuarios registrados.</p>';
    return;
  }

  let html = `
    <div style="background:#fff; border-radius:8px; padding:15px; box-shadow:0 2px 4px rgba(0,0,0,0.05); overflow-x:auto;">
      <table style="width:100%; border-collapse:collapse; text-align:left; font-size:14px;">
        <thead>
          <tr style="border-bottom:2px solid #eee; color:#555;">
            <th style="padding:10px;">Nombre</th>
            <th style="padding:10px;">Email</th>
            <th style="padding:10px;">Teléfono</th>
            <th style="padding:10px;">Estado</th>
          </tr>
        </thead>
        <tbody>
  `;

  usuarios.forEach(u => {
    html += `
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px; font-weight:bold;">${u.nombre || ''} ${u.apellido || ''}</td>
        <td style="padding:10px; color:#555;">${u.email || '-'}</td>
        <td style="padding:10px; color:#555;">${u.telefono || '-'}</td>
        <td style="padding:10px;">
          <span style="background:${u.bloqueado ? '#e74c3c' : '#2ecc71'}; color:#fff; padding:2px 8px; border-radius:10px; font-size:11px;">
            ${u.bloqueado ? 'Bloqueado' : 'Activo'}
          </span>
        </td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
}

function configurarBuscadorUsuarios() {
  const inputFiltro = document.getElementById('filtroUsuario');
  if (inputFiltro) {
    inputFiltro.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtrados = listaUsuarios.filter(u => {
        const nom = `${u.nombre || ''} ${u.apellido || ''}`.toLowerCase();
        const email = (u.email || '').toLowerCase();
        const tel = (u.telefono || '').toLowerCase();
        return nom.includes(q) || email.includes(q) || tel.includes(q);
      });
      renderizarListaUsuarios(filtrados);
    });
  }
}

function configurarBuscadorClientes() {
  const inputNombre = document.getElementById('adminClienteNombre');
  const inputApellido = document.getElementById('adminClienteApellido');
  const contenedorAutocomplete = crearContenedorAutocomplete(inputNombre);

  const buscarYMostrar = (texto) => {
    const queryStr = texto.toLowerCase().trim();
    if (!queryStr || queryStr.length < 2) {
      if (contenedorAutocomplete) contenedorAutocomplete.style.display = 'none';
      return;
    }

    const coincidencias = listaUsuarios.filter(u => {
      const nombreCompleto = `${u.nombre || ''} ${u.apellido || ''}`.toLowerCase();
      const email = (u.email || '').toLowerCase();
      const telefono = (u.telefono || '').toLowerCase();
      return nombreCompleto.includes(queryStr) || email.includes(queryStr) || telefono.includes(queryStr);
    });

    renderizarAutocomplete(coincidencias, contenedorAutocomplete);
  };

  if (inputNombre) {
    inputNombre.addEventListener('input', (e) => buscarYMostrar(e.target.value));
  }
  if (inputApellido) {
    inputApellido.addEventListener('input', () => {
      const nom = inputNombre ? inputNombre.value : '';
      buscarYMostrar(`${nom} ${inputApellido.value}`);
    });
  }

  document.addEventListener('click', (e) => {
    if (contenedorAutocomplete && !contenedorAutocomplete.contains(e.target) && e.target !== inputNombre) {
      contenedorAutocomplete.style.display = 'none';
    }
  });
}

function crearContenedorAutocomplete(inputRef) {
  if (!inputRef) return null;
  const parent = inputRef.parentElement;
  if (!parent) return null;
  parent.style.position = 'relative';

  let listDiv = document.getElementById('listaClientesAutocomplete');
  if (!listDiv) {
    listDiv = document.createElement('div');
    listDiv.id = 'listaClientesAutocomplete';
    listDiv.className = 'autocomplete-dropdown';
    listDiv.style.cssText = 'position:absolute; top:100%; left:0; right:0; background:#fff; border:1px solid #ccc; max-height:200px; overflow-y:auto; z-index:1000; box-shadow:0 4px 8px rgba(0,0,0,0.1); display:none; border-radius:4px;';
    parent.appendChild(listDiv);
  }
  return listDiv;
}

function renderizarAutocomplete(coincidencias, contenedor) {
  if (!contenedor) return;
  contenedor.innerHTML = '';

  if (coincidencias.length === 0) {
    contenedor.innerHTML = '<div style="padding:10px; color:#888;">No se encontraron clientes registrados.</div>';
    contenedor.style.display = 'block';
    return;
  }

  coincidencias.forEach(u => {
    const item = document.createElement('div');
    item.style.cssText = 'padding:10px; cursor:pointer; border-bottom:1px solid #eee; transition:background 0.2s;';
    item.innerHTML = `
      <strong>${u.nombre || ''} ${u.apellido || ''}</strong><br>
      <small style="color:#666;">📧 ${u.email || 'Sin email'} | 📞 ${u.telefono || 'Sin tel'}</small>
    `;
    item.addEventListener('mouseenter', () => item.style.background = '#f0f0f0');
    item.addEventListener('mouseleave', () => item.style.background = '#fff');
    item.addEventListener('click', () => seleccionarCliente(u, contenedor));
    contenedor.appendChild(item);
  });

  contenedor.style.display = 'block';
}

function seleccionarCliente(u, contenedor) {
  clienteSeleccionado = u;
  
  const inputNombre = document.getElementById('adminClienteNombre');
  const inputApellido = document.getElementById('adminClienteApellido');
  const inputTel = document.getElementById('adminClienteTelefono');
  const inputEmail = document.getElementById('adminClienteEmail');

  if (inputNombre) inputNombre.value = u.nombre || '';
  if (inputApellido) inputApellido.value = u.apellido || '';
  if (inputTel) inputTel.value = u.telefono || '';
  if (inputEmail) inputEmail.value = u.email || '';

  if (contenedor) contenedor.style.display = 'none';
}

// -------------------------------------------------------------------
// 3. ESTADÍSTICAS (TOTALES DEL MES)
// -------------------------------------------------------------------
function actualizarEstadisticas(turnos) {
  const hoyObj = new Date();
  const yyyy = hoyObj.getFullYear();
  const mm = String(hoyObj.getMonth() + 1).padStart(2, '0');
  const dd = String(hoyObj.getDate()).padStart(2, '0');

  const mesActualStr = `${yyyy}-${mm}`;
  const hoyStr = `${yyyy}-${mm}-${dd}`;

  // REQUISITO: "Turnos totales" es únicamente el conteo del mes actual
  const turnosMes = turnos.filter(t => t.fecha && t.fecha.startsWith(mesActualStr) && t.estado !== 'cancelado');
  const turnosHoy = turnos.filter(t => t.fecha === hoyStr && t.estado !== 'cancelado');
  const turnosProximos = turnos.filter(t => t.fecha >= hoyStr && t.estado !== 'cancelado');

  const elTotal = document.getElementById('statTotal');
  const elProximos = document.getElementById('statProximos');
  const elHoy = document.getElementById('statHoy');

  if (elTotal) elTotal.textContent = turnosMes.length;
  if (elProximos) elProximos.textContent = turnosProximos.length;
  if (elHoy) elHoy.textContent = turnosHoy.length;
}

// -------------------------------------------------------------------
// 4. CARGAR Y RENDEREAR TURNOS (LISTA Y CALENDARIO)
// -------------------------------------------------------------------
function cargarTurnosAdmin() {
  const loadingMsg = document.getElementById('loadingMsg');
  if (loadingMsg) loadingMsg.classList.remove('ocultar');

  onSnapshot(collection(db, 'turnos'), (snapshot) => {
    if (loadingMsg) loadingMsg.classList.add('ocultar');

    todosLosTurnos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // Ordenar turnos en memoria por fecha y hora
    todosLosTurnos.sort((a, b) => {
      const fechaA = `${a.fecha || ''} ${a.horario || ''}`;
      const fechaB = `${b.fecha || ''} ${b.horario || ''}`;
      return fechaA.localeCompare(fechaB);
    });

    actualizarEstadisticas(todosLosTurnos);

    if (vistaActual === 'calendario') {
      renderizarCalendario(todosLosTurnos);
    } else {
      filtrarYRenderizarTurnos();
    }
  }, (error) => {
    console.error('Error al cargar turnos:', error);
    if (loadingMsg) loadingMsg.textContent = 'Error al cargar los turnos.';
  });
}

function configurarFiltrosTurnos() {
  const selectProf = document.getElementById('filtroProfesional');
  const inputFecha = document.getElementById('filtroFecha');
  const btnLimpiar = document.getElementById('btnLimpiarFiltros');

  const manejarCambioFiltros = () => {
    const profVal = selectProf?.value;
    const fechaVal = inputFecha?.value;

    if (btnLimpiar) {
      if (profVal || fechaVal) {
        btnLimpiar.style.display = 'inline-block';
      } else {
        btnLimpiar.style.display = 'none';
      }
    }

    if (vistaActual === 'calendario') {
      renderizarCalendario(todosLosTurnos);
    } else {
      filtrarYRenderizarTurnos();
    }
  };

  if (selectProf) selectProf.addEventListener('change', manejarCambioFiltros);
  if (inputFecha) inputFecha.addEventListener('change', manejarCambioFiltros);

  if (btnLimpiar) {
    btnLimpiar.addEventListener('click', () => {
      if (selectProf) selectProf.value = '';
      if (inputFecha) inputFecha.value = '';
      btnLimpiar.style.display = 'none';
      filtrarYRenderizarTurnos();
    });
  }
}

function filtrarYRenderizarTurnos() {
  const profFiltro = document.getElementById('filtroProfesional')?.value;
  const fechaFiltro = document.getElementById('filtroFecha')?.value;

  let turnosFiltrados = [...todosLosTurnos];

  if (profFiltro) {
    turnosFiltrados = turnosFiltrados.filter(t => t.profesional === profFiltro);
  }

  if (fechaFiltro) {
    turnosFiltrados = turnosFiltrados.filter(t => t.fecha === fechaFiltro);
  }

  const container = document.getElementById('turnosListaContainer');
  if (container) {
    renderizarListaTurnosAdmin(turnosFiltrados, container);
  }
}

function renderizarListaTurnosAdmin(turnos, contenedor) {
  contenedor.innerHTML = '';

  if (turnos.length === 0) {
    contenedor.innerHTML = '<p style="text-align:center; color:#7f8c8d; padding:20px;">No se encontraron turnos con los criterios seleccionados.</p>';
    return;
  }

  turnos.forEach(t => {
    const card = document.createElement('div');
    card.className = 'turno-card-admin';
    card.style.cssText = 'background:#fff; border-left:4px solid #3498db; padding:15px; margin-bottom:12px; border-radius:6px; box-shadow:0 2px 4px rgba(0,0,0,0.05);';
    if (t.estado === 'cancelado') card.style.borderLeftColor = '#e74c3c';

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:5px;">
        <h4 style="margin:0; color:#2c3e50;">📅 ${t.fechaFormato || t.fecha} - ⏰ ${t.horario}</h4>
        <span style="background:${t.estado === 'cancelado' ? '#e74c3c' : '#2ecc71'}; color:#fff; padding:3px 10px; border-radius:12px; font-size:12px; font-weight:bold;">
          ${t.estado || 'confirmado'}
        </span>
      </div>
      <p style="margin:8px 0 4px; color:#333;"><strong>Cliente:</strong> ${t.clienteNombre || 'Cliente'} ${t.clienteTelefono ? `(${t.clienteTelefono})` : ''} ${t.clienteEmail ? `- 📧 ${t.clienteEmail}` : ''}</p>
      <p style="margin:0; color:#555;"><strong>Servicio:</strong> ${t.servicio || 'Servicio'} con <strong>${t.profesional || 'Profesional'}</strong></p>
      ${t.estado !== 'cancelado' ? `
        <div style="margin-top:10px; text-align:right;">
          <button onclick="cancelarTurnoAdmin('${t.id}')" class="btn btn-sm" style="background:#e74c3c; color:#fff; border:none; padding:5px 12px; border-radius:4px; cursor:pointer;">Cancelar Turno</button>
        </div>
      ` : ''}
    `;
    contenedor.appendChild(card);
  });
}

window.cancelarTurnoAdmin = async function(turnoId) {
  if (!confirm('¿Seguro que querés cancelar este turno?')) return;
  try {
    await updateDoc(doc(db, 'turnos', turnoId), { estado: 'cancelado' });
    alert('Turno cancelado correctamente.');
  } catch (error) {
    console.error('Error al cancelar turno:', error);
    alert('Error al cancelar el turno.');
  }
};

// -------------------------------------------------------------------
// 5. VISTA CALENDARIO
// -------------------------------------------------------------------
function configurarVistaCalendario() {
  const btnVista = document.getElementById('btnVista');
  const vistaLista = document.getElementById('vistaLista');
  const vistaCalendario = document.getElementById('vistaCalendario');

  if (btnVista) {
    btnVista.addEventListener('click', () => {
      if (vistaActual === 'lista') {
        vistaActual = 'calendario';
        btnVista.textContent = '📋 Ver Lista';
        if (vistaLista) vistaLista.classList.add('ocultar');
        if (vistaCalendario) vistaCalendario.classList.remove('ocultar');
        renderizarCalendario(todosLosTurnos);
      } else {
        vistaActual = 'lista';
        btnVista.textContent = '📅 Ver Calendario';
        if (vistaCalendario) vistaCalendario.classList.add('ocultar');
        if (vistaLista) vistaLista.classList.remove('ocultar');
      }
    });
  }
}

function renderizarCalendario(turnos) {
  const container = document.getElementById('calendarioContainer');
  if (!container) return;

  const mesesNombres = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const primerDiaMes = new Date(calAnio, calMes, 1).getDay();
  const diasEnMes = new Date(calAnio, calMes + 1, 0).getDate();

  const hoyObj = new Date();
  const esMesActual = hoyObj.getFullYear() === calAnio && hoyObj.getMonth() === calMes;
  const diaHoy = hoyObj.getDate();

  let html = `
    <div style="background:#fff; border-radius:8px; padding:20px; box-shadow:0 2px 4px rgba(0,0,0,0.05); overflow-x:auto;">
      <!-- Header del Calendario -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; flex-wrap:wrap; gap:10px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <button class="btn btn-secondary btn-sm" id="calPrevMes" style="padding:4px 10px;">◀</button>
          <h3 style="margin:0; min-width:180px; text-align:center; color:#2c3e50;">${mesesNombres[calMes]} ${calAnio}</h3>
          <button class="btn btn-secondary btn-sm" id="calNextMes" style="padding:4px 10px;">▶</button>
        </div>
        <button class="btn btn-outline btn-sm" id="calHoyBtn">Ir a Hoy</button>
      </div>

      <!-- Días de la Semana -->
      <div style="display:grid; grid-template-columns:repeat(7, minmax(110px, 1fr)); gap:6px; min-width:700px;">
        <div style="font-weight:bold; padding:8px; background:#f8f9fa; border-radius:4px; text-align:center; color:#555;">Dom</div>
        <div style="font-weight:bold; padding:8px; background:#f8f9fa; border-radius:4px; text-align:center; color:#555;">Lun</div>
        <div style="font-weight:bold; padding:8px; background:#f8f9fa; border-radius:4px; text-align:center; color:#555;">Mar</div>
        <div style="font-weight:bold; padding:8px; background:#f8f9fa; border-radius:4px; text-align:center; color:#555;">Mié</div>
        <div style="font-weight:bold; padding:8px; background:#f8f9fa; border-radius:4px; text-align:center; color:#555;">Jue</div>
        <div style="font-weight:bold; padding:8px; background:#f8f9fa; border-radius:4px; text-align:center; color:#555;">Vie</div>
        <div style="font-weight:bold; padding:8px; background:#f8f9fa; border-radius:4px; text-align:center; color:#555;">Sáb</div>
  `;

  // Celdas vacías previas
  for (let i = 0; i < primerDiaMes; i++) {
    html += `<div style="min-height:95px; background:#fafafa; border-radius:4px; opacity:0.3;"></div>`;
  }

  // Días del mes
  for (let dia = 1; dia <= diasEnMes; dia++) {
    const mmStr = String(calMes + 1).padStart(2, '0');
    const ddStr = String(dia).padStart(2, '0');
    const fechaStr = `${calAnio}-${mmStr}-${ddStr}`;

    const esHoy = esMesActual && dia === diaHoy;
    const turnosDelDia = turnos.filter(t => t.fecha === fechaStr && t.estado !== 'cancelado');

    const bgEstilo = esHoy ? 'background:#e8f4fc; border:2px solid #3498db;' : 'background:#fff; border:1px solid #e2e8f0;';

    html += `
      <div class="cal-day-cell" data-fecha="${fechaStr}" style="min-height:95px; padding:6px; border-radius:4px; text-align:left; font-size:12px; cursor:pointer; transition:all 0.2s; ${bgEstilo}">
        <div style="font-weight:bold; font-size:13px; margin-bottom:4px; color:${esHoy ? '#2980b9' : '#333'}; display:flex; justify-content:space-between; align-items:center;">
          <span>${dia}</span>
          ${turnosDelDia.length > 0 ? `<span style="background:#27ae60; color:#fff; border-radius:10px; padding:1px 6px; font-size:10px;">${turnosDelDia.length}</span>` : ''}
        </div>
        <div style="display:flex; flex-direction:column; gap:2px;">
    `;

    turnosDelDia.slice(0, 2).forEach(t => {
      html += `
        <div style="background:#3498db; color:#fff; padding:2px 4px; border-radius:3px; font-size:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${t.horario} - ${t.clienteNombre || ''}">
          ⏰ ${t.horario} ${t.clienteNombre ? t.clienteNombre.split(' ')[0] : ''}
        </div>
      `;
    });

    if (turnosDelDia.length > 2) {
      html += `<div style="font-size:10px; color:#7f8c8d; text-align:center; margin-top:2px;">+${turnosDelDia.length - 2} más</div>`;
    }

    html += `
        </div>
      </div>
    `;
  }

  html += `
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Botones de navegación
  document.getElementById('calPrevMes')?.addEventListener('click', () => {
    calMes--;
    if (calMes < 0) { calMes = 11; calAnio--; }
    renderizarCalendario(turnos);
  });

  document.getElementById('calNextMes')?.addEventListener('click', () => {
    calMes++;
    if (calMes > 11) { calMes = 0; calAnio++; }
    renderizarCalendario(turnos);
  });

  document.getElementById('calHoyBtn')?.addEventListener('click', () => {
    const hoy = new Date();
    calAnio = hoy.getFullYear();
    calMes = hoy.getMonth();
    renderizarCalendario(turnos);
  });

  // Al hacer clic en un día del calendario, filtrar en la lista por esa fecha
  document.querySelectorAll('.cal-day-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const fecha = cell.dataset.fecha;
      if (fecha) {
        const inputFiltroFecha = document.getElementById('filtroFecha');
        if (inputFiltroFecha) {
          inputFiltroFecha.value = fecha;
          vistaActual = 'lista';
          const btnVista = document.getElementById('btnVista');
          if (btnVista) btnVista.textContent = '📅 Ver Calendario';
          document.getElementById('vistaCalendario')?.classList.add('ocultar');
          document.getElementById('vistaLista')?.classList.remove('ocultar');
          filtrarYRenderizarTurnos();
        }
      }
    });
  });
}

// -------------------------------------------------------------------
// 6. CONFIRMAR RESERVA DESDE ADMIN
// -------------------------------------------------------------------
function configurarFormularioReservaAdmin() {
  const formAdminReserva = document.getElementById('formAdminReserva');
  if (!formAdminReserva) return;

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
      alert('Por favor completá todos los campos obligatorios (*).');
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
      const btnSubmit = document.getElementById('btnGuardarReservaAdmin');
      if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.textContent = 'Guardando...'; }

      // 1. Guardar turno en Firestore
      const docRef = await addDoc(collection(db, "turnos"), nuevoTurno);

      // 2. Enviar notificaciones y correo
      try {
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

      } catch (notifError) {
        console.error('Error enviando notificaciones:', notifError);
      }

      alert('¡Turno reservado con éxito!');
      
      // Ocultar y reiniciar formulario
      formAdminReserva.reset();
      clienteSeleccionado = null;
      document.getElementById('seccionNuevaReserva')?.classList.add('ocultar');

      if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = 'Guardar Reserva'; }

    } catch (error) {
      console.error('Error al guardar reserva admin:', error);
      alert('Error al guardar la reserva.');
      const btnSubmit = document.getElementById('btnGuardarReservaAdmin');
      if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = 'Guardar Reserva'; }
    }
  });
}

// -------------------------------------------------------------------
// 7. DATOS DE BARBERÍA Y SELECTS DINÁMICOS
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

    poblarSelectsProfesionales();
  } catch(e) {
    console.error('Error cargando datos de barbería:', e);
  }
}

function poblarSelectsProfesionales() {
  const selectFiltro = document.getElementById('filtroProfesional');
  const selectAdmin = document.getElementById('adminSelectProfesional');

  if (selectFiltro) {
    selectFiltro.innerHTML = '<option value="">Todos los profesionales</option>';
    barberia.profesionales.forEach(p => {
      selectFiltro.innerHTML += `<option value="${p.nombre}">${p.nombre}</option>`;
    });
  }

  if (selectAdmin) {
    selectAdmin.innerHTML = '<option value="">Seleccionar...</option>';
    barberia.profesionales.forEach(p => {
      selectAdmin.innerHTML += `<option value="${p.nombre}" data-id="${p.id}">${p.nombre}</option>`;
    });

    selectAdmin.addEventListener('change', (e) => {
      const selectedOption = e.target.options[e.target.selectedIndex];
      const profId = selectedOption.dataset.id;
      poblarSelectServicios(profId);
    });
  }
}

function poblarSelectServicios(profId) {
  const selectServ = document.getElementById('adminSelectServicio');
  if (!selectServ) return;

  selectServ.innerHTML = '<option value="">Seleccionar...</option>';
  if (!profId) return;

  const servicios = barberia.servicios[profId] || [];
  servicios.forEach(s => {
    selectServ.innerHTML += `<option value="${s.nombre}">${s.nombre} ($${s.precio || 0})</option>`;
  });
}
