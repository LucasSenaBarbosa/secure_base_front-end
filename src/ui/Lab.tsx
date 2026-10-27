import {
  Bell, BellOff, CloudRain, Crosshair, DoorOpen, Droplets, Eye, Fan, Flame, Gauge, Lightbulb, Moon, Music,
  PersonStanding, Radio, RotateCw, Scan, Sparkles, Square, Sun, Thermometer, UserRound, Volume2, VolumeX, Wind, AppWindow,
} from 'lucide-react';
import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { enableAudio } from '../sim/audio';
import { firmwareById } from '../sim/firmware';
import { CARDS, INTERIOR_MODULES, MODULES, MORSE_PASSWORD, SONGS, moduleById } from '../sim/hardware';
import { notificationPermission, notificationsSupported, requestRainNotifications } from '../sim/notifications';
import { LCD_H, LCD_W, drawLcd } from '../sim/lcd';
import { useSim } from '../sim/store';
import type { Cmd, RgbMode, SongId } from '../sim/types';
import { Scene } from '../three/Scene';
import { guideBox } from '../three/spotlight';
import { Toggle } from './bits';
import { formatUptime, useThrottled } from './hooks';

const TOUR_KEY = 'ks5009-tour-done';

function Tour({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const done = step >= MODULES.length;
  const focusRef = useRef<HTMLDivElement>(null);
  const xrayWas = useRef(useSim.getState().ui.xray);

  useEffect(() => {
    if (done) {
      guideBox.active = false;
      guideBox.ok = false;
      return;
    }
    const module = MODULES[step];
    guideBox.active = true;
    guideBox.id = module.id;
    guideBox.ok = false;
    useSim.getState().setUi({
      selected: module.id,
      autoRotate: false,
      xray: INTERIOR_MODULES.includes(module.id) || xrayWas.current,
    });
    useSim.getState().focus(module.id);
    return () => {
      guideBox.active = false;
      guideBox.ok = false;
    };
  }, [step, done]);

  useEffect(() => {
    let frame = 0;
    const place = () => {
      const spot = focusRef.current;
      if (spot && guideBox.ok) {
        spot.style.opacity = '1';
        spot.style.left = `${guideBox.x}px`;
        spot.style.top = `${guideBox.y}px`;
        spot.style.width = `${guideBox.w}px`;
        spot.style.height = `${guideBox.h}px`;
      } else if (spot) spot.style.opacity = '0';
      frame = window.requestAnimationFrame(place);
    };
    frame = window.requestAnimationFrame(place);
    return () => window.cancelAnimationFrame(frame);
  }, [done]);

  const finish = () => {
    localStorage.setItem(TOUR_KEY, '1');
    useSim.getState().setUi({ selected: null, xray: xrayWas.current });
    useSim.getState().focus('home');
    onClose();
  };

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
      if (event.key === 'ArrowRight') setStep((n) => Math.min(MODULES.length, n + 1));
      if (event.key === 'ArrowLeft') setStep((n) => Math.max(0, n - 1));
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  });

  if (done) {
    return (
      <div className="tour-layer" role="dialog" aria-modal="true" aria-label="Tutorial dos componentes">
        <div className="tour-shade complete" />
        <div className="tour-card complete">
          <span className="tour-step">Tutorial concluído</span>
          <b>Você conheceu os {MODULES.length} componentes</b>
          <p>Agora explore a casa, teste os sensores e grave outros firmwares. O botão Ver Guia abre este tour novamente.</p>
          <div className="tour-actions"><button className="primary" onClick={finish}>Explorar projeto</button></div>
        </div>
      </div>
    );
  }

  const cur = MODULES[step];
  return (
    <div className="tour-layer" role="dialog" aria-modal="true" aria-label={`Componente: ${cur.name}`}>
      <div className="tour-shade">
        <div className="tour-focus" ref={focusRef}><span>{step + 1}</span></div>
      </div>
      <div className="tour-card">
        <div className="tour-progress"><i style={{ width: `${((step + 1) / MODULES.length) * 100}%` }} /></div>
        <span className="tour-step">Componente {step + 1} de {MODULES.length}</span>
        <b>{cur.name}</b>
        <small>{cur.part}</small>
        <p>{cur.description}</p>
        <div className="tour-meta"><span>{cur.pin}</span><span>{cur.kind}</span></div>
        <div className="tour-actions">
          <button onClick={finish}>Sair</button>
          <button disabled={step === 0} onClick={() => setStep((n) => n - 1)}>Anterior</button>
          <button className="primary" onClick={() => setStep((n) => n + 1)}>
            {step === MODULES.length - 1 ? 'Concluir' : 'Próximo'}
          </button>
        </div>
      </div>
    </div>
  );
}

