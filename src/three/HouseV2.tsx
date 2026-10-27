import { useGLTF } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import gsap from 'gsap';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playClick } from '../sim/audio';
import { MAX_RPM } from '../sim/hardware';
import { LCD_H, LCD_W, drawLcd } from '../sim/lcd';
import { useSim } from '../sim/store';
import type { ModuleId } from '../sim/types';
import type { Rig } from './rig';
import { useRig } from './rig';
import { HOUSE_V2_URL, buildHouseV2, disposeMaterials, type V2House } from './v2model';

const noRaycast = () => {};

const moduleOf = (o: THREE.Object3D | null): ModuleId | null => {
  for (let n = o; n; n = n.parent) if (n.userData.module) return n.userData.module as ModuleId;
  return null;
};

function publishRig(model: V2House, setRig: (rig: Rig | null) => void) {
  const dummy = new THREE.Group();
  const mat = model.yellow ?? new THREE.MeshStandardMaterial();
  setRig({
    root: model.root,
    parts: [],
    fan: (model.fan as THREE.Group) ?? dummy,
    fanAxis: new THREE.Vector3(0, 0, 1),
    fanBlur: new THREE.Mesh(),
    bladeMat: model.blade ?? mat,
    door: (model.door as THREE.Group) ?? dummy,
    doorHorn: dummy,
    windowHorn: (model.windowHorn as THREE.Group) ?? dummy,
    btnL: dummy,
    btnR: dummy,
    ledMat: mat,
    rgbMats: model.rgb ? [model.rgb] : [],
    lcdCanvas: document.createElement('canvas'),
    lcdTex: new THREE.CanvasTexture(document.createElement('canvas')),
    wallMats: model.wallMats,
    wallMeshes: model.wallMeshes,
    modules: model.modules,
  });
}

