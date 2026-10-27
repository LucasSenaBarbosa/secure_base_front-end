import { AUTHORIZED, MORSE_PASSWORD, SONGS } from './hardware';
import type { Firmware, RgbMode } from './types';

const OPEN = 180;
const CLOSED = 0;

export const pad16 = (s: string) => (s + ' '.repeat(16)).slice(0, 16);

function hsv(h: number, s = 1, v = 1) {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const c = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${c(f(5))}${c(f(3))}${c(f(1))}`;
}

function scale(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (x: number) => Math.round(Math.max(0, Math.min(255, x * k))).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

export function rgbFrame(mode: RgbMode, color: string, t: number): [string, string, string, string] {
  const off = '#000000';
  switch (mode) {
    case 'off':
      return [off, off, off, off];
    case 'static':
      return [color, color, color, color];
    case 'rainbow':
      return [0, 1, 2, 3].map((i) => hsv(((t / 4000) + i / 4) % 1)) as [string, string, string, string];
    case 'breath': {
      const k = 0.08 + 0.92 * (0.5 - 0.5 * Math.cos((t / 2600) * Math.PI * 2));
      const c = scale(color, k);
      return [c, c, c, c];
    }
    case 'chase': {
      const i = Math.floor(t / 180) % 4;
      return [0, 1, 2, 3].map((j) => (j === i ? color : scale(color, 0.08))) as [string, string, string, string];
    }
    case 'alarm': {
      const on = Math.floor(t / 250) % 2 === 0;
      const c = on ? '#ff1a1a' : '#200000';
      return [c, on ? '#200000' : '#ff1a1a', c, on ? '#200000' : '#ff1a1a'];
    }
  }
}

function morseSymbol(ms: number) {
  return ms < 320 ? '.' : '-';
}

const smartHome: Firmware = {
  id: 'smart-home',
  index: '00',
  title: 'Smart Home Wi-Fi (firmware completo)',
  summary: 'Integra todos os módulos: controle pelo app via Wi-Fi, alarme de gás, janela automática na chuva, luz por presença, ventilação por temperatura, acesso por RFID e senha Morse.',
  modules: ['esp32', 'led', 'rgb', 'btnL', 'btnR', 'pir', 'buzzer', 'doorServo', 'windowServo', 'fan', 'lcd', 'dht', 'steam', 'gas', 'rfid'],
  pins: ['IO12 LED', 'IO26 RGB', 'IO16/IO27 Botões', 'IO14 PIR', 'IO25 Buzzer', 'IO13 Porta', 'IO5 Janela', 'IO19/IO18 Ventilador', 'IO21/IO22 I²C', 'IO17 DHT11', 'IO34 Vapor', 'IO23 Gás'],
  tryIt: [
    'Use o painel "App Wi-Fi" para ligar luzes, ventilador, porta e janela.',
    'Abra a válvula de gás em "Ambiente" e acompanhe o alarme.',
    'Ligue a chuva: a janela fecha sozinha quando o sensor de vapor molha.',
    'Aproxime o cartão branco ou o chaveiro azul do leitor RFID.',
    `Digite a senha Morse ${MORSE_PASSWORD} no botão esquerdo e confirme no direito.`,
  ],
  code: `#include <WiFi.h>
#include <WebServer.h>
#include <ESP32Servo.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_NeoPixel.h>
#include <MFRC522_I2C.h>
#include "xht11.h"

#define LED 12
#define BTN_L 16
#define BTN_R 27
#define PIR 14
#define BUZZER 25
#define FAN_A 19
#define FAN_B 18
#define STEAM 34
#define GAS 23

LiquidCrystal_I2C lcd(0x27, 16, 2);
MFRC522 rfid(0x28);
Adafruit_NeoPixel rgb(4, 26, NEO_GRB + NEO_KHZ800);
Servo door, window;
xht11 dht(17);
WebServer server(80);

String morse = "";
const String PASSWORD = "${MORSE_PASSWORD}";

void setup() {
  Serial.begin(115200);
  WiFi.softAP("Keyestudio-SmartHome");
  server.on("/cmd", handleAppCommand);
  server.begin();
  door.attach(13);  window.attach(5);
  lcd.init();  lcd.backlight();
  rgb.begin();  rfid.PCD_Init();
  pinMode(GAS, INPUT);  pinMode(PIR, INPUT);
  pinMode(BTN_L, INPUT); pinMode(BTN_R, INPUT);
}

void loop() {
  server.handleClient();

  if (digitalRead(GAS) == LOW) {          // MQ-2 ativo em LOW
    sirenOn();  fan(255);  window.write(180);
    lcdPrint("!! PERIGO GAS !!", "Ventilando...");
  }
  if (analogRead(STEAM) > 1600) window.write(0);   // chuva
  if (digitalRead(PIR)) lightFor(5000);
  if (dht.temperature() >= fanTemp) fan(200);

  if (rfid.PICC_IsNewCardPresent() && isAuthorized(rfid.uid))
    openDoorFor(4000);

  readMorse();   // BTN_L: ponto/traço · BTN_R: confirma
  if (morseConfirmed && morse == PASSWORD) openDoorFor(4000);

  showClimate();  // T:24C H:58% / Gas:OK Chuva:Nao
}`,
  setup(c) {
    c.print('Keyestudio Smart Home v2.1 — ESP32');
    c.print('Wi-Fi AP "Keyestudio-SmartHome" ativo · IP 192.168.4.1');
    c.print('LCD 0x27 OK · RFID 0x28 OK · SK6812 x4 OK');
    Object.assign(c.mem, { ledOn: false, appFan: 0, doorOpen: false, windowOpen: true, doorUntil: 0, lightUntil: 0, alarm: false, raining: false, autoFanOn: false, morse: '', msg: null, msgUntil: 0, bootUntil: c.t + 2200 });
    c.lcd('hello', 'keyestudio');
  },
  loop(c) {
    const { mem, s, a, settings, t, ev } = c;
    const flash = (l0: string, l1: string, ms = 3500) => {
      mem.msg = [l0, l1];
      mem.msgUntil = t + ms;
    };

    for (const cmd of ev.cmds) {
      switch (cmd.type) {
        case 'led': mem.ledOn = cmd.on; c.print(`[WiFi] LED ${cmd.on ? 'ON' : 'OFF'}`); break;
        case 'fan': mem.appFan = cmd.speed; c.print(`[WiFi] Ventilador PWM=${cmd.speed}`); break;
        case 'door': mem.doorOpen = cmd.open; mem.doorUntil = 0; c.print(`[WiFi] Porta ${cmd.open ? 'aberta' : 'fechada'}`); break;
        case 'window': mem.windowOpen = cmd.open; c.print(`[WiFi] Janela ${cmd.open ? 'aberta' : 'fechada'}`); break;
        case 'rgb': c.print(`[WiFi] RGB modo=${cmd.mode}${cmd.color ? ' cor=' + cmd.color : ''}`); break;
        case 'music': c.tone(SONGS[cmd.song].notes); c.print(`[WiFi] Tocando: ${SONGS[cmd.song].label}`); break;
        case 'silence': c.noTone(); c.print('[WiFi] Buzzer silenciado'); break;
        case 'lcd': flash(cmd.text.slice(0, 16), cmd.text.slice(16, 32), 6000); c.print(`[WiFi] LCD: "${cmd.text}"`); break;
      }
    }

    const gas = settings.gasAlarm && s.gasDetected;
    if (gas && !mem.alarm) {
      mem.alarm = true;
      c.print(`ALERTA: gás detectado! ADC=${s.gasAdc}`);
      c.tone(SONGS.siren.notes, true);
    } else if (!gas && mem.alarm) {
      mem.alarm = false;
      c.noTone();
      c.print('Gás dissipado — sistema normal');
    }

    const wasRaining = mem.raining;
    mem.raining = s.steamAdc > (wasRaining ? 1200 : 1600);
    if (mem.raining && !wasRaining) {
      c.print(`Chuva detectada (vapor=${s.steamAdc})`);
      if (settings.autoWindow) {
        mem.windowOpen = false;
        c.print('→ Fechando janela automaticamente');
        flash('Chovendo!', 'Janela fechada');
      }
    } else if (!mem.raining && wasRaining) {
      c.print('Sensor de vapor seco — chuva parou');
    }

    if (ev.pirRise) c.print('PIR: movimento detectado');
    if (settings.autoLight && s.pir) mem.lightUntil = t + 5000;

    const hot = s.dhtT >= settings.fanTemp;
    const cool = s.dhtT <= settings.fanTemp - 1;
    if (settings.autoFan && hot && !mem.autoFanOn) {
      mem.autoFanOn = true;
      c.print(`Temperatura ${s.dhtT}°C ≥ ${settings.fanTemp}°C → ventilador automático`);
    } else if ((!settings.autoFan || cool) && mem.autoFanOn) {
      mem.autoFanOn = false;
      c.print('Temperatura normalizada → ventilador automático desligado');
    }

    if (ev.card) {
      c.print(`RFID UID: ${ev.card}`);
      if (!settings.rfidAccess) {
        c.print('Acesso por RFID desabilitado no app');
      } else if (AUTHORIZED.has(ev.card)) {
        mem.doorUntil = t + 4000;
        c.tone(SONGS.ok.notes);
        c.print('Cartão autorizado → porta aberta por 4 s');
        flash('Bem-vindo!', ev.card);
      } else {
        c.tone(SONGS.error.notes);
        c.print('Cartão NÃO autorizado');
        flash('Acesso negado', ev.card);
      }
    }

    if (ev.releaseL !== null) {
      mem.morse = (mem.morse + morseSymbol(ev.releaseL)).slice(-8);
      c.tone([[1800, 45]]);
      c.print(`Morse: ${mem.morse}`);
    }
    if (ev.releaseR !== null) {
      if (!mem.morse) {
        c.tone(SONGS.doorbell.notes);
        c.print('Campainha tocada');
        flash('Ding-dong!', 'Visita na porta');
      } else if (settings.morseAccess && mem.morse === MORSE_PASSWORD) {
        mem.doorUntil = t + 4000;
        c.tone(SONGS.ok.notes);
        c.print('Senha Morse correta → porta aberta');
        flash('Senha correta', 'Porta aberta');
      } else {
        c.tone(SONGS.error.notes);
        c.print(`Senha Morse incorreta (${mem.morse})`);
        flash('Senha errada', mem.morse);
      }
      mem.morse = '';
    }

    a.led = mem.ledOn || t < mem.lightUntil ? 255 : 0;
    a.fanPwm = mem.alarm ? 255 : Math.max(mem.appFan, mem.autoFanOn ? 200 : 0);
    a.door = mem.doorOpen || t < mem.doorUntil ? OPEN : CLOSED;
    a.window = mem.alarm || mem.windowOpen ? OPEN : CLOSED;
    a.rgb = mem.alarm ? rgbFrame('alarm', '#ff0000', t) : rgbFrame(settings.rgbMode, settings.rgbColor, t);

    if (t < mem.bootUntil) return;
    if (mem.alarm) c.lcd(Math.floor(t / 500) % 2 ? '!! PERIGO GAS !!' : '', 'Ventilando...');
    else if (mem.msg && t < mem.msgUntil) c.lcd(mem.msg[0], mem.msg[1]);
    else if (mem.morse) c.lcd('Senha Morse:', mem.morse);
    else c.lcd(`T:${s.dhtT}C  H:${s.dhtH}%`, `Gas:OK Chuva:${mem.raining ? 'Sim' : 'Nao'}`);
  },
};

const blink: Firmware = {
  id: 'blink', index: '01', title: 'LED piscante', summary: 'Primeiro contato com saídas digitais: o LED amarelo liga e desliga a cada segundo.',
  modules: ['led'], pins: ['IO12 LED'], tryIt: ['Observe o LED amarelo no telhado e o monitor serial.'],
  code: `#define LED_PIN 12

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  Serial.println("LED ON");
  delay(1000);
  digitalWrite(LED_PIN, LOW);
  Serial.println("LED OFF");
  delay(1000);
}`,
  setup(c) { c.mem.on = false; },
  loop(c) {
    if (c.every('blink', 1000)) {
      c.mem.on = !c.mem.on;
      c.print(c.mem.on ? 'LED ON' : 'LED OFF');
    }
    c.a.led = c.mem.on ? 255 : 0;
  },
};

const breathing: Firmware = {
  id: 'breathing', index: '02', title: 'LED respiração (PWM)', summary: 'Usa o periférico LEDC do ESP32 para variar o ciclo de trabalho e criar um efeito de respiração suave.',
  modules: ['led'], pins: ['IO12 LED (LEDC canal 0, 5 kHz, 8 bits)'], tryIt: ['Veja o brilho variar e o duty cycle no monitor GPIO.'],
  code: `#define LED_PIN 12

