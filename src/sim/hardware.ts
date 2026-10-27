import type { ModuleId, Note, SongId } from './types';

export interface ModuleInfo {
  id: ModuleId;
  name: string;
  part: string;
  pin: string;
  kind: 'Entrada digital' | 'Entrada analógica' | 'Saída digital' | 'Saída PWM' | 'Barramento I²C' | 'Protocolo 1-Wire' | 'Controladora' | 'Alimentação' | 'Mecânica';
  description: string;
  /** mesh name prefixes inside the GLB that belong to this module */
  meshes: string[];
  /** camera position / target in scene units (mm / 100) */
  view: { pos: [number, number, number]; target: [number, number, number] };
}

const v = (pos: [number, number, number], target: [number, number, number]) => ({ pos, target });

export const MODULES: ModuleInfo[] = [
  { id: 'esp32', name: 'Placa ESP32 PLUS', part: 'Keyestudio ESP32 PLUS (ESP32-WROOM-32)', pin: 'USB / DC', kind: 'Controladora', description: 'Microcontrolador dual-core 240 MHz com Wi-Fi e Bluetooth. Executa o firmware e lê/aciona todos os módulos.', meshes: ['ESP32PLUS_', 'Internal_Dupont'], view: v([1.6, 2.6, 1.9], [0, 0.2, -0.1]) },
  { id: 'led', name: 'LED amarelo', part: 'Módulo LED amarelo 5 mm', pin: 'IO12', kind: 'Saída PWM', description: 'Luz principal da casa. Aceita liga/desliga e brilho por PWM (ledc).', meshes: ['Yellow_LED'], view: v([0.25, 2.25, 1.35], [0.04, 1.38, 0.42]) },
  { id: 'rgb', name: 'LED RGB SK6812', part: 'Módulo 4× SK6812 (6812 RGB)', pin: 'IO26', kind: 'Protocolo 1-Wire', description: 'Quatro LEDs endereçáveis usados como luz ambiente. Cada LED recebe 24 bits de cor.', meshes: ['RGB6812_'], view: v([0.3, 1.5, 1.7], [-0.43, 0.76, -0.47]) },
  { id: 'btnL', name: 'Botão esquerdo', part: 'Módulo botão (pull-up)', pin: 'IO16', kind: 'Entrada digital', description: 'Nível LOW quando pressionado. No firmware completo insere ponto/traço da senha Morse.', meshes: ['Button_Left'], view: v([-0.4, 0.45, 1.75], [-0.4, 0.32, 0.75]) },
  { id: 'btnR', name: 'Botão direito', part: 'Módulo botão (pull-up)', pin: 'IO27', kind: 'Entrada digital', description: 'Nível LOW quando pressionado. Confirma a senha Morse e alterna modos nas lições.', meshes: ['Button_Right'], view: v([-0.2, 0.45, 1.75], [-0.25, 0.32, 0.75]) },
  { id: 'pir', name: 'Sensor PIR', part: 'Sensor de movimento piroelétrico', pin: 'IO14', kind: 'Entrada digital', description: 'Saída HIGH quando detecta radiação infravermelha em movimento (pessoas). Mantém o sinal por ~2 s.', meshes: ['PIR_'], view: v([-0.2, 1.0, 1.85], [-0.39, 0.8, 0.75]) },
  { id: 'buzzer', name: 'Buzzer passivo', part: 'Buzzer passivo (sem oscilador)', pin: 'IO25', kind: 'Saída PWM', description: 'Reproduz tons pela frequência do sinal PWM — músicas, campainha e sirene de alarme.', meshes: ['Buzzer_'], view: v([-0.8, 0.7, -1.9], [-0.5, 0.42, -0.8]) },
  { id: 'doorServo', name: 'Servo da porta', part: 'Micro servo SG90 180°', pin: 'IO13', kind: 'Saída PWM', description: 'Abre e fecha a porta. Pulso de 0,5–2,5 ms a 50 Hz define o ângulo.', meshes: ['Servo_Right_', 'Door_Leaf', 'Door_Knob'], view: v([2.1, 0.9, -0.2], [1.1, 0.65, -0.42]) },
  { id: 'windowServo', name: 'Servo da janela', part: 'Micro servo SG90 180°', pin: 'IO5', kind: 'Saída PWM', description: 'Movimenta a janela. Fecha automaticamente quando o sensor de vapor detecta chuva.', meshes: ['Servo_Window_'], view: v([-2.1, 0.9, 0.2], [-1.1, 0.6, -0.3]) },
  { id: 'fan', name: 'Ventilador', part: 'Motor DC 130 + driver (INA/INB)', pin: 'IO19 / IO18', kind: 'Saída PWM', description: 'Ventilação da casa. Velocidade e sentido por PWM nos pinos INA/INB.', meshes: ['Fan_'], view: v([1.5, 2.6, 1.3], [0.73, 1.8, 0.2]) },
  { id: 'lcd', name: 'Display LCD 1602', part: 'LCD 16×2 com backpack I²C (0x27)', pin: 'SDA IO21 · SCL IO22', kind: 'Barramento I²C', description: 'Mostra mensagens do sistema: clima, alertas, senha e boas-vindas.', meshes: ['LCD1602_'], view: v([0.3, 0.85, 1.75], [0.26, 0.76, 0.74]) },
  { id: 'dht', name: 'Sensor DHT11', part: 'Temperatura e umidade DHT11', pin: 'IO17', kind: 'Protocolo 1-Wire', description: 'Mede temperatura (0–50 °C, ±2 °C) e umidade (20–90 %, ±5 %) com leitura a cada 1 s.', meshes: ['DHT11_'], view: v([0.75, 2.2, 1.3], [0.46, 1.4, 0.4]) },
  { id: 'steam', name: 'Sensor de vapor', part: 'Sensor de vapor / gotas de água', pin: 'IO34 (ADC)', kind: 'Entrada analógica', description: 'Valor analógico sobe conforme a área coberta por água — usado para detectar chuva.', meshes: ['Steam_'], view: v([-0.35, 2.2, 1.3], [-0.36, 1.38, 0.42]) },
  { id: 'gas', name: 'Sensor de gás MQ-2', part: 'Sensor de gás analógico MQ-2', pin: 'IO23 (DO)', kind: 'Entrada digital', description: 'Detecta GLP, metano e fumaça. A saída digital vai a LOW acima do limiar do potenciômetro.', meshes: ['Gas_'], view: v([-0.1, 0.7, -1.95], [-0.18, 0.42, -0.85]) },
  { id: 'rfid', name: 'Leitor RFID', part: 'RFID RC522 13,56 MHz (I²C 0x28)', pin: 'SDA IO21 · SCL IO22', kind: 'Barramento I²C', description: 'Lê o UID do cartão branco e do chaveiro azul para controlar o acesso à porta.', meshes: ['RFID_', 'Front_RFID'], view: v([-0.55, 1.0, 1.75], [-0.71, 0.8, 0.74]) },
  { id: 'battery', name: 'Suporte 6×AA', part: 'Suporte de pilhas 6×AA (9 V)', pin: 'DC jack', kind: 'Alimentação', description: 'Alimenta servos e motor sem depender do USB. Pilhas não inclusas.', meshes: ['Battery_'], view: v([0.9, 0.8, -1.9], [0.46, 0.51, -0.75]) },
  { id: 'door', name: 'Porta', part: 'Porta de madeira articulada', pin: '—', kind: 'Mecânica', description: 'Acionada pelo servo da porta através do braço plástico.', meshes: ['Door_'], view: v([0.8, 0.5, 1.6], [0.5, 0.25, 0.6]) },
];

