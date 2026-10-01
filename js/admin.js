import { db, auth } from './firebase-config.js';
import { iniciarCalendario, actualizarTurnos } from './calendario.js';
import {
    signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    collection, getDocs, deleteDoc, doc, query, orderBy, updateDoc, getDoc, addDoc, setDoc, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { crearNotificacion, mostrarNotifPush, solicitarPermisoPush, enviarEmailCancelacion, enviarEmailModificacion } from './notifications.js';
import { iniciarCampana } from './notif-ui.js';

let todosLosTurnos = [];
let todosLosUsuarios = [];
let profesionales = [];
let vistaActual = 'lista';
let mesActual = new Date();

onAuthStateChanged(auth, async (user) => {
    if (user) {
        mostrarPanel();
        await Promise.all([cargarTurnos(), cargarUsuarios(), cargarProfesionales()]);
        iniciarCampana(user.uid, true);
    } else {
        mostrarLogin();
    }
});

document.getElementById('btnLogin').addEventListener('click', async () => {
    const email = document.getElementById('adminEmail').value.trim();
    const pass = document.getElementById('adminPass').value.trim();
    const error = document.getElementById('loginError');
    error.textContent = '';
    if (!email || !pass) { error.textContent = 'Completá email y contraseña.'; return; }
    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (e) {
        error.textContent = 'Email o contraseña incorrectos.';
    }
});

document.getElementById('adminPass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btnLogin').click();
});

document.getElementById('btnLogout').addEventListener('click', async () => { await signOut(auth); });

// Navegación secciones
['Turnos', 'Usuarios', 'Profesionales', 'Servicios', 'Horarios'].forEach(seccion => {
    document.getElementById(`btnSeccion${seccion}`).addEventListener('click', () => cambiarSeccion(seccion.toLowerCase()));
});

function cambiarSeccion(seccion) {
    ['turnos', 'usuarios', 'profesionales', 'servicios', 'horarios'].forEach(s => {
        document.getElementById(`seccion${s.charAt(0).toUpperCase() + s.slice(1)}`).classList.toggle('ocultar', s !== seccion);
        const btn = document.getElementById(`btnSeccion${s.charAt(0).toUpperCase() + s.slice(1)}`);
        btn.classList.toggle('btn-primary', s === seccion);
        btn.classList.toggle('btn-secondary', s !== seccion);
    });
    if (seccion === 'servicios') renderizarSelectorProfesionalServicios();
    if (seccion === 'horarios') renderizarSelectorProfesionalHorarios();
}

function mostrarLogin() {
    document.getElementById('loginSection').classList.remove('ocultar');
    document.getElementById('panelSection').classList.add('ocultar');
}
function mostrarPanel() {
    document.getElementById('loginSection').classList.add('ocultar');
    document.getElementById('panelSection').classList.remove('ocultar');
}

// ===================== TURNOS =====================
document.getElementById('btnVista').addEventListener('click', () => {
    vistaActual = vistaActual === 'lista' ? 'calendario' : 'lista';
    document.getElementById('btnVista').textContent = vistaActual === 'lista' ? 'Ver Calendario' : 'Ver Lista';
    document.getElementById('vistaLista').classList.toggle('ocultar', vistaActual !== 'lista');
    document.getElementById('vistaCalendario').classList.toggle('ocultar', vistaActual !== 'calendario');
    document.getElementById('filtrosLista').classList.toggle('ocultar', vistaActual !== 'lista');
    if (vistaActual === 'calendario') {
        iniciarCalendario(todosLosTurnos, eliminarTurnoAdmin, abrirModalTurno);
    }
});
document.getElementById('filtroProfesional').addEventListener('change', renderizarVista);
document.getElementById('filtroFecha').addEventListener('change', renderizarVista);
document.getElementById('filtroUsuario').addEventListener('input', renderizarUsuarios);

async function cargarTurnos() {
    document.getElementById('loadingMsg').classList.remove('ocultar');
    const q = query(collection(db, "turnos"), orderBy("fecha"), orderBy("horario"));
    const snapshot = await getDocs(q);
    todosLosTurnos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    document.getElementById('loadingMsg').classList.add('ocultar');
    actualizarEstadisticas();
    renderizarVista();
    if (vistaActual === 'calendario') actualizarTurnos(todosLosTurnos);
}

function actualizarEstadisticas() {
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('statTotal').textContent = todosLosTurnos.length;
    document.getElementById('statProximos').textContent = todosLosTurnos.filter(t => t.fecha >= hoy).length;
    document.getElementById('statHoy').textContent = todosLosTurnos.filter(t => t.fecha === hoy).length;
    document.getElementById('statUsuarios').textContent = todosLosUsuarios.length;
}

function getFiltrados() {
    const prof = document.getElementById('filtroProfesional').value;
    const fecha = document.getElementById('filtroFecha').value;
    return todosLosTurnos.filter(t => {
        if (prof && t.profesional !== prof) return false;
        if (fecha && t.fecha !== fecha) return false;
        return true;
    });
}

