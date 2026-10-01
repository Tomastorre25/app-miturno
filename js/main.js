import { db, auth } from './firebase-config.js';
import { collection, addDoc, getDocs, query, where, doc, getDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { enviarEmailConfirmacion, crearNotificacion, mostrarNotifPush, programarRecordatorios, verificarRecordatorios, registrarServiceWorker, solicitarPermisoPush } from './notifications.js';
import { iniciarCampana } from './notif-ui.js';

const ADMIN_EMAIL = 'tomasdelatorre15@gmail.com';
let barberia = { profesionales: [], servicios: {} };
let reservaActual = { profesional: null, servicio: null, fecha: null, horario: null };
let usuarioActual = null;

registrarServiceWorker();

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = './pages/auth.html';
    return;
  }
  try {
    const userDocRef = doc(db, 'usuarios', user.uid);
    const userDoc = await getDoc(userDocRef);

    const esAdmin = (user.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) ||
                    (userDoc.exists() && (userDoc.data().esAdmin || userDoc.data().rol === 'admin'));

    if (esAdmin) {
      usuarioActual = { uid: user.uid, nombre: 'Admin', apellido: '', telefono: '', email: user.email };
      actualizarNav(usuarioActual);
      await cargarDatosBarberia();
      inicializar();
      iniciarCampana(user.uid, false);
      verificarRecordatorios().catch(console.error);
      return;
    }

    if (!userDoc.exists()) {
      usuarioActual = {
        uid: user.uid,
        nombre: user.displayName || 'Cliente',
        apellido: '',
        telefono: '',
        email: user.email
      };
    } else {
      const userData = userDoc.data();
      if (userData.bloqueado) {
        await signOut(auth);
        window.location.href = './pages/auth.html';
        return;
      }
      usuarioActual = { uid: user.uid, ...userData };
    }

    actualizarNav(usuarioActual);
    await cargarDatosBarberia();
    inicializar();
    iniciarCampana(user.uid, false);
    solicitarPermisoPush().catch(console.error);
    verificarRecordatorios().catch(console.error);

  } catch (error) {
    console.error('Error al cargar usuario:', error);
    await signOut(auth);
    window.location.href = './pages/auth.html';
  }
});

async function cargarDatosBarberia() {
  try {
    const profSnap = await getDocs(query(collection(db, 'profesionales'), orderBy('orden')));
    barberia.profesionales = profSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    barberia.servicios = {};
    for (const prof of barberia.profesionales) {
      const servSnap = await getDocs(query(collection(db, `profesionales/${prof.id}/servicios`), orderBy('orden')));
      barberia.servicios[prof.id] = servSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch(e) {
    console.error('Error al cargar datos de la barbería:', e);
  }
}

function actualizarNav(userData) {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;
  const liPerfil = document.createElement('li');
  liPerfil.innerHTML = `<a href="./pages/perfil.html">${userData.nombre || 'Perfil'}</a>`;
  const liSalir = document.createElement('li');
  liSalir.innerHTML = `<a href="#" id="btnSalir">Salir</a>`;
  navbar.appendChild(liPerfil);
  navbar.appendChild(liSalir);

  document.getElementById('btnSalir')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = './pages/auth.html';
  });
}

function inicializar() {
  mostrarProfesionales();
  configurarFecha();
  configurarHorario();
  configurarEventosGenerales();
}

function mostrarProfesionales() {
  const container = document.getElementById('profesionalesContainer');
  if (!container) return;
  container.innerHTML = "";
  if (barberia.profesionales.length === 0) {
    container.innerHTML = '<p>No hay profesionales disponibles por el momento.</p>';
    return;
  }
  barberia.profesionales.forEach(prof => {
    const contenedor = document.createElement('div');
    contenedor.className = 'profesional-item';
    const card = document.createElement('div');
    card.className = 'profesional-card';
    card.innerHTML = `<h3>${prof.nombre}</h3>`;
    card.addEventListener('click', () => seleccionarProfesional(prof.id, prof.nombre));
    contenedor.appendChild(card);
    container.appendChild(contenedor);
  });
}

function seleccionarProfesional(id, nombre) {
  cacheDia = {};
  reservaActual.profesional = { id, nombre };
  const elemSel = document.getElementById('profesionalSeleccionado');
  const elemFin = document.getElementById('profesionalFinal');
  if (elemSel) elemSel.textContent = nombre;
  if (elemFin) elemFin.textContent = nombre;
  mostrarPaso(2);
}