void setup() {
  Serial.begin(115200);
  ledcAttach(LED_PIN, 5000, 8);   // 5 kHz, 8 bits
}

void loop() {
  for (int duty = 0; duty <= 255; duty++) {
    ledcWrite(LED_PIN, duty);
    delay(4);
  }
  for (int duty = 255; duty >= 0; duty--) {
    ledcWrite(LED_PIN, duty);
    delay(4);
  }
}`,
  setup() {},
  loop(c) {
    const phase = (c.t % 2000) / 2000;
    c.a.led = Math.round(255 * (phase < 0.5 ? phase * 2 : 2 - phase * 2));
    if (c.every('duty', 1000)) c.print(`duty=${c.a.led}`);
  },
};

const lamp: Firmware = {
  id: 'lamp', index: '03', title: 'Botões e luminária', summary: 'Leitura de entradas digitais com detecção de borda: cada toque no botão esquerdo alterna o LED.',
  modules: ['btnL', 'btnR', 'led'], pins: ['IO16 Botão esquerdo', 'IO27 Botão direito', 'IO12 LED'], tryIt: ['Clique no botão amarelo esquerdo na casa 3D ou use o painel "Interação".', 'O botão direito apenas informa seu estado no serial.'],
  code: `#define BTN_L 16
#define BTN_R 27
#define LED 12
bool ledOn = false;

