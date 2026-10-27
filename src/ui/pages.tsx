import { Activity, Box, Check, CloudRain, Copy, Cpu, Droplets, Fan, Flame, Gauge, Search, Thermometer } from 'lucide-react';
import gsap from 'gsap';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FIRMWARES } from '../sim/firmware';
import { MAX_RPM, MODULES } from '../sim/hardware';
import { inventory } from '../inventory';
import { useSim } from '../sim/store';
import type { ModuleId } from '../sim/types';
import { LiquidGauge, RadialGauge, TrendChart } from './charts';
import { formatUptime, useAnimatedNumber, useThrottled } from './hooks';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const LINK: Record<string, ModuleId> = {
  esp32: 'esp32', lcd: 'lcd', led: 'led', rfid: 'rfid', analog: 'gas', button: 'btnL', buzzer: 'buzzer',
  pir: 'pir', steam: 'steam', dht: 'dht', fan: 'fan', servo: 'doorServo', vibration: 'pir',
};

export function FirmwarePage() {
  const current = useSim((s) => s.firmwareId);
  const board = useSim((s) => s.board);
  const [id, setId] = useState(current);
  const [copied, setCopied] = useState(false);
  const fw = FIRMWARES.find((item) => item.id === id) ?? FIRMWARES[0];
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="eyebrow">KS5009 · 1 firmware integrado + 13 lições</span>
          <h1>Firmware do ESP32</h1>
          <p>Cada sketch roda de verdade no simulador: pinos, temporização, LCD, tons e servos. Gravar reinicia a placa como o esptool.</p>
        </div>
      </header>
      <div className="fw-layout">
        <div className="fw-list">
          {FIRMWARES.map((item) => (
            <button key={item.id} className={item.id === id ? 'on' : ''} onClick={() => setId(item.id)}>
              <b>{item.index}</b>
              <span>{item.title}{item.id === current ? <em> na placa</em> : ''}</span>
            </button>
          ))}
        </div>
        <article className="fw-detail">
          <div className="fw-title">
            <div>
              <span className="eyebrow">MODULE / {fw.index}</span>
              <h2>{fw.title}</h2>
            </div>
            <button className="primary" disabled={board !== 'running'} onClick={() => { useSim.getState().flash(fw.id); useSim.getState().setUi({ page: 'lab' }); }}>
              <Cpu size={15} /> Gravar no ESP32
            </button>
          </div>
          <p>{fw.summary}</p>
          <div className="chip-row">{fw.pins.map((pin) => <span key={pin}>{pin}</span>)}</div>
          <h3>Como testar</h3>
          <ul>{fw.tryIt.map((step) => <li key={step}>{step}</li>)}</ul>
          <div className="code-bar">
            <span>Arduino · C++</span>
            <button onClick={() => { void navigator.clipboard.writeText(fw.code); setCopied(true); window.setTimeout(() => setCopied(false), 1400); }}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <pre className="code">{fw.code}</pre>
        </article>
      </div>
    </div>
  );
}

