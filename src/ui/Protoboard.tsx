import { CircuitBoard, Pause, Play, Smartphone, SkipForward, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Cmd } from '../sim/types';
import { NET_BY_ID, NETS, netFocus, type NetGroup } from '../sim/wiring';
import { useSim } from '../sim/store';
import { BreadboardScene } from '../three/Breadboard';
import { useThrottled } from './hooks';

const FILTERS: { id: 'all' | NetGroup; label: string }[] = [
  { id: 'all', label: 'Tudo' },
  { id: 'power', label: 'Alimentação' },
  { id: 'signal', label: 'Sinais' },
  { id: 'bus', label: 'I²C' },
];

interface DemoStep {
  net: string;
  title: string;
  kind: 'act' | 'sense';
  cmd?: Cmd;
}

const DEMO_STEPS: DemoStep[] = [
  { net: 'v5', title: 'Alimentação 5 V nos trilhos vermelhos', kind: 'sense' },
  { net: 'led', title: 'Ligando o LED amarelo (GPIO12)', kind: 'act', cmd: { type: 'led', on: true } },
  { net: 'rgb', title: 'Fita SK6812 em arco-íris', kind: 'act', cmd: { type: 'rgb', mode: 'rainbow' } },
  { net: 'led', title: 'Apagando o LED', kind: 'act', cmd: { type: 'led', on: false } },
  { net: 'door', title: 'Abrindo a porta (servo SG90)', kind: 'act', cmd: { type: 'door', open: true } },
  { net: 'window', title: 'Abrindo a janela (segundo servo)', kind: 'act', cmd: { type: 'window', open: true } },
  { net: 'door', title: 'Fechando a porta', kind: 'act', cmd: { type: 'door', open: false } },
  { net: 'window', title: 'Fechando a janela', kind: 'act', cmd: { type: 'window', open: false } },
  { net: 'fanA', title: 'Acionando o ventilador (driver PWM)', kind: 'act', cmd: { type: 'fan', speed: 1 } },
  { net: 'buzzer', title: 'Testando o buzzer (campainha)', kind: 'act', cmd: { type: 'music', song: 'doorbell' } },
  { net: 'fanA', title: 'Parando o ventilador', kind: 'act', cmd: { type: 'fan', speed: 0 } },
  { net: 'sda', title: 'Lendo LCD e RFID pelo barramento I²C', kind: 'sense' },
  { net: 'dht', title: 'Lendo temperatura e umidade (DHT11)', kind: 'sense' },
  { net: 'pir', title: 'Verificando presença (sensor PIR)', kind: 'sense' },
  { net: 'gas', title: 'Monitorando gás (MQ-2 digital)', kind: 'sense' },
  { net: 'steam', title: 'Monitorando chuva (sensor de vapor)', kind: 'sense' },
];

const DEMO_STEP_MS = 2600;

function TestDemoPhone({ onSelect, onClose }: { onSelect: (id: string | null) => void; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [tick, setTick] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);

  const advance = () => setStep((s) => (s + 1) % DEMO_STEPS.length);

  useEffect(() => {
    const current = DEMO_STEPS[step];
    onSelect(netFocus(current.net)[0]);
    if (current.cmd) useSim.getState().sendCommand(current.cmd);
  }, [step, onSelect]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(advance, DEMO_STEP_MS);
    return () => clearInterval(id);
  }, [playing]);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    el.style.transition = 'none';
    el.style.width = '0%';
    const raf = requestAnimationFrame(() => {
      el.style.transition = `width ${DEMO_STEP_MS}ms linear`;
      el.style.width = '100%';
    });
    return () => cancelAnimationFrame(raf);
  }, [step, playing, tick]);

  const current = DEMO_STEPS[step];
  const history = DEMO_STEPS.slice(Math.max(0, step - 3), step).reverse();

  return (
    <div className="demo-phone">
      <div className="demo-head">
        <span><Smartphone size={13} /> Teste automático · protoboard</span>
        <button onClick={onClose} aria-label="Fechar demonstração"><X size={14} /></button>
      </div>
      <div className="demo-screen">
        <div className="demo-step">
          <i className={current.kind === 'act' ? 'dot act' : 'dot sense'} />
          <b>{current.title}</b>
        </div>
        <div className="demo-bar"><div ref={barRef} /></div>
        <div className="demo-log">
          {history.map((h, i) => (
            <div key={`${h.net}-${step}-${i}`}><CircuitBoard size={10} /> {h.title}</div>
          ))}
        </div>
      </div>
      <div className="demo-controls">
        <button onClick={() => { setPlaying((p) => !p); setTick((t) => t + 1); }} aria-label={playing ? 'Pausar' : 'Reproduzir'} className="primary">
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button onClick={() => { advance(); setTick((t) => t + 1); }} aria-label="Próximo passo"><SkipForward size={14} /></button>
      </div>
    </div>
  );
}

