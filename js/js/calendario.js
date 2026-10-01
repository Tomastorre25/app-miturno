import { db } from './firebase-config.js';
import { collection, query, orderBy, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let todosLosTurnos = [];
let vistaActual = 'mes'; // 'dia', 'semana', 'mes'
let fechaActual = new Date();
let onEliminarCallback = null;
let onEditarCallback = null;

export function iniciarCalendario(turnos, onEliminar, onEditar) {
    todosLosTurnos = turnos;
    onEliminarCallback = onEliminar;
    onEditarCallback = onEditar;
    renderizarCalendario();
    configurarControles();
}

export function actualizarTurnos(turnos) {
    todosLosTurnos = turnos;
    renderizarCalendario();
}

function configurarControles() {
    document.getElementById('btnVistaDia').addEventListener('click', () => cambiarVista('dia'));
    document.getElementById('btnVistaSemana').addEventListener('click', () => cambiarVista('semana'));
    document.getElementById('btnVistaMes').addEventListener('click', () => cambiarVista('mes'));
    document.getElementById('btnCalAnterior').addEventListener('click', navegar(-1));
    document.getElementById('btnCalSiguiente').addEventListener('click', navegar(1));
    document.getElementById('btnCalHoy').addEventListener('click', () => {
        fechaActual = new Date();
        renderizarCalendario();
    });
}

function cambiarVista(vista) {
    vistaActual = vista;
    ['dia','semana','mes'].forEach(v => {
        document.getElementById(`btnVista${v.charAt(0).toUpperCase()+v.slice(1)}`).classList.toggle('btn-primary', v === vista);
        document.getElementById(`btnVista${v.charAt(0).toUpperCase()+v.slice(1)}`).classList.toggle('btn-secondary', v !== vista);
    });
    renderizarCalendario();
}

function navegar(dir) {
    return () => {
        if (vistaActual === 'dia') fechaActual.setDate(fechaActual.getDate() + dir);
        else if (vistaActual === 'semana') fechaActual.setDate(fechaActual.getDate() + dir * 7);
        else fechaActual.setMonth(fechaActual.getMonth() + dir);
        renderizarCalendario();
    };
}

function fechaStr(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function renderizarCalendario() {
    const container = document.getElementById('calendarioContainer');
    container.innerHTML = '';

    // Update label
    const label = document.getElementById('calLabel');
    if (vistaActual === 'dia') {
        label.textContent = fechaActual.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } else if (vistaActual === 'semana') {
        const lunes = getLunes(fechaActual);
        const domingo = new Date(lunes); domingo.setDate(domingo.getDate() + 6);
        label.textContent = `${lunes.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} - ${domingo.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    } else {
        label.textContent = fechaActual.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
    }

    if (vistaActual === 'dia') renderDia(container);
    else if (vistaActual === 'semana') renderSemana(container);
    else renderMes(container);
}

function getLunes(date) {
    const d = new Date(date);
    const dia = d.getDay();
    const diff = dia === 0 ? -6 : 1 - dia;
    d.setDate(d.getDate() + diff);
    return d;
}

function turnosDe(fecha) {
    return todosLosTurnos.filter(t => t.fecha === fecha).sort((a,b) => a.horario.localeCompare(b.horario));
}

function crearTurnoItem(turno) {
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const fechaTurno = new Date(turno.fecha + 'T00:00:00');
    const pasado = fechaTurno < hoy;

    const div = document.createElement('div');
    div.className = `cal-turno-item ${pasado ? 'cal-turno-pasado' : 'cal-turno-proximo'}`;
    div.innerHTML = `
        <div class="cal-turno-hora">${turno.horario}</div>
        <div class="cal-turno-info">
            <div class="cal-turno-cliente">${turno.clienteNombre || 'Sin nombre'}</div>
            <div class="cal-turno-detalle">${turno.profesional} · ${turno.servicio}</div>
        </div>
        <div class="cal-turno-actions">
            <button class="cal-btn-editar">Editar</button>
            <button class="cal-btn-eliminar">X</button>
        </div>`;
    div.querySelector('.cal-btn-editar').addEventListener('click', (e) => { e.stopPropagation(); onEditarCallback && onEditarCallback(turno); });
    div.querySelector('.cal-btn-eliminar').addEventListener('click', (e) => { e.stopPropagation(); onEliminarCallback && onEliminarCallback(turno.id); });
    return div;
}

function renderDia(container) {
    const fecha = fechaStr(fechaActual);
    const turnos = turnosDe(fecha);

    const wrapper = document.createElement('div');
    wrapper.className = 'cal-dia-wrapper';

    if (turnos.length === 0) {
        wrapper.innerHTML = '<p class="light-text text-center" style="padding:30px;">No hay turnos para este día.</p>';
    } else {
        turnos.forEach(t => wrapper.appendChild(crearTurnoItem(t)));
    }
    container.appendChild(wrapper);
}

function renderSemana(container) {
    const lunes = getLunes(fechaActual);
    const dias = Array.from({length: 7}, (_, i) => {
        const d = new Date(lunes);
        d.setDate(d.getDate() + i);
        return d;
    });

    const grid = document.createElement('div');
    grid.className = 'cal-semana-grid';

    dias.forEach(dia => {
        const fecha = fechaStr(dia);
        const turnos = turnosDe(fecha);
        const hoy = fechaStr(new Date());
        const esHoy = fecha === hoy;

        const col = document.createElement('div');
        col.className = `cal-semana-col ${esHoy ? 'cal-semana-hoy' : ''}`;

        const header = document.createElement('div');
        header.className = 'cal-semana-header';
        header.innerHTML = `<div class="cal-semana-dia">${dia.toLocaleDateString('es-ES', { weekday: 'short' })}</div>
                            <div class="cal-semana-num ${esHoy ? 'cal-num-hoy' : ''}">${dia.getDate()}</div>`;
        col.appendChild(header);

        const body = document.createElement('div');
        body.className = 'cal-semana-body';

        if (turnos.length === 0) {
            body.innerHTML = '<p class="cal-semana-vacio">-</p>';
        } else {
            turnos.forEach(t => {
                const item = document.createElement('div');
                item.className = 'cal-semana-turno';
                item.innerHTML = `<span class="cal-semana-hora">${t.horario}</span> ${t.clienteNombre || 'Sin nombre'}`;
                item.title = `${t.profesional} - ${t.servicio}`;
                item.addEventListener('click', () => onEditarCallback && onEditarCallback(t));
                body.appendChild(item);
            });
        }
        col.appendChild(body);
        grid.appendChild(col);
    });

    container.appendChild(grid);
}

function renderMes(container) {
    const año = fechaActual.getFullYear();
    const mes = fechaActual.getMonth();
    const primerDia = new Date(año, mes, 1);
    const ultimoDia = new Date(año, mes + 1, 0);
    const hoy = fechaStr(new Date());

    const grid = document.createElement('div');
    grid.className = 'calendario-grid';

    ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].forEach(d => {
        const cell = document.createElement('div');
        cell.className = 'cal-header-cell';
        cell.textContent = d;
        grid.appendChild(cell);
    });

    // Start from Monday
    let startDay = primerDia.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;

    for (let i = 0; i < startDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'cal-cell cal-empty';
        grid.appendChild(empty);
    }

    for (let dia = 1; dia <= ultimoDia.getDate(); dia++) {
        const fecha = `${año}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        const turnos = turnosDe(fecha);
        const esHoy = fecha === hoy;

        const cell = document.createElement('div');
        cell.className = `cal-cell ${esHoy ? 'cal-hoy' : ''} ${turnos.length > 0 ? 'cal-con-turnos' : ''}`;

        const numDia = document.createElement('div');
        numDia.className = 'cal-dia-num';
        numDia.textContent = dia;
        cell.appendChild(numDia);

        if (turnos.length > 0) {
            const badge = document.createElement('div');
            badge.className = 'cal-badge';
            badge.textContent = `${turnos.length} turno${turnos.length > 1 ? 's' : ''}`;
            cell.appendChild(badge);

            const lista = document.createElement('div');
            lista.className = 'cal-mini-lista';
            turnos.slice(0,3).forEach(t => {
                const item = document.createElement('div');
                item.className = 'cal-mini-item';
                item.textContent = `${t.horario} · ${t.profesional}`;
                lista.appendChild(item);
            });
            if (turnos.length > 3) {
                const mas = document.createElement('div');
                mas.className = 'cal-mini-item cal-mas';
                mas.textContent = `+${turnos.length - 3} mas`;
                lista.appendChild(mas);
            }
            cell.appendChild(lista);
            cell.style.cursor = 'pointer';
            cell.addEventListener('click', () => mostrarTurnosDia(fecha, turnos));
        }
        grid.appendChild(cell);
    }
    container.appendChild(grid);
}

function mostrarTurnosDia(fecha, turnos) {
    const fechaObj = new Date(fecha + 'T00:00:00');
    document.getElementById('modalTitulo').textContent = fechaObj.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
    const modalContenido = document.getElementById('modalContenido');
    modalContenido.innerHTML = '';
    turnos.forEach(turno => {
        const item = crearTurnoItem(turno);
        modalContenido.appendChild(item);
    });
    document.getElementById('modalDia').classList.remove('ocultar');
}