function renderizarVista() {
    if (vistaActual === 'lista') {
        document.getElementById('vistaLista').classList.remove('ocultar');
        document.getElementById('vistaCalendario').classList.add('ocultar');
        document.getElementById('filtrosLista').classList.remove('ocultar');
        renderizarLista();
    } else {
        document.getElementById('vistaLista').classList.add('ocultar');
        document.getElementById('vistaCalendario').classList.remove('ocultar');
        document.getElementById('filtrosLista').classList.add('ocultar');
        iniciarCalendario(todosLosTurnos, eliminarTurnoAdmin, abrirModalTurno);
    }
}

function renderizarLista() {
    const container = document.getElementById('turnosListaContainer');
    const turnos = getFiltrados();
    container.innerHTML = '';
    if (turnos.length === 0) {
        container.innerHTML = '<p class="light-text text-center" style="padding:20px;">No hay turnos para mostrar.</p>';
        return;
    }
    const porFecha = {};
    turnos.forEach(t => { if (!porFecha[t.fecha]) porFecha[t.fecha] = []; porFecha[t.fecha].push(t); });
    Object.keys(porFecha).sort().forEach(fecha => {
        const grupo = document.createElement('div');
        grupo.className = 'grupo-fecha';
        const titulo = document.createElement('div');
        titulo.className = 'grupo-fecha-titulo';
        titulo.textContent = new Date(fecha + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        grupo.appendChild(titulo);
        porFecha[fecha].sort((a, b) => a.horario.localeCompare(b.horario)).forEach(turno => grupo.appendChild(crearCardTurno(turno)));
        container.appendChild(grupo);
    });
}

function crearCardTurno(turno) {
    const hoy = new Date().toISOString().split('T')[0];
    const pasado = turno.fecha < hoy;
    const card = document.createElement('div');
    card.className = `turno-card admin-turno-card ${pasado ? 'turno-pasado' : ''}`;
    card.innerHTML = `
        <div class="turno-info">
            <div class="turno-field"><span class="turno-label">Horario:</span> <span class="turno-value turno-horario-badge">${turno.horario}</span></div>
            <div class="turno-field"><span class="turno-label">Profesional:</span> <span class="turno-value">${turno.profesional}</span></div>
            <div class="turno-field"><span class="turno-label">Servicio:</span> <span class="turno-value">${turno.servicio}</span></div>
            <div class="turno-field"><span class="turno-label">Cliente:</span> <span class="turno-value">${turno.clienteNombre || 'Sin nombre'}</span></div>
            <div class="turno-field"><span class="turno-label">Teléfono:</span> <span class="turno-value">${turno.clienteTelefono || '-'}</span></div>
            <div class="turno-field"><span class="turno-label">Email:</span> <span class="turno-value">${turno.clienteEmail || '-'}</span></div>
        </div>
        <div class="turno-actions" style="flex-direction:column;gap:6px;">
            <button class="btn btn-primary btn-sm btn-editar-admin">Editar</button>
            <button class="btn btn-secondary btn-sm btn-eliminar-admin">Eliminar</button>
        </div>`;
    card.querySelector('.btn-editar-admin').addEventListener('click', () => abrirModalTurno(turno));
    card.querySelector('.btn-eliminar-admin').addEventListener('click', () => eliminarTurnoAdmin(turno.id));
    return card;
}

async function eliminarTurnoAdmin(id) {
    if (confirm('¿Eliminar este turno?')) {
        const turnoDoc = await getDoc(doc(db, 'turnos', id));
        const turno = turnoDoc.exists() ? turnoDoc.data() : null;
        await deleteDoc(doc(db, "turnos", id));
        if (turno) {
            // Notificacion in-app
            if (turno.usuarioId) {
                await crearNotificacion({
                    para: turno.usuarioId,
                    tipo: 'cancelacion_admin',
                    mensaje: `Tu turno fue cancelado: ${turno.profesional} - ${turno.fechaFormato} a las ${turno.horario}`,
                    turnoId: id
                });
            }
            // Email al cliente
            try { await enviarEmailCancelacion(turno); } catch(e) { console.error(e); }
        }
        await cargarTurnos();
    }
}





document.getElementById('modalCerrar').addEventListener('click', () => document.getElementById('modalDia').classList.add('ocultar'));
document.getElementById('modalDia').addEventListener('click', (e) => { if (e.target === document.getElementById('modalDia')) document.getElementById('modalDia').classList.add('ocultar'); });

// ===================== USUARIOS =====================
async function cargarUsuarios() {
    const snapshot = await getDocs(collection(db, "usuarios"));
    todosLosUsuarios = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    actualizarEstadisticas();
    renderizarUsuarios();
}

function renderizarUsuarios() {
    const container = document.getElementById('usuariosContainer');
    const filtro = document.getElementById('filtroUsuario').value.toLowerCase();
    const filtrados = todosLosUsuarios.filter(u => !filtro || (u.nombre + ' ' + u.apellido + ' ' + u.email + ' ' + (u.telefono||'')).toLowerCase().includes(filtro));
    container.innerHTML = '';
    if (filtrados.length === 0) { container.innerHTML = '<p class="light-text text-center" style="padding:20px;">No hay usuarios.</p>'; return; }

    filtrados.forEach(usuario => {
        const turnosUsuario = todosLosTurnos.filter(t => t.usuarioId === usuario.id);
        const hoy = new Date().toISOString().split('T')[0];
        const turnosProximos = turnosUsuario.filter(t => t.fecha >= hoy);
        const turnosPasados = turnosUsuario.filter(t => t.fecha < hoy);

        const card = document.createElement('div');
        card.className = `usuario-card-collapsible ${usuario.bloqueado ? 'usuario-bloqueado' : ''}`;

        // Header
        const header = document.createElement('div');
        header.className = 'usuario-header';

        const headerInfo = document.createElement('div');
        headerInfo.className = 'usuario-header-info';
        headerInfo.innerHTML = `
            <div class="usuario-nombre">${usuario.nombre} ${usuario.apellido}
                ${usuario.bloqueado ? '<span class="badge-bloqueado">BLOQUEADO</span>' : ''}
            </div>
            <div class="usuario-resumen">
                <span>${turnosProximos.length} turno${turnosProximos.length !== 1 ? 's' : ''} proximos</span>
                <span>${turnosPasados.length} historico${turnosPasados.length !== 1 ? 's' : ''}</span>
            </div>`;

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'btn btn-secondary btn-sm';
        toggleBtn.textContent = 'Ver detalles';

        header.appendChild(headerInfo);
        header.appendChild(toggleBtn);

        // Detalle colapsable
        const detalle = document.createElement('div');
        detalle.className = 'usuario-detalle ocultar';

        const turnosHTML = turnosUsuario.length === 0
            ? '<p class="light-text" style="padding:8px 0;">Sin turnos registrados.</p>'
            : [...turnosProximos, ...turnosPasados]
                .sort((a,b) => b.fecha.localeCompare(a.fecha))
                .map(t => {
                    const pasado = t.fecha < hoy;
                    return `<div class="usuario-turno-item ${pasado ? 'turno-pasado' : ''}">
                        <span class="turno-horario-badge">${t.horario}</span>
                        <span>${t.fechaFormato || t.fecha}</span>
                        <span>${t.profesional}</span>
                        <span>${t.servicio}</span>
                        ${pasado ? '<span class="badge-pasado-sm">Historico</span>' : '<span class="badge-proximo-sm">Proximo</span>'}
                    </div>`;
                }).join('');

        detalle.innerHTML = `
            <div class="usuario-detalle-datos">
                <div class="usuario-dato-item"><strong>Email:</strong> ${usuario.email}</div>
                <div class="usuario-dato-item"><strong>Telefono:</strong> ${usuario.telefono || '-'}</div>
                <div class="usuario-dato-item"><strong>Cliente desde:</strong> ${usuario.creadoEn ? new Date(usuario.creadoEn).toLocaleDateString('es-ES') : '-'}</div>
            </div>
            <div class="usuario-turnos-titulo">Turnos</div>
            <div class="usuario-turnos-lista">${turnosHTML}</div>
            <div class="usuario-detalle-actions">
                <button class="btn ${usuario.bloqueado ? 'btn-success' : 'btn-danger'} btn-sm btn-bloquear" data-id="${usuario.id}" data-bloqueado="${usuario.bloqueado}">
                    ${usuario.bloqueado ? 'Desbloquear' : 'Bloquear'}
                </button>
            </div>`;

        toggleBtn.addEventListener('click', () => {
            const isOpen = !detalle.classList.contains('ocultar');
            detalle.classList.toggle('ocultar');
            toggleBtn.textContent = isOpen ? 'Ver detalles' : 'Ocultar';
        });

        detalle.querySelector('.btn-bloquear').addEventListener('click', async (e) => {
            const uid = e.target.dataset.id;
            const bloqueado = e.target.dataset.bloqueado === 'true';
            if (confirm(`${bloqueado ? 'Desbloquear' : 'Bloquear'} a este usuario?`)) {
                await updateDoc(doc(db, 'usuarios', uid), { bloqueado: !bloqueado });
                await cargarUsuarios();
            }
        });

        card.appendChild(header);
        card.appendChild(detalle);
        container.appendChild(card);
    });
}

// ===================== PROFESIONALES =====================
async function cargarProfesionales() {
    const snap = await getDocs(query(collection(db, 'profesionales'), orderBy('orden')));
    profesionales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderizarProfesionales();
    actualizarFiltroProfesional();
}

function actualizarFiltroProfesional() {
    const select = document.getElementById('filtroProfesional');
    const valorActual = select.value;
    select.innerHTML = '<option value="">Todos</option>';
    profesionales.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.nombre;
        opt.textContent = p.nombre;
        if (p.nombre === valorActual) opt.selected = true;
        select.appendChild(opt);
    });
}