const Stage = memo(function Stage() {
  const [tour, setTour] = useState(false);
  const board = useSim((s) => s.board);
  return (
    <section className="stage">
      <div className="stage-view">
        <Scene />
        {tour && board === 'running' && <Tour onClose={() => setTour(false)} />}
      </div>
      <StageChrome tour={tour} setTour={setTour} />
    </section>
  );
});

function StageChrome({ tour, setTour }: { tour: boolean; setTour: (on: boolean) => void }) {
  const ui = useSim((s) => s.ui);
  const setUi = useSim((s) => s.setUi);
  const focus = useSim((s) => s.focus);
  const board = useSim((s) => s.board);
  const firmwareId = useSim((s) => s.firmwareId);
  const muted = useSim((s) => s.settings.muted);
  const night = useSim((s) => s.env.night);
  const flash = useThrottled((s) => s.flashProgress, 100);
  const live = useThrottled(
    (s) => ({
      t: s.sensors.temp.toFixed(1),
      h: Math.round(s.sensors.humidity),
      gas: s.sensors.gasDetected,
      rpm: Math.round(Math.abs(s.act.fanRpm)),
      door: Math.round(s.act.doorPos),
    }),
    250,
  );
  const hovered = moduleById[ui.hovered ?? 'esp32'];
  const fw = firmwareById(firmwareId);

  return (
    <>
      <div className="stage-top">
        <span className="live-pill"><i /> {board === 'running' ? 'ESP32 em execução' : board === 'flashing' ? 'Gravando flash' : 'Reiniciando'}</span>
        <span className="stage-top-right">
          <span className="stage-fw">{fw.index} · {fw.title}</span>
          {!tour && (
            <button className="guide-launch" disabled={board !== 'running'} onClick={() => setTour(true)}>
              <Sparkles size={15} /> Ver Guia
            </button>
          )}
        </span>
      </div>
      <div className="stage-tools">
        <div className="tool-group" role="group" aria-label="Versão da casa">
          <button className={ui.model === 'v1' ? 'on' : ''} onClick={() => { setUi({ model: 'v1' }); focus('home'); }}>V1</button>
          <button className={ui.model === 'v2' ? 'on' : ''} onClick={() => { setUi({ model: 'v2' }); focus('home'); }}>V2</button>
        </div>
        <div className="tool-group">
          {(['home', 'front', 'back', 'side', 'top'] as const).map((id) => (
            <button key={id} className={ui.focus.target === id ? 'on' : ''} onClick={() => focus(id)}>
              {({ home: '3/4', front: 'Frente', back: 'Fundo', side: 'Lado', top: 'Topo' })[id]}
            </button>
          ))}
        </div>
        <div className="tool-group">
          <button className={ui.xray ? 'on' : ''} onClick={() => setUi({ xray: !ui.xray })}><Scan size={14} /> Raio-X</button>
          <button className={ui.exploded ? 'on' : ''} onClick={() => setUi({ exploded: !ui.exploded })}><Square size={14} /> Explodir</button>
          <button className={ui.sensorViz ? 'on' : ''} onClick={() => setUi({ sensorViz: !ui.sensorViz })}><Eye size={14} /> PIR</button>
          <button className={ui.autoRotate ? 'on' : ''} onClick={() => setUi({ autoRotate: !ui.autoRotate })}><RotateCw size={14} /> Órbita</button>
          <button className={night ? 'on' : ''} onClick={() => useSim.getState().setEnv({ night: !night })}>{night ? <Moon size={14} /> : <Sun size={14} />} Noite</button>
          <button className={muted ? '' : 'on'} onClick={() => (muted ? enableAudio() : useSim.getState().setSettings({ muted: true }))}>
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />} Som
          </button>
        </div>
      </div>
      {ui.hovered && <div className="hover-card"><Crosshair size={14} /><div><b>{hovered.name}</b><small>{hovered.pin} · {hovered.kind}</small></div></div>}
      <div className="stage-meters">
        <span><Thermometer size={13} /> {live.t}°C</span>
        <span><Droplets size={13} /> {live.h}%</span>
        <span className={live.gas ? 'bad' : ''}><Wind size={13} /> {live.gas ? 'gás' : 'ar ok'}</span>
        <span><Fan size={13} /> {live.rpm} rpm</span>
        <span><DoorOpen size={13} /> {live.door}°</span>
      </div>
      {board !== 'running' && (
        <div className="flash-overlay">
          <div>
            <b>{board === 'flashing' ? 'esptool · gravando a flash' : 'Boot ROM · reset'}</b>
            <div className="bar"><i style={{ width: `${board === 'flashing' ? Math.round(flash * 100) : 100}%` }} /></div>
            <small>{board === 'flashing' ? `${Math.round(flash * 100)}% · 921600 baud` : 'Subindo o firmware…'}</small>
          </div>
        </div>
      )}
    </>
  );
}

