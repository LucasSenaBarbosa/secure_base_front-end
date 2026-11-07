import { Activity, Box, CircuitBoard, CloudRain, Cpu, House, Layers, LogOut, Radar, RotateCcw, Users, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react';
import { firmwareById } from '../sim/firmware';
import { onRainEvent, type RainEvent } from '../sim/notifications';
import { useSim, type Page } from '../sim/store';
import { Logo } from './Logo';
import { LoginScreen } from './Login';
import { ThemeLauncher } from './ThemeDrawer';
import { useSession } from './session';

/** Cada página vira um arquivo JS próprio, baixado só quando é aberta (three.js e ECharts inclusos). */
function page<M>(load: () => Promise<M>, pick: (m: M) => ComponentType) {
  return lazy(() => load().then((m) => ({ default: pick(m) })));
}
const Landing = page(() => import('./Landing'), (m) => m.Landing);
const Lab = page(() => import('./Lab'), (m) => m.Lab);
const OptimizationPage = page(() => import('./Optimization'), (m) => m.OptimizationPage);
const ProtoboardPage = page(() => import('./Protoboard'), (m) => m.ProtoboardPage);
const FirmwarePage = page(() => import('./pages'), (m) => m.FirmwarePage);
const InventoryPage = page(() => import('./pages'), (m) => m.InventoryPage);
const TelemetryPage = page(() => import('./pages'), (m) => m.TelemetryPage);
const UsersPage = page(() => import('./Users'), (m) => m.UsersPage);

const PageLoading = () => <div className="page-loading" role="status">Carregando…</div>;

const NAV: { id: Page; label: string; icon: typeof House }[] = [
  { id: 'lab', label: 'Laboratório', icon: Box },
  { id: 'optimization', label: 'Otimização', icon: Radar },
  { id: 'protoboard', label: 'Protoboard', icon: CircuitBoard },
  { id: 'firmware', label: 'Firmware', icon: Cpu },
  { id: 'inventory', label: 'Inventário', icon: Layers },
  { id: 'telemetry', label: 'Telemetria', icon: Activity },
  { id: 'users', label: 'Usuários', icon: Users },
];

function RainBanner() {
  const [evt, setEvt] = useState<RainEvent | null>(null);

  useEffect(() => onRainEvent((e) => setEvt(e)), []);
  useEffect(() => {
    if (!evt) return;
    const t = setTimeout(() => setEvt(null), 6500);
    return () => clearTimeout(t);
  }, [evt]);

  if (!evt) return null;
  return (
    <div className="rain-toast">
      <CloudRain size={22} />
      <div>
        <b>Começou a chover</b>
        <small>Vapor em {evt.pct}% · janela fechando automaticamente</small>
      </div>
      <button onClick={() => setEvt(null)} aria-label="Fechar"><X size={14} /></button>
    </div>
  );
}

export function App() {
  const user = useSession((s) => s.user);
  const loading = useSession((s) => s.loading);
  const initialize = useSession((s) => s.initialize);
  const entered = useSession((s) => s.entered);
  const signOut = useSession((s) => s.signOut);
  const page = useSim((s) => s.ui.page);
  const setUi = useSim((s) => s.setUi);
  const canAccessMasterPages = user?.role === 'master';
  const visibleNav = NAV.filter(
    (item) => !['firmware', 'protoboard'].includes(item.id) || canAccessMasterPages,
  );
  const isRestrictedPage = page === 'firmware' || page === 'protoboard';
  const activePage = isRestrictedPage && !canAccessMasterPages ? 'lab' : page;
  const board = useSim((s) => s.board);
  const firmwareId = useSim((s) => s.firmwareId);
  const fw = firmwareById(firmwareId);

  useEffect(() => {
    return initialize();
  }, [initialize]);

  useEffect(() => {
    if (!canAccessMasterPages && isRestrictedPage) {
      setUi({ page: 'lab' });
    }
  }, [canAccessMasterPages, isRestrictedPage, setUi]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useSim.getState().setUi({ selected: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (loading) return <div className="login-screen"><p>Conectando à SecureBase…</p></div>;
  if (!user) return <LoginScreen />;
  if (!entered) return <Suspense fallback={<div className="login-screen"><p>Carregando…</p></div>}><Landing /></Suspense>;

  return (
    <div className="app">
      <RainBanner />
      <aside className="side">
        <div className="brand">
          <Logo />
          <div><strong>SecureBase</strong><small>Casa inteligente</small></div>
        </div>
        <nav>
          {visibleNav.map((item) => (
            <button key={item.id} className={activePage === item.id ? 'on' : ''} onClick={() => setUi({ page: item.id })}>
              <item.icon size={16} /> {item.label}
            </button>
          ))}
        </nav>
        <div className="side-status">
          <div><i className={board === 'running' ? 'ok' : 'busy'} /> Placa <b>{board === 'running' ? 'rodando' : board === 'flashing' ? 'gravando' : 'boot'}</b></div>
          <div><i className="ok" /> Sketch <b>{fw.index}</b></div>
          <button onClick={() => useSim.getState().reset()}><RotateCcw size={13} /> Reset EN</button>
        </div>
      </aside>
      <div className="workspace">
        <header className="top">
          <div className="crumbs">SecureBase <span>/</span> <b>{NAV.find((n) => n.id === activePage)?.label}</b></div>
          <div className="top-tools">
            <div className="top-meta"><span>COM3</span><i /><span>115200 baud</span></div>
            <ThemeLauncher />
            <span className="who">{user.name}</span>
            <button className="icon-btn" onClick={signOut} aria-label="Sair"><LogOut size={15} /></button>
          </div>
        </header>
        <Suspense fallback={<PageLoading />}>
          {activePage === 'lab' ? <Lab /> : activePage === 'optimization' ? <OptimizationPage /> : activePage === 'protoboard' ? <ProtoboardPage /> : activePage === 'firmware' ? <FirmwarePage /> : activePage === 'inventory' ? <InventoryPage /> : activePage === 'users' ? <UsersPage /> : <TelemetryPage />}
        </Suspense>
      </div>
      <nav className="mobile-tabs">
        {visibleNav.map((item) => (
          <button key={item.id} className={activePage === item.id ? 'on' : ''} onClick={() => setUi({ page: item.id })}>
            <item.icon size={17} /> {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
