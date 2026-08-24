export type ThemeMode = 'system' | 'light' | 'dark';
export type FontSizeMode = 'small' | 'medium' | 'large';

export const THEME_STORAGE_KEY = 'kms.theme.mode';
export const FONT_SIZE_STORAGE_KEY = 'kms.ui.fontSize';

export function readThemeMode(): ThemeMode {
  const value = localStorage.getItem(THEME_STORAGE_KEY);
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function writeThemeMode(mode: ThemeMode) {
  localStorage.setItem(THEME_STORAGE_KEY, mode);
  applyThemeMode(mode);
}

export function applyThemeMode(mode = readThemeMode()) {
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.dataset.theme = resolved;
}

export function installSystemThemeListener() {
  const media = window.matchMedia('(prefers-color-scheme: light)');
  const handler = () => {
    if (readThemeMode() === 'system') applyThemeMode('system');
  };
  media.addEventListener('change', handler);
  return () => media.removeEventListener('change', handler);
}

export function readFontSizeMode(): FontSizeMode {
  const value = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
  return value === 'small' || value === 'large' || value === 'medium' ? value : 'medium';
}

export function writeFontSizeMode(mode: FontSizeMode) {
  localStorage.setItem(FONT_SIZE_STORAGE_KEY, mode);
  applyFontSizeMode(mode);
}

export function applyFontSizeMode(mode = readFontSizeMode()) {
  document.documentElement.dataset.fontSize = mode;
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