function LcdMirror() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = LCD_W;
    canvas.height = LCD_H;
    const ctx = canvas.getContext('2d')!;
    const paint = () => {
      const { act } = useSim.getState();
      drawLcd(ctx, act.lcd, act.backlight);
    };
    paint();
    return useSim.subscribe((s, p) => {
      if (s.act.lcd[0] !== p.act.lcd[0] || s.act.lcd[1] !== p.act.lcd[1] || s.act.backlight !== p.act.backlight) paint();
    });
  }, []);
  return <canvas ref={ref} className="lcd-mirror" aria-label="Espelho do LCD 1602" />;
}

const FAN_LEVELS = [0, 110, 180, 255];
const SWATCHES = ['#8b5cf6', '#ff3b5c', '#ff9f1a', '#ffe14d', '#2ee59d', '#2fb8ff', '#ffffff'];

function Phone() {
  const settings = useSim((s) => s.settings);
  const setSettings = useSim((s) => s.setSettings);
  const firmwareId = useSim((s) => s.firmwareId);
  const board = useSim((s) => s.board);
  const connected = firmwareId === 'smart-home' && board === 'running';
  const [lcd, setLcd] = useState('Casa pronta');
  const [autoOpen, setAutoOpen] = useState(false);
  const [notifyPerm, setNotifyPerm] = useState<NotificationPermission>(() => notificationPermission());
  const send = (cmd: Cmd) => {
    enableAudio();
    useSim.getState().sendCommand(cmd);
  };
  const st = useThrottled((s) => ({
    led: s.act.led > 8,
    door: s.act.door > 90,
    win: s.act.window > 90,
    fan: Math.abs(s.act.fanPwm),
    t: s.sensors.dhtT,
    h: s.sensors.dhtH,
    gas: s.sensors.gasDetected,
  }), 200);
  const fanLevel = FAN_LEVELS.reduce((best, v, i) => (Math.abs(v - st.fan) < Math.abs(FAN_LEVELS[best] - st.fan) ? i : best), 0);
  const modes: { id: RgbMode; label: string }[] = [
    { id: 'static', label: 'Fixa' }, { id: 'rainbow', label: 'Arco-íris' }, { id: 'breath', label: 'Respiro' },
    { id: 'chase', label: 'Chase' }, { id: 'off', label: 'Desligar' },
  ];
  const tiles = [
    { id: 'led', label: 'Luz', icon: Lightbulb, on: st.led, state: st.led ? 'Acesa' : 'Apagada', act: () => send({ type: 'led', on: !st.led }) },
    { id: 'door', label: 'Porta', icon: DoorOpen, on: st.door, state: st.door ? 'Aberta' : 'Fechada', act: () => send({ type: 'door', open: !st.door }) },
    { id: 'win', label: 'Janela', icon: AppWindow, on: st.win, state: st.win ? 'Aberta' : 'Fechada', act: () => send({ type: 'window', open: !st.win }) },
    { id: 'fan', label: 'Ventilador', icon: Fan, on: fanLevel > 0, state: fanLevel ? `Nível ${fanLevel}` : 'Desligado', act: () => send({ type: 'fan', speed: FAN_LEVELS[(fanLevel + 1) % 4] }) },
  ];

  return (
    <div className="device">
      <div className="screen">
        <div className="status-bar"><span>{connected ? 'Wi-Fi' : 'Sem rede'}</span><i /><span>192.168.4.1</span></div>
        <header className="app-head">
          <div><small>Keyestudio</small><b>Minha casa</b></div>
          <span className={connected ? 'link on' : 'link'}>{connected ? 'Conectado' : 'Offline'}</span>
        </header>
        <LcdMirror />
        <div className="readouts">
          <div><Thermometer size={14} /><b>{st.t}°</b><small>Temp.</small></div>
          <div><Droplets size={14} /><b>{st.h}%</b><small>Umid.</small></div>
          <div className={st.gas ? 'alert' : ''}><Wind size={14} /><b>{st.gas ? 'Gás!' : 'OK'}</b><small>Ar</small></div>
        </div>
        {!connected && <p className="offline-note">O firmware gravado não tem servidor Wi-Fi. Grave o 00 · Smart Home para controlar pelo app.</p>}
        <div className="tiles">
          {tiles.map((tile) => (
            <button key={tile.id} className={tile.on ? 'tile on' : 'tile'} disabled={!connected} onClick={tile.act} aria-pressed={tile.on}>
              <tile.icon size={22} />
              <b>{tile.label}</b>
              <small>{tile.state}</small>
              {tile.id === 'fan' && <span className="levels">{[1, 2, 3].map((n) => <i key={n} className={fanLevel >= n ? 'on' : ''} />)}</span>}
            </button>
          ))}
        </div>
        <section className="app-section">
          <h4>Luz ambiente</h4>
          <div className="swatches">
            {SWATCHES.map((c) => (
              <button key={c} aria-label={`Cor ${c}`} disabled={!connected} className={settings.rgbMode === 'static' && settings.rgbColor === c ? 'on' : ''} style={{ background: c }} onClick={() => send({ type: 'rgb', mode: 'static', color: c })} />
            ))}
            <label className="custom-color" aria-label="Cor personalizada">
              <input type="color" value={settings.rgbColor} disabled={!connected} onChange={(e) => send({ type: 'rgb', mode: 'static', color: e.target.value })} />
            </label>
          </div>
          <div className="chips">
            {modes.map((m) => (
              <button key={m.id} disabled={!connected} className={settings.rgbMode === m.id ? 'on' : ''} onClick={() => send({ type: 'rgb', mode: m.id, color: settings.rgbColor })}>{m.label}</button>
            ))}
          </div>
        </section>
        <section className="app-section">
          <h4>Som</h4>
          <div className="chips">
            {(['birthday', 'ode', 'doorbell'] as SongId[]).map((id) => (
              <button key={id} disabled={!connected} onClick={() => send({ type: 'music', song: id })}><Music size={12} /> {SONGS[id].label}</button>
            ))}
            <button disabled={!connected} onClick={() => send({ type: 'silence' })}>Parar</button>
          </div>
        </section>
        <form className="lcd-form" onSubmit={(e) => { e.preventDefault(); send({ type: 'lcd', text: lcd }); }}>
          <input value={lcd} maxLength={32} onChange={(e) => setLcd(e.target.value)} aria-label="Mensagem do LCD" />
          <button type="submit" disabled={!connected}>Enviar ao LCD</button>
        </form>
        <section className="app-section">
          <button className="section-toggle" onClick={() => setAutoOpen((v) => !v)} aria-expanded={autoOpen}>
            <h4>Automações</h4><span>{autoOpen ? 'Fechar' : 'Ajustar'}</span>
          </button>
          {autoOpen && (
      <div className="auto-list">
        <div><span>Luz por presença</span><Toggle label="Luz automática" on={settings.autoLight} onClick={() => setSettings({ autoLight: !settings.autoLight })} /></div>
        <div><span>Ventilador a partir de {settings.fanTemp}°C</span><Toggle label="Ventilador automático" on={settings.autoFan} onClick={() => setSettings({ autoFan: !settings.autoFan })} /></div>
        <input aria-label="Temperatura do ventilador" type="range" min={18} max={40} value={settings.fanTemp} onChange={(e) => setSettings({ fanTemp: Number(e.target.value) })} />
        <div><span>Fechar janela na chuva</span><Toggle label="Janela automática" on={settings.autoWindow} onClick={() => setSettings({ autoWindow: !settings.autoWindow })} /></div>
        <div><span>Alarme de gás</span><Toggle label="Alarme de gás" on={settings.gasAlarm} onClick={() => setSettings({ gasAlarm: !settings.gasAlarm })} /></div>
        <div><span>Acesso RFID</span><Toggle label="Acesso RFID" on={settings.rfidAccess} onClick={() => setSettings({ rfidAccess: !settings.rfidAccess })} /></div>
        <div><span>Senha Morse {MORSE_PASSWORD}</span><Toggle label="Senha Morse" on={settings.morseAccess} onClick={() => setSettings({ morseAccess: !settings.morseAccess })} /></div>
        <div className="notify-row">
          <span>Notificar celular na chuva</span>
          <Toggle label="Notificação de chuva" on={settings.rainNotify} onClick={() => setSettings({ rainNotify: !settings.rainNotify })} />
        </div>
        {settings.rainNotify && notificationsSupported() && (
          <div className="notify-row">
            <span className={notifyPerm === 'granted' ? 'notify-status on' : 'notify-status'}>
              {notifyPerm === 'granted' ? <Bell size={12} /> : <BellOff size={12} />}
              {notifyPerm === 'granted' ? 'Notificações ativas' : notifyPerm === 'denied' ? 'Bloqueadas pelo navegador' : 'Permissão não concedida'}
            </span>
            {notifyPerm !== 'granted' && notifyPerm !== 'denied' && (
              <button type="button" className="notify-btn" onClick={() => requestRainNotifications().then(setNotifyPerm)}>Ativar</button>
            )}
          </div>
        )}
        <label className="slider-label">Volume
          <input type="range" min={0} max={1} step={0.01} value={settings.volume} onChange={(e) => { enableAudio(); setSettings({ volume: Number(e.target.value) }); }} />
        </label>
      </div>
          )}
        </section>
      </div>
    </div>
  );
}

