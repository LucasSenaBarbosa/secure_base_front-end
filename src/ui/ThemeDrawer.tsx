import { Check, Palette, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { THEMES, type ThemeName } from '../auth/themes';
import { useSession } from './session';

export function ThemeLauncher() {
  const [open, setOpen] = useState(false);
  const theme = useSession((s) => s.theme);
  const setTheme = useSession((s) => s.setTheme);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Temas"><Palette size={15} /></button>
      {open && createPortal(
        <>
          <button className="theme-backdrop" aria-label="Fechar temas" onClick={() => setOpen(false)} />
          <aside className="theme-drawer" role="dialog" aria-label="Temas">
            <header>
              <div className="theme-title"><Palette size={16} /><div><b>Temas</b><small>Escolha a aparência do sistema</small></div></div>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Fechar"><X size={15} /></button>
            </header>
            <div className="theme-list">
              {THEMES.map((item) => {
                const on = item.id === theme;
                return (
                  <button key={item.id} className={on ? 'theme-option on' : 'theme-option'} onClick={() => setTheme(item.id as ThemeName)}>
                    <i style={{ background: item.swatch }} />
                    <span><b>{item.name}</b><small>{item.detail}</small></span>
                    {on && <Check size={16} />}
                  </button>
                );
              })}
            </div>
          </aside>
        </>,
        document.body,
      )}
    </>
  );
}
