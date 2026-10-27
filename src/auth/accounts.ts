import { normalizeTheme, THEMES, type ThemeName } from './themes';

export const THEME_KEY = 'securebase-theme';

export function loadTheme(): ThemeName {
  return normalizeTheme(localStorage.getItem(THEME_KEY));
}

export function saveTheme(theme: ThemeName) {
  localStorage.setItem(THEME_KEY, theme);
}

export function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme;
  const color = THEMES.find((item) => item.id === theme)?.color ?? '#070b14';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}
