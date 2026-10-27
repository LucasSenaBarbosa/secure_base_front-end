import { useGLTF } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import gsap from 'gsap';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playClick } from '../sim/audio';
import { MAX_RPM } from '../sim/hardware';
import { drawLcd } from '../sim/lcd';
import { useSim } from '../sim/store';
import type { ModuleId } from '../sim/types';
import { buildRig, useRig } from './rig';

export const MODEL_URL = '/models/keyestudio-smart-home-premium.glb';

const moduleOf = (o: THREE.Object3D | null): ModuleId | null => {
  for (let n = o; n; n = n.parent) if (n.userData.module) return n.userData.module as ModuleId;
  return null;
};

const noRaycast = () => {};

export function House() {
  const { scene } = useGLTF(MODEL_URL);
  const rig = useMemo(() => buildRig(scene), [scene]);
  const explode = useRef({ v: 0 });
  const fanAngle = useRef(0);
  const held = useRef({ L: false, R: false });
  const setRig = useRig((s) => s.setRig);
  const xray = useSim((s) => s.ui.xray);
  const exploded = useSim((s) => s.ui.exploded);

  useEffect(() => {
    setRig(rig);
    return () => setRig(null);
  }, [rig, setRig]);

  useEffect(() => {
    const ctx = rig.lcdCanvas.getContext('2d')!;
    const paint = () => {
      const { act } = useSim.getState();
      drawLcd(ctx, act.lcd, act.backlight);
      rig.lcdTex.needsUpdate = true;
    };
    paint();
    return useSim.subscribe((s, p) => {
      if (s.act.lcd !== p.act.lcd && (s.act.lcd[0] !== p.act.lcd[0] || s.act.lcd[1] !== p.act.lcd[1])) paint();
      else if (s.act.backlight !== p.act.backlight) paint();
    });
  }, [rig]);

  useEffect(() => {
    const target = xray ? 0.1 : 1;
    if (xray) rig.wallMats.forEach((m) => { m.transparent = true; m.depthWrite = false; m.needsUpdate = true; });
    rig.wallMeshes.forEach((m) => { m.raycast = xray ? noRaycast : THREE.Mesh.prototype.raycast; m.castShadow = !xray; });
    const tween = gsap.to(rig.wallMats, {
      opacity: (i) => (i === 1 ? (xray ? 0.06 : 0.3) : target),
      duration: 0.9,
      ease: 'power2.inOut',
      onComplete: () => {
        if (!xray) rig.wallMats.forEach((m, i) => { if (i !== 1) { m.transparent = false; m.depthWrite = true; m.needsUpdate = true; } });
      },
    });
    return () => { tween.kill(); };
  }, [xray, rig]);

  useEffect(() => {
    const tween = gsap.to(explode.current, { v: exploded ? 1 : 0, duration: 1.6, ease: exploded ? 'expo.out' : 'expo.inOut' });
    return () => { tween.kill(); };
  }, [exploded]);

  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useFrame((_, dt) => {
    const { act, sensors } = useSim.getState();
    const d = Math.min(dt, 0.05);

    const e = explode.current.v;
    for (const p of rig.parts) p.obj.position.copy(p.base).addScaledVector(p.dir, e * 0.75);

    const omega = (act.fanRpm / 60) * Math.PI * 2 * 0.045;
    fanAngle.current += omega * d;
    rig.fan.quaternion.copy(rig.fan.userData.baseQuat).multiply(tmpQ.setFromAxisAngle(rig.fanAxis, fanAngle.current));
    const speed = Math.abs(act.fanRpm) / MAX_RPM;
    rig.bladeMat.opacity = 1 - Math.min(0.75, speed * 0.9);
    (rig.fanBlur.material as THREE.MeshBasicMaterial).opacity = Math.min(0.45, speed * 0.55);

    const damp = (g: THREE.Object3D, key: 'x' | 'y' | 'z', target: number, k = 14) => {
      g.rotation[key] = THREE.MathUtils.damp(g.rotation[key], target, k, d);
    };
    damp(rig.door, 'y', -(act.doorPos / 180) * THREE.MathUtils.degToRad(105));
    damp(rig.doorHorn, 'x', -(act.doorPos / 180) * Math.PI);
    damp(rig.windowHorn, 'x', -(act.windowPos / 180) * Math.PI);

    const press = (g: THREE.Group, down: boolean) => {
      const depth = g.userData.press ?? 0;
      const vel = g.userData.pressVel ?? 0;
      const accel = ((down ? 0.003 : 0) - depth) * 1400 - vel * 34;
      g.userData.pressVel = vel + accel * d;
      g.userData.press = depth + g.userData.pressVel * d;
      g.position.z -= g.userData.press;
    };
    press(rig.btnL, held.current.L || sensors.btnL);
    press(rig.btnR, held.current.R || sensors.btnR);

    rig.ledMat.emissiveIntensity = THREE.MathUtils.damp(rig.ledMat.emissiveIntensity, (act.led / 255) * 7, 18, d);

    act.rgb.forEach((hex, i) => {
      const m = rig.rgbMats[i];
      color.set(hex);
      m.emissive.lerp(color, Math.min(1, d * 20));
      m.color.setRGB(0.85 + color.r * 0.15, 0.85 + color.g * 0.15, 0.85 + color.b * 0.15);
    });
  });

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const id = moduleOf(e.object);
    useSim.getState().setUi({ hovered: id });
    document.body.style.cursor = id ? 'pointer' : 'default';
  };
  const onOut = () => {
    useSim.getState().setUi({ hovered: null });
    document.body.style.cursor = 'default';
  };
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    const id = moduleOf(e.object);
    if (id !== 'btnL' && id !== 'btnR') return;
    e.stopPropagation();
    const btn = id === 'btnL' ? 'L' : 'R';
    held.current[btn] = true;
    playClick(true);
    useSim.getState().pressButton(btn, true);
    const up = () => {
      held.current[btn] = false;
      playClick(false);
      useSim.getState().pressButton(btn, false);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointerup', up);
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 6) return;
    const id = moduleOf(e.object);
    const sim = useSim.getState();
    if (id === 'btnL' || id === 'btnR') {
      if (sim.ui.selected !== id) sim.setUi({ selected: id });
      return;
    }
    if (id) sim.select(id);
  };

  return (
    <group scale={10}>
      <primitive object={rig.root} onPointerOver={onOver} onPointerOut={onOut} onPointerDown={onDown} onClick={onClick} />
    </group>
  );
}

useGLTF.preload(MODEL_URL);