function renderizarProfesionales() {
    const container = document.getElementById('profesionalesAdminContainer');
    container.innerHTML = '';
    if (profesionales.length === 0) {
        container.innerHTML = '<p class="light-text text-center" style="padding:20px;">No hay profesionales. Agregá uno.</p>';
    }
    profesionales.forEach(prof => {
        const card = document.createElement('div');
        card.className = 'editor-card';
        card.innerHTML = `
            <div class="editor-card-info">
                <div class="editor-card-nombre">${prof.nombre}</div>
                <div class="editor-card-detalle">${prof.descripcion || ''}</div>
            </div>
            <div class="editor-card-actions">
                <button class="btn btn-primary btn-sm btn-editar-prof" data-id="${prof.id}">Editar</button>
                <button class="btn btn-danger btn-sm btn-borrar-prof" data-id="${prof.id}" data-nombre="${prof.nombre}">Borrar</button>
            </div>`;
        card.querySelector('.btn-editar-prof').addEventListener('click', () => abrirModalProfesional(prof));
        card.querySelector('.btn-borrar-prof').addEventListener('click', async () => {
            if (confirm(`¿Borrar a ${prof.nombre}? También se borrarán sus servicios.`)) {
                await deleteDoc(doc(db, 'profesionales', prof.id));
                await cargarProfesionales();
            }
        });
        container.appendChild(card);
    });
}

