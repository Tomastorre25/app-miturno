import { db } from './firebase-config.js';
import { collection, addDoc, onSnapshot, query, where, orderBy, updateDoc, doc, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ===================== EMAILJS CONFIG =====================
const EMAILJS_SERVICE_ID = 'service_fqi01vb';
const EMAILJS_TEMPLATE_ID = 'template_9ou9i41';
const EMAILJS_PUBLIC_KEY = '-RIJpzYopS3zE85CV';

// Carga e inicialización dinámica de EmailJS para asegurar disponibilidad
function asegurarEmailJS() {
  return new Promise((resolve) => {
    if (typeof emailjs !== 'undefined') {
      try { emailjs.init(EMAILJS_PUBLIC_KEY); } catch(e){}
      return resolve(true);
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
    script.onload = () => {
      try { emailjs.init(EMAILJS_PUBLIC_KEY); } catch(e){}
      resolve(true);
    };
    script.onerror = () => {
      console.warn('No se pudo cargar el SDK de EmailJS');
      resolve(false);
    };
    document.head.appendChild(script);
  });
}

export async function enviarEmail(params) {
  try {
    const listo = await asegurarEmailJS();
    if (!listo || typeof emailjs === 'undefined') {
      console.warn('EmailJS no disponible');
      return false;
    }
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, params, EMAILJS_PUBLIC_KEY);
    console.log('Email enviado correctamente a:', params.to_email || params.email);
    return true;
  } catch(e) {
    console.error('Error enviando email via EmailJS:', e);
    return false;
  }
}

export async function enviarEmailConfirmacion(turno) {
  const emailDestino = turno.clienteEmail || turno.email;
  if (!emailDestino) {
    console.warn('No se envió email de confirmación: falta dirección de email del cliente.');
    return;
  }
  
  await enviarEmail({
    to_email: emailDestino,
    email: emailDestino,
    cliente_nombre: turno.clienteNombre || 'Cliente',
    profesional: turno.profesional,
    servicio: turno.servicio,
    fecha: turno.fechaFormato || turno.fecha,
    horario: turno.horario,
    url_turnos: 'https://miturno-barberia.web.app/pages/turnos.html',
    asunto: 'Turno confirmado - Mi Turno Barbería',
    mensaje_extra: '¡Tu turno fue confirmado exitosamente!'
  });
}

export async function enviarEmailCancelacion(turno) {
  const emailDestino = turno.clienteEmail || turno.email;
  if (!emailDestino) return;
  await enviarEmail({
    to_email: emailDestino,
    email: emailDestino,
    cliente_nombre: turno.clienteNombre || 'Cliente',
    profesional: turno.profesional,
    servicio: turno.servicio,
    fecha: turno.fechaFormato || turno.fecha,
    horario: turno.horario,
    url_turnos: 'https://miturno-barberia.web.app/pages/turnos.html',
    asunto: 'Turno cancelado - Mi Turno',
    mensaje_extra: 'Tu turno ha sido cancelado. Podés volver a reservar desde la app.'
  });
}

export async function enviarEmailModificacion(turno) {
  const emailDestino = turno.clienteEmail || turno.email;
  if (!emailDestino) return;
  await enviarEmail({
    to_email: emailDestino,
    email: emailDestino,
    cliente_nombre: turno.clienteNombre || 'Cliente',
    profesional: turno.profesional,
    servicio: turno.servicio,
    fecha: turno.fechaFormato || turno.fecha,
    horario: turno.horario,
    url_turnos: 'https://miturno-barberia.web.app/pages/turnos.html',
    asunto: 'Turno modificado - Mi Turno',
    mensaje_extra: 'Tu turno fue modificado con los nuevos datos indicados arriba.'
  });
}

export async function enviarEmailRecordatorio(turno, tipo) {
  const emailDestino = turno.clienteEmail || turno.email;
  if (!emailDestino) return;
  const mensaje = tipo === '1dia' 
    ? 'Te recordamos que mañana tenés tu turno reservado.' 
    : 'Te recordamos que en 30 minutos tenés tu turno reservado.';
    
  await enviarEmail({
    to_email: emailDestino,
    email: emailDestino,
    cliente_nombre: turno.clienteNombre || 'Cliente',
    profesional: turno.profesional,
    servicio: turno.servicio,
    fecha: turno.fechaFormato || turno.fecha,
    horario: turno.horario,
    url_turnos: 'https://miturno-barberia.web.app/pages/turnos.html',
    asunto: 'Recordatorio de turno - Mi Turno',
    mensaje_extra: mensaje
  });
}

// ===================== RECORDATORIOS =====================
export async function programarRecordatorios(turno) {
  try {
    const fechaTurno = new Date(`${turno.fecha}T${turno.horario}:00`);
    const ahora = new Date();
    
    const unDiaAntes = new Date(fechaTurno);
    unDiaAntes.setDate(unDiaAntes.getDate() - 1);
    
    const mediaHoraAntes = new Date(fechaTurno);
    mediaHoraAntes.setMinutes(mediaHoraAntes.getMinutes() - 30);
    
    const recordatorios = [];
    if (unDiaAntes > ahora) {
      recordatorios.push({ tipo: '1dia', enviarEn: unDiaAntes.toISOString(), enviado: false });
    }
    if (mediaHoraAntes > ahora) {
      recordatorios.push({ tipo: '30min', enviarEn: mediaHoraAntes.toISOString(), enviado: false });
    }
    
    if (recordatorios.length > 0) {
      await addDoc(collection(db, 'recordatorios'), {
        turnoId: turno.id || '',
        usuarioId: turno.usuarioId || '',
        clienteEmail: turno.clienteEmail || turno.email || '',
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
  } catch(e) {
    console.error('Error al programar recordatorios:', e);
  }
}

// Verificación de recordatorios pendientes (se ejecuta al abrir la app)
export async function verificarRecordatorios() {
  try {
    const ahora = new Date();
    const snap = await getDocs(collection(db, 'recordatorios'));
    
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      let actualizado = false;
      
      const recordatorios = (data.recordatorios || []).map(r => {
        if (!r.enviado && new Date(r.enviarEn) <= ahora) {
          // Enviar email de recordatorio
          enviarEmailRecordatorio(data, r.tipo);
          
          // Enviar notificación Push al móvil
          const msgPush = r.tipo === '1dia'
            ? `Mañana tenés turno con ${data.profesional} a las ${data.horario}`
            : `En 30 minutos tenés turno con ${data.profesional}`;
          mostrarNotifPush('⏰ Recordatorio de Turno', msgPush);

          actualizado = true;
          return { ...r, enviado: true };
        }
        return r;
      });
      
      if (actualizado) {
        await updateDoc(doc(db, 'recordatorios', docSnap.id), { recordatorios });
      }
    }
  } catch(e) {
    console.error('Error verificando recordatorios:', e);
  }
}

// ===================== NOTIFICACIONES IN-APP =====================
export async function crearNotificacion(data) {
  try {
    await addDoc(collection(db, 'notificaciones'), {
      ...data,
      leida: false,
      creadoEn: new Date().toISOString()
    });
  } catch(e) {
    console.error('Error creando notificación in-app:', e);
  }
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

// ===================== PUSH NOTIFICATIONS PARA MÓVILES =====================

// Registrar Service Worker globalmente
export async function registrarServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('Service Worker registrado:', reg.scope);
      return reg;
    } catch (err) {
      console.error('Error al registrar Service Worker:', err);
    }
  }
  return null;
}

export async function solicitarPermisoPush() {
  if (!('Notification' in window)) {
    console.warn('Este navegador no soporta notificaciones push.');
    return false;
  }
  
  // Asegurar registro del SW
  await registrarServiceWorker();

  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  try {
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      mostrarNotifPush('Notificaciones Activadas', '¡Recibirás confirmaciones y recordatorios de tus turnos!');
      return true;
    }
  } catch (e) {
    console.error('Error al solicitar permiso de notificaciones:', e);
  }
  return false;
}

export async function mostrarNotifPush(titulo, cuerpo) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(titulo, {
          body: cuerpo,
          icon: '/media/logo-blanco.png',
          badge: '/media/logo-blanco.png',
          vibrate: [200, 100, 200],
          data: { url: '/pages/turnos.html' }
        });
        return;
      }
    }
    // Fallback estándar
    new Notification(titulo, {
      body: cuerpo,
      icon: '/media/logo-blanco.png'
    });
  } catch (e) {
    console.error('Error al mostrar notificación push:', e);
  }
}
