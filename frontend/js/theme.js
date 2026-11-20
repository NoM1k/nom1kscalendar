// Light/dark theme. Default: follow the OS setting. Once the user clicks the toggle, their choice is saved.
// The theme is applied via <html data-theme="light|dark">; css/style.css holds the palettes.
// (index.html also applies the saved theme inline in <head> to avoid a flash on load.)
import { loadSetting, saveSetting } from './settings.js';

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

const effectiveTheme = () => loadSetting('theme', null) ?? (prefersDark.matches ? 'dark' : 'light');

function apply(button) {
  const theme = effectiveTheme();
  document.documentElement.dataset.theme = theme;
  button.textContent = theme === 'dark' ? '☀' : '☾';
  button.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  button.setAttribute('aria-label', button.title);
}

export function initTheme(button) {
  apply(button);
  button.addEventListener('click', () => {
    saveSetting('theme', effectiveTheme() === 'dark' ? 'light' : 'dark');
    apply(button);
  });
  // Follow OS changes as long as the user has not chosen explicitly.
  prefersDark.addEventListener('change', () => apply(button));
}
