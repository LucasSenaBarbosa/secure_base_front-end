import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import gsap from 'gsap';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CARDS } from '../sim/hardware';
import { useSim } from '../sim/store';
import { PIR_POS, PIR_RANGE, personPos } from '../sim/world';

const spriteTexture = (() => {
  let tex: THREE.CanvasTexture | null = null;
  return () => {
    if (tex) return tex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    tex = new THREE.CanvasTexture(c);
    return tex;
  };
})();

function DeviceLights() {
  const led = useRef<THREE.PointLight>(null!);
  const rgb = useRef<THREE.PointLight>(null!);
  const c = useMemo(() => new THREE.Color(), []);
  const sum = useMemo(() => new THREE.Color(), []);
  useFrame((_, dt) => {
    const { act } = useSim.getState();
    led.current.intensity = THREE.MathUtils.damp(led.current.intensity, (act.led / 255) * 2.4, 16, dt);
    sum.setRGB(0, 0, 0);
    act.rgb.forEach((h) => sum.add(c.set(h)));
    const lum = (sum.r + sum.g + sum.b) / 12;
    if (lum > 0) rgb.current.color.copy(sum).multiplyScalar(1 / Math.max(sum.r, sum.g, sum.b, 0.001));
    rgb.current.intensity = THREE.MathUtils.damp(rgb.current.intensity, lum * 6, 12, dt);
  });
  return (
    <>
      <pointLight ref={led} position={[0.04, 1.5, 0.55]} color="#ffb547" intensity={0} distance={3} decay={2} />
      <pointLight ref={rgb} position={[-0.43, 0.8, -0.35]} intensity={0} distance={3.2} decay={2} />
    </>
  );
}

const RAIN = 1100;
function Rain() {
  const ref = useRef<THREE.LineSegments>(null!);
  const { geo, speeds } = useMemo(() => {
    const pos = new Float32Array(RAIN * 6);
    const speeds = new Float32Array(RAIN);
    for (let i = 0; i < RAIN; i++) {
      const x = (Math.random() - 0.5) * 5.5;
      const y = Math.random() * 5;
      const z = (Math.random() - 0.5) * 5;
      pos.set([x, y, z, x + 0.01, y + 0.13, z], i * 6);
      speeds[i] = 7 + Math.random() * 3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return { geo, speeds };
  }, []);
  useFrame((_, dt) => {
    const rain = useSim.getState().env.rain;
    ref.current.visible = rain > 0.01;
    if (!ref.current.visible) return;
    const n = Math.floor(RAIN * rain);
    geo.setDrawRange(0, n * 2);
    const p = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      const dy = speeds[i] * Math.min(dt, 0.05);
      p[o + 1] -= dy;
      p[o + 4] -= dy;
      const roof = Math.abs(p[o]) < 0.95 && Math.abs(p[o + 2]) < 0.66 && p[o + 1] < 1.62 - Math.abs(p[o + 2]) * 0.85;
      if (p[o + 1] < 0 || roof) {
        const y = 4.6 + Math.random() * 0.6;
        p[o + 1] = y;
        p[o + 4] = y + 0.13;
      }
    }
    geo.attributes.position.needsUpdate = true;
  });
  return (
    <lineSegments ref={ref} geometry={geo} frustumCulled={false}>
      <lineBasicMaterial color="#b8d4ff" transparent opacity={0.42} depthWrite={false} />
    </lineSegments>
  );
}