void setup() {
  Serial.begin(115200);
  pinMode(BTN_L, INPUT);
  pinMode(BTN_R, INPUT);
  pinMode(LED, OUTPUT);
}

void loop() {
  if (digitalRead(BTN_L) == LOW) {
    delay(10);                       // debounce
    while (digitalRead(BTN_L) == LOW);
    ledOn = !ledOn;
    digitalWrite(LED, ledOn);
    Serial.println(ledOn ? "Luz ligada" : "Luz desligada");
  }
  if (digitalRead(BTN_R) == LOW) Serial.println("Botao direito");
}`,
  setup(c) { c.mem.on = false; },
  loop(c) {
    if (c.ev.releaseL !== null) {
      c.mem.on = !c.mem.on;
      c.print(c.mem.on ? 'Luz ligada' : 'Luz desligada');
    }
    if (c.ev.pressR) c.print('Botao direito');
    c.a.led = c.mem.on ? 255 : 0;
  },
};

const pirLight: Firmware = {
  id: 'pir', index: '04', title: 'Luz por presença (PIR)', summary: 'O sensor PIR detecta movimento e acende o LED enquanto houver alguém em frente à casa.',
  modules: ['pir', 'led'], pins: ['IO14 PIR', 'IO12 LED'], tryIt: ['Em "Ambiente", clique em "Simular visitante" e veja a figura passar pelo sensor.'],
  code: `#define PIR 14