document.getElementById('btnAgregarProfesional').addEventListener('click', () => abrirModalProfesional(null));

function abrirModalProfesional(prof) {
    const modal = document.getElementById('modalProfesional');
    document.getElementById('modalProfTitulo').textContent = prof ? 'Editar Profesional' : 'Nuevo Profesional';
    document.getElementById('profNombre').value = prof?.nombre || '';
    document.getElementById('profDescripcion').value = prof?.descripcion || '';
    document.getElementById('profEspecialidades').value = prof?.especialidades || '';
    document.getElementById('profFoto').value = prof?.foto || '';
    document.getElementById('profOrden').value = prof?.orden ?? profesionales.length;
    document.getElementById('profId').value = prof?.id || '';
    document.getElementById('profMsg').textContent = '';
    modal.classList.remove('ocultar');
}

document.getElementById('modalProfCerrar').addEventListener('click', () => document.getElementById('modalProfesional').classList.add('ocultar'));
document.getElementById('modalProfesional').addEventListener('click', e => { if (e.target === document.getElementById('modalProfesional')) document.getElementById('modalProfesional').classList.add('ocultar'); });

document.getElementById('btnGuardarProfesional').addEventListener('click', async () => {
    const nombre = document.getElementById('profNombre').value.trim();
    const descripcion = document.getElementById('profDescripcion').value.trim();
    const especialidades = document.getElementById('profEspecialidades').value.trim();
    const foto = document.getElementById('profFoto').value.trim();
    const orden = parseInt(document.getElementById('profOrden').value) || 0;
    const id = document.getElementById('profId').value;
    const msg = document.getElementById('profMsg');

    if (!nombre) { msg.textContent = 'El nombre es obligatorio.'; return; }

    const btn = document.getElementById('btnGuardarProfesional');
    btn.disabled = true; btn.textContent = 'Guardando...';

    try {
        const data = { nombre, descripcion, especialidades, foto, orden };
        if (id) {
            await updateDoc(doc(db, 'profesionales', id), data);
        } else {
            await addDoc(collection(db, 'profesionales'), data);
        }
        document.getElementById('modalProfesional').classList.add('ocultar');
        await cargarProfesionales();
    } catch (e) {
        msg.textContent = 'Error al guardar.';
        console.error(e);
    }
    btn.disabled = false; btn.textContent = 'Guardar';
});

// ===================== SERVICIOS =====================
let profSeleccionadoServicios = null;

function renderizarSelectorProfesionalServicios() {
    const select = document.getElementById('selectorProfServicios');
    select.innerHTML = '<option value="">-- Seleccioná un profesional --</option>';
    profesionales.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.nombre;
        select.appendChild(opt);
    });
    document.getElementById('serviciosEditorContainer').classList.add('ocultar');
}

function renderizarSelectorProfesionalHorarios() {
    const select = document.getElementById('selectorProfHorarios');
    select.innerHTML = '<option value="">-- Seleccioná un profesional --</option>';
    profesionales.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.nombre;
        select.appendChild(opt);
    });
    document.getElementById('horariosEditorContainer').classList.add('ocultar');
}

document.getElementById('selectorProfServicios').addEventListener('change', async (e) => {
    const id = e.target.value;
    if (!id) { document.getElementById('serviciosEditorContainer').classList.add('ocultar'); return; }
    profSeleccionadoServicios = profesionales.find(p => p.id === id);
    await cargarServicios(id);
    document.getElementById('serviciosEditorContainer').classList.remove('ocultar');
});

async function cargarServicios(profId) {
    const snap = await getDocs(query(collection(db, `profesionales/${profId}/servicios`), orderBy('orden')));
    const servicios = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderizarServicios(profId, servicios);
}

