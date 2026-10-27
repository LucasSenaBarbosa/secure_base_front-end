import { MAX_RPM } from './hardware';
import type { Actuators, Sensors } from './types';

export type NetGroup = 'power' | 'signal' | 'bus';

export interface NetRead {
  level: number;
  text: string;
}

export interface Net {
  id: string;
  title: string;
  pin: string;
  from: string;
  to: string;
  color: string;
  group: NetGroup;
  about: string;
  read: (s: Sensors, a: Actuators) => NetRead;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const rgbLevel = (colors: string[]) => {
  let max = 0;
  for (const hex of colors) {
    const n = Number.parseInt(hex.slice(1), 16);
    if (Number.isNaN(n)) continue;
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    max = Math.max(max, (r + g + b) / (255 * 3));
  }
  return clamp01(max);
};

export const NETS: Net[] = [
  {
    id: 'v5',
    title: 'Alimentação 5 V',
    pin: '5V · VIN · pilhas',
    from: 'Pino 5V do ESP32 e suporte 6×AA',
    to: 'Trilhos vermelhos e VCC dos módulos',
    color: '#c62a30',
    group: 'power',
    about: 'O USB e as pilhas entram pelo 5V/VIN. Os dois trilhos vermelhos estão ligados entre si e alimentam LED, botões, PIR, buzzer, vapor, gás, LCD, RFID, servos e o ventilador. Servo e motor puxam corrente daqui — não do regulador de 3,3 V.',
    read: () => ({ level: 0.72, text: '5 V estável' }),
  },
  {
    id: 'v3',
    title: 'Alimentação 3,3 V',
    pin: '3V3',
    from: 'Regulador do ESP32',
    to: 'VCC do DHT11',
    color: '#ff9c7a',
    group: 'power',
    about: 'O DHT11 desta montagem sai do pino 3V3, no mesmo nível lógico do ESP32. O restante dos módulos fica no trilho de 5 V, como no shield do kit.',
    read: () => ({ level: 0.6, text: '3,3 V no DHT11' }),
  },
  {
    id: 'gnd',
    title: 'Terra comum',
    pin: 'GND',
    from: 'GND do ESP32 e negativo da bateria',
    to: 'Trilhos azuis e GND de cada módulo',
    color: '#2a2e36',
    group: 'power',
    about: 'Placa, pilhas, sensores e atuadores compartilham o mesmo retorno. Sem esse fio a corrente não fecha e nenhum sinal chega.',
    read: () => ({ level: 0.34, text: 'referência 0 V' }),
  },
  {
    id: 'led',
    title: 'LED amarelo',
    pin: 'IO12 · PWM',
    from: 'GPIO12',
    to: 'Pino de sinal do LED',
    color: '#f5d030',
    group: 'signal',
    about: 'Saída PWM. O firmware escreve de 0 a 255: zero apaga o lustre da casa e 255 deixa o ciclo de trabalho em 100%.',
    read: (_s, a) => ({
      level: clamp01(a.led / 255),
      text: a.led > 8 ? `PWM ${Math.round(a.led)}` : 'apagado',
    }),
  },
  {
    id: 'rgb',
    title: 'Fita SK6812',
    pin: 'IO26 · dados',
    from: 'GPIO26',
    to: 'DIN do módulo 4× SK6812',
    color: '#b084fc',
    group: 'signal',
    about: 'Um único fio carrega 24 bits por LED, na ordem verde, vermelho e azul. O firmware reescreve os quatro LEDs a cada quadro: arco-íris, cor fixa ou alarme.',
    read: (_s, a) => {
      const level = rgbLevel(a.rgb);
      return { level, text: level > 0.04 ? 'quadro de cor' : 'apagada' };
    },
  },
  {
    id: 'btnL',
    title: 'Botão esquerdo',
    pin: 'IO16 · pull-up',
    from: 'GPIO16',
    to: 'Botão esquerdo',
    color: '#60a5fa',
    group: 'signal',
    about: 'Entrada com pull-up. Em repouso o fio fica em HIGH. O clique liga o pino no GND e a leitura cai para LOW. Na casa, toque curto é ponto e toque longo é traço da senha Morse.',
    read: (s) => (s.btnL ? { level: 1, text: 'LOW · pressionado' } : { level: 0.14, text: 'HIGH · repouso' }),
  },
  {
    id: 'btnR',
    title: 'Botão direito',
    pin: 'IO27 · pull-up',
    from: 'GPIO27',
    to: 'Botão direito',
    color: '#38bdf8',
    group: 'signal',
    about: 'Mesmo circuito do botão esquerdo, noutro pino. No firmware completo ele confirma a senha Morse e, nas lições, troca o modo.',
    read: (s) => (s.btnR ? { level: 1, text: 'LOW · pressionado' } : { level: 0.14, text: 'HIGH · repouso' }),
  },
  {
    id: 'dht',
    title: 'DHT11',
    pin: 'IO17 · 1-Wire',
    from: 'GPIO17',
    to: 'Dados do DHT11',
    color: '#22d3ee',
    group: 'signal',
    about: 'Protocolo de um fio. O ESP32 pede a leitura e o sensor devolve 40 bits: umidade, temperatura e checksum. O simulador atualiza o valor uma vez por segundo.',
    read: (s) => ({ level: 0.55, text: `${s.dhtT} °C · ${s.dhtH}%` }),
  },
  {
    id: 'steam',
    title: 'Sensor de vapor',
    pin: 'IO34 · ADC1',
    from: 'GPIO34',
    to: 'Saída analógica do sensor',
    color: '#7dd3fc',
    group: 'signal',
    about: 'IO34 só serve de entrada analógica, de 0 a 3,3 V, em 12 bits. Quanto mais água na trilha, maior o número. O firmware lê isso como chuva e fecha a janela.',
    read: (s) => ({ level: clamp01(s.steamAdc / 4095), text: `ADC ${s.steamAdc}` }),
  },
  {
    id: 'gas',
    title: 'MQ-2 digital',
    pin: 'IO23 · DO',
    from: 'GPIO23',
    to: 'DO do sensor de gás',
    color: '#f43f5e',
    group: 'signal',
    about: 'O comparador do módulo usa o potenciômetro como limiar. Acima dele, DO vai a LOW. O firmware trata esse LOW como vazamento: buzzer e ventilador entram juntos. O pino AO do módulo fica sem fio — o kit usa a saída digital.',
    read: (s) => (s.gasDetected ? { level: 1, text: 'LOW · gás' } : { level: 0.14, text: 'HIGH · ar limpo' }),
  },
  {
    id: 'sda',
    title: 'I²C dados',
    pin: 'IO21 · SDA',
    from: 'GPIO21',
    to: 'SDA do LCD 0x27 e do RC522 0x28',
    color: '#4ade80',
    group: 'bus',
    about: 'LCD e RFID dividem este fio. Cada chip só responde ao próprio endereço: o display em 0x27 e o leitor em 0x28. Os bytes do texto e o UID do cartão passam por aqui.',
    read: (s, a) => ({
      level: s.rfid ? 1 : a.backlight ? 0.42 : 0.18,
      text: s.rfid ? 'UID na linha' : 'repouso',
    }),
  },
  {
    id: 'scl',
    title: 'I²C clock',
    pin: 'IO22 · SCL',
    from: 'GPIO22',
    to: 'SCL do LCD e do RC522',
    color: '#a78bfa',
    group: 'bus',
    about: 'Relógio do barramento, gerado pelo ESP32. Cada borda marca um bit em SDA. Sem este fio o display e o leitor ficam mudos, mesmo com a alimentação ligada.',
    read: (s, a) => ({
      level: s.rfid ? 1 : a.backlight ? 0.42 : 0.18,
      text: s.rfid ? 'clock no cartão' : 'repouso',
    }),
  },
  {
    id: 'pir',
    title: 'Sensor PIR',
    pin: 'IO14',
    from: 'GPIO14',
    to: 'OUT do PIR',
    color: '#fb7185',
    group: 'signal',
    about: 'A saída fica HIGH enquanto o sensor vê infravermelho em movimento. O simulador segura o pulso por cerca de 2 s, no mesmo ritmo do tempo de bloqueio de um PIR real.',
    read: (s) => (s.pir ? { level: 1, text: 'HIGH · presença' } : { level: 0.1, text: 'LOW · vazio' }),
  },
  {
    id: 'buzzer',
    title: 'Buzzer passivo',
    pin: 'IO25 · PWM',
    from: 'GPIO25',
    to: 'Buzzer passivo',
    color: '#a3e635',
    group: 'signal',
    about: 'Este buzzer não oscila sozinho. A frequência do PWM é a nota: tone() no firmware faz o pino vibrar nessa frequência — campainha, sirene ou música.',
    read: (_s, a) => (a.buzzer > 0 ? { level: 0.9, text: `${Math.round(a.buzzer)} Hz` } : { level: 0.08, text: 'mudo' }),
  },
  {
    id: 'door',
    title: 'Servo da porta',
    pin: 'IO13 · 50 Hz',
    from: 'GPIO13',
    to: 'Fio de sinal do SG90',
    color: '#fb923c',
    group: 'signal',
    about: 'O pulso dura de 0,5 a 2,5 ms e se repete a cada 20 ms. Essa largura escolhe o ângulo. Vermelho e marrom do servo vão no 5 V e no GND: o motor não pode ser alimentado pelos 3,3 V.',
    read: (_s, a) => ({ level: clamp01(a.doorPos / 180), text: `${Math.round(a.doorPos)}°` }),
  },
  {
    id: 'window',
    title: 'Servo da janela',
    pin: 'IO5 · 50 Hz',
    from: 'GPIO5',
    to: 'Fio de sinal do SG90',
    color: '#2dd4bf',
    group: 'signal',
    about: 'O mesmo pulso de servo da porta, noutro pino. Com chuva no sensor de vapor, o firmware manda este sinal fechar a janela.',
    read: (_s, a) => ({ level: clamp01(a.windowPos / 180), text: `${Math.round(a.windowPos)}°` }),
  },
  {
    id: 'fanA',
    title: 'Ventilador INA',
    pin: 'IO19 · PWM',
    from: 'GPIO19',
    to: 'INA do driver do motor',
    color: '#f472b6',
    group: 'signal',
    about: 'O motor DC gira conforme o PWM neste pino e em INB. Um sentido sopra para fora; o outro inverte. A alimentação do motor sai do trilho de 5 V, não do GPIO.',
    read: (_s, a) => ({
      level: clamp01(Math.abs(a.fanRpm) / MAX_RPM),
      text: a.fanPwm === 0 ? 'parado' : a.fanPwm > 0 ? 'soprando' : 'reverso',
    }),
  },
  {
    id: 'fanB',
    title: 'Ventilador INB',
    pin: 'IO18 · PWM',
    from: 'GPIO18',
    to: 'INB do driver do motor',
    color: '#818cf8',
    group: 'signal',
    about: 'Segundo canal do driver. Junto com INA ele define sentido e velocidade. O rotor do simulador tem inércia e só estabiliza perto de 6200 rpm com PWM alto.',
    read: (_s, a) => ({
      level: clamp01(Math.abs(a.fanRpm) / MAX_RPM),
      text: `${Math.round(Math.abs(a.fanRpm))} rpm`,
    }),
  },
];

export const NET_BY_ID = Object.fromEntries(NETS.map((net) => [net.id, net])) as Record<string, Net>;

/** Malha Mod_<id> da protoboard → fio que o clique deve destacar. */
export const MODULE_NET: Record<string, string> = {
  led: 'led',
  rgb: 'rgb',
  btnL: 'btnL',
  btnR: 'btnR',
  dht: 'dht',
  steam: 'steam',
  gas: 'gas',
  lcd: 'sda',
  rfid: 'sda',
  pir: 'pir',
  buzzer: 'buzzer',
  door: 'door',
  window: 'window',
  fan: 'fanA',
  battery: 'v5',
  esp32: 'v3',
};

export function netFocus(id: string): string[] {
  if (id === 'sda' || id === 'scl') return ['sda', 'scl'];
  if (id === 'fanA' || id === 'fanB') return ['fanA', 'fanB'];
  return [id];
}

export function netLevel(id: string, sensors: Sensors, act: Actuators): number {
  return NET_BY_ID[id]?.read(sensors, act).level ?? 0;
}