export function ProtoboardPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [group, setGroup] = useState<(typeof FILTERS)[number]['id']>('all');
  const [demo, setDemo] = useState(false);
  const live = useThrottled((s) => {
    const out: Record<string, { level: number; text: string }> = {};
    for (const net of NETS) out[net.id] = net.read(s.sensors, s.act);
    return out;
  }, 180);
  const board = useSim((s) => s.board);
  const current = selected ? NET_BY_ID[selected] : null;
  const hint = NET_BY_ID[hover ?? selected ?? ''];
  const visible = NETS.filter((net) => group === 'all' || net.group === group);

  return (
    <div className="proto">
      <section className="stage">
        <div className="stage-view">
          <BreadboardScene selected={selected} onSelect={setSelected} onHover={setHover} />
        </div>
        <div className="stage-top">
          <span className="live-pill"><i /> {board === 'running' ? 'Fios ao vivo' : 'Placa em reset'}</span>
          <span className="stage-top-right">
            <span className="stage-fw">Protoboard 830 · KS5009</span>
            <button className="demo-toggle" onClick={() => setDemo((v) => !v)}>
              <Smartphone size={14} /> {demo ? 'Fechar demo' : 'Demo no celular'}
            </button>
          </span>
        </div>
        {demo && <TestDemoPhone onSelect={setSelected} onClose={() => setDemo(false)} />}
        <div className="bb-legend">
          <span><i style={{ background: '#c62a30' }} /> 5 V</span>
          <span><i style={{ background: '#ff9c7a' }} /> 3,3 V</span>
          <span><i style={{ background: '#2a2e36' }} /> GND</span>
          <span>fio claro = sinal ativo</span>
        </div>
        {hint && (
          <div className="hover-card">
            <CircuitBoard size={14} />
            <div><b>{hint.title}</b><small>{hint.pin}</small></div>
          </div>
        )}
      </section>
      <aside className="dock proto-dock">
        <div className="proto-head">
          <span className="eyebrow">Ligações · mesmo firmware da casa</span>
          <h2>Protoboard</h2>
          <p>Cada módulo do KS5009 está encaixado na placa de 830 pontos. Clique num fio ou num componente para ver por onde a corrente passa e o que o pino está fazendo agora.</p>
        </div>
        <div className="proto-filters">
          {FILTERS.map((item) => (
            <button key={item.id} className={group === item.id ? 'on' : ''} onClick={() => setGroup(item.id)}>{item.label}</button>
          ))}
        </div>
        {current && (
          <article className="proto-detail">
            <span className="eyebrow">{current.pin}</span>
            <h3>{current.title}</h3>
            <p>{current.about}</p>
            <div className="proto-path"><span>{current.from}</span><b>→</b><span>{current.to}</span></div>
            <em>{live[current.id]?.text}</em>
          </article>
        )}
        <div className="proto-scroll">
          {visible.map((net) => {
            const state = live[net.id];
            const on = selected === net.id;
            return (
              <button key={net.id} className={on ? 'proto-net on' : 'proto-net'} onClick={() => setSelected(on ? null : net.id)}>
                <i className="proto-swatch" style={{ background: net.color, color: net.color }} />
                <span>
                  <b>{net.title}</b>
                  <small>{net.pin}</small>
                  <span className="proto-bar"><i style={{ width: `${Math.round((state?.level ?? 0) * 100)}%`, background: net.color }} /></span>
                </span>
                <em>{state?.text}</em>
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