function renderizarServicios(profId, servicios) {
    const container = document.getElementById('serviciosListaContainer');
    container.innerHTML = '';
    document.getElementById('serviciosEditorTitulo').textContent = `Servicios de ${profSeleccionadoServicios?.nombre || ''}`;

    if (servicios.length === 0) {
        container.innerHTML = '<p class="light-text text-center" style="padding:15px;">No hay servicios. Agregá uno.</p>';
    }

    servicios.forEach(serv => {
        const card = document.createElement('div');
        card.className = 'editor-card';
        card.innerHTML = `
            <div class="editor-card-info">
                <div class="editor-card-nombre">${serv.nombre}</div>
                <div class="editor-card-detalle">${serv.precio} · ${serv.duracion}</div>
            </div>
            <div class="editor-card-actions">
                <button class="btn btn-primary btn-sm btn-editar-serv" data-id="${serv.id}">Editar</button>
                <button class="btn btn-danger btn-sm btn-borrar-serv" data-id="${serv.id}">Borrar</button>
            </div>`;
        card.querySelector('.btn-editar-serv').addEventListener('click', () => abrirModalServicio(serv, profId));
        card.querySelector('.btn-borrar-serv').addEventListener('click', async () => {
            if (confirm(`¿Borrar el servicio "${serv.nombre}"?`)) {
                await deleteDoc(doc(db, `profesionales/${profId}/servicios`, serv.id));
                await cargarServicios(profId);
            }
        });
        container.appendChild(card);
    });
}

document.getElementById('btnAgregarServicio').addEventListener('click', () => {
    if (!profSeleccionadoServicios) return;
    abrirModalServicio(null, profSeleccionadoServicios.id);
});

function abrirModalServicio(serv, profId) {
    document.getElementById('modalServTitulo').textContent = serv ? 'Editar Servicio' : 'Nuevo Servicio';
    document.getElementById('servNombre').value = serv?.nombre || '';
    document.getElementById('servPrecio').value = serv?.precio || '';
    document.getElementById('servDuracion').value = serv?.duracion || '';
    document.getElementById('servOrden').value = serv?.orden ?? 0;
    document.getElementById('servId').value = serv?.id || '';
    document.getElementById('servProfId').value = profId;
    document.getElementById('servMsg').textContent = '';
    document.getElementById('modalServicio').classList.remove('ocultar');
}

document.getElementById('modalServCerrar').addEventListener('click', () => document.getElementById('modalServicio').classList.add('ocultar'));
document.getElementById('modalServicio').addEventListener('click', e => { if (e.target === document.getElementById('modalServicio')) document.getElementById('modalServicio').classList.add('ocultar'); });

document.getElementById('btnGuardarServicio').addEventListener('click', async () => {
    const nombre = document.getElementById('servNombre').value.trim();
    const precio = document.getElementById('servPrecio').value.trim();
    const duracion = document.getElementById('servDuracion').value.trim();
    const orden = parseInt(document.getElementById('servOrden').value) || 0;
    const id = document.getElementById('servId').value;
    const profId = document.getElementById('servProfId').value;
    const msg = document.getElementById('servMsg');

    if (!nombre || !precio || !duracion) { msg.textContent = 'Completá todos los campos.'; return; }

    const btn = document.getElementById('btnGuardarServicio');
    btn.disabled = true; btn.textContent = 'Guardando...';

    try {
        if (id) {
            await updateDoc(doc(db, `profesionales/${profId}/servicios`, id), { nombre, precio, duracion, orden });
        } else {
            await addDoc(collection(db, `profesionales/${profId}/servicios`), { nombre, precio, duracion, orden });
        }
        document.getElementById('modalServicio').classList.add('ocultar');
        await cargarServicios(profId);
    } catch (e) {
        msg.textContent = 'Error al guardar.';
        console.error(e);
    }
    btn.disabled = false; btn.textContent = 'Guardar';
});

// ===================== HORARIOS =====================
let profSeleccionadoHorarios = null;
let serviciosDelProfHorarios = [];

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DIAS_KEYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

document.getElementById('selectorProfHorarios').addEventListener('change', async (e) => {
    const id = e.target.value;
    if (!id) { document.getElementById('horariosEditorContainer').classList.add('ocultar'); return; }
    profSeleccionadoHorarios = profesionales.find(p => p.id === id);

    // Cargar servicios del profesional para obtener duraciones
    const servSnap = await getDocs(query(collection(db, `profesionales/${id}/servicios`), orderBy('orden')));
    serviciosDelProfHorarios = servSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    await cargarHorariosProfesional(id);
    document.getElementById('horariosEditorContainer').classList.remove('ocultar');
    document.getElementById('horariosEditorTitulo').textContent = `Horarios de ${profSeleccionadoHorarios.nombre}`;
});

function parsearDuracion(duracionStr) {
    // Parsear "30 min", "60 min", "1h", etc.
    const match = duracionStr.match(/(\d+)/);
    return match ? parseInt(match[1]) : 30;
}