function mostrarServicios(profesionalId) {
  const container = document.getElementById('serviciosContainer');
  if (!container) return;
  const servicios = barberia.servicios[profesionalId] || [];
  container.innerHTML = '';
  if (servicios.length === 0) {
    container.innerHTML = '<p>No hay servicios disponibles para este profesional.</p>';
    return;
  }
  servicios.forEach(servicio => {
    const contenedor = document.createElement('div');
    contenedor.className = 'servicio-item';
    const card = document.createElement('div');
    card.className = 'servicio-card';
    card.innerHTML = `
      <h3>${servicio.nombre}</h3>
      <p>Precio: $${servicio.precio}</p>
      <p>Duración: ${servicio.duracion}</p>
    `;
    card.addEventListener('click', () => seleccionarServicio(servicio.id, servicio.nombre, servicio.duracion));
    contenedor.appendChild(card);
    container.appendChild(contenedor);
  });
}

function seleccionarServicio(id, nombre, duracion) {
  reservaActual.servicio = { id, nombre, duracion };
  const elemFin = document.getElementById('servicioFinal');
  if (elemFin) elemFin.textContent = nombre;
  mostrarPaso(3);
}

function getFechaLocalHoy() {
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd = String(hoy.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function configurarFecha() {
  const dia = document.getElementById('dia');
  if (!dia) return;
  const fechaHoy = getFechaLocalHoy();
  dia.min = fechaHoy;
  dia.addEventListener('change', (e) => {
    if (e.target.value < fechaHoy) {
      e.target.value = fechaHoy;
    }
  }, { capture: true });
}

function configurarHorario() {
  const dia = document.getElementById('dia');
  if (!dia) return;
  dia.addEventListener('change', async (e) => {
    if (e.target.value) await mostrarHorarios(e.target.value);
  });
}

function parsearMinutos(horario) {
  const [hh, mm] = horario.split(':').map(Number);
  return hh * 60 + mm;
}

function minutosAHorario(min) {
  return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`;
}

function parsearDuracion(duracionStr) {
  const match = duracionStr ? duracionStr.match(/(\d+)/) : null;
  return match ? parseInt(match[1]) : 30;
}

let cacheDia = {};

async function cargarDatosDelDia(fecha) {
  if (cacheDia.fecha === fecha && cacheDia.profId === reservaActual.profesional.id) return cacheDia;
  const profId = reservaActual.profesional.id;
  const fechaObj = new Date(fecha + 'T00:00:00');
  const diasMap = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const diaKey = diasMap[fechaObj.getDay()];

  let horaInicio = '09:00', horaFin = '19:00', intervaloMin = null, diaActivo = true;
  try {
    const horarioDoc = await getDoc(doc(db, `profesionales/${profId}/horarios`, diaKey));
    if (horarioDoc.exists()) {
      const data = horarioDoc.data();
      diaActivo = data.activo ?? true;
      horaInicio = data.horaInicio || '09:00';
      horaFin = data.horaFin || '19:00';
      intervaloMin = data.intervaloMin || null;
    }
  } catch(e) {}

  const serviciosSnap = await getDocs(collection(db, `profesionales/${profId}/servicios`));
  const serviciosMap = {};
  let duraciones = [];
  serviciosSnap.docs.forEach(d => {
    const dur = parsearDuracion(d.data().duracion);
    serviciosMap[d.data().nombre] = dur;
    duraciones.push(dur);
  });

  if (!intervaloMin) {
    intervaloMin = duraciones.length > 0 ? Math.min(...duraciones) : 30;
  }

  const q = query(
    collection(db, "turnos"),
    where("profesional", "==", reservaActual.profesional.nombre),
    where("fecha", "==", fecha)
  );
  const snapshot = await getDocs(q);
  const bloquesOcupados = snapshot.docs.map(d => {
    const data = d.data();
    const inicio = parsearMinutos(data.horario);
    const duracion = serviciosMap[data.servicio] || intervaloMin;
    return { inicio, fin: inicio + duracion };
  }).sort((a, b) => a.inicio - b.inicio);

  cacheDia = { fecha, profId, diaActivo, horaInicio, horaFin, intervaloMin, bloquesOcupados };
  return cacheDia;
}

function generarSlotsParaServicio(horaInicio, horaFin, intervaloMin, bloquesOcupados, duracionServicio, esHoy, horaActualMin) {
  const inicioMin = parsearMinutos(horaInicio);
  const finMin = parsearMinutos(horaFin);
  const slots = [];
  let cursor = inicioMin;

  while (cursor < finMin) {
    const bloqueEnCursor = bloquesOcupados.find(b => cursor >= b.inicio && cursor < b.fin);
    if (bloqueEnCursor) {
      cursor = bloqueEnCursor.fin;
      continue;
    }

    if (esHoy && cursor <= horaActualMin) {
      cursor += intervaloMin;
      continue;
    }

    const finServicio = cursor + duracionServicio;
    if (finServicio > finMin) break;

    const proximoBloque = bloquesOcupados.find(b => b.inicio > cursor);
    if (proximoBloque && finServicio > proximoBloque.inicio) {
      cursor = proximoBloque.fin;
      continue;
    }

    slots.push(minutosAHorario(cursor));
    cursor += intervaloMin;
  }
  return slots;
}

async function mostrarHorarios(fecha) {
  const container = document.getElementById('horariosDisponibles');
  if (!container) return;
  container.innerHTML = '<p>Cargando horarios...</p>';
  const btnConf = document.getElementById('btnConfirmar');
  if (btnConf) btnConf.disabled = true;

  const datos = await cargarDatosDelDia(fecha);
  if (!datos.diaActivo) {
    container.innerHTML = '<p>El profesional no trabaja este día.</p>';
    return;
  }

  const ahora = new Date();
  const horaActualMin = ahora.getHours() * 60 + ahora.getMinutes();
  const esHoy = fecha === getFechaLocalHoy();

  const duracionServicio = parsearDuracion(reservaActual.servicio?.duracion || '');
  const slots = generarSlotsParaServicio(
    datos.horaInicio, datos.horaFin, datos.intervaloMin, datos.bloquesOcupados,
    duracionServicio, esHoy, horaActualMin
  );

  container.innerHTML = '<h3>Horarios disponibles:</h3><div id="horariosBotones"></div>';
  const botonesContainer = document.getElementById('horariosBotones');

  if (slots.length === 0) {
    botonesContainer.innerHTML = '<p>No hay horarios disponibles para este día.</p>';
    return;
  }

  slots.forEach(horario => {
    const contenedor = document.createElement('div');
    contenedor.className = 'horario-item';
    const btn = document.createElement('button');
    btn.className = 'horario-btn';
    btn.textContent = horario;
    btn.addEventListener('click', () => seleccionarHorario(fecha, horario, btn));
    contenedor.appendChild(btn);
    botonesContainer.appendChild(contenedor);
  });
}

function seleccionarHorario(fecha, horario, boton) {
  reservaActual.fecha = fecha;
  reservaActual.horario = horario;
  document.querySelectorAll('.horario-btn').forEach(btn => btn.classList.remove('selected'));
  if (boton) boton.classList.add('selected');
  const btnConf = document.getElementById('btnConfirmar');
  if (btnConf) btnConf.disabled = false;
}

function mostrarPaso(numero) {
  document.querySelectorAll('.paso-container').forEach(paso => paso.classList.add('ocultar'));
  document.getElementById(`paso${numero}`)?.classList.remove('ocultar');
  if (numero === 2) mostrarServicios(reservaActual.profesional.id);
  if (numero === 4) mostrarResumenPaso4();
}

function mostrarResumenPaso4() {
  if (usuarioActual) {
    const elemNom = document.getElementById('resumenNombre');
    const elemTel = document.getElementById('resumenTelefono');
    if (elemNom) elemNom.textContent = `${usuarioActual.nombre || ''} ${usuarioActual.apellido || ''}`;
    if (elemTel) elemTel.textContent = usuarioActual.telefono || '';
  }
  const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const fechaFormato = new Date(reservaActual.fecha + 'T00:00:00').toLocaleDateString('es-ES', opciones);

  const pProf = document.getElementById('resumenPaso4Profesional');
  const pServ = document.getElementById('resumenPaso4Servicio');
  const pFec = document.getElementById('resumenPaso4Fecha');
  const pHor = document.getElementById('resumenPaso4Horario');

  if (pProf) pProf.textContent = reservaActual.profesional.nombre;
  if (pServ) pServ.textContent = reservaActual.servicio.nombre;
  if (pFec) pFec.textContent = fechaFormato;
  if (pHor) pHor.textContent = reservaActual.horario;
}

async function confirmarReserva() {
  const btn = document.getElementById('btnFinalizar');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const fechaFormato = new Date(reservaActual.fecha + 'T00:00:00').toLocaleDateString('es-ES', opciones);

  const nuevoTurno = {
    profesional: reservaActual.profesional.nombre,
    servicio: reservaActual.servicio.nombre,
    fecha: reservaActual.fecha,
    fechaFormato,
    horario: reservaActual.horario,
    clienteNombre: `${usuarioActual.nombre || ''} ${usuarioActual.apellido || ''}`.trim(),
    clienteTelefono: usuarioActual.telefono || '',
    clienteEmail: usuarioActual.email || '',
    usuarioId: usuarioActual.uid,
    creadoEn: new Date().toISOString()
  };

  try {
    const docRef = await addDoc(collection(db, "turnos"), nuevoTurno);

    const rProf = document.getElementById('resumenProfesional');
    const rServ = document.getElementById('resumenServicio');
    const rFec = document.getElementById('resumenFecha');
    const rHor = document.getElementById('resumenHorario');

    if (rProf) rProf.textContent = reservaActual.profesional.nombre;
    if (rServ) rServ.textContent = reservaActual.servicio.nombre;
    if (rFec) rFec.textContent = fechaFormato;
    if (rHor) rHor.textContent = reservaActual.horario;

    try {
      await crearNotificacion({
        para: 'admin',
        tipo: 'nueva_reserva',
        mensaje: `Nueva reserva: ${nuevoTurno.clienteNombre} - ${nuevoTurno.profesional} - ${nuevoTurno.fechaFormato} ${nuevoTurno.horario}`,
        turnoId: docRef.id
      });
      await crearNotificacion({
        para: usuarioActual.uid,
        tipo: 'confirmacion',
        mensaje: `Tu turno fue confirmado: ${nuevoTurno.profesional} - ${nuevoTurno.fechaFormato} a las ${nuevoTurno.horario}`,
        turnoId: docRef.id
      });

      await mostrarNotifPush('¡Turno Confirmado!', `${nuevoTurno.profesional} - ${nuevoTurno.fechaFormato} a las ${nuevoTurno.horario}`);
      await enviarEmailConfirmacion(nuevoTurno);
      await programarRecordatorios({ ...nuevoTurno, id: docRef.id });

    } catch(notifError) {
      console.error('Error enviando notificaciones/emails:', notifError);
    }

    mostrarPaso(5);
  } catch (error) {
    alert('Error al guardar el turno. Intentá de nuevo.');
    console.error(error);
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar Reserva'; }
  }
}

function nuevaReserva() {
  reservaActual = { profesional: null, servicio: null, fecha: null, horario: null };
  cacheDia = {};
  const elemDia = document.getElementById('dia');
  const elemHor = document.getElementById('horariosDisponibles');
  const btnConf = document.getElementById('btnConfirmar');
  if (elemDia) elemDia.value = '';
  if (elemHor) elemHor.innerHTML = '';
  if (btnConf) btnConf.disabled = true;

  const btnFinalizar = document.getElementById('btnFinalizar');
  if (btnFinalizar) {
    btnFinalizar.disabled = false;
    btnFinalizar.textContent = 'Confirmar Reserva';
  }
  mostrarPaso(1);
}

function configurarEventosGenerales() {
  document.getElementById('btnVolver1')?.addEventListener('click', () => mostrarPaso(1));
  document.getElementById('btnVolver2')?.addEventListener('click', () => mostrarPaso(2));
  document.getElementById('btnConfirmar')?.addEventListener('click', () => mostrarPaso(4));
  document.getElementById('btnVolver3')?.addEventListener('click', () => mostrarPaso(3));
  document.getElementById('btnFinalizar')?.addEventListener('click', confirmarReserva);
  document.getElementById('btnNuevaReserva')?.addEventListener('click', nuevaReserva);
}
