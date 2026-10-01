import { db } from './firebase-config.js';
import {
    collection, getDocs, query, orderBy, doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const DIAS_LABELS = {
    lunes: 'Lunes',
    martes: 'Martes',
    miercoles: 'Miércoles',
    jueves: 'Jueves',
    viernes: 'Viernes',
    sabado: 'Sábado',
    domingo: 'Domingo'
};

async function cargarProfesionales() {
    const container = document.getElementById('profesionalesGaleria');
    container.innerHTML = '<p class="light-text text-center" style="padding:30px;">Cargando profesionales...</p>';

    const profSnap = await getDocs(query(collection(db, 'profesionales'), orderBy('orden')));
    const profesionales = profSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (profesionales.length === 0) {
        container.innerHTML = '<p class="light-text text-center" style="padding:30px;">No hay profesionales disponibles.</p>';
        return;
    }

    container.innerHTML = '';

    for (const prof of profesionales) {
        // Cargar servicios
        const servSnap = await getDocs(query(collection(db, `profesionales/${prof.id}/servicios`), orderBy('orden')));
        const servicios = servSnap.docs.map(d => d.data());

        // Cargar horarios por día
        const horSnap = await getDocs(collection(db, `profesionales/${prof.id}/horarios`));
        const horarios = {};
        horSnap.docs.forEach(d => { horarios[d.id] = d.data(); });

        const tarjeta = crearTarjeta(prof, servicios, horarios);
        container.appendChild(tarjeta);
    }
}

function crearTarjeta(prof, servicios, horarios) {
    const tarjeta = document.createElement('div');
    tarjeta.className = 'profesional-tarjeta';

    // Imagen — usar foto si existe, sino placeholder
    const imgSrc = prof.foto || `../media/${prof.nombre.toLowerCase()}.jpg`;

    // Especialidades: usar campo específico si existe, sino usar servicios
    let especialidades;
    if (prof.especialidades && prof.especialidades.trim()) {
        especialidades = prof.especialidades.trim().split('\n')
            .map(e => `• ${e.trim()}`).filter(e => e.length > 2).join('<br>');
    } else if (servicios.length > 0) {
        especialidades = servicios.map(s => `• ${s.nombre}`).join('<br>');
    } else {
        especialidades = '• Consultar disponibilidad';
    }

    // Horarios activos agrupados por rango
    const diasActivos = Object.entries(horarios)
        .filter(([, data]) => data.activo)
        .sort((a, b) => {
            const orden = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
            return orden.indexOf(a[0]) - orden.indexOf(b[0]);
        });

    let horariosHTML = '';
    if (diasActivos.length === 0) {
        horariosHTML = '<div class="horario-item-prof">Consultar disponibilidad</div>';
    } else {
        // Agrupar días consecutivos con mismo horario
        const grupos = agruparDias(diasActivos);
        grupos.forEach(g => {
            horariosHTML += `<div class="horario-item-prof">${g.dias}: ${g.inicio} - ${g.fin}</div>`;
        });
    }

    tarjeta.innerHTML = `
        <img src="${imgSrc}" alt="${prof.nombre}" class="profesional-imagen" onerror="this.style.background='#e0e0e0';this.removeAttribute('src')">
        <div class="profesional-contenido">
            <div class="profesional-nombre">${prof.nombre}</div>
            <p class="profesional-descripcion">${prof.descripcion || ''}</p>

            <div class="profesional-seccion">
                <div class="profesional-seccion-titulo">Se especializa en:</div>
                <div class="profesional-especializacion">${especialidades}</div>
            </div>

            <div class="profesional-seccion">
                <div class="profesional-seccion-titulo">Horarios de atención:</div>
                <div class="profesional-horarios">${horariosHTML}</div>
            </div>
        </div>`;

    return tarjeta;
}

function agruparDias(diasActivos) {
    // Intentar agrupar días consecutivos con el mismo horario
    const grupos = [];
    const DIAS_CORTOS = {
        lunes: 'Lun', martes: 'Mar', miercoles: 'Mié',
        jueves: 'Jue', viernes: 'Vie', sabado: 'Sáb', domingo: 'Dom'
    };

    let i = 0;
    while (i < diasActivos.length) {
        const [diaKey, data] = diasActivos[i];
        let j = i + 1;
        const diasGrupo = [DIAS_CORTOS[diaKey]];

        // Agrupar consecutivos con mismo horario
        while (j < diasActivos.length) {
            const [nextKey, nextData] = diasActivos[j];
            if (nextData.horaInicio === data.horaInicio && nextData.horaFin === data.horaFin) {
                diasGrupo.push(DIAS_CORTOS[nextKey]);
                j++;
            } else {
                break;
            }
        }

        // Formatear rango de días
        let diasStr = '';
        if (diasGrupo.length === 1) {
            diasStr = diasGrupo[0];
        } else if (diasGrupo.length === 2) {
            diasStr = diasGrupo.join(' y ');
        } else {
            diasStr = `${diasGrupo[0]} a ${diasGrupo[diasGrupo.length - 1]}`;
        }

        grupos.push({
            dias: diasStr,
            inicio: data.horaInicio || '09:00',
            fin: data.horaFin || '19:00'
        });

        i = j;
    }
    return grupos;
}

cargarProfesionales();