function calcularIntervaloMinimo() {
    if (!serviciosDelProfHorarios.length) return 30;
    const duraciones = serviciosDelProfHorarios.map(s => parsearDuracion(s.duracion));
    return Math.min(...duraciones);
}

function generarSlotsDelDia(horaInicio, horaFin, intervaloMin) {
    const slots = [];
    let [hh, mm] = horaInicio.split(':').map(Number);
    const [finHH, finMM] = horaFin.split(':').map(Number);
    const finTotal = finHH * 60 + finMM;

    let actual = hh * 60 + mm;
    while (actual + intervaloMin <= finTotal) {
        slots.push(`${String(Math.floor(actual/60)).padStart(2,'0')}:${String(actual%60).padStart(2,'0')}`);
        actual += intervaloMin;
    }
    return slots;
}

async function cargarHorariosProfesional(profId) {
    const intervaloMin = calcularIntervaloMinimo();
    document.getElementById('infoIntervalos').innerHTML = generarInfoIntervalos(intervaloMin);

    const container = document.getElementById('horariosListaContainer');
    container.innerHTML = '<p class="light-text text-center" style="padding:15px;">Cargando...</p>';

    // Cargar config guardada
    const snap = await getDocs(collection(db, `profesionales/${profId}/horarios`));
    const horariosGuardados = {};
    snap.docs.forEach(d => { horariosGuardados[d.id] = d.data(); });

    renderizarHorariosPorDia(profId, horariosGuardados, intervaloMin);
}

function generarInfoIntervalos(intervaloMin) {
    if (!serviciosDelProfHorarios.length) return '<p class="light-text">Cargá los servicios primero para calcular los intervalos.</p>';
    
    let html = '<div class="intervalos-info">';
    html += `<div class="intervalo-badge"> Intervalo base: <strong>${intervaloMin} min</strong> (el menor de los servicios)</div>`;
    html += '<div class="servicios-duraciones">';
    serviciosDelProfHorarios.forEach(s => {
        html += `<span class="servicio-duracion-tag">${s.nombre}: ${s.duracion}</span>`;
    });
    html += '</div></div>';
    return html;
}

function renderizarHorariosPorDia(profId, horariosGuardados, intervaloMin) {
    const container = document.getElementById('horariosListaContainer');
    container.innerHTML = '';

    DIAS.forEach((dia, idx) => {
        const diaKey = DIAS_KEYS[idx];
        const config = horariosGuardados[diaKey] || {};
        const activo = config.activo ?? false;
        const horaInicio = config.horaInicio || '09:00';
        const horaFin = config.horaFin || '19:00';

        const section = document.createElement('div');
        section.className = 'horario-dia-section';

        section.innerHTML = `
            <div class="horario-dia-header">
                <div class="horario-dia-titulo">${dia}</div>
                <label class="toggle-switch">
                    <input type="checkbox" class="dia-toggle" ${activo ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>
            <div class="dia-config" style="display:${activo ? 'block' : 'none'}">
                <div class="horario-rango">
                    <div class="form-group">
                        <label class="form-label">Hora inicio</label>
                        <input type="time" class="form-control hora-inicio" value="${horaInicio}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Hora fin</label>
                        <input type="time" class="form-control hora-fin" value="${horaFin}">
                    </div>
                </div>
                <div class="preview-slots">
                    <div class="preview-titulo">Vista previa de slots (intervalo: ${intervaloMin} min):</div>
                    <div class="preview-lista">${generarPreviewSlots(horaInicio, horaFin, intervaloMin)}</div>
                </div>
                <button class="btn btn-primary btn-sm horario-save-btn">Guardar ${dia}</button>
            </div>`;

        const toggle = section.querySelector('.dia-toggle');
        const diaConfig = section.querySelector('.dia-config');
        const horaInicioInput = section.querySelector('.hora-inicio');
        const horaFinInput = section.querySelector('.hora-fin');
        const previewLista = section.querySelector('.preview-lista');

        toggle.addEventListener('change', () => {
            diaConfig.style.display = toggle.checked ? 'block' : 'none';
        });

        const actualizarPreview = () => {
            previewLista.innerHTML = generarPreviewSlots(horaInicioInput.value, horaFinInput.value, intervaloMin);
        };
        horaInicioInput.addEventListener('change', actualizarPreview);
        horaFinInput.addEventListener('change', actualizarPreview);

        section.querySelector('.horario-save-btn').addEventListener('click', async () => {
            const btn = section.querySelector('.horario-save-btn');
            btn.disabled = true; btn.textContent = 'Guardando...';
            try {
                await setDoc(doc(db, `profesionales/${profId}/horarios`, diaKey), {
                    activo: toggle.checked,
                    horaInicio: horaInicioInput.value,
                    horaFin: horaFinInput.value,
                    intervaloMin
                });
                btn.textContent = 'Guardado';
                setTimeout(() => { btn.disabled = false; btn.textContent = `Guardar ${dia}`; }, 2000);
            } catch(e) {
                btn.textContent = 'Error'; btn.disabled = false; console.error(e);
            }
        });

        container.appendChild(section);
    });
}