#define LED 12

void setup() {
  Serial.begin(115200);
  pinMode(PIR, INPUT);
  pinMode(LED, OUTPUT);
}

void loop() {
  bool motion = digitalRead(PIR);
  digitalWrite(LED, motion);
  if (motion) Serial.println("Alguem chegou!");
  delay(200);
}`,
  setup() {},
  loop(c) {
    c.a.led = c.s.pir ? 255 : 0;
    if (c.s.pir && c.every('pir', 600)) c.print('Alguem chegou!');
  },
};

const music: Firmware = {
  id: 'music', index: '05', title: 'Buzzer musical', summary: 'Gera notas musicais com a função tone() variando a frequência do buzzer passivo.',
  modules: ['buzzer', 'btnL', 'btnR'], pins: ['IO25 Buzzer', 'IO16/IO27 Botões'], tryIt: ['Botão esquerdo: "Parabéns pra você".', 'Botão direito: "Ode à alegria".', 'Ative o som no topo da cena 3D.'],
  code: `#define BUZZER 25
#define BTN_L 16
#define BTN_R 27

int birthday[] = {392,392,440,392,523,494, 392,392,440,392,587,523};
int beats[]    = {  1,  1,  2,  2,  2,  4,   1,  1,  2,  2,  2,  4};

void play(int *melody, int *dur, int n) {
  for (int i = 0; i < n; i++) {
    tone(BUZZER, melody[i]);
    delay(dur[i] * 250);
    noTone(BUZZER);
    delay(30);
  }
}