function World() {
  const env = useSim(useShallow((s) => ({
    outdoorTemp: s.env.outdoorTemp, outdoorHumidity: s.env.outdoorHumidity, rain: s.env.rain,
    gasLeak: s.env.gasLeak, speed: s.env.speed, heater: s.env.heater, personMode: s.env.personMode,
  })));
  const setEnv = useSim((s) => s.setEnv);
  const threshold = useSim((s) => s.sensors.gasThreshold);
  const setGasThreshold = useSim((s) => s.setGasThreshold);
  const water = useThrottled((s) => Math.round(s.sensors.steamWater * 100), 300);
  const ppm = useThrottled((s) => Math.round(s.sensors.gasPpm), 300);
  return (
    <div className="world">
      <p className="dock-note">O ambiente empurra os sensores. Temperatura e gás evoluem com inércia, ventilação e janelas — o DHT11 só publica uma leitura por segundo.</p>
      <label>Temperatura externa <b>{env.outdoorTemp.toFixed(0)}°C</b>
        <input type="range" min={5} max={42} step={0.5} value={env.outdoorTemp} onChange={(e) => setEnv({ outdoorTemp: Number(e.target.value) })} />
      </label>
      <label>Umidade externa <b>{env.outdoorHumidity}%</b>
        <input type="range" min={15} max={98} value={env.outdoorHumidity} onChange={(e) => setEnv({ outdoorHumidity: Number(e.target.value) })} />
      </label>
      <label>Chuva <b>{Math.round(env.rain * 100)}%</b>
        <input type="range" min={0} max={1} step={0.01} value={env.rain} onChange={(e) => setEnv({ rain: Number(e.target.value) })} />
      </label>
      <label>Vazamento de gás <b>{Math.round(env.gasLeak * 100)}%</b>
        <input type="range" min={0} max={1} step={0.01} value={env.gasLeak} onChange={(e) => setEnv({ gasLeak: Number(e.target.value) })} />
      </label>
      <label>Limiar do MQ-2 <b>{threshold}</b>
        <input type="range" min={600} max={3600} step={20} value={threshold} onChange={(e) => setGasThreshold(Number(e.target.value))} />
      </label>
      <label>Velocidade do clima <b>{env.speed.toFixed(0)}×</b>
        <input type="range" min={1} max={20} step={1} value={env.speed} onChange={(e) => setEnv({ speed: Number(e.target.value) })} />
      </label>
      <div className="world-actions">
        <button onClick={() => useSim.getState().walkVisitor()}><PersonStanding size={15} /> Visitante</button>
        <button onClick={() => setEnv({ personMode: env.personMode === 'stay' ? 'none' : 'stay', personT: env.personMode === 'stay' ? null : 0.5 })}><UserRound size={15} /> Ficar na porta</button>
        <button onClick={() => useSim.getState().dropWater()}><Droplets size={15} /> Pingar água</button>
        <button className={env.heater ? 'on' : ''} onClick={() => setEnv({ heater: !env.heater })}><Flame size={15} /> Aquecedor</button>
        <button className={env.rain > 0.4 ? 'on' : ''} onClick={() => setEnv({ rain: env.rain > 0.4 ? 0 : 0.85 })}><CloudRain size={15} /> Temporal</button>
        <button className={env.gasLeak > 0.4 ? 'on' : ''} onClick={() => setEnv({ gasLeak: env.gasLeak > 0.4 ? 0 : 0.75 })}><Gauge size={15} /> Abrir gás</button>
      </div>
      <div className="world-read">Sensor molhado {water}% · gás interno {ppm} ppm</div>
      <div className="cards">
        {CARDS.map((card) => (
          <button key={card.uid} className="rfid-card" style={{ '--card': card.color } as CSSProperties} onClick={() => useSim.getState().tapCard(card.uid)}>
            <Radio size={14} />
            <span><b>{card.label}</b><small>{card.uid} · {card.authorized ? 'autorizado' : 'negado'}</small></span>
          </button>
        ))}
      </div>
      <p className="dock-note">Botões da casa: toque curto é ponto, toque longo é traço. Senha <b>{MORSE_PASSWORD}</b>. O botão direito confirma.</p>
    </div>
  );
}