function generarPreviewSlots(horaInicio, horaFin, intervaloMin) {
    if (!horaInicio || !horaFin) return '<span class="light-text">Configurá los horarios</span>';
    const slots = generarSlotsDelDia(horaInicio, horaFin, intervaloMin);
    if (slots.length === 0) return '<span class="light-text">Sin slots disponibles con esta configuración</span>';
    return slots.map(s => `<span class="preview-slot">${s}</span>`).join('');
}

// ===================== NUEVO/EDITAR TURNO ADMIN =====================
document.getElementById('btnNuevoTurnoAdmin').addEventListener('click', () => abrirModalTurno(null));
document.getElementById('modalTurnoCerrar').addEventListener('click', () => document.getElementById('modalTurnoAdmin').classList.add('ocultar'));
document.getElementById('modalTurnoAdmin').addEventListener('click', e => {
    if (e.target === document.getElementById('modalTurnoAdmin')) document.getElementById('modalTurnoAdmin').classList.add('ocultar');
});

document.getElementById('turnoAdminProfesional').addEventListener('change', async (e) => {
    await cargarServiciosParaTurno(e.target.value);
    await cargarHorariosParaTurno();
});
document.getElementById('turnoAdminFecha').addEventListener('change', cargarHorariosParaTurno);

async function abrirModalTurno(turno) {
    const modal = document.getElementById('modalTurnoAdmin');
    document.getElementById('modalTurnoTitulo').textContent = turno ? 'Editar Turno' : 'Nuevo Turno';
    document.getElementById('turnoAdminMsg').textContent = '';
    document.getElementById('turnoEditId').value = turno?.id || '';

    // Poblar profesionales
    const select = document.getElementById('turnoAdminProfesional');
    select.innerHTML = '<option value="">-- Seleccionar --</option>';
    profesionales.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.nombre;
        if (turno && p.nombre === turno.profesional) opt.selected = true;
        select.appendChild(opt);
    });

    // Fecha
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth()+1).padStart(2,'0');
    const dd = String(hoy.getDate()).padStart(2,'0');
    document.getElementById('turnoAdminFecha').min = `${yyyy}-${mm}-${dd}`;
    document.getElementById('turnoAdminFecha').value = turno?.fecha || '';

    // Datos cliente
    document.getElementById('turnoAdminNombre').value = turno?.clienteNombre || '';
    document.getElementById('turnoAdminTelefono').value = turno?.clienteTelefono || '';
    document.getElementById('turnoAdminEmail').value = turno?.clienteEmail || '';
    document.getElementById('turnoAdminHorarioCustom').value = turno?.horario || '';

    if (turno) {
        const profId = profesionales.find(p => p.nombre === turno.profesional)?.id;
        if (profId) {
            select.value = profId;
            await cargarServiciosParaTurno(profId, turno.servicio);
            await cargarHorariosParaTurno(turno.horario);
        }
    } else {
        document.getElementById('turnoAdminServicio').innerHTML = '<option value="">-- Seleccionar profesional primero --</option>';
        document.getElementById('turnoAdminHorario').innerHTML = '<option value="">-- Seleccionar fecha primero --</option>';
    }

    modal.classList.remove('ocultar');
}

async function cargarServiciosParaTurno(profId, servicioActual) {
    const select = document.getElementById('turnoAdminServicio');
    select.innerHTML = '<option value="">-- Seleccionar --</option>';
    if (!profId) return;
    const snap = await getDocs(query(collection(db, `profesionales/${profId}/servicios`), orderBy('orden')));
    snap.docs.forEach(d => {
        const data = d.data();
        const opt = document.createElement('option');
        opt.value = data.nombre;
        opt.textContent = `${data.nombre} (${data.duracion} - ${data.precio})`;
        if (servicioActual && data.nombre === servicioActual) opt.selected = true;
        select.appendChild(opt);
    });
}