void loop() {
  if (digitalRead(BTN_L) == LOW) play(birthday, beats, 12);
  if (digitalRead(BTN_R) == LOW) playOdeToJoy();
}`,
  setup(c) { c.print('Pressione um botao para tocar'); },
  loop(c) {
    if (c.ev.pressL && !c.toneBusy) { c.tone(SONGS.birthday.notes); c.print('Tocando: Parabens pra voce'); }
    if (c.ev.pressR && !c.toneBusy) { c.tone(SONGS.ode.notes); c.print('Tocando: Ode a alegria'); }
  },
};

const servos: Firmware = {
  id: 'servo', index: '06', title: 'Servos: porta e janela', summary: 'Controle de ângulo dos dois micro servos SG90 com a biblioteca ESP32Servo.',
  modules: ['doorServo', 'windowServo', 'btnL', 'btnR'], pins: ['IO13 Servo porta', 'IO5 Servo janela', 'IO16/IO27 Botões'], tryIt: ['Botão esquerdo abre/fecha a porta.', 'Botão direito abre/fecha a janela.'],
  code: `#include <ESP32Servo.h>
Servo door, window;
bool doorOpen = false, windowOpen = false;

void setup() {
  Serial.begin(115200);
  door.attach(13);
  window.attach(5);
}

void loop() {
  if (pressed(16)) {
    doorOpen = !doorOpen;
    door.write(doorOpen ? 180 : 0);
    Serial.printf("Porta: %d graus\\n", doorOpen ? 180 : 0);
  }
  if (pressed(27)) {
    windowOpen = !windowOpen;
    window.write(windowOpen ? 180 : 0);
  }
}`,
  setup(c) { c.mem.door = false; c.mem.win = false; },
  loop(c) {
    if (c.ev.pressL) { c.mem.door = !c.mem.door; c.print(`Porta: ${c.mem.door ? OPEN : CLOSED} graus`); }
    if (c.ev.pressR) { c.mem.win = !c.mem.win; c.print(`Janela: ${c.mem.win ? OPEN : CLOSED} graus`); }
    c.a.door = c.mem.door ? OPEN : CLOSED;
    c.a.window = c.mem.win ? OPEN : CLOSED;
  },
};

const FAN_STEPS = [0, 110, 180, 255];
const fan: Firmware = {
  id: 'fan', index: '07', title: 'Ventilador', summary: 'Driver de motor DC com dois pinos: PWM em INA define a velocidade e a inversão de INA/INB troca o sentido.',
  modules: ['fan', 'btnL', 'btnR'], pins: ['IO19 INA', 'IO18 INB', 'IO16/IO27 Botões'], tryIt: ['Botão esquerdo alterna as velocidades 0 → 110 → 180 → 255.', 'Botão direito inverte o sentido de rotação.'],
  code: `#define INA 19
#define INB 18
int steps[] = {0, 110, 180, 255};
int level = 0;  bool reverse = false;

void setup() {
  ledcAttach(INA, 1000, 8);
  ledcAttach(INB, 1000, 8);
}

