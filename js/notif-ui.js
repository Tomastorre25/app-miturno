import { 
  escucharNotificaciones, 
  marcarLeidaNotificacion, 
  marcarTodasLeidas, 
  eliminarNotificacion, 
  eliminarTodasNotificaciones 
} from './notifications.js';

export function iniciarCampana(uid, esAdmin = false) {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  // Verificar si la campanita ya fue insertada en el DOM
  let containerCampana = document.getElementById('notifCampanaContainer');
  if (!containerCampana) {
    containerCampana = document.createElement('li');
    containerCampana.id = 'notifCampanaContainer';
    containerCampana.style.cssText = 'position: relative; display: inline-block; margin-left: 10px; cursor: pointer;';
    
    containerCampana.innerHTML = `
      <div id="btnNotifCampana" style="position: relative; padding: 8px 12px; font-size: 20px; color: #fff; user-select: none;">
        🔔
        <span id="badgeNotifCount" style="display: none; position: absolute; top: 2px; right: 2px; background: #e74c3c; color: #fff; font-size: 11px; font-weight: bold; border-radius: 10px; padding: 2px 6px; border: 2px solid #fff;">0</span>
      </div>

      <div id="dropdownNotificaciones" style="display: none; position: absolute; right: 0; top: 40px; width: 320px; max-height: 400px; background: #fff; color: #333; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 10000; overflow: hidden;">
        <div style="padding: 12px 15px; background: #2c3e50; color: #fff; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #34495e;">
          <strong style="font-size: 14px;">🔔 Notificaciones</strong>
          <div style="display: flex; gap: 8px;">
            <button id="btnMarcarTodasLeidas" style="background: none; border: none; color: #3498db; font-size: 12px; cursor: pointer; text-decoration: underline;">Leídas</button>
            <button id="btnBorrarTodasNotif" style="background: none; border: none; color: #e74c3c; font-size: 12px; cursor: pointer; text-decoration: underline;">Limpiar</button>
          </div>
        </div>
        <div id="listaNotificacionesItems" style="max-height: 320px; overflow-y: auto;">
          <p style="padding: 15px; text-align: center; color: #888; font-size: 13px;">No hay notificaciones</p>
        </div>
      </div>
    `;

    navbar.insertBefore(containerCampana, navbar.firstChild);
  }

  const btnCampana = document.getElementById('btnNotifCampana');
  const dropdown = document.getElementById('dropdownNotificaciones');
  const badge = document.getElementById('badgeNotifCount');
  const listaItems = document.getElementById('listaNotificacionesItems');
  const btnLeidas = document.getElementById('btnMarcarTodasLeidas');
  const btnBorrarTodas = document.getElementById('btnBorrarTodasNotif');

  // Toggle desplegable
  btnCampana.addEventListener('click', (e) => {
    e.stopPropagation();
    const desplegado = dropdown.style.display === 'block';
    dropdown.style.display = desplegado ? 'none' : 'block';
  });

  // Cerrar al hacer clic fuera
  document.addEventListener('click', (e) => {
    if (dropdown && !containerCampana.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });

  // Marcar todas leídas
  btnLeidas.addEventListener('click', async (e) => {
    e.stopPropagation();
    await marcarTodasLeidas(uid, esAdmin);
  });

  // Eliminar todas las notificaciones
  btnBorrarTodas.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (confirm('¿Seguro que querés borrar todas las notificaciones?')) {
      await eliminarTodasNotificaciones(uid, esAdmin);
    }
  });

  // Escuchar en tiempo real
  escucharNotificaciones(uid, esAdmin, (notificaciones) => {
    const noLeidas = notificaciones.filter(n => !n.leida).length;
    if (noLeidas > 0) {
      badge.textContent = noLeidas > 99 ? '99+' : noLeidas;
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }

    if (notificaciones.length === 0) {
      listaItems.innerHTML = '<p style="padding:20px; text-align:center; color:#888; font-size:13px; margin:0;">No hay notificaciones</p>';
      return;
    }

    listaItems.innerHTML = '';
    notificaciones.forEach(n => {
      const item = document.createElement('div');
      item.style.cssText = `
        padding: 12px 15px; 
        border-bottom: 1px solid #f0f0f0; 
        background: ${n.leida ? '#fff' : '#f4f8fb'}; 
        display: flex; 
        justify-content: space-between; 
        align-items: flex-start;
        gap: 10px;
        transition: background 0.2s;
      `;

      const fechaStr = n.creadoEn ? new Date(n.creadoEn).toLocaleString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

      item.innerHTML = `
        <div style="flex: 1; cursor: pointer;">
          <p style="margin: 0; font-size: 13px; color: #2c3e50; line-height: 1.4; font-weight: ${n.leida ? 'normal' : 'bold'};">
            ${n.mensaje || 'Nueva notificación'}
          </p>
          <small style="color: #95a5a6; font-size: 11px;">${fechaStr}</small>
        </div>
        <button class="btn-borrar-notif-single" data-id="${n.id}" style="background: none; border: none; color: #bdc3c7; font-size: 16px; cursor: pointer; padding: 0 4px; line-height: 1;" title="Borrar notificación">
          &times;
        </button>
      `;

      // Marcar leída al hacer clic en el texto
      item.querySelector('div').addEventListener('click', async () => {
        if (!n.leida) {
          await marcarLeidaNotificacion(n.id);
        }
      });

      // Borrar notificación individual al hacer clic en la X
      const btnBorrar = item.querySelector('.btn-borrar-notif-single');
      btnBorrar.addEventListener('click', async (e) => {
        e.stopPropagation();
        await eliminarNotificacion(n.id);
      });

      // Hover en botón de borrar
      btnBorrar.addEventListener('mouseenter', () => btnBorrar.style.color = '#e74c3c');
      btnBorrar.addEventListener('mouseleave', () => btnBorrar.style.color = '#bdc3c7');

      listaItems.appendChild(item);
    });
  });
}