function Pins() {
  const snap = useThrottled((s) => ({
    led: s.act.led, fan: Math.round(s.act.fanPwm), rpm: Math.abs(s.act.fanRpm),
    door: Math.round(s.act.doorPos), win: Math.round(s.act.windowPos), buzz: Math.round(s.act.buzzer),
    pir: s.sensors.pir, gas: s.sensors.gasDetected, adc: s.sensors.gasAdc, steam: s.sensors.steamAdc,
    t: s.sensors.dhtT, h: s.sensors.dhtH, l: s.sensors.btnL, r: s.sensors.btnR, uid: s.sensors.rfid,
    lcd0: s.act.lcd[0], lcd1: s.act.lcd[1], up: s.uptime,
  }), 200);
  const rows: [string, string, string][] = [
    ['IO12', 'LED amarelo', snap.led > 8 ? `PWM ${snap.led}` : 'LOW'],
    ['IO16', 'Botão esquerdo', snap.l ? 'LOW · pressionado' : 'HIGH'],
    ['IO27', 'Botão direito', snap.r ? 'LOW · pressionado' : 'HIGH'],
    ['IO14', 'PIR', snap.pir ? 'HIGH · movimento' : 'LOW'],
    ['IO25', 'Buzzer', snap.buzz ? `${snap.buzz} Hz` : 'silêncio'],
    ['IO13', 'Servo porta', `${snap.door}°`],
    ['IO5', 'Servo janela', `${snap.win}°`],
    ['IO19', 'Ventilador', `${snap.fan} · ${Math.round(snap.rpm)} rpm`],
    ['IO34', 'Vapor ADC', String(snap.steam)],
    ['IO23', 'MQ-2 DO', snap.gas ? 'LOW · gás' : `HIGH · ADC ${snap.adc}`],
    ['IO17', 'DHT11', `${snap.t}°C  ${snap.h}%`],
    ['I²C', 'RFID 0x28', snap.uid ?? 'sem cartão'],
  ];
  return (
    <div className="pins">
      <div className="lcd-preview"><span>{snap.lcd0}</span><span>{snap.lcd1}</span></div>
      <div className="pin-table">
        {rows.map(([pin, name, value]) => (
          <div key={pin}><b>{pin}</b><span>{name}</span><em>{value}</em></div>
        ))}
      </div>
      <small className="uptime">uptime {formatUptime(snap.up)}</small>
    </div>
  );
}