export const moduleById = Object.fromEntries(MODULES.map((m) => [m.id, m])) as Record<ModuleId, ModuleInfo>;

export function moduleForMesh(name: string): ModuleId | null {
  for (const m of MODULES) if (m.meshes.some((p) => name.startsWith(p))) return m.id;
  return null;
}

export const INTERIOR_MODULES: ModuleId[] = ['esp32', 'rgb'];

export const CARDS = [
  { uid: '4A 91 2F 7C', label: 'Cartão branco', color: '#f3f4f6', authorized: true },
  { uid: 'B3 05 E8 16', label: 'Chaveiro azul', color: '#2f6bff', authorized: true },
  { uid: 'DE AD 42 00', label: 'Cartão desconhecido', color: '#f04d5d', authorized: false },
] as const;

export const AUTHORIZED = new Set<string>(CARDS.filter((c) => c.authorized).map((c) => c.uid));

export const MORSE_PASSWORD = '.--.';

const N = { C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880 };

export const SONGS: Record<SongId, { label: string; notes: Note[] }> = {
  birthday: {
    label: 'Parabéns pra você',
    notes: [
      [N.G4, 260], [N.G4, 260], [N.A4, 520], [N.G4, 520], [N.C5, 520], [N.B4, 900],
      [N.G4, 260], [N.G4, 260], [N.A4, 520], [N.G4, 520], [N.D5, 520], [N.C5, 900],
      [N.G4, 260], [N.G4, 260], [N.G5, 520], [N.E5, 520], [N.C5, 520], [N.B4, 520], [N.A4, 900],
      [N.F5, 260], [N.F5, 260], [N.E5, 520], [N.C5, 520], [N.D5, 520], [N.C5, 1000],
    ],
  },
  ode: {
    label: 'Ode à alegria',
    notes: [
      [N.E4, 380], [N.E4, 380], [N.F4, 380], [N.G4, 380], [N.G4, 380], [N.F4, 380], [N.E4, 380], [N.D4, 380],
      [N.C4, 380], [N.C4, 380], [N.D4, 380], [N.E4, 380], [N.E4, 560], [N.D4, 190], [N.D4, 760],
      [N.E4, 380], [N.E4, 380], [N.F4, 380], [N.G4, 380], [N.G4, 380], [N.F4, 380], [N.E4, 380], [N.D4, 380],
      [N.C4, 380], [N.C4, 380], [N.D4, 380], [N.E4, 380], [N.D4, 560], [N.C4, 190], [N.C4, 760],
    ],
  },
  doorbell: { label: 'Campainha', notes: [[N.E5, 420], [N.C5, 650]] },
  siren: { label: 'Sirene', notes: [[880, 260], [1320, 260]] },
  ok: { label: 'Bipe OK', notes: [[N.A5, 90], [0, 50], [N.A5, 140]] },
  error: { label: 'Bipe erro', notes: [[220, 380]] },
};

export const MAX_RPM = 6200;
