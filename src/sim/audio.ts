import { useSim } from './store';

let ctx: AudioContext | null = null;
let osc: OscillatorNode | null = null;
let gain: GainNode | null = null;

function ensureAudio() {
  if (ctx) return;
  ctx = new AudioContext();
  osc = ctx.createOscillator();
  osc.type = 'square';
  const body = ctx.createBiquadFilter();
  body.type = 'peaking';
  body.frequency.value = 2700;
  body.Q.value = 2.5;
  body.gain.value = 8;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 5200;
  gain = ctx.createGain();
  gain.gain.value = 0;
  osc.connect(body).connect(lowpass).connect(gain).connect(ctx.destination);
  osc.start();
}

function apply() {
  if (!ctx || !osc || !gain) return;
  const { act, settings } = useSim.getState();
  const now = ctx.currentTime;
  const on = act.buzzer > 0 && !settings.muted;
  if (on) osc.frequency.setTargetAtTime(act.buzzer, now, 0.002);
  gain.gain.setTargetAtTime(on ? settings.volume * 0.18 : 0, now, 0.006);
}

/** Short mechanical tick for tactile buttons; deeper on press, lighter on release. */
export function playClick(down: boolean) {
  const { settings } = useSim.getState();
  if (!ctx || settings.muted) return;
  const now = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * 0.03);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.12));
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = down ? 1900 : 3400;
  band.Q.value = 3;
  const amp = ctx.createGain();
  amp.gain.value = settings.volume * (down ? 0.9 : 0.5);
  src.connect(band).connect(amp).connect(ctx.destination);
  src.start(now);
}

/** Must be called from a user gesture so the browser allows audio playback. */
export function enableAudio() {
  ensureAudio();
  void ctx!.resume();
  useSim.getState().setSettings({ muted: false });
}

useSim.subscribe((s, p) => {
  if (s.act.buzzer !== p.act.buzzer || s.settings.muted !== p.settings.muted || s.settings.volume !== p.settings.volume) apply();
});
