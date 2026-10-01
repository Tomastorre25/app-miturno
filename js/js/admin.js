import { db, auth } from './firebase-config.js';
import { 
  collection, addDoc, getDocs, query, where, doc, getDoc, updateDoc, deleteDoc, orderBy, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
  enviarEmailConfirmacion, crearNotificacion, programarRecordatorios 
} from './notifications.js';

// Variables de estado
let listaUsuarios = [];
let clienteSeleccionado = null;
let barberia = { profesionales: [], servicios: {} };

const ADMIN_EMAIL = 'tomasdelatorre15@gmail.com';

document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = './auth.html';
      return;
    }

    // Verificar si es administrador
    if (user.email !== ADMIN_EMAIL) {
      const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
      if (!userDoc.exists() || !userDoc.data().esAdmin) {
        alert('Acceso no autorizado.');
        window.location.href = '../index.html';
        return;
      }
    }

    // Cargar datos iniciales
    inicializarAdmin();
  });
});

async function inicializarAdmin() {
  await cargarUsuarios();
  await cargarDatosBarberia();
  configurarBuscadorClientes();
  cargarTurnosAdmin();
  configurarFormularioReservaAdmin();
}

// -------------------------------------------------------------------
// 1. CARGAR Y BUSCAR CLIENTES (AUTOCOMPLETE)
// -------------------------------------------------------------------
async function cargarUsuarios() {
  try {
    const snap = await getDocs(collection(db, 'usuarios'));
    listaUsuarios = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Error al cargar usuarios:', error);
  }
}

