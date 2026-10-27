export const THEMES = [
  { id: 'claro', name: 'Claro', detail: 'Fundo claro', swatch: 'linear-gradient(145deg, #f8fbff, #c9d8ee)', color: '#f3f6fb' },
  { id: 'escuro', name: 'Escuro', detail: 'Confortável à noite', swatch: 'linear-gradient(145deg, #1c2436, #6d5ef0)', color: '#090e18' },
  { id: 'meia-noite', name: 'Meia-noite', detail: 'Preto · azul elétrico', swatch: 'linear-gradient(145deg, #0b1220, #3b82f6)', color: '#070b14' },
  { id: 'verde', name: 'Verde', detail: 'Controles em verde vivo', swatch: 'linear-gradient(145deg, #10241c, #22c55e)', color: '#07110e' },
  { id: 'executivo', name: 'Executivo', detail: 'Preto · âmbar', swatch: 'linear-gradient(145deg, #16130d, #f5b942)', color: '#0b0d12' },
  { id: 'azul', name: 'Azul', detail: 'Azul institucional', swatch: 'linear-gradient(145deg, #102033, #1d6fe8)', color: '#071018' },
  { id: 'ambar', name: 'Âmbar', detail: 'Dourado · contraste quente', swatch: 'linear-gradient(145deg, #241c10, #f59e0b)', color: '#100e0a' },
  { id: 'brasa', name: 'Brasa', detail: 'Coral vivo', swatch: 'linear-gradient(145deg, #241016, #fb7185)', color: '#10080c' },
  { id: 'grafite', name: 'Grafite', detail: 'Índigo elétrico', swatch: 'linear-gradient(145deg, #16181e, #818cf8)', color: '#0c0e12' },
  { id: 'aurora', name: 'Aurora', detail: 'Menta · ciano', swatch: 'linear-gradient(145deg, #102226, #2dd4bf)', color: '#071214' },
] as const;

export type ThemeName = (typeof THEMES)[number]['id'];

export function normalizeTheme(raw: string | null): ThemeName {
  if (raw === 'light') return 'claro';
  if (raw === 'dark') return 'escuro';
  return THEMES.some((theme) => theme.id === raw) ? raw as ThemeName : 'meia-noite';
}