export function InventoryPage() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('Todos');
  const cats = ['Todos', 'Eletrônica', 'Estrutura', 'Mecânica', 'Fixadores'];
  const items = inventory.filter((item) => (cat === 'Todos' || item.category === cat) && `${item.name} ${item.description}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="eyebrow">Packing list · KS5009</span>
          <h1>Inventário do kit</h1>
          <p>Peças da casa de madeira e dos módulos. Itens eletrônicos abrem direto no gêmeo digital.</p>
        </div>
      </header>
      <div className="inv-tools">
        <label className="search"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar módulo, sensor ou parafuso" /></label>
        <div className="seg">{cats.map((c) => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}</div>
      </div>
      <div className="inv-grid">
        {items.map((item) => {
          const link = LINK[item.id];
          return (
            <article key={item.id} className="inv-card">
              <span>{item.category}</span>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <div><small>Qtd. {item.qty}</small>{link && <button onClick={() => { useSim.getState().setUi({ page: 'lab' }); useSim.getState().select(link); }}>Ver em 3D</button>}</div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function TelemetryPage() {
  const history = useSim((s) => s.history);
  const threshold = useSim((s) => s.sensors.gasThreshold);
  const snap = useThrottled(
    (s) => ({
      temp: s.sensors.temp,
      hum: s.sensors.humidity,
      gas: s.sensors.gasAdc,
      steam: s.sensors.steamAdc,
      rpm: Math.abs(s.act.fanRpm),
      ppm: s.sensors.gasPpm,
      water: s.sensors.steamWater,
      gasOn: s.sensors.gasDetected,
      uptime: s.uptime,
    }),
    300,
  );
  const series = useMemo(
    () => ({
      temp: history.map((p) => p.temp),
      hum: history.map((p) => p.hum),
      gas: history.map((p) => p.gas),
      steam: history.map((p) => p.steam),
      rpm: history.map((p) => p.rpm),
    }),
    [history],
  );

  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current) return;
    const items = root.current.querySelectorAll('.tele-liquids > *, .tele-board > *');
    const tween = gsap.fromTo(
      items,
      { y: 16, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.55, stagger: 0.06, ease: 'power3.out' },
    );
    return () => { tween.kill(); gsap.set(items, { clearProps: 'opacity,transform' }); };
  }, []);

  const temp = useAnimatedNumber(snap.temp, 1);
  const hum = useAnimatedNumber(snap.hum);
  const water = useAnimatedNumber(snap.water * 100);
  const ppm = useAnimatedNumber(snap.ppm);
  const rpmPct = clamp01(snap.rpm / MAX_RPM) * 100;
  const gasPct = Math.min(100, (snap.gas / threshold) * 100);

  return (
    <div className="page tele-page" ref={root}>
      <header className="page-head">
        <div>
          <span className="eyebrow">Painel ao vivo · uptime {formatUptime(snap.uptime)}</span>
          <h1>Telemetria</h1>
          <p>Leituras físicas do gêmeo digital: calor pela janela, diluição do gás MQ-2 e evaporação do sensor de vapor — calculado a cada quadro.</p>
        </div>
        <div className={snap.gasOn ? 'tele-alert bad' : 'tele-alert'}>
          <Flame size={14} /> {snap.gasOn ? 'Gás detectado' : 'Ar dentro do limite'}
        </div>
      </header>

      <div className="tele-liquids">
        <article className="tele-card">
          <span><Droplets size={12} /> Umidade interna</span>
          <LiquidGauge value={snap.hum} color="#3aa7ff" label="Umidade interna" />
          <strong>{hum}<small>%</small></strong>
        </article>
        <article className="tele-card">
          <span><CloudRain size={12} /> Sensor de vapor</span>
          <LiquidGauge value={snap.water * 100} color="#36d1c4" label="Sensor de vapor" />
          <strong>{water}<small>%</small></strong>
        </article>
        <article className="tele-card">
          <span><Fan size={12} /> Ventilador</span>
          <RadialGauge value={rpmPct} color="#8d7bff" />
          <strong>{Math.round(snap.rpm)}<small>rpm</small></strong>
        </article>
        <article className="tele-card">
          <span><Flame size={12} /> Risco de gás</span>
          <RadialGauge value={gasPct} color={snap.gasOn ? '#ff5a68' : '#ffb15a'} />
          <strong>{Math.round(snap.gas)}<small>ADC</small></strong>
          <em>{ppm} ppm</em>
        </article>
      </div>

      <div className="tele-board">
        <article className="chart-card main">
          <header><Thermometer size={14} /> Temperatura × Umidade<small>{temp}°C agora</small></header>
          <TrendChart
            series={[
              { name: 'Temp (°C)', data: series.temp, color: '#ffb15a', unit: '°C' },
              { name: 'Umidade (%)', data: series.hum, color: '#7eb6ff', unit: '%' },
            ]}
            dual
          />
        </article>
        <article className="chart-card gas">
          <header><Gauge size={14} /> MQ-2 vs limiar</header>
          <TrendChart series={[{ name: 'ADC gás', data: series.gas, color: '#ff8fa3' }]} markLine={{ value: threshold, label: 'limiar' }} />
        </article>
        <article className="chart-card steam">
          <header><CloudRain size={14} /> Sensor de vapor</header>
          <TrendChart series={[{ name: 'ADC vapor', data: series.steam, color: '#7dd3fc' }]} />
        </article>
        <article className="chart-card fan">
          <header><Activity size={14} /> Ventilador</header>
          <TrendChart series={[{ name: 'RPM', data: series.rpm, color: '#c4b5ff' }]} />
        </article>
      </div>

      <div className="module-strip tele-modules">
        {MODULES.map((mod) => (
          <button key={mod.id} onClick={() => { useSim.getState().setUi({ page: 'lab' }); useSim.getState().select(mod.id); }}>
            <Box size={14} /> {mod.name}
          </button>
        ))}
      </div>
    </div>
  );
}
