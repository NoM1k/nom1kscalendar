// Day view: the week view's time grid with a single, wide column and more detail per event.
import { renderWeek } from './week.js';

/**
 * @param {HTMLElement} container
 * @param {{day: Date, events: object[], tasks: object[], users: object[], userId: number|'all', zoom?: number}} data
 */
export function renderDay(container, { day, ...rest }) {
  renderWeek(container, { ...rest, weekStart: day, days: 1, detailed: true });
}
