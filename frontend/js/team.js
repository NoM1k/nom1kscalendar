// Compact team strip: who is busy/free and where they are (office / home / away).
import { esc } from './util.js';

const OFFICE_LABEL = { office: 'In office', home: 'Home office', away: 'Away' };

export function renderTeam(container, users) {
  container.innerHTML = users
    .map(
      (u) => `
      <div class="card">
        <div class="name"><span class="dot" style="background:${esc(u.color)}"></span>${esc(u.name)}</div>
        <div class="badges">
          <span class="badge ${u.busyNow ? 'busy' : 'free'}">${u.busyNow ? 'Busy' : 'Free'}</span>
          <span class="badge ${u.officeStatus}">${OFFICE_LABEL[u.officeStatus]}</span>
        </div>
      </div>`
    )
    .join('');
}
