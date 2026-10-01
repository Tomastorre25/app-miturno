import { db } from './firebase-config.js';
import {
    collection, addDoc, onSnapshot, query, where, orderBy, updateDoc, doc, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ===================== EMAILJS =====================
const EMAILJS_SERVICE_ID = 'service_fqi01vb';
const EMAILJS_TEMPLATE_ID = 'template_9ou9i41';
const EMAILJS_PUBLIC_KEY = '-RIJpzYopS3zE85CV';

export async function enviarEmail(params) {
    try {
        if (typeof emailjs === 'undefined') { console.warn('EmailJS no disponible'); return; }
        await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, params, EMAILJS_PUBLIC_KEY);
        console.log('Email enviado OK');
    } catch(e) {
        console.error('Error enviando email:', e);
    }
}

export async function enviarEmailConfirmacion(turno) {
    if (!turno.clienteEmail) return;
    await enviarEmail({
        to_email: turno.clienteEmail,
        cliente_nombre: turno.clienteNombre,
        profesional: turno.profesional,
        servicio: turno.servicio,
        fecha: turno.fechaFormato,
        horario: turno.horario,
        url_turnos: 'https://miturno-barberia.web.app/pages/turnos.html',
        asunto: 'Turno confirmado - Mi Turno',
        mensaje_extra: 'Tu turno fue confirmado con los datos indicados.'
    });
}

export async function enviarEmailCancelacion(turno) {
    if (!turno.clienteEmail) return;
    await enviarEmail({
        to_email: turno.clienteEmail,
        cliente_nombre: turno.clienteNombre,
        profesional: turno.profesional,
        servicio: turno.servicio,
        fecha: turno.fechaFormato,
        horario: turno.horario,
        url_turnos: 'https://miturno-barberia.web.app/pages/turnos.html',
        asunto: 'Turno cancelado - Mi Turno',
        mensaje_extra: 'Tu turno ha sido cancelado. Comunicate con nosotros para reprogramar.'
    });
}

export async function enviarEmailModificacion(turno) {
    if (!turno.clienteEmail) return;
    await enviarEmail({
        to_email: turno.clienteEmail,
        cliente_nombre: turno.clienteNombre,
        profesional: turno.profesional,
        servicio: turno.servicio,
        fecha: turno.fechaFormato,
        horario: turno.horario,
        url_turnos: 'https://miturno-barberia.web.app/pages/turnos.html',
        asunto: 'Turno modificado - Mi Turno',
        mensaje_extra: 'Tu turno fue modificado con los nuevos datos indicados arriba.'
    });
}

export async function enviarEmailRecordatorio(turno, tipo) {
    if (!turno.email) return;
    const mensaje = tipo === '1dia'
        ? 'Te recordamos que mañana tenes turno.'
        : 'Te recordamos que en 30 minutos tenes turno.';
    await enviarEmail({
        to_email: turno.email,
        cliente_nombre: turno.clienteNombre,
        profesional: turno.profesional,
        servicio: turno.servicio,
        fecha: turno.fechaFormato,
        horario: turno.horario,
        url_turnos: 'https://miturno-barberia.web.app/pages/turnos.html',
        asunto: 'Recordatorio de turno - Mi Turno',
        mensaje_extra: mensaje
    });
}

// ===================== RECORDATORIOS (client-side check) =====================
export async function programarRecordatorios(turno) {
    const fechaTurno = new Date(`${turno.fecha}T${turno.horario}:00`);
    const ahora = new Date();
    const unDiaAntes = new Date(fechaTurno); unDiaAntes.setDate(unDiaAntes.getDate() - 1);
    const mediaHoraAntes = new Date(fechaTurno); mediaHoraAntes.setMinutes(mediaHoraAntes.getMinutes() - 30);

    const recordatorios = [];
    if (unDiaAntes > ahora) recordatorios.push({ tipo: '1dia', enviarEn: unDiaAntes.toISOString(), enviado: false });
    if (mediaHoraAntes > ahora) recordatorios.push({ tipo: '30min', enviarEn: mediaHoraAntes.toISOString(), enviado: false });

    if (recordatorios.length > 0) {
        await addDoc(collection(db, 'recordatorios'), {
            turnoId: turno.id || '',
            email: turno.clienteEmail || '',
            clienteNombre: turno.clienteNombre || '',
            profesional: turno.profesional,
            servicio: turno.servicio,
            fecha: turno.fecha,
            fechaFormato: turno.fechaFormato,
            horario: turno.horario,
            recordatorios,
            creadoEn: new Date().toISOString()
        });
    }
}

// Check and send pending reminders (called on page load)
export async function verificarRecordatorios() {
    const ahora = new Date();
    const snap = await getDocs(collection(db, 'recordatorios'));
    for (const docSnap of snap.docs) {
        const data = docSnap.data();
        let actualizado = false;
        const recordatorios = data.recordatorios.map(r => {
            if (!r.enviado && new Date(r.enviarEn) <= ahora) {
                enviarEmailRecordatorio(data, r.tipo);
                actualizado = true;
                return { ...r, enviado: true };
            }
            return r;
        });
        if (actualizado) {
            await updateDoc(doc(db, 'recordatorios', docSnap.id), { recordatorios });
        }
    }
}

// ===================== NOTIFICACIONES IN-APP =====================
export async function crearNotificacion(data) {
    await addDoc(collection(db, 'notificaciones'), {
        ...data,
        leida: false,
        creadoEn: new Date().toISOString()
    });
}

export function escucharNotificaciones(uid, esAdmin, callback) {
    const q = esAdmin
        ? query(collection(db, 'notificaciones'), where('para', '==', 'admin'), orderBy('creadoEn', 'desc'))
        : query(collection(db, 'notificaciones'), where('para', '==', uid), orderBy('creadoEn', 'desc'));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
}

export async function marcarLeidaNotificacion(id) {
    await updateDoc(doc(db, 'notificaciones', id), { leida: true });
}

export async function marcarTodasLeidas(uid, esAdmin) {
    const q = esAdmin
        ? query(collection(db, 'notificaciones'), where('para', '==', 'admin'), where('leida', '==', false))
        : query(collection(db, 'notificaciones'), where('para', '==', uid), where('leida', '==', false));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => updateDoc(doc(db, 'notificaciones', d.id), { leida: true })));
}

// ===================== PUSH NOTIFICATIONS =====================
export async function solicitarPermisoPush() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
}

export function mostrarNotifPush(titulo, cuerpo) {
    if (Notification.permission === 'granted') {
        try {
            // Use service worker for better mobile support
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: 'SHOW_NOTIFICATION',
                    title: titulo,
                    body: cuerpo
                });
            } else {
                new Notification(titulo, { body: cuerpo, icon: '/media/logo-blanco.png' });
            }
        } catch(e) {
            console.error('Error push notif:', e);
        }
    }
}
