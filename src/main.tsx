import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, loadTheme } from './auth/accounts';
import { App } from './ui/App';
import './sim/audio';
import './style.css';

applyTheme(loadTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
