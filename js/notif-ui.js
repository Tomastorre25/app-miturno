import { escucharNotificaciones, marcarLeidaNotificacion, marcarTodasLeidas, solicitarPermisoPush } from './notifications.js';

let unsubscribeNotif = null;

export function iniciarCampana(uid, esAdmin) {
    // Inject bell into nav
    const nav = document.querySelector('nav');
    if (!nav || document.getElementById('notifCampana')) return;

    const campana = document.createElement('div');
    campana.id = 'notifCampana';
    campana.className = 'notif-campana';
    campana.innerHTML = `
        <button class="notif-btn" id="notifBtn" title="Notificaciones">
            <span class="notif-icon">&#128276;</span>
            <span class="notif-badge ocultar" id="notifBadge">0</span>
        </button>
        <div class="notif-panel ocultar" id="notifPanel">
            <div class="notif-panel-header">
                <span>Notificaciones</span>
                <button class="notif-marcar-todas" id="notifMarcarTodas">Marcar todas leidas</button>
            </div>
            <div class="notif-lista" id="notifLista"></div>
        </div>`;
    nav.appendChild(campana);

    document.getElementById('notifBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('notifPanel').classList.toggle('ocultar');
    });

    document.addEventListener('click', (e) => {
        if (!campana.contains(e.target)) {
            document.getElementById('notifPanel')?.classList.add('ocultar');
        }
    });

    document.getElementById('notifMarcarTodas').addEventListener('click', async () => {
        await marcarTodasLeidas(uid, esAdmin);
    });

    // Escuchar notificaciones en tiempo real
    if (unsubscribeNotif) unsubscribeNotif();
    unsubscribeNotif = escucharNotificaciones(uid, esAdmin, (notifs) => {
        renderizarNotificaciones(notifs, uid, esAdmin);
    });

    // Pedir permiso push
    solicitarPermisoPush();
}

function renderizarNotificaciones(notifs, uid, esAdmin) {
    const lista = document.getElementById('notifLista');
    const badge = document.getElementById('notifBadge');
    if (!lista || !badge) return;

    const noLeidas = notifs.filter(n => !n.leida).length;
    badge.textContent = noLeidas;
    badge.classList.toggle('ocultar', noLeidas === 0);

    if (notifs.length === 0) {
        lista.innerHTML = '<p class="notif-vacia">Sin notificaciones</p>';
        return;
    }

    lista.innerHTML = '';
    notifs.slice(0, 20).forEach(notif => {
        const item = document.createElement('div');
        item.className = `notif-item ${notif.leida ? 'leida' : 'no-leida'}`;
        const fecha = new Date(notif.creadoEn).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        item.innerHTML = `
            <div class="notif-mensaje">${notif.mensaje}</div>
            <div class="notif-fecha">${fecha}</div>`;
        if (!notif.leida) {
            item.addEventListener('click', () => marcarLeidaNotificacion(notif.id));
        }
        lista.appendChild(item);
    });
}