function configurarBuscadorClientes() {
  const inputNombre = document.getElementById('adminClienteNombre') || document.getElementById('clienteNombre');
  const inputApellido = document.getElementById('adminClienteApellido') || document.getElementById('clienteApellido');
  const inputSearch = document.getElementById('buscarClienteInput');
  const contenedorAutocomplete = document.getElementById('listaClientesAutocomplete') || crearContenedorAutocomplete(inputNombre || inputSearch);

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
  if (inputSearch) {
    inputSearch.addEventListener('input', (e) => buscarYMostrar(e.target.value));
  }

  // Cerrar lista al hacer clic fuera
  document.addEventListener('click', (e) => {
    if (contenedorAutocomplete && !contenedorAutocomplete.contains(e.target) && e.target !== inputNombre && e.target !== inputSearch) {
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
    item.className = 'autocomplete-item';
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
  
  const inputNombre = document.getElementById('adminClienteNombre') || document.getElementById('clienteNombre');
  const inputApellido = document.getElementById('adminClienteApellido') || document.getElementById('clienteApellido');
  const inputTel = document.getElementById('adminClienteTelefono') || document.getElementById('clienteTelefono');
  const inputEmail = document.getElementById('adminClienteEmail') || document.getElementById('clienteEmail');

  if (inputNombre) inputNombre.value = u.nombre || '';
  if (inputApellido) inputApellido.value = u.apellido || '';
  if (inputTel) inputTel.value = u.telefono || '';
  if (inputEmail) inputEmail.value = u.email || '';

  if (contenedor) contenedor.style.display = 'none';
}

// -------------------------------------------------------------------
// 2. MOSTRAR TURNOS EN EL PANEL DE ADMIN (CORREGIDO SIN ERRORES DE ÍNDICES)
// -------------------------------------------------------------------
function cargarTurnosAdmin() {
  const contenedorTurnos = document.getElementById('listaTurnosAdmin') || document.getElementById('contenedorTurnos') || document.getElementById('tablaTurnos');
  if (!contenedorTurnos) return;

  contenedorTurnos.innerHTML = '<p>Cargando turnos...</p>';

  // Escuchar cambios en tiempo real sin ordenar en Firestore para evitar errores de índice faltante
  onSnapshot(collection(db, 'turnos'), (snapshot) => {
    let turnos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // Ordenar en memoria local por fecha y horario
    turnos.sort((a, b) => {
      const fechaA = `${a.fecha || ''} ${a.horario || ''}`;
      const fechaB = `${b.fecha || ''} ${b.horario || ''}`;
      return fechaA.localeCompare(fechaB);
    });

    renderizarTurnosAdmin(turnos, contenedorTurnos);
  }, (error) => {
    console.error('Error al cargar turnos:', error);
    contenedorTurnos.innerHTML = '<p class="error">Error al cargar los turnos. Revisá la consola o los permisos.</p>';
  });
}

function renderizarTurnosAdmin(turnos, contenedor) {
  contenedor.innerHTML = '';

  if (turnos.length === 0) {
    contenedor.innerHTML = '<p>No hay turnos registrados en el sistema.</p>';
    return;
  }

  // Si el contenedor es una tabla (tbody)
  if (contenedor.tagName === 'TBODY') {
    turnos.forEach(t => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${t.fechaFormato || t.fecha || '-'}</td>
        <td>${t.horario || '-'}</td>
        <td>${t.clienteNombre || t.nombre || 'Cliente'}</td>
        <td>${t.clienteTelefono || '-'}</td>
        <td>${t.profesional || '-'}</td>
        <td>${t.servicio || '-'}</td>
        <td><span class="badge ${t.estado === 'cancelado' ? 'badge-danger' : 'badge-success'}">${t.estado || 'confirmado'}</span></td>
        <td>
          <button class="btn-cancelar-turno" data-id="${t.id}" style="background:#e74c3c; color:#fff; border:none; padding:5px 10px; border-radius:3px; cursor:pointer;">Cancelar</button>
        </td>
      `;
      contenedor.appendChild(tr);
    });
  } else {
    // Si es un div contenedor de tarjetas
    turnos.forEach(t => {
      const card = document.createElement('div');
      card.className = 'turno-card-admin';
      card.style.cssText = 'background:#fff; border-left:4px solid #3498db; padding:15px; margin-bottom:10px; border-radius:5px; box-shadow:0 2px 4px rgba(0,0,0,0.05);';
      if (t.estado === 'cancelado') card.style.borderLeftColor = '#e74c3c';

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h4>📅 ${t.fechaFormato || t.fecha} - ⏰ ${t.horario}</h4>
          <span style="background:${t.estado === 'cancelado' ? '#e74c3c' : '#2ecc71'}; color:#fff; padding:3px 8px; border-radius:12px; font-size:12px;">${t.estado || 'confirmado'}</span>
        </div>
        <p><strong>Cliente:</strong> ${t.clienteNombre || 'Cliente'} (${t.clienteTelefono || 'Sin tel'}) - 📧 ${t.clienteEmail || 'Sin email'}</p>
        <p><strong>Servicio:</strong> ${t.servicio} con <strong>${t.profesional}</strong></p>
        ${t.estado !== 'cancelado' ? `<button onclick="cancelarTurnoAdmin('${t.id}')" style="background:#e74c3c; color:#fff; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; margin-top:5px;">Cancelar Turno</button>` : ''}
      `;
      contenedor.appendChild(card);
    });
  }

  // Asignar eventos a botones de cancelación
  document.querySelectorAll('.btn-cancelar-turno').forEach(btn => {
    btn.addEventListener('click', () => cancelarTurnoAdmin(btn.dataset.id));
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
// 3. CONFIRMAR RESERVA DESDE ADMIN Y NOTIFICAR AL CLIENTE
// -------------------------------------------------------------------
function configurarFormularioReservaAdmin() {
  const formAdminReserva = document.getElementById('formAdminReserva') || document.getElementById('formNuevaReservaAdmin');
  if (!formAdminReserva) return;

  formAdminReserva.addEventListener('submit', async (e) => {
    e.preventDefault();

    const profesional = document.getElementById('adminSelectProfesional')?.value;
    const servicio = document.getElementById('adminSelectServicio')?.value;
    const fecha = document.getElementById('adminInputFecha')?.value;
    const horario = document.getElementById('adminSelectHorario')?.value;

    const nombre = document.getElementById('adminClienteNombre')?.value.trim() || document.getElementById('clienteNombre')?.value.trim();
    const apellido = document.getElementById('adminClienteApellido')?.value.trim() || document.getElementById('clienteApellido')?.value.trim();
    const telefono = document.getElementById('adminClienteTelefono')?.value.trim() || document.getElementById('clienteTelefono')?.value.trim();
    const email = document.getElementById('adminClienteEmail')?.value.trim() || document.getElementById('clienteEmail')?.value.trim();

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

      // 1. Guardar turno en Firestore
      const docRef = await addDoc(collection(db, "turnos"), nuevoTurno);

      // 2. ENVIAR NOTIFICACIONES Y EMAIL AL CLIENTE
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

        // Programar recordatorios automáticos
        await programarRecordatorios({ ...nuevoTurno, id: docRef.id });

      } catch (notifError) {
        console.error('Error enviando notificaciones:', notifError);
      }

      alert('¡Turno reservado con éxito y notificación enviada al cliente!');
      formAdminReserva.reset();
      clienteSeleccionado = null;

      if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = 'Guardar Reserva'; }

    } catch (error) {
      console.error('Error al guardar reserva admin:', error);
      alert('Error al guardar la reserva.');
    }
  });
}

async function cargarDatosBarberia() {
  try {
    const profSnap = await getDocs(query(collection(db, 'profesionales'), orderBy('orden')));
    barberia.profesionales = profSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {
    console.error('Error cargando barbería:', e);
  }
}