async function cargarHorariosParaTurno(horarioActual) {
    const profId = document.getElementById('turnoAdminProfesional').value;
    const fecha = document.getElementById('turnoAdminFecha').value;
    const select = document.getElementById('turnoAdminHorario');
    select.innerHTML = '<option value="">-- Seleccionar --</option>';
    if (!profId || !fecha) return;

    const prof = profesionales.find(p => p.id === profId);
    if (!prof) return;

    // Get occupied slots
    const q = query(collection(db, 'turnos'), where('profesional', '==', prof.nombre), where('fecha', '==', fecha));
    const snap = await getDocs(q);
    const ocupados = snap.docs.map(d => d.data().horario).filter(h => h !== horarioActual);

    // Get day config
    const fechaObj = new Date(fecha + 'T00:00:00');
    const diasMap = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
    const diaKey = diasMap[fechaObj.getDay()];
    let horaInicio = '09:00', horaFin = '19:00', intervaloMin = 30;
    try {
        const horDoc = await getDoc(doc(db, `profesionales/${profId}/horarios`, diaKey));
        if (horDoc.exists()) {
            const d = horDoc.data();
            horaInicio = d.horaInicio || '09:00';
            horaFin = d.horaFin || '19:00';
            intervaloMin = d.intervaloMin || 30;
        }
    } catch(e) {}

    // Generate slots
    let cursor = parseInt(horaInicio.split(':')[0])*60 + parseInt(horaInicio.split(':')[1]);
    const fin = parseInt(horaFin.split(':')[0])*60 + parseInt(horaFin.split(':')[1]);

    while (cursor <= fin) {
        const h = `${String(Math.floor(cursor/60)).padStart(2,'0')}:${String(cursor%60).padStart(2,'0')}`;
        const opt = document.createElement('option');
        opt.value = h;
        opt.textContent = h + (ocupados.includes(h) ? ' (ocupado)' : '');
        if (horarioActual && h === horarioActual) opt.selected = true;
        select.appendChild(opt);
        cursor += intervaloMin;
    }
}

document.getElementById('btnGuardarTurnoAdmin').addEventListener('click', async () => {
    const profId = document.getElementById('turnoAdminProfesional').value;
    const servicio = document.getElementById('turnoAdminServicio').value;
    const fecha = document.getElementById('turnoAdminFecha').value;
    const horarioSelect = document.getElementById('turnoAdminHorario').value;
    const horarioCustom = document.getElementById('turnoAdminHorarioCustom').value;
    const horario = horarioCustom || horarioSelect;
    const clienteNombre = document.getElementById('turnoAdminNombre').value.trim();
    const clienteTelefono = document.getElementById('turnoAdminTelefono').value.trim();
    const clienteEmail = document.getElementById('turnoAdminEmail').value.trim();
    const editId = document.getElementById('turnoEditId').value;
    const msg = document.getElementById('turnoAdminMsg');

    if (!profId || !servicio || !fecha || !horario || !clienteNombre) {
        msg.textContent = 'Completá los campos obligatorios.'; return;
    }

    const prof = profesionales.find(p => p.id === profId);
    const btn = document.getElementById('btnGuardarTurnoAdmin');
    btn.disabled = true; btn.textContent = 'Guardando...';

    const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const fechaFormato = new Date(fecha + 'T00:00:00').toLocaleDateString('es-ES', opciones);

    const data = {
        profesional: prof.nombre,
        servicio,
        fecha,
        fechaFormato,
        horario,
        clienteNombre,
        clienteTelefono,
        clienteEmail,
        creadoEn: new Date().toISOString(),
        creadoPorAdmin: true
    };

    try {
        if (editId) {
            // Get usuarioId BEFORE updating
            const turnoDocAntes = await getDoc(doc(db, 'turnos', editId));
            const usuarioId = turnoDocAntes.data()?.usuarioId;

            await updateDoc(doc(db, 'turnos', editId), data);

            // Notify admin
            await crearNotificacion({
                para: 'admin',
                tipo: 'modificacion_admin',
                mensaje: `Turno editado: ${data.clienteNombre} - ${data.profesional} - ${data.fechaFormato} ${data.horario}`,
                turnoId: editId
            });

            // Notify client if registered user
            if (usuarioId) {
                await crearNotificacion({
                    para: usuarioId,
                    tipo: 'modificacion',
                    mensaje: `Tu turno fue modificado: ${data.profesional} - ${data.fechaFormato} a las ${data.horario}`,
                    turnoId: editId
                });
            }
            // Email modificacion al cliente
            try { await enviarEmailModificacion({ ...data, clienteEmail: data.clienteEmail }); } catch(e) { console.error(e); }
        } else {
            const docRef = await addDoc(collection(db, 'turnos'), data);

            // Notify admin
            await crearNotificacion({
                para: 'admin',
                tipo: 'nueva_reserva_admin',
                mensaje: `Turno creado manualmente: ${data.clienteNombre} - ${data.profesional} - ${data.fechaFormato} ${data.horario}`,
                turnoId: docRef.id
            });

            // Notify client if email matches a registered user
            if (clienteEmail) {
                const usuariosSnap = await getDocs(query(collection(db, 'usuarios'), where('email', '==', clienteEmail)));
                if (!usuariosSnap.empty) {
                    const uid = usuariosSnap.docs[0].id;
                    await crearNotificacion({
                        para: uid,
                        tipo: 'confirmacion_admin',
                        mensaje: `El admin agendo un turno para vos: ${data.profesional} - ${data.fechaFormato} a las ${data.horario}`,
                        turnoId: docRef.id
                    });
                }
            }
        }
        document.getElementById('modalTurnoAdmin').classList.add('ocultar');
        await cargarTurnos();
    } catch(e) {
        msg.textContent = 'Error al guardar: ' + e.message; console.error(e);
    }
    btn.disabled = false; btn.textContent = 'Guardar Turno';
});
