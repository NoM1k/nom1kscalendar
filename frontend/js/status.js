// "My status" controls: office presence (office / home / away) and a manual "do not disturb" (busy) switch.
// Changes go through the REST API; the server then broadcasts a live update to everyone.
import { api } from './api.js';

/**
 * @param {{office: HTMLSelectElement, dnd: HTMLInputElement}} els
 * @param {() => number|null} getMeId  returns the id of the user "I am"
 * @param {() => Promise<void>} onChanged  called after a successful save
 * @returns {{render: (me: object|undefined) => void}}
 */
export function initStatus(els, getMeId, onChanged) {
  async function save(patch) {
    const id = getMeId();
    if (!id) return;
    try {
      await api.setStatus(id, patch);
      await onChanged();
    } catch (err) {
      console.error(err);
    }
  }
  els.office.addEventListener('change', () => save({ officeStatus: els.office.value }));
  els.dnd.addEventListener('change', () => save({ manualBusy: els.dnd.checked }));

  return {
    render(me) {
      els.office.disabled = els.dnd.disabled = !me;
      if (!me) return;
      els.office.value = me.officeStatus;
      els.dnd.checked = me.manualBusy;
    },
  };
}
