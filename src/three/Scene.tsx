import { CameraControls, ContactShadows, Environment, Html } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer, Noise, Vignette } from '@react-three/postprocessing';
import { Suspense, useRef, type Ref } from 'react';
import * as THREE from 'three';
import { moduleById } from '../sim/hardware';
import { useSim } from '../sim/store';
import type { ModuleId } from '../sim/types';
import { Effects } from './Effects';
import { House } from './House';
import { HouseV2 } from './HouseV2';
import { frameOf, guideBox, projectGuide } from './spotlight';

type Cam = {
  setLookAt(px: number, py: number, pz: number, tx: number, ty: number, tz: number, transition?: boolean): void;
  rotate(azimuth: number, polar: number, transition: boolean): void;
};

const VIEWS: Record<string, { pos: [number, number, number]; target: [number, number, number] }> = {
  home: { pos: [3.6, 2.15, 4.35], target: [0.05, 0.78, 0] },
  front: { pos: [0.1, 1.05, 3.6], target: [0.05, 0.7, 0.15] },
  back: { pos: [0.15, 1.05, -3.5], target: [0.05, 0.62, -0.2] },
  top: { pos: [0.15, 5.2, 0.01], target: [0.05, 0.2, 0] },
  side: { pos: [4.3, 1.55, 0.4], target: [0.05, 0.75, 0] },
};

const NIGHT = new THREE.Color('#070b14');
const DAY = new THREE.Color('#10182b');

function CameraRig() {
  const controls = useRef<Cam>(null);
  const focus = useSim((s) => s.ui.focus);
  const auto = useSim((s) => s.ui.autoRotate);
  const applied = useRef(-1);

  useFrame(({ camera, size }, dt) => {
    const cam = controls.current;
    if (!cam) return;
    if (applied.current !== focus.nonce) {
      applied.current = focus.nonce;
      const view = VIEWS[focus.target] ?? (moduleById[focus.target as ModuleId] ? frameOf(focus.target as ModuleId) : undefined);
      if (view) cam.setLookAt(view.pos[0], view.pos[1], view.pos[2], view.target[0], view.target[1], view.target[2], applied.current > 0);
    } else if (auto && !guideBox.active) {
      cam.rotate(dt * 0.16, 0, false);
    }
    projectGuide(camera, size.width, size.height);
  });

  return (
    <CameraControls
      ref={controls as unknown as Ref<CameraControls>}
      makeDefault
      smoothTime={0.42}
      draggingSmoothTime={0.12}
      minDistance={1.2}
      maxDistance={11}
      maxPolarAngle={Math.PI * 0.49}
      dollySpeed={0.5}
    />
  );
}

function Lights() {
  const amb = useRef<THREE.AmbientLight>(null!);
  const hemi = useRef<THREE.HemisphereLight>(null!);
  const sun = useRef<THREE.DirectionalLight>(null!);
  const fill = useRef<THREE.DirectionalLight>(null!);
  useFrame(({ scene }, dt) => {
    const night = useSim.getState().env.night;
    const k = 1 - Math.exp(-dt * 2.2);
    const bg = scene.background;
    if (bg instanceof THREE.Color) bg.lerp(night ? NIGHT : DAY, k);
    amb.current.intensity = THREE.MathUtils.damp(amb.current.intensity, night ? 0.05 : 0.18, 2.2, dt);
    hemi.current.intensity = THREE.MathUtils.damp(hemi.current.intensity, night ? 0.12 : 0.5, 2.2, dt);
    sun.current.intensity = THREE.MathUtils.damp(sun.current.intensity, night ? 0.1 : 2.1, 2.2, dt);
    fill.current.intensity = THREE.MathUtils.damp(fill.current.intensity, night ? 0.04 : 0.45, 2.2, dt);
  });
  return (
    <>
      <ambientLight ref={amb} intensity={0.18} />
      <hemisphereLight ref={hemi} args={['#c9d6ff', '#24180f', 0.5]} />
      <directionalLight
        ref={sun}
        position={[5.5, 8, 3.5]}
        intensity={2.1}
        color="#ffeedd"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
        shadow-camera-near={1}
        shadow-camera-far={24}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
      />
      <directionalLight ref={fill} position={[-4, 3, -2]} intensity={0.7} color="#8ea4ff" />
    </>
  );
}

function Beacon() {
  const selected = useSim((s) => s.ui.selected);
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const s = 1 + Math.sin(clock.elapsedTime * 3.2) * 0.08;
    ref.current.scale.setScalar(s);
  });
  if (!selected || guideBox.active) return null;
  const target = moduleById[selected].view.target;
  return (
    <mesh ref={ref} position={target} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
      <ringGeometry args={[0.16, 0.2, 48]} />
      <meshBasicMaterial color="#9b8cff" transparent opacity={0.9} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

export function Scene() {
  const model = useSim((s) => s.ui.model);
  return (
    <Canvas
      camera={{ position: [3.6, 2.15, 4.35], fov: 35, near: 0.05, far: 80 }}
      onCreated={({ camera }) => camera.lookAt(0.05, 0.78, 0)}
      shadows
      dpr={[1, 1.75]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.92 }}
      onPointerMissed={() => useSim.getState().setUi({ selected: null })}
    >
      <color attach="background" args={['#10182b']} />
      <Suspense fallback={<Html center><span className="loading-3d">Carregando gêmeo digital…</span></Html>}>
        {model === 'v2' ? <HouseV2 mode="lab" /> : <><House /><Effects /></>}
        <Environment preset="city" environmentIntensity={0.6} />
        <ContactShadows position={[0, -0.02, 0]} opacity={0.58} scale={10} blur={2.1} far={3} color="#05070c" />
      </Suspense>
      <Lights />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
        <circleGeometry args={[7.5, 72]} />
        <meshStandardMaterial color="#0c1322" roughness={0.92} metalness={0.04} />
      </mesh>
      <gridHelper args={[14, 40, '#1c2838', '#121a28']} position={[0, -0.025, 0]} />
      <Beacon />
      <CameraRig />
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.42} luminanceThreshold={0.78} luminanceSmoothing={0.28} mipmapBlur />
        <Vignette eskil={false} offset={0.18} darkness={0.42} />
        <Noise opacity={0.006} />
      </EffectComposer>
    </Canvas>
  );
}