export function HouseV2({ mode }: { mode: 'lab' | 'show' }) {
  const { scene } = useGLTF(HOUSE_V2_URL);
  const model = useMemo(() => buildHouseV2(scene), [scene]);
  const explode = useRef({ v: 0 });
  const fanAngle = useRef(0);
  const held = useRef({ L: false, R: false });
  const spin = useMemo(() => new THREE.Quaternion(), []);
  const axis = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const color = useMemo(() => new THREE.Color(), []);
  const sum = useMemo(() => new THREE.Color(), []);
  const reduce = useRef(false);
  const setRig = useRig((s) => s.setRig);
  const xray = useSim((s) => (mode === 'lab' ? s.ui.xray : false));
  const exploded = useSim((s) => (mode === 'lab' ? s.ui.exploded : false));

  useEffect(() => {
    reduce.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => () => disposeMaterials(model.root), [model]);

  useEffect(() => {
    if (mode !== 'lab') return;
    publishRig(model, setRig);
    return () => setRig(null);
  }, [mode, model, setRig]);

  useEffect(() => {
    if (!model.lcd?.isMesh) return;
    const canvas = document.createElement('canvas');
    canvas.width = LCD_W;
    canvas.height = LCD_H;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.center.set(0.5, 0.5);
    tex.repeat.set(-1, 1);
    const prev = model.lcd.material;
    model.lcd.material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const ctx = canvas.getContext('2d')!;
    const paint = () => {
      const { act } = useSim.getState();
      drawLcd(ctx, mode === 'show' ? ['SecureBase  V2  ', 'T:26C H:50% OK  '] : act.lcd, mode === 'show' || act.backlight);
      tex.needsUpdate = true;
    };
    paint();
    const unsub = mode === 'show' ? () => {} : useSim.subscribe((s, p) => {
      if (s.act.lcd !== p.act.lcd || s.act.backlight !== p.act.backlight) paint();
    });
    return () => {
      unsub();
      tex.dispose();
      (model.lcd!.material as THREE.Material).dispose();
      model.lcd!.material = prev;
    };
  }, [mode, model]);

  useEffect(() => {
    const target = xray ? 0.12 : 1;
    model.wallMats.forEach((mat) => {
      mat.transparent = true;
      mat.depthWrite = !xray;
      mat.needsUpdate = true;
    });
    model.wallMeshes.forEach((mesh) => {
      mesh.raycast = xray ? noRaycast : THREE.Mesh.prototype.raycast;
      mesh.castShadow = !xray;
    });
    const tween = gsap.to(model.wallMats, {
      opacity: target,
      duration: 0.8,
      ease: 'power2.inOut',
      onComplete: () => {
        if (!xray) model.wallMats.forEach((mat) => { mat.transparent = false; mat.depthWrite = true; mat.needsUpdate = true; });
      },
    });
    return () => { tween.kill(); };
  }, [xray, model]);

  useEffect(() => {
    const tween = gsap.to(explode.current, { v: exploded ? 1 : 0, duration: 1.4, ease: exploded ? 'expo.out' : 'expo.inOut' });
    return () => { tween.kill(); };
  }, [exploded]);

  const ledLight = useRef<THREE.PointLight>(null);
  const rgbLight = useRef<THREE.PointLight>(null);
  const rainRef = useRef<THREE.LineSegments>(null);
  const gasRef = useRef<THREE.Points>(null);
  const gasMat = useRef<THREE.PointsMaterial>(null);
  const buzzerRef = useRef<THREE.Group>(null);
  const pirRef = useRef<THREE.Mesh>(null);
  const pirMat = useRef<THREE.MeshBasicMaterial>(null);
  const buzzerPhase = useRef(0);
  const buzzerLevel = useRef(0);

  const rain = useMemo(() => {
    const count = 700;
    const pos = new Float32Array(count * 6);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 4.2;
      const y = Math.random() * 3.2;
      const z = (Math.random() - 0.5) * 3.6;
      pos.set([x, y, z, x + 0.012, y + 0.16, z], i * 6);
      speeds[i] = 2.4 + Math.random() * 1.1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return { geo, speeds, count };
  }, []);

  const gas = useMemo(() => {
    const count = 180;
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const life = new Float32Array(count);
    for (let i = 0; i < count; i++) life[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return { geo, vel, life, count };
  }, []);

  const gasOrigin = useMemo(() => new THREE.Vector3(), []);
  const pirGeo = useMemo(() => {
    const geo = new THREE.ConeGeometry(0.22, 0.7, 24, 1, true);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, 0.36);
    return geo;
  }, []);

  useFrame((state, dt) => {
    const d = Math.min(dt, 0.05);
    const e = explode.current.v;
    for (const piece of model.pieces) {
      piece.obj.position.copy(piece.base).addScaledVector(piece.dir, e);
    }

    let doorOpen = 0.42;
    let fanRpm = 0;
    let ledLevel = 0.72;
    let night = true;
    if (mode === 'show') {
      const t = state.clock.elapsedTime;
      if (!reduce.current) {
        doorOpen = (Math.sin(t * 0.42) + 1) / 2;
        fanRpm = 2800;
        ledLevel = 0.55 + Math.sin(t * 1.7) * 0.35;
      }
      if (model.rgb) {
        model.rgb.emissive.setHSL((t * 0.07) % 1, 0.8, 0.5);
        model.rgb.emissiveIntensity = 3.2;
      }
    } else {
      const { act, env } = useSim.getState();
      doorOpen = act.doorPos / 180;
      fanRpm = Math.abs(act.fanRpm);
      ledLevel = act.led / 255;
      night = env.night;
      if (model.rgb) {
        sum.setRGB(0, 0, 0);
        act.rgb.forEach((hex) => sum.add(color.set(hex)));
        const peak = Math.max(sum.r, sum.g, sum.b, 0.001);
        model.rgb.emissive.copy(sum).multiplyScalar(1 / peak);
        model.rgb.emissiveIntensity = THREE.MathUtils.damp(model.rgb.emissiveIntensity, (sum.r + sum.g + sum.b) * 1.6, 10, d);
      }
      if (model.windowHorn) {
        const base = (model.windowHorn.userData.baseRot as number) ?? 0;
        model.windowHorn.rotation.z = THREE.MathUtils.damp(model.windowHorn.rotation.z, base - (act.windowPos / 180) * 1.4, 8, d);
      }
    }

    if (model.door) {
      const target = -doorOpen * THREE.MathUtils.degToRad(78);
      model.door.rotation.y = THREE.MathUtils.damp(model.door.rotation.y, target, 6, d);
    }
    if (model.fan) {
      const omega = (fanRpm / 60) * Math.PI * 2 * (mode === 'show' ? 0.12 : 0.05);
      fanAngle.current += omega * d;
      const base = model.fan.userData.baseQuat as THREE.Quaternion;
      model.fan.quaternion.copy(base).multiply(spin.setFromAxisAngle(axis, fanAngle.current));
      const speed = fanRpm / MAX_RPM;
      if (model.blade) model.blade.opacity = 1 - Math.min(0.72, speed * 0.85);
    }
    if (model.yellow) {
      model.yellow.emissiveIntensity = THREE.MathUtils.damp(model.yellow.emissiveIntensity, 0.35 + ledLevel * 5.5, 10, d);
    }
    const warm = (night ? 1.7 : 0.45) + ledLevel * 1.3;
    model.warmLeds.forEach((mat) => {
      mat.emissiveIntensity = THREE.MathUtils.damp(mat.emissiveIntensity, warm, 6, d);
    });

    if (ledLight.current && model.ledAnchor) {
      model.ledAnchor.getWorldPosition(ledLight.current.position);
      ledLight.current.intensity = THREE.MathUtils.damp(ledLight.current.intensity, ledLevel * 2.2, 8, d);
    }
    if (rgbLight.current && model.rgbAnchor && model.rgb) {
      model.rgbAnchor.getWorldPosition(rgbLight.current.position);
      rgbLight.current.color.copy(model.rgb.emissive);
      rgbLight.current.intensity = THREE.MathUtils.damp(rgbLight.current.intensity, model.rgb.emissiveIntensity * 0.35, 8, d);
    }

    if (mode !== 'lab') return;
    const sim = useSim.getState();

    if (rainRef.current) {
      const amount = sim.env.rain;
      rainRef.current.visible = amount > 0.02;
      if (rainRef.current.visible) {
        const n = Math.floor(rain.count * amount);
        rain.geo.setDrawRange(0, n * 2);
        const p = rain.geo.attributes.position.array as Float32Array;
        for (let i = 0; i < n; i++) {
          const o = i * 6;
          const dy = rain.speeds[i] * d;
          p[o + 1] -= dy;
          p[o + 4] -= dy;
          const onRoof = Math.abs(p[o]) < 1.55 && Math.abs(p[o + 2]) < 1.25 && p[o + 1] < 1.92;
          if (p[o + 1] < 0 || onRoof) {
            const y = 2.8 + Math.random() * 0.4;
            p[o + 1] = y;
            p[o + 4] = y + 0.16;
          }
        }
        rain.geo.attributes.position.needsUpdate = true;
      }
    }

    if (gasRef.current && gasMat.current && model.gas) {
      const density = Math.min(1, sim.sensors.gasPpm / 2200);
      gasRef.current.visible = density > 0.02;
      if (gasRef.current.visible) {
        model.gas.getWorldPosition(gasOrigin);
        gasMat.current.opacity = 0.08 + density * 0.35;
        const p = gas.geo.attributes.position.array as Float32Array;
        for (let i = 0; i < gas.count; i++) {
          gas.life[i] += d * 0.18;
          if (gas.life[i] >= 1) {
            gas.life[i] = 0;
            p.set([gasOrigin.x + (Math.random() - 0.5) * 0.12, gasOrigin.y + Math.random() * 0.08, gasOrigin.z + (Math.random() - 0.5) * 0.12], i * 3);
            gas.vel.set([(Math.random() - 0.5) * 0.15, 0.12 + Math.random() * 0.16, (Math.random() - 0.5) * 0.15], i * 3);
          }
          p[i * 3] += gas.vel[i * 3] * d;
          p[i * 3 + 1] += gas.vel[i * 3 + 1] * d;
          p[i * 3 + 2] += gas.vel[i * 3 + 2] * d;
        }
        gas.geo.setDrawRange(0, Math.floor(gas.count * (0.25 + 0.75 * density)));
        gas.geo.attributes.position.needsUpdate = true;
      }
    }

    if (buzzerRef.current) {
      const on = sim.act.buzzer > 0 ? 1 : 0;
      buzzerLevel.current = THREE.MathUtils.damp(buzzerLevel.current, on, 10, d);
      buzzerRef.current.visible = buzzerLevel.current > 0.02;
      if (model.buzzer) model.buzzer.getWorldPosition(buzzerRef.current.position);
      buzzerPhase.current = (buzzerPhase.current + d * (0.8 + sim.act.buzzer / 1400)) % 1;
      buzzerRef.current.children.forEach((child, i) => {
        const s = (buzzerPhase.current + i / 3) % 1;
        child.scale.setScalar(0.04 + s * 0.28);
        ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (1 - s) * 0.55 * buzzerLevel.current;
      });
    }

    if (pirRef.current && pirMat.current && model.pir) {
      const show = sim.ui.sensorViz || sim.ui.selected === 'pir' || sim.env.personT !== null;
      pirMat.current.opacity = THREE.MathUtils.damp(pirMat.current.opacity, show ? (sim.sensors.pir ? 0.28 : 0.1) : 0, 8, d);
      pirRef.current.visible = pirMat.current.opacity > 0.01;
      model.pir.getWorldPosition(pirRef.current.position);
      model.pir.getWorldQuaternion(pirRef.current.quaternion);
      pirMat.current.color.set(sim.sensors.pir ? '#38f5a8' : '#7eb6ff');
    }
  });

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    if (mode !== 'lab') return;
    e.stopPropagation();
    const id = moduleOf(e.object);
    useSim.getState().setUi({ hovered: id });
    document.body.style.cursor = id ? 'pointer' : 'default';
  };
  const onOut = () => {
    if (mode !== 'lab') return;
    useSim.getState().setUi({ hovered: null });
    document.body.style.cursor = 'default';
  };
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (mode !== 'lab') return;
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
    if (mode !== 'lab') return;
    e.stopPropagation();
    if (e.delta > 6) return;
    const id = moduleOf(e.object);
    if (!id || id === 'btnL' || id === 'btnR') {
      if (id) useSim.getState().setUi({ selected: id });
      return;
    }
    useSim.getState().select(id);
  };

  return (
    <group>
      <primitive object={model.root} onPointerOver={onOver} onPointerOut={onOut} onPointerDown={onDown} onClick={onClick} />
      <pointLight ref={ledLight} color="#ffb547" intensity={0} distance={2.4} decay={2} />
      <pointLight ref={rgbLight} intensity={0} distance={2.2} decay={2} />
      {mode === 'lab' && (
        <>
          <lineSegments ref={rainRef} geometry={rain.geo} frustumCulled={false} visible={false}>
            <lineBasicMaterial color="#c5dcff" transparent opacity={0.4} depthWrite={false} />
          </lineSegments>
          <points ref={gasRef} geometry={gas.geo} frustumCulled={false} visible={false}>
            <pointsMaterial ref={gasMat} color="#b5e07a" size={0.16} sizeAttenuation transparent depthWrite={false} opacity={0.2} />
          </points>
          <group ref={buzzerRef} visible={false}>
            {[0, 1, 2].map((i) => (
              <mesh key={i}>
                <ringGeometry args={[0.9, 1, 40]} />
                <meshBasicMaterial color="#ffd36b" transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
              </mesh>
            ))}
          </group>
          <mesh ref={pirRef} geometry={pirGeo} visible={false} raycast={() => {}}>
            <meshBasicMaterial ref={pirMat} color="#7eb6ff" transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
        </>
      )}
    </group>
  );
}

useGLTF.preload(HOUSE_V2_URL);
