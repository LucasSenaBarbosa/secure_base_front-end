export type ModuleId =
  | 'esp32' | 'led' | 'rgb' | 'btnL' | 'btnR' | 'pir' | 'buzzer' | 'doorServo' | 'windowServo'
  | 'fan' | 'lcd' | 'dht' | 'steam' | 'gas' | 'rfid' | 'battery' | 'door';

export type RgbMode = 'off' | 'static' | 'rainbow' | 'breath' | 'chase' | 'alarm';

export type PersonMode = 'none' | 'walk' | 'stay';

export interface Env {
  outdoorTemp: number;
  outdoorHumidity: number;
  rain: number;
  gasLeak: number;
  personMode: PersonMode;
  /** 0..1 progress of the walking figure, null when nobody is around */
  personT: number | null;
  heater: boolean;
  night: boolean;
  speed: number;
}

export interface Sensors {
  temp: number;
  humidity: number;
  dhtT: number;
  dhtH: number;
  gasPpm: number;
  gasAdc: number;
  /** MQ-2 module digital output is active-low: true here means DO pulled LOW (gas detected) */
  gasDetected: boolean;
  gasThreshold: number;
  steamWater: number;
  steamAdc: number;
  pir: boolean;
  btnL: boolean;
  btnR: boolean;
  rfid: string | null;
}

export interface Actuators {
  led: number;
  rgb: [string, string, string, string];
  fanPwm: number;
  fanRpm: number;
  door: number;
  doorPos: number;
  window: number;
  windowPos: number;
  buzzer: number;
  lcd: [string, string];
  backlight: boolean;
}

export interface Settings {
  autoLight: boolean;
  autoFan: boolean;
  fanTemp: number;
  autoWindow: boolean;
  gasAlarm: boolean;
  rfidAccess: boolean;
  morseAccess: boolean;
  rgbMode: RgbMode;
  rgbColor: string;
  volume: number;
  muted: boolean;
  rainNotify: boolean;
}

export type Cmd =
  | { type: 'led'; on: boolean }
  | { type: 'fan'; speed: number }
  | { type: 'door'; open: boolean }
  | { type: 'window'; open: boolean }
  | { type: 'rgb'; mode: RgbMode; color?: string }
  | { type: 'music'; song: SongId }
  | { type: 'silence' }
  | { type: 'lcd'; text: string };

export type SongId = 'birthday' | 'ode' | 'doorbell' | 'siren' | 'ok' | 'error';

export type Note = [freq: number, ms: number];

export interface SerialLine {
  id: number;
  t: number;
  text: string;
  kind: 'out' | 'sys' | 'warn' | 'err' | 'in';
}

export interface Sample {
  temp: number;
  hum: number;
  gas: number;
  steam: number;
  rpm: number;
}

export type BoardState = 'running' | 'flashing' | 'booting';

export interface TapEvent {
  uid: string;
  nonce: number;
}

export interface FirmwareEvents {
  pressL: boolean;
  pressR: boolean;
  /** hold duration in ms when the button was released this tick */
  releaseL: number | null;
  releaseR: number | null;
  card: string | null;
  pirRise: boolean;
  cmds: Cmd[];
}

export interface FirmwareCtx {
  t: number;
  dt: number;
  s: Readonly<Sensors>;
  a: Actuators;
  settings: Settings;
  ev: FirmwareEvents;
  mem: Record<string, any>;
  print(text: string): void;
  tone(seq: Note[], loop?: boolean): void;
  noTone(): void;
  toneBusy: boolean;
  lcd(l0: string, l1?: string): void;
  every(key: string, ms: number): boolean;
}

export interface Firmware {
  id: string;
  index: string;
  title: string;
  summary: string;
  modules: ModuleId[];
  pins: string[];
  tryIt: string[];
  code: string;
  setup(ctx: FirmwareCtx): void;
  loop(ctx: FirmwareCtx): void;
}