void loop() {
  if (pressed(16)) level = (level + 1) % 4;
  if (pressed(27)) reverse = !reverse;
  ledcWrite(reverse ? INB : INA, steps[level]);
  ledcWrite(reverse ? INA : INB, 0);
}`,
  setup(c) { c.mem.level = 0; c.mem.rev = false; },
  loop(c) {
    if (c.ev.pressL) { c.mem.level = (c.mem.level + 1) % 4; c.print(`Velocidade PWM=${FAN_STEPS[c.mem.level]}`); }
    if (c.ev.pressR) { c.mem.rev = !c.mem.rev; c.print(`Sentido ${c.mem.rev ? 'reverso' : 'normal'}`); }
    c.a.fanPwm = FAN_STEPS[c.mem.level] * (c.mem.rev ? -1 : 1);
  },
};

const lcd: Firmware = {
  id: 'lcd', index: '08', title: 'Display LCD 1602', summary: 'Comunicação I²C com o backpack PCF8574 para escrever texto nas 2 linhas de 16 caracteres.',
  modules: ['lcd', 'btnR'], pins: ['IO21 SDA', 'IO22 SCL (endereço 0x27)'], tryIt: ['A segunda linha mostra o tempo desde o boot.', 'Botão direito liga/desliga a luz de fundo.'],
  code: `#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x27, 16, 2);
bool light = true;

void setup() {
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("hello");
}

void loop() {
  lcd.setCursor(0, 1);
  lcd.print("Uptime: ");
  lcd.print(millis() / 1000);
  lcd.print("s");
  if (pressed(27)) {
    light = !light;
    light ? lcd.backlight() : lcd.noBacklight();
  }
}`,
  setup(c) { c.mem.light = true; c.print('LCD 0x27 inicializado'); },
  loop(c) {
    if (c.ev.pressR) { c.mem.light = !c.mem.light; c.print(`Backlight ${c.mem.light ? 'ON' : 'OFF'}`); }
    c.a.backlight = c.mem.light;
    c.lcd('hello', `Uptime: ${Math.floor(c.t / 1000)}s`);
  },
};

const climate: Firmware = {
  id: 'dht', index: '09', title: 'Clima com DHT11', summary: 'Lê temperatura e umidade a cada segundo, mostra no LCD e liga o ventilador acima de 28 °C.',
  modules: ['dht', 'lcd', 'fan'], pins: ['IO17 DHT11', 'IO21/IO22 LCD', 'IO19/IO18 Ventilador'], tryIt: ['Em "Ambiente", aumente a temperatura externa e acelere o tempo.', 'Acima de 28 °C o ventilador liga e resfria a casa.'],
  code: `#include "xht11.h"
#include <LiquidCrystal_I2C.h>
xht11 dht(17);
LiquidCrystal_I2C lcd(0x27, 16, 2);
unsigned char data[4];

void loop() {
  if (dht.receive(data)) {
    int hum = data[0], temp = data[2];
    lcd.setCursor(0, 0); lcd.printf("Temp: %d C  ", temp);
    lcd.setCursor(0, 1); lcd.printf("Umid: %d %%  ", hum);
    Serial.printf("Temperatura: %dC  Umidade: %d%%\\n", temp, hum);
    ledcWrite(19, temp >= 28 ? 200 : 0);
  }
  delay(1000);
}`,
  setup() {},
  loop(c) {
    if (c.every('dht', 1000)) c.print(`Temperatura: ${c.s.dhtT}C  Umidade: ${c.s.dhtH}%`);
    c.lcd(`Temp: ${c.s.dhtT} C`, `Umid: ${c.s.dhtH} %`);
    c.a.fanPwm = c.s.dhtT >= 28 ? 200 : 0;
  },
};

const RGB_CYCLE: { mode: RgbMode; color: string; label: string }[] = [
  { mode: 'rainbow', color: '#ffffff', label: 'arco-iris' },
  { mode: 'static', color: '#ff2020', label: 'vermelho' },
  { mode: 'static', color: '#20ff40', label: 'verde' },
  { mode: 'static', color: '#2050ff', label: 'azul' },
  { mode: 'breath', color: '#b14dff', label: 'respiracao roxa' },
  { mode: 'chase', color: '#ffb020', label: 'perseguicao ambar' },
];
const rgb: Firmware = {
  id: 'rgb', index: '10', title: 'Luz ambiente RGB', summary: 'Controla os 4 LEDs SK6812 endereçáveis com Adafruit_NeoPixel — cores fixas, arco-íris, respiração e perseguição.',
  modules: ['rgb', 'btnL', 'btnR'], pins: ['IO26 SK6812 DIN'], tryIt: ['Botão esquerdo troca o efeito.', 'Botão direito apaga os LEDs.', 'Use o Raio-X para ver os LEDs dentro da casa.'],
  code: `#include <Adafruit_NeoPixel.h>