const GAS = 280;
function GasCloud() {
  const ref = useRef<THREE.Points>(null!);
  const mat = useRef<THREE.PointsMaterial>(null!);
  const { geo, vel, life } = useMemo(() => {
    const pos = new Float32Array(GAS * 3);
    const vel = new Float32Array(GAS * 3);
    const life = new Float32Array(GAS);
    for (let i = 0; i < GAS; i++) life[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return { geo, vel, life };
  }, []);
  useFrame((_, dt) => {
    const { sensors, act } = useSim.getState();
    const density = Math.min(1, sensors.gasPpm / 2200);
    ref.current.visible = density > 0.01;
    if (!ref.current.visible) return;
    mat.current.opacity = 0.08 + density * 0.32;
    const fanPush = Math.abs(act.fanRpm) / 6200;
    const p = geo.attributes.position.array as Float32Array;
    const d = Math.min(dt, 0.05);
    for (let i = 0; i < GAS; i++) {
      life[i] += d * (0.12 + fanPush * 0.25);
      if (life[i] >= 1) {
        life[i] = 0;
        p.set([-0.18 + (Math.random() - 0.5) * 0.5, 0.35 + Math.random() * 0.25, -0.95 + (Math.random() - 0.5) * 0.4], i * 3);
        vel.set([(Math.random() - 0.5) * 0.25, 0.12 + Math.random() * 0.18, (Math.random() - 0.5) * 0.25 + 0.04], i * 3);
      }
      p[i * 3] += vel[i * 3] * d;
      p[i * 3 + 1] += vel[i * 3 + 1] * d * (1 + fanPush);
      p[i * 3 + 2] += (vel[i * 3 + 2] - fanPush * 0.3) * d;
    }
    geo.setDrawRange(0, Math.floor(GAS * (0.3 + 0.7 * density)));
    geo.attributes.position.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geo} frustumCulled={false}>
      <pointsMaterial ref={mat} map={spriteTexture()} color="#b5e07a" size={0.42} sizeAttenuation transparent depthWrite={false} opacity={0.2} />
    </points>
  );
}

function Droplets() {
  const ref = useRef<THREE.Group>(null!);
  useFrame(() => {
    const w = useSim.getState().sensors.steamWater;
    ref.current.visible = w > 0.02;
    ref.current.children.forEach((c, i) => {
      const s = Math.max(0, Math.min(1, w * 3 - i * 0.5));
      c.scale.setScalar(0.0001 + s);
    });
  });
  const drops: [number, number, number][] = [[0, 0, 0.035], [0.05, -0.03, 0.026], [-0.05, 0.02, 0.03], [0.02, 0.05, 0.022]];
  return (
    <group ref={ref} position={[-0.36, 1.35, 0.43]} rotation={[0.72, 0, 0]}>
      {drops.map(([x, y, r], i) => (
        <mesh key={i} position={[x, 0, y]} scale={0.0001}>
          <sphereGeometry args={[r, 20, 12]} />
          <meshPhysicalMaterial color="#9fd3ff" roughness={0.02} transmission={0.6} thickness={0.05} transparent opacity={0.75} />
        </mesh>
      ))}
    </group>
  );
}

function BuzzerWaves() {
  const ref = useRef<THREE.Group>(null!);
  const phase = useRef(0);
  const level = useRef(0);
  useFrame((_, dt) => {
    const f = useSim.getState().act.buzzer;
    level.current = THREE.MathUtils.damp(level.current, f > 0 ? 1 : 0, 10, dt);
    ref.current.visible = level.current > 0.02;
    phase.current = (phase.current + dt * (0.8 + f / 1500)) % 1;
    ref.current.children.forEach((c, i) => {
      const s = (phase.current + i / 3) % 1;
      c.scale.setScalar(0.05 + s * 0.6);
      ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (1 - s) * 0.55 * level.current;
    });
  });
  return (
    <group ref={ref} position={[-0.5, 0.44, -0.86]} rotation={[0, Math.PI, 0]}>
      {[0, 1, 2].map((i) => (
        <mesh key={i}>
          <ringGeometry args={[0.92, 1, 64]} />
          <meshBasicMaterial color="#ffd36b" transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function PirCone() {
  const ref = useRef<THREE.Mesh>(null!);
  const mat = useRef<THREE.MeshBasicMaterial>(null!);
  const geo = useMemo(() => {
    const g = new THREE.ConeGeometry(Math.tan((55 * Math.PI) / 180) * PIR_RANGE, PIR_RANGE, 48, 1, true);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, PIR_RANGE / 2);
    g.scale(1, 0.45, 1);
    return g;
  }, []);
  const active = useMemo(() => new THREE.Color('#38f5a8'), []);
  const idle = useMemo(() => new THREE.Color('#5aa8ff'), []);
  useFrame((_, dt) => {
    const { ui, sensors, env } = useSim.getState();
    const show = ui.sensorViz || ui.selected === 'pir' || env.personT !== null;
    mat.current.opacity = THREE.MathUtils.damp(mat.current.opacity, show ? (sensors.pir ? 0.16 : 0.07) : 0, 8, dt);
    ref.current.visible = mat.current.opacity > 0.005;
    mat.current.color.lerp(sensors.pir ? active : idle, Math.min(1, dt * 8));
  });
  return (
    <mesh ref={ref} geometry={geo} position={[PIR_POS.x, PIR_POS.y, PIR_POS.z]} raycast={() => {}}>
      <meshBasicMaterial ref={mat} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
}

function Visitor() {
  const ref = useRef<THREE.Group>(null!);
  const legL = useRef<THREE.Group>(null!);
  const legR = useRef<THREE.Group>(null!);
  const armL = useRef<THREE.Group>(null!);
  const armR = useRef<THREE.Group>(null!);
  const walk = useRef(0);
  const fade = useRef(0);
  useFrame((_, dt) => {
    const { env } = useSim.getState();
    const t = env.personT;
    fade.current = THREE.MathUtils.damp(fade.current, t === null ? 0 : 1, 6, dt);
    ref.current.visible = fade.current > 0.01;
    if (t === null) return;
    const p = personPos(t);
    const moving = env.personMode === 'walk' && Math.abs(t - 0.5) > 0.04;
    ref.current.position.x = THREE.MathUtils.damp(ref.current.position.x, p.x, 8, dt);
    ref.current.position.z = THREE.MathUtils.damp(ref.current.position.z, p.z, 8, dt);
    const heading = moving ? p.heading : Math.PI;
    ref.current.rotation.y = THREE.MathUtils.damp(ref.current.rotation.y, heading, 6, dt);
    ref.current.scale.setScalar(fade.current);
    walk.current += dt * (moving ? 9 : 0);
    const s = moving ? Math.sin(walk.current) * 0.55 : 0;
    legL.current.rotation.x = s;
    legR.current.rotation.x = -s;
    armL.current.rotation.x = -s * 0.8;
    armR.current.rotation.x = moving ? s * 0.8 : -1.1 + Math.sin(performance.now() / 160) * 0.35;
    ref.current.position.y = moving ? Math.abs(Math.cos(walk.current)) * 0.01 : 0;
  });
  const skin = <meshStandardMaterial color="#e9ecf5" roughness={0.35} metalness={0.05} />;
  const accent = <meshStandardMaterial color="#7c6cff" roughness={0.4} emissive="#4a37ff" emissiveIntensity={0.4} />;
  return (
    <group ref={ref} visible={false}>
      <group ref={legL} position={[-0.028, 0.16, 0]}>
        <mesh position={[0, -0.075, 0]} castShadow><capsuleGeometry args={[0.022, 0.11, 6, 12]} />{accent}</mesh>
      </group>
      <group ref={legR} position={[0.028, 0.16, 0]}>
        <mesh position={[0, -0.075, 0]} castShadow><capsuleGeometry args={[0.022, 0.11, 6, 12]} />{accent}</mesh>
      </group>
      <mesh position={[0, 0.235, 0]} castShadow><capsuleGeometry args={[0.048, 0.09, 8, 16]} />{skin}</mesh>
      <group ref={armL} position={[-0.064, 0.28, 0]}>
        <mesh position={[0, -0.05, 0]} castShadow><capsuleGeometry args={[0.016, 0.08, 6, 10]} />{skin}</mesh>
      </group>
      <group ref={armR} position={[0.064, 0.28, 0]}>
        <mesh position={[0, -0.05, 0]} castShadow><capsuleGeometry args={[0.016, 0.08, 6, 10]} />{skin}</mesh>
      </group>
      <mesh position={[0, 0.36, 0]} castShadow><sphereGeometry args={[0.042, 24, 16]} />{skin}</mesh>
    </group>
  );
}

function cardFace(label: string, uid: string, color: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 323;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 512, 323);
  grad.addColorStop(0, color);
  grad.addColorStop(1, color === '#f3f4f6' ? '#cfd5e2' : '#0b0f1a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 323);
  const ink = color === '#f3f4f6' ? '#1d2433' : '#ffffff';
  g.strokeStyle = ink;
  g.globalAlpha = 0.5;
  g.lineWidth = 6;
  for (let i = 1; i <= 3; i++) {
    g.beginPath();
    g.arc(410, 90, 22 * i, -0.8, 0.8);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.fillStyle = '#d6b25e';
  g.fillRect(48, 110, 92, 70);
  g.fillStyle = ink;
  g.font = '700 34px system-ui, sans-serif';
  g.fillText(label.toUpperCase(), 48, 70);
  g.font = '500 26px ui-monospace, monospace';
  g.fillText(`UID ${uid}`, 48, 268);
  g.font = '600 22px system-ui, sans-serif';
  g.fillText('13.56 MHz · MIFARE', 48, 230);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function RfidCard() {
  const group = useRef<THREE.Group>(null!);
  const tap = useSim((s) => s.tap);
  const faces = useMemo(() => Object.fromEntries(CARDS.map((c) => [c.uid, cardFace(c.label, c.uid, c.color)])), []);
  const card = CARDS.find((c) => c.uid === tap?.uid) ?? CARDS[0];
  const isFob = card.uid === CARDS[1].uid;

  useEffect(() => {
    if (!tap) return;
    const g = group.current;
    const tl = gsap.timeline();
    tl.set(g, { visible: true })
      .set(g.position, { x: 2.1, y: 1.5, z: 2.6 })
      .set(g.rotation, { x: -0.4, y: -1.1, z: 0.3 })
      .set(g.scale, { x: 1, y: 1, z: 1 })
      .to(g.position, { x: -0.71, y: 0.8, z: 0.84, duration: 0.75, ease: 'power3.out' }, 0)
      .to(g.rotation, { x: 0, y: 0, z: 0, duration: 0.75, ease: 'power3.out' }, 0)
      .to(g.position, { z: 0.81, duration: 0.15, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 0.8)
      .to(g.position, { x: 0.4, y: 1.3, z: 2.4, duration: 0.6, ease: 'power2.in' }, 2.1)
      .to(g.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.6, ease: 'power2.in' }, 2.1)
      .set(g, { visible: false });
    return () => { tl.kill(); };
  }, [tap]);

  return (
    <group ref={group} visible={false}>
      {isFob ? (
        <group>
          <RoundedBox args={[0.3, 0.4, 0.05]} radius={0.06} smoothness={4} castShadow>
            <meshStandardMaterial color="#2a62ff" roughness={0.35} />
          </RoundedBox>
          <mesh position={[0, 0.25, 0]}>
            <torusGeometry args={[0.06, 0.014, 12, 32]} />
            <meshStandardMaterial color="#c9ced8" metalness={1} roughness={0.25} />
          </mesh>
        </group>
      ) : (
        <RoundedBox args={[0.856, 0.54, 0.012]} radius={0.004} smoothness={2} castShadow>
          <meshStandardMaterial map={faces[card.uid]} roughness={0.35} />
        </RoundedBox>
      )}
    </group>
  );
}

function ReaderPulse() {
  const ref = useRef<THREE.Group>(null!);
  const phase = useRef(0);
  const level = useRef(0);
  useFrame((_, dt) => {
    const present = useSim.getState().sensors.rfid !== null;
    level.current = THREE.MathUtils.damp(level.current, present ? 1 : 0, 10, dt);
    ref.current.visible = level.current > 0.02;
    phase.current = (phase.current + dt * 1.6) % 1;
    ref.current.children.forEach((c, i) => {
      const s = (phase.current + i / 2) % 1;
      c.scale.setScalar(0.06 + s * 0.3);
      ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (1 - s) * 0.7 * level.current;
    });
  });
  return (
    <group ref={ref} position={[-0.71, 0.8, 0.76]}>
      {[0, 1].map((i) => (
        <mesh key={i}>
          <ringGeometry args={[0.9, 1, 64]} />
          <meshBasicMaterial color="#56d7ff" transparent depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

export function Effects() {
  return (
    <>
      <DeviceLights />
      <Rain />
      <GasCloud />
      <Droplets />
      <BuzzerWaves />
      <PirCone />
      <Visitor />
      <RfidCard />
      <ReaderPulse />
      <WindowShutter />
    </>
  );
}

function WindowShutter() {
  const ref = useRef<THREE.Group>(null!);
  useFrame((_, dt) => {
    const open = useSim.getState().act.windowPos / 180;
    ref.current.rotation.y = THREE.MathUtils.damp(ref.current.rotation.y, -open * 1.15, 8, dt);
  });
  return (
    <group ref={ref} position={[0.82, 1.09, 0.1]}>
      <mesh position={[0.14, 0, 0]} castShadow>
        <boxGeometry args={[0.28, 0.3, 0.012]} />
        <meshPhysicalMaterial color="#d7eeff" roughness={0.06} metalness={0} transmission={0.55} thickness={0.02} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}
