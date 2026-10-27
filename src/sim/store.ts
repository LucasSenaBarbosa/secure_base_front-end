import { create } from 'zustand';
import { firmwareById, pad16 } from './firmware';
import { CARDS, MAX_RPM } from './hardware';
import { emitRainEvent, sendRainNotification } from './notifications';
import { pirSees } from './world';
import type {
  Actuators, BoardState, Cmd, Env, Firmware, FirmwareCtx, FirmwareEvents, ModuleId, Note, Sample,
  SerialLine, Sensors, Settings, TapEvent,
} from './types';

export type CameraPreset = 'home' | 'front' | 'back' | 'top' | 'side';

export type Page = 'lab' | 'protoboard' | 'firmware' | 'inventory' | 'telemetry' | 'users';

export type HouseModel = 'v1' | 'v2';

export interface UiState {
  page: Page;
  selected: ModuleId | null;
  hovered: ModuleId | null;
  xray: boolean;
  exploded: boolean;
  sensorViz: boolean;
  autoRotate: boolean;
  /** Casa de madeira do kit (v1) ou a maquete premium (v2). */
  model: HouseModel;
  focus: { target: ModuleId | CameraPreset; nonce: number };
}

interface SimState {
  env: Env;
  sensors: Sensors;
  act: Actuators;
  settings: Settings;
  board: BoardState;
  flashProgress: number;
  firmwareId: string;
  uptime: number;
  serial: SerialLine[];
  history: Sample[];
  tap: TapEvent | null;
  ui: UiState;

  setEnv(p: Partial<Env>): void;
  setSettings(p: Partial<Settings>): void;
  setGasThreshold(v: number): void;
  setUi(p: Partial<UiState>): void;
  focus(target: ModuleId | CameraPreset): void;
  select(id: ModuleId | null): void;
  pressButton(btn: 'L' | 'R', down: boolean): void;
  tapCard(uid: string): void;
  dropWater(): void;
  walkVisitor(): void;
  sendCommand(cmd: Cmd): void;
  flash(id: string): void;
  reset(): void;
  serialSend(text: string): void;
  clearSerial(): void;
}

const STEP = 50;

const initialEnv: Env = { outdoorTemp: 24, outdoorHumidity: 55, rain: 0, gasLeak: 0, personMode: 'none', personT: null, heater: false, night: false, speed: 5 };

const initialSensors: Sensors = {
  temp: 25, humidity: 52, dhtT: 25, dhtH: 52, gasPpm: 0, gasAdc: 380, gasDetected: false, gasThreshold: 1800,
  steamWater: 0, steamAdc: 0, pir: false, btnL: false, btnR: false, rfid: null,
};

const blankLcd = (): [string, string] => [pad16(''), pad16('')];

const initialAct = (): Actuators => ({
  led: 0, rgb: ['#000000', '#000000', '#000000', '#000000'], fanPwm: 0, fanRpm: 0,
  door: 0, doorPos: 0, window: 0, windowPos: 0, buzzer: 0, lcd: blankLcd(), backlight: true,
});

const initialSettings: Settings = {
  autoLight: true, autoFan: true, fanTemp: 28, autoWindow: true, gasAlarm: true, rfidAccess: true, morseAccess: true,
  rgbMode: 'rainbow', rgbColor: '#8b5cf6', volume: 0.35, muted: true, rainNotify: true,
};

const RAIN_THRESHOLD = 0.3;

/* ---------------- engine internals (not reactive) ---------------- */

let serialId = 0;
let fw: Firmware = firmwareById('smart-home');
let mem: Record<string, any> = {};
let toneSeq: Note[] = [];
let toneLoop = false;
let toneIdx = 0;
let toneElapsed = 0;
const cmdQueue: Cmd[] = [];
const input = { L: false, R: false, downAtL: 0, downAtR: 0 };
const prev = { L: false, R: false, pir: false };
let releaseL: number | null = null;
let releaseR: number | null = null;
let pressedL = false;
let pressedR = false;
let pendingCard: { uid: string; at: number } | null = null;
let rfidUntil = 0;
let pirUntil = 0;
let lastDht = 0;
let lastSample = 0;
let realClock = 0;
let flashLog: { at: number; text: string }[] = [];
let bootLogAt = 0;

const noise = (amp: number) => (Math.random() * 2 - 1) * amp;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const approach = (v: number, target: number, dt: number, tau: number) => v + (target - v) * (1 - Math.exp(-dt / tau));