function Serial() {
  const lines = useSim((s) => s.serial);
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [lines]);
  return (
    <div className="serial">
      <div className="serial-log" aria-live="polite">
        {lines.map((line) => (
          <div key={line.id} className={`ln ${line.kind}`}>
            <span>{formatUptime(line.t)}</span>{line.text}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; useSim.getState().serialSend(text.trim()); setText(''); }}>
        <input value={text} placeholder="reset ou UID do cartão" aria-label="Enviar ao serial" onChange={(e) => setText(e.target.value)} />
        <button type="submit">Enviar</button>
        <button type="button" onClick={() => useSim.getState().clearSerial()}>Limpar</button>
      </form>
    </div>
  );
}

export function Lab() {
  const [tab, setTab] = useState<'app' | 'world' | 'pins' | 'serial'>('app');
  const selected = useSim((s) => s.ui.selected);
  const mod = selected ? moduleById[selected] : null;
  return (
    <div className="lab">
      <Stage />
      <aside className="dock">
        {mod && (
          <div className="sel-card">
            <div><b>{mod.name}</b><small>{mod.part}</small></div>
            <p>{mod.description}</p>
            <span>{mod.pin}</span>
          </div>
        )}
        <div className="dock-tabs">
          {([['app', 'App'], ['world', 'Ambiente'], ['pins', 'GPIO'], ['serial', 'Serial']] as const).map(([id, label]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <div className="dock-body">
          {tab === 'app' && <Phone />}
          {tab === 'world' && <World />}
          {tab === 'pins' && <Pins />}
          {tab === 'serial' && <Serial />}
        </div>
      </aside>
    </div>
  );
}