Adafruit_NeoPixel rgb(4, 26, NEO_GRB + NEO_KHZ800);
int mode = 0;

void rainbow(uint16_t t) {
  for (int i = 0; i < 4; i++)
    rgb.setPixelColor(i, rgb.ColorHSV(t * 16 + i * 16384));
  rgb.show();
}

void loop() {
  if (pressed(16)) mode = (mode + 1) % 6;
  if (pressed(27)) { rgb.clear(); rgb.show(); mode = -1; }
  switch (mode) {
    case 0: rainbow(millis()); break;
    case 1: rgb.fill(rgb.Color(255, 32, 32)); rgb.show(); break;
    // ... verde, azul, respiração, perseguição
  }
}`,
  setup(c) { c.mem.i = 0; c.mem.off = false; c.print('Modo: arco-iris'); },
  loop(c) {
    if (c.ev.pressL) { c.mem.i = (c.mem.i + 1) % RGB_CYCLE.length; c.mem.off = false; c.print(`Modo: ${RGB_CYCLE[c.mem.i].label}`); }
    if (c.ev.pressR) { c.mem.off = true; c.print('LEDs apagados'); }
    const m = RGB_CYCLE[c.mem.i];
    c.a.rgb = rgbFrame(c.mem.off ? 'off' : m.mode, m.color, c.t);
  },
};

const rain: Firmware = {
  id: 'steam', index: '11', title: 'Janela inteligente (chuva)', summary: 'Lê o sensor de vapor pelo ADC de 12 bits. Acima de 1600 considera chuva e fecha a janela.',
  modules: ['steam', 'windowServo', 'lcd'], pins: ['IO34 Vapor (ADC1)', 'IO5 Servo janela', 'IO21/IO22 LCD'], tryIt: ['Ligue a chuva em "Ambiente" ou pingue uma gota no sensor.', 'Quando secar, a janela reabre.'],
  code: `#include <ESP32Servo.h>
#define STEAM 34
Servo window;

void setup() {
  Serial.begin(115200);
  window.attach(5);
}

void loop() {
  int water = analogRead(STEAM);     // 0..4095
  Serial.println(water);
  if (water > 1600) {
    window.write(0);
    lcdPrint("Chovendo!", "Janela fechada");
  } else {
    window.write(180);
    lcdPrint("Tempo seco", "Janela aberta");
  }
  delay(500);
}`,
  setup() {},
  loop(c) {
    if (c.every('adc', 500)) c.print(String(c.s.steamAdc));
    const wet = c.s.steamAdc > 1600;
    c.a.window = wet ? CLOSED : OPEN;
    c.lcd(wet ? 'Chovendo!' : 'Tempo seco', wet ? 'Janela fechada' : 'Janela aberta');
  },
};

const gasAlarm: Firmware = {
  id: 'gas', index: '12', title: 'Alarme de gás', summary: 'Monitora a saída digital do MQ-2. Em vazamento dispara sirene, aviso no LCD e ventilação forçada.',
  modules: ['gas', 'buzzer', 'lcd', 'fan'], pins: ['IO23 MQ-2 DO', 'IO25 Buzzer', 'IO19/IO18 Ventilador'], tryIt: ['Abra a válvula de gás em "Ambiente".', 'Ajuste o potenciômetro (limiar) do módulo para mudar a sensibilidade.'],
  code: `#define GAS 23
#define BUZZER 25

void setup() {
  Serial.begin(115200);
  pinMode(GAS, INPUT);
}