export const useSim = create<SimState>()((set, get) => {
  const log = (text: string, kind: SerialLine['kind'] = 'out') => {
    const line: SerialLine = { id: ++serialId, t: get().uptime, text, kind };
    set((s) => ({ serial: [...s.serial.slice(-299), line] }));
  };

  const startFirmware = () => {
    mem = {};
    toneSeq = [];
    toneLoop = false;
    const s = get();
    const act = initialAct();
    const ctx = makeCtx(s.sensors, act, s.settings, emptyEvents(), 0);
    fw.setup(ctx);
    set({ act: { ...act, lcd: ctx.a.lcd }, uptime: 0, board: 'running' });
  };

  const makeCtx = (sensors: Sensors, a: Actuators, settings: Settings, ev: FirmwareEvents, t: number): FirmwareCtx => ({
    t,
    dt: STEP,
    s: sensors,
    a,
    settings,
    ev,
    mem,
    print: (text) => log(text),
    tone: (seq, loop = false) => {
      toneSeq = seq;
      toneLoop = loop;
      toneIdx = 0;
      toneElapsed = 0;
    },
    noTone: () => {
      toneSeq = [];
      toneLoop = false;
    },
    get toneBusy() {
      return toneSeq.length > 0 && toneIdx < toneSeq.length;
    },
    lcd: (l0, l1 = '') => {
      a.lcd = [pad16(l0), pad16(l1)];
    },
    every: (key, ms) => {
      const k = `__every_${key}`;
      if (mem[k] === undefined || t - mem[k] >= ms) {
        mem[k] = t;
        return true;
      }
      return false;
    },
  });

  const emptyEvents = (): FirmwareEvents => ({ pressL: false, pressR: false, releaseL: null, releaseR: null, card: null, pirRise: false, cmds: [] });

  const stepPhysics = (env: Env, s: Sensors, a: Actuators, dtReal: number, t: number): { env: Env; s: Sensors } => {
    const dt = dtReal * env.speed;
    const fanFrac = Math.abs(a.fanRpm) / MAX_RPM;
    const windowOpen = clamp(a.windowPos / 180, 0, 1);
    const doorOpen = clamp(a.doorPos / 180, 0, 1);

    const tTarget = env.outdoorTemp + 1.2 + (env.night ? -1.5 : 0.8) + (env.heater ? 14 : 0) - fanFrac * 3.2 - env.rain * 1.5;
    const tTau = 110 / (1 + windowOpen * 0.9 + fanFrac * 1.6 + doorOpen * 0.4) * (env.heater ? 0.35 : 1);
    const temp = approach(s.temp, tTarget, dt, tTau);

    const hTarget = clamp(env.outdoorHumidity * (0.82 + windowOpen * 0.18) + env.rain * 22 - fanFrac * 6 - (env.heater ? 18 : 0), 12, 97);
    const humidity = approach(s.humidity, hTarget, dt, 85);

    const vent = 0.025 + windowOpen * 0.1 + doorOpen * 0.06 + fanFrac * 0.36;
    const gasPpm = Math.max(0, s.gasPpm + (env.gasLeak * 1200 - s.gasPpm * vent) * dt);
    const gasAdc = Math.round(clamp(380 + (3600 * gasPpm) / (gasPpm + 2500) + noise(10), 0, 4095));
    const gasDetected = s.gasDetected ? gasAdc > s.gasThreshold - 80 : gasAdc > s.gasThreshold;

    const evap = 0.035 * (1 + (temp - 20) / 25) * (env.heater ? 3 : 1);
    const steamWater = clamp(s.steamWater + env.rain * 0.45 * dtReal - s.steamWater * evap * dt * 0.25, 0, 1);
    const steamAdc = Math.round(clamp(steamWater * 3950 + (steamWater > 0.02 ? noise(25) : 0), 0, 4095));

    let personT = env.personT;
    if (env.personMode === 'walk' && personT !== null) {
      personT += dtReal / 11;
      if (personT >= 1) personT = null;
    }
    if (env.personMode === 'stay') personT = 0.5;
    const nextEnv = personT === env.personT ? env : { ...env, personT, personMode: personT === null ? 'none' : env.personMode };
    if (pirSees(personT)) pirUntil = t + 2000;

    let dhtT = s.dhtT;
    let dhtH = s.dhtH;
    if (t - lastDht >= 1000) {
      lastDht = t;
      dhtT = Math.round(clamp(temp + noise(0.35), 0, 50));
      dhtH = Math.round(clamp(humidity + noise(0.8), 20, 95));
    }

    return {
      env: nextEnv,
      s: { ...s, temp, humidity, dhtT, dhtH, gasPpm, gasAdc, gasDetected, steamWater, steamAdc, pir: t < pirUntil, btnL: input.L, btnR: input.R, rfid: t < rfidUntil ? s.rfid : null },
    };
  };

  const stepActuators = (a: Actuators, dtReal: number): Actuators => {
    const pwm = Math.abs(a.fanPwm) < 55 ? 0 : a.fanPwm;
    const fanRpm = approach(a.fanRpm, (pwm / 255) * MAX_RPM, dtReal, pwm === 0 ? 1.4 : 0.7);
    const servo = (pos: number, target: number) => {
      const max = 420 * dtReal;
      return pos + clamp(target - pos, -max, max);
    };
    let buzzer = 0;
    if (toneSeq.length) {
      toneElapsed += dtReal * 1000;
      while (toneIdx < toneSeq.length && toneElapsed >= toneSeq[toneIdx][1] + 30) {
        toneElapsed -= toneSeq[toneIdx][1] + 30;
        toneIdx++;
        if (toneIdx >= toneSeq.length && toneLoop) toneIdx = 0;
      }
      if (toneIdx < toneSeq.length) buzzer = toneElapsed < toneSeq[toneIdx][1] ? toneSeq[toneIdx][0] : 0;
      else toneSeq = [];
    }
    return { ...a, fanRpm: Math.abs(fanRpm) < 1 ? 0 : fanRpm, doorPos: servo(a.doorPos, a.door), windowPos: servo(a.windowPos, a.window), buzzer };
  };

  const step = () => {
    const st = get();
    const dtReal = STEP / 1000;

    if (st.board === 'flashing') {
      const progress = Math.min(1, st.flashProgress + dtReal / 3.4);
      while (flashLog.length && flashLog[0].at <= progress) log(flashLog.shift()!.text, 'sys');
      const act = stepActuators({ ...st.act, fanPwm: 0, door: st.act.doorPos, window: st.act.windowPos, led: 0, rgb: ['#000000', '#000000', '#000000', '#000000'] }, dtReal);
      set({ flashProgress: progress, act });
      if (progress >= 1) {
        set({ board: 'booting' });
        bootLogAt = realClock;
        log('ets Jun  8 2016 00:22:57', 'sys');
        log('rst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)', 'sys');
        log('configsip: 0, SPIWP:0xee · clk_drv:0x00 · mode:DIO, clock div:1', 'sys');
        log('load:0x3fff0030,len:1344 · entry 0x400805f0', 'sys');
      }
      return;
    }
    if (st.board === 'booting') {
      if (realClock - bootLogAt > 700) startFirmware();
      return;
    }

    const t = st.uptime + STEP;
    let act = { ...st.act };
    const phys = stepPhysics(st.env, st.sensors, act, dtReal, t);

    const ev = emptyEvents();
    ev.pressL = pressedL;
    ev.pressR = pressedR;
    ev.releaseL = releaseL;
    ev.releaseR = releaseR;
    pressedL = pressedR = false;
    releaseL = releaseR = null;
    if (pendingCard && realClock >= pendingCard.at) {
      ev.card = pendingCard.uid;
      phys.s.rfid = pendingCard.uid;
      rfidUntil = t + 1100;
      pendingCard = null;
    }
    ev.pirRise = phys.s.pir && !prev.pir;
    prev.pir = phys.s.pir;

    const cmds = cmdQueue.splice(0);
    if (cmds.length) {
      if (fw.id === 'smart-home') ev.cmds = cmds;
      else log(`[WiFi] Firmware "${fw.title}" não possui servidor Wi-Fi — comando "${cmds[0].type}" ignorado`, 'warn');
    }

    const ctx = makeCtx(phys.s, act, st.settings, ev, t);
    try {
      fw.loop(ctx);
    } catch (e) {
      log(`Guru Meditation Error: ${(e as Error).message}`, 'err');
    }
    act = stepActuators(ctx.a, dtReal);

    let history = st.history;
    if (t - lastSample >= 500) {
      lastSample = t;
      history = [...history.slice(-159), { temp: phys.s.temp, hum: phys.s.humidity, gas: phys.s.gasAdc, steam: phys.s.steamAdc, rpm: Math.abs(act.fanRpm) }];
    }

    set({ env: phys.env, sensors: phys.s, act, uptime: t, history });
  };

  let acc = 0;
  let last = performance.now();
  const g = globalThis as { __simTimer?: ReturnType<typeof setInterval> };
  if (g.__simTimer) clearInterval(g.__simTimer);
  g.__simTimer = setInterval(() => {
    const now = performance.now();
    acc = Math.min(acc + (now - last), STEP * 20);
    last = now;
    while (acc >= STEP) {
      acc -= STEP;
      realClock += STEP;
      step();
    }
  }, STEP);

  queueMicrotask(() => {
    log('ESP32 conectado em COM3 @ 115200 baud', 'sys');
    startFirmware();
  });

  return {
    env: initialEnv,
    sensors: initialSensors,
    act: initialAct(),
    settings: initialSettings,
    board: 'booting',
    flashProgress: 0,
    firmwareId: fw.id,
    uptime: 0,
    serial: [],
    history: [],
    tap: null,
    ui: { page: 'lab', selected: null, hovered: null, xray: false, exploded: false, sensorViz: false, autoRotate: false, model: 'v1', focus: { target: 'home', nonce: 0 } },

    setEnv: (p) => {
      const prevRain = get().env.rain;
      set((s) => ({ env: { ...s.env, ...p } }));
      if (p.rain !== undefined && p.rain >= RAIN_THRESHOLD && prevRain < RAIN_THRESHOLD) {
        const pct = Math.round(p.rain * 100);
        log(`[Clima] Chuva detectada (${pct}%) — fechando janela automaticamente`, 'sys');
        if (get().settings.rainNotify) {
          emitRainEvent(pct);
          sendRainNotification(pct);
        }
      }
    },
    setSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
    setGasThreshold: (v) => set((s) => ({ sensors: { ...s.sensors, gasThreshold: v } })),
    setUi: (p) => set((s) => ({ ui: { ...s.ui, ...p } })),
    focus: (target) => set((s) => ({ ui: { ...s.ui, focus: { target, nonce: s.ui.focus.nonce + 1 } } })),
    select: (id) => {
      set((s) => ({ ui: { ...s.ui, selected: id } }));
      if (id) get().focus(id);
    },
    pressButton: (btn, down) => {
      if (input[btn] === down) return;
      input[btn] = down;
      const now = realClock;
      if (btn === 'L') {
        if (down) { input.downAtL = now; pressedL = true; } else releaseL = now - input.downAtL;
      } else {
        if (down) { input.downAtR = now; pressedR = true; } else releaseR = now - input.downAtR;
      }
    },
    tapCard: (uid) => {
      pendingCard = { uid, at: realClock + 750 };
      set((s) => ({ tap: { uid, nonce: (s.tap?.nonce ?? 0) + 1 } }));
    },
    dropWater: () => set((s) => ({ sensors: { ...s.sensors, steamWater: clamp(s.sensors.steamWater + 0.5, 0, 1) } })),
    walkVisitor: () => set((s) => ({ env: { ...s.env, personMode: 'walk', personT: 0 } })),
    sendCommand: (cmd) => {
      if (cmd.type === 'rgb') set((s) => ({ settings: { ...s.settings, rgbMode: cmd.mode, rgbColor: cmd.color ?? s.settings.rgbColor } }));
      if (get().board !== 'running') {
        log('[WiFi] ESP32 indisponível (gravando/reiniciando)', 'warn');
        return;
      }
      cmdQueue.push(cmd);
    },
    flash: (id) => {
      fw = firmwareById(id);
      const kb = 220 + Math.round(fw.code.length / 9);
      flashLog = [
        { at: 0.0, text: `Sketch "${fw.title}" compilado · ${kb} KB (${Math.round(kb / 13.1)}%) de flash` },
        { at: 0.02, text: 'esptool.py v4.8 · Serial port COM3' },
        { at: 0.05, text: 'Connecting....' },
        { at: 0.12, text: 'Chip is ESP32-D0WD-V3 (revision v3.1) · Features: WiFi, BT, Dual Core, 240MHz' },
        { at: 0.16, text: 'MAC: 08:3a:f2:6c:91:d4 · Uploading stub... Running stub...' },
        { at: 0.2, text: 'Changing baud rate to 921600' },
        { at: 0.24, text: 'Flash will be erased from 0x00001000 to 0x00057fff...' },
        ...[10, 25, 40, 55, 70, 85, 100].map((p, i) => ({ at: 0.3 + i * 0.1, text: `Writing at 0x000${(0x10000 + p * 0x700).toString(16)}... (${p} %)` })),
        { at: 0.99, text: 'Hash of data verified. Hard resetting via RTS pin...' },
      ];
      cmdQueue.length = 0;
      toneSeq = [];
      set({ board: 'flashing', flashProgress: 0, firmwareId: fw.id, act: { ...get().act, lcd: blankLcd(), buzzer: 0 } });
    },
    reset: () => {
      log('--- RESET (botão EN) ---', 'sys');
      toneSeq = [];
      bootLogAt = realClock;
      set({ board: 'booting', act: { ...get().act, lcd: blankLcd(), buzzer: 0 } });
    },
    serialSend: (text) => {
      log(`> ${text}`, 'in');
      const card = CARDS.find((c) => c.uid.replace(/ /g, '').toLowerCase() === text.replace(/ /g, '').toLowerCase());
      if (card) get().tapCard(card.uid);
      else if (text.trim() === 'reset') get().reset();
      else log('Comando serial não reconhecido. Use "reset" ou um UID RFID.', 'warn');
    },
    clearSerial: () => set({ serial: [] }),
  };
});