void loop() {
  if (digitalRead(GAS) == LOW) {      // ativo em LOW
    Serial.println("Perigo! Gas detectado");
    lcdPrint("Perigo! Gas", "Evacue o local");
    ledcWrite(19, 255);               // ventilação
    tone(BUZZER, 880); delay(250);
    tone(BUZZER, 1320); delay(250);
  } else {
    noTone(BUZZER);
    ledcWrite(19, 0);
    lcdPrint("Ar seguro", "");
  }
}`,
  setup(c) { c.mem.alarm = false; },
  loop(c) {
    const g = c.s.gasDetected;
    if (g && !c.mem.alarm) { c.mem.alarm = true; c.tone(SONGS.siren.notes, true); }
    if (!g && c.mem.alarm) { c.mem.alarm = false; c.noTone(); c.print('Ar seguro'); }
    if (g && c.every('gas', 700)) c.print('Perigo! Gas detectado');
    c.a.fanPwm = g ? 255 : 0;
    c.lcd(g ? 'Perigo! Gas' : 'Ar seguro', g ? 'Evacue o local' : `MQ-2 ADC ${c.s.gasAdc}`);
  },
};

const access: Firmware = {
  id: 'access', index: '13', title: 'Acesso RFID + senha Morse', summary: 'Abre a porta com cartão autorizado ou com a senha em código Morse digitada nos botões.',
  modules: ['rfid', 'btnL', 'btnR', 'doorServo', 'lcd', 'buzzer'], pins: ['IO21/IO22 RFID 0x28', 'IO16/IO27 Botões', 'IO13 Servo porta'], tryIt: ['Aproxime o cartão branco (autorizado) ou o desconhecido.', `Toque curto = ponto, toque longo = traço. Senha: ${MORSE_PASSWORD}`, 'Confirme com o botão direito.'],
  code: `#include <MFRC522_I2C.h>
#include <ESP32Servo.h>
MFRC522 rfid(0x28);
Servo door;
String morse = "", pass = "${MORSE_PASSWORD}";

void loop() {
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    String uid = readUid(rfid.uid);
    Serial.println("UID: " + uid);
    authorized(uid) ? openDoor() : deny();
  }
  if (digitalRead(16) == LOW) {
    unsigned long t0 = millis();
    while (digitalRead(16) == LOW);
    morse += (millis() - t0 < 320) ? "." : "-";
    lcdPrint("Senha:", morse);
  }
  if (pressed(27)) {
    morse == pass ? openDoor() : deny();
    morse = "";
  }
}`,
  setup(c) { c.mem.morse = ''; c.mem.until = 0; c.mem.msg = null; c.mem.msgUntil = 0; },
  loop(c) {
    const { mem, t, ev } = c;
    const show = (l0: string, l1: string) => { mem.msg = [l0, l1]; mem.msgUntil = t + 3000; };
    if (ev.card) {
      c.print(`UID: ${ev.card}`);
      if (AUTHORIZED.has(ev.card)) { mem.until = t + 3000; c.tone(SONGS.ok.notes); show('Acesso liberado', ev.card); }
      else { c.tone(SONGS.error.notes); show('Acesso negado', ev.card); }
    }
    if (ev.releaseL !== null) { mem.morse = (mem.morse + morseSymbol(ev.releaseL)).slice(-8); c.tone([[1800, 45]]); }
    if (ev.releaseR !== null) {
      if (mem.morse === MORSE_PASSWORD) { mem.until = t + 3000; c.tone(SONGS.ok.notes); show('Senha correta', 'Porta aberta'); c.print('Senha correta'); }
      else { c.tone(SONGS.error.notes); show('Senha errada', mem.morse || '(vazia)'); c.print(`Senha errada: ${mem.morse}`); }
      mem.morse = '';
    }
    c.a.door = t < mem.until ? OPEN : CLOSED;
    if (mem.msg && t < mem.msgUntil) c.lcd(mem.msg[0], mem.msg[1]);
    else c.lcd(mem.morse ? 'Senha:' : 'Aproxime cartao', mem.morse || 'ou digite Morse');
  },
};

export const FIRMWARES: Firmware[] = [smartHome, blink, breathing, lamp, pirLight, music, servos, fan, lcd, climate, rgb, rain, gasAlarm, access];

export const firmwareById = (id: string) => FIRMWARES.find((f) => f.id === id) ?? smartHome;
