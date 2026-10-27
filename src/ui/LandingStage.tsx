import { ContactShadows, Environment, Html, Lightformer, MeshReflectorMaterial, OrbitControls, Sparkles, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, ChromaticAberration, DepthOfField, EffectComposer, Noise, Vignette } from '@react-three/postprocessing';
import { Suspense, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import * as THREE from 'three';
import { HouseV2 } from '../three/HouseV2';
import { PARTS_V2_URL, SHOW_PARTS, buildShowParts, disposeMaterials } from '../three/v2model';

export function useStill() {
  const [still, setStill] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setStill(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return still;
}

function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(255,255,255,0.55)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function StudioEnv() {
  return (
    <Environment resolution={256} frames={1}>
      <Lightformer form="rect" intensity={2.6} color="#fff4e6" position={[0, 6, 2]} rotation-x={Math.PI / 2} scale={[10, 6, 1]} />
      <Lightformer form="rect" intensity={1.6} color="#9fb8ff" position={[-6, 2, 0]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} />
      <Lightformer form="rect" intensity={1.4} color="#ffd6a3" position={[6, 2, -1]} rotation-y={-Math.PI / 2} scale={[8, 3, 1]} />
      <Lightformer form="ring" intensity={2.2} color="#c4b5fd" position={[0, 3, -6]} scale={3} />
    </Environment>
  );
}

function Reflector({ radius, color }: { radius: number; color: string }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]}>
      <circleGeometry args={[radius, 96]} />
      <MeshReflectorMaterial
        resolution={1024}
        blur={[320, 90]}
        mixBlur={1}
        mixStrength={22}
        mixContrast={1.1}
        depthScale={1.1}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.3}
        roughness={0.85}
        metalness={0.55}
        color={color}
        mirror={0.6}
      />
    </mesh>
  );
}

function Rings({ still, radius, y = 0.012 }: { still: boolean; radius: number; y?: number }) {
  const spin = useRef<THREE.Group>(null);
  const waves = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (still) return;
    const t = clock.elapsedTime;
    if (spin.current) spin.current.rotation.z = t * 0.16;
    waves.current?.children.forEach((child, i) => {
      const s = (t * 0.22 + i / 3) % 1;
      child.scale.setScalar(0.4 + s * 1.3);
      ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (1 - s) * 0.4;
    });
  });
  return (
    <group position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <group ref={spin}>
        <mesh>
          <ringGeometry args={[radius, radius * 1.012, 128]} />
          <meshBasicMaterial color="#cdbdff" transparent opacity={0.55} toneMapped={false} depthWrite={false} />
        </mesh>
        {Array.from({ length: 36 }, (_, i) => {
          const a = (i / 36) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * radius * 1.05, Math.sin(a) * radius * 1.05, 0]} rotation={[0, 0, a]}>
              <planeGeometry args={[i % 3 === 0 ? 0.09 : 0.04, 0.012]} />
              <meshBasicMaterial color="#9ad8ff" transparent opacity={0.7} toneMapped={false} depthWrite={false} />
            </mesh>
          );
        })}
      </group>
      <group ref={waves}>
        {[0, 1, 2].map((i) => (
          <mesh key={i}>
            <ringGeometry args={[radius * 0.97, radius, 96]} />
            <meshBasicMaterial color="#7dd3fc" transparent opacity={0.3} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Fireflies({ still, count, area, height, color }: { still: boolean; count: number; area: number; height: number; color: string }) {
  const geo = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) pos.set([(Math.random() - 0.5) * area, Math.random() * height, (Math.random() - 0.5) * area], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, [count, area, height]);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame(({ clock }, dt) => {
    if (still) return;
    const p = geo.attributes.position.array as Float32Array;
    const t = clock.elapsedTime;
    for (let i = 0; i < p.length; i += 3) {
      p[i + 1] += dt * (0.05 + ((i * 7) % 5) * 0.012);
      p[i] += Math.sin(t * 0.6 + i) * dt * 0.03;
      if (p[i + 1] > height) p[i + 1] = 0;
    }
    geo.attributes.position.needsUpdate = true;
  });
  return (
    <points geometry={geo} frustumCulled={false}>
      <pointsMaterial color={color} size={0.028} transparent opacity={0.85} depthWrite={false} sizeAttenuation toneMapped={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

const heroAberration = new THREE.Vector2(0.00035, 0.0005);

export function HouseHero() {
  const still = useStill();
  return (
    <div className="land-stage" aria-hidden="true">
      <Canvas
        camera={{ position: [4.15, 2.05, 4.55], fov: 34, near: 0.05, far: 40 }}
        onCreated={({ camera }) => camera.lookAt(0, 0.9, 0)}
        shadows
        dpr={[1, 1.75]}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.08 }}
      >
        <color attach="background" args={['#05070d']} />
        <fog attach="fog" args={['#05070d', 8, 15]} />
        <Suspense fallback={<Html center><span className="loading-3d">Carregando casa V2…</span></Html>}>
          <HouseV2 mode="show" />
          <StudioEnv />
          <Reflector radius={6} color="#0a0f1b" />
          <ContactShadows position={[0, 0.002, 0]} opacity={0.55} scale={7} blur={2.4} far={2.2} color="#020308" />
        </Suspense>
        <hemisphereLight args={['#d7e6ff', '#24180f', 0.5]} />
        <directionalLight
          position={[4.2, 6.4, 2.6]}
          intensity={2.4}
          color="#fff0e0"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0004}
          shadow-camera-near={0.4}
          shadow-camera-far={16}
          shadow-camera-left={-4}
          shadow-camera-right={4}
          shadow-camera-top={4}
          shadow-camera-bottom={-4}
        />
        <pointLight position={[-2.6, 1.4, -1.6]} color="#7c8cff" intensity={7} distance={9} />
        <pointLight position={[2.4, 0.4, 2.2]} color="#ffb37a" intensity={4} distance={6} />
        <Rings still={still} radius={2.2} />
        <Sparkles count={60} scale={[4, 2.4, 4]} position={[0, 1.2, 0]} size={2.4} speed={still ? 0 : 0.35} color="#ffe3b8" opacity={0.75} />
        <Fireflies still={still} count={90} area={4.6} height={2.6} color="#9ad8ff" />
        <OrbitControls
          autoRotate={!still}
          autoRotateSpeed={0.55}
          enablePan={false}
          enableZoom={false}
          minPolarAngle={0.55}
          maxPolarAngle={Math.PI * 0.47}
          target={[0, 0.9, 0]}
        />
        <EffectComposer multisampling={4}>
          <Bloom intensity={0.85} luminanceThreshold={0.62} luminanceSmoothing={0.25} mipmapBlur radius={0.72} />
          <ChromaticAberration offset={heroAberration} radialModulation modulationOffset={0.3} />
          <Vignette eskil={false} offset={0.12} darkness={0.62} />
          <Noise opacity={0.018} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}

const COUNT = SHOW_PARTS.length;
const STEP = (Math.PI * 2) / COUNT;
const RADIUS = 3.4;
const AUTO_SPEED = -0.17;

interface Spin {
  angle: number;
  vel: number;
  drag: boolean;
  hold: number;
  target: number | null;
}

function Carousel({ spin, onFront, still }: { spin: React.MutableRefObject<Spin>; onFront: (i: number) => void; still: boolean }) {
  const { scene } = useGLTF(PARTS_V2_URL);
  const parts = useMemo(() => buildShowParts(scene), [scene]);
  useEffect(() => () => parts.forEach((part) => disposeMaterials(part.object)), [parts]);
  const slots = useRef<(THREE.Group | null)[]>([]);
  const halos = useRef<(THREE.Mesh | null)[]>([]);
  const front = useRef(-1);
  const beam = useMemo(() => beamTexture(), []);
  useEffect(() => () => beam.dispose(), [beam]);
  const beamMat = useRef<THREE.MeshBasicMaterial>(null);
  const spot = useRef<THREE.PointLight>(null);

  useFrame(({ clock }, dt) => {
    const d = Math.min(dt, 0.05);
    const t = clock.elapsedTime;
    const s = spin.current;
    if (!s.drag) {
      if (s.target !== null) {
        s.angle = THREE.MathUtils.damp(s.angle, s.target, 4.2, d);
        s.vel = 0;
        if (Math.abs(s.angle - s.target) < 0.002) { s.angle = s.target; s.target = null; s.hold = 3.2; }
      } else {
        if (s.hold > 0) s.hold -= d;
        s.vel = THREE.MathUtils.damp(s.vel, still || s.hold > 0 ? 0 : AUTO_SPEED, 1.4, d);
        s.angle += s.vel * d;
      }
    }

    let best = 0;
    let bestCos = -2;
    parts.forEach((part, i) => {
      const slot = slots.current[i];
      if (!slot) return;
      const a = i * STEP + s.angle;
      const c = Math.cos(a);
      if (c > bestCos) { bestCos = c; best = i; }
      const f = Math.pow((c + 1) / 2, 4);
      slot.position.set(Math.sin(a) * RADIUS, 1.02 + f * 0.22 + (still ? 0 : Math.sin(t * 1.1 + i * 1.7) * 0.06), Math.cos(a) * RADIUS);
      slot.scale.setScalar(0.6 + f * 0.85);
      if (!still) slot.rotation.y += d * (0.3 + f * 0.55);
      slot.rotation.x = 0.12 + Math.sin(t * 0.7 + i) * 0.05;
      if (part.spin) part.spin.rotateY(d * 7);
      const pulse = 0.5 + Math.sin(t * 3 + i) * 0.5;
      part.glow.forEach((mat) => { mat.emissiveIntensity = 0.9 + pulse * 2.4 + f * 1.5; });
      const halo = halos.current[i];
      if (halo) {
        halo.position.set(slot.position.x, 0.012, slot.position.z);
        (halo.material as THREE.MeshBasicMaterial).opacity = 0.1 + f * 0.7;
        halo.scale.setScalar(0.55 + f * 0.45);
      }
    });
    if (beamMat.current) beamMat.current.opacity = 0.32 + Math.sin(t * 2.2) * 0.08;
    if (spot.current) spot.current.intensity = 5 + Math.sin(t * 2.2) * 1.2;
    if (best !== front.current) {
      front.current = best;
      onFront(best);
    }
  });

  return (
    <>
      {parts.map((part, i) => (
        <group key={part.prefix} ref={(node) => { slots.current[i] = node; }}>
          <primitive object={part.object} />
        </group>
      ))}
      {parts.map((part, i) => (
        <mesh key={`halo-${part.prefix}`} ref={(node) => { halos.current[i] = node; }} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.52, 0.56, 64]} />
          <meshBasicMaterial color="#a5b4fc" transparent opacity={0.2} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
      <mesh position={[0, 1.1, RADIUS]}>
        <cylinderGeometry args={[0.7, 0.82, 2.2, 64, 1, true]} />
        <meshBasicMaterial ref={beamMat} map={beam} color="#8ec5ff" transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <pointLight ref={spot} position={[0, 2.6, RADIUS + 0.4]} color="#cfe1ff" intensity={5} distance={5} />
    </>
  );
}

const carouselAberration = new THREE.Vector2(0.0004, 0.0006);

const pushFor = (width: number, height: number) => Math.max(1, 2.1 / (width / Math.max(height, 1)));

function FitCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    const push = pushFor(size.width, size.height);
    camera.position.set(0, 1.75 + (push - 1) * 0.8, 8.9 * push);
    camera.lookAt(0, 1.05, 0);
  }, [camera, size.width, size.height]);
  return null;
}

function CarouselFx() {
  const size = useThree((s) => s.size);
  const focus = 8.9 * pushFor(size.width, size.height) - RADIUS;
  return (
    <EffectComposer multisampling={0}>
      <DepthOfField worldFocusDistance={focus} worldFocusRange={3.2} bokehScale={4.5} />
      <Bloom intensity={1} luminanceThreshold={0.58} luminanceSmoothing={0.25} mipmapBlur radius={0.75} />
      <ChromaticAberration offset={carouselAberration} radialModulation modulationOffset={0.35} />
      <Vignette eskil={false} offset={0.1} darkness={0.66} />
      <Noise opacity={0.02} />
    </EffectComposer>
  );
}

export function PartCarousel() {
  const still = useStill();
  const [index, setIndex] = useState(0);
  const spin = useRef<Spin>({ angle: 0, vel: AUTO_SPEED, drag: false, hold: 0, target: null });
  const dragFrom = useRef({ x: 0, t: 0 });
  const part = SHOW_PARTS[index];

  const goTo = (next: number) => {
    const i = ((next % COUNT) + COUNT) % COUNT;
    const s = spin.current;
    const k = Math.round((s.angle + i * STEP) / (Math.PI * 2));
    s.target = -i * STEP + k * Math.PI * 2;
  };

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    spin.current.drag = true;
    spin.current.target = null;
    dragFrom.current = { x: e.clientX, t: e.timeStamp };
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = spin.current;
    if (!s.drag) return;
    const dx = e.clientX - dragFrom.current.x;
    const dt = Math.max(1, e.timeStamp - dragFrom.current.t) / 1000;
    s.angle += dx * 0.0055;
    s.vel = THREE.MathUtils.clamp((dx * 0.0055) / dt, -6, 6);
    dragFrom.current = { x: e.clientX, t: e.timeStamp };
  };
  const up = () => {
    spin.current.drag = false;
    spin.current.hold = 1.8;
  };

  return (
    <section className="land-carousel" aria-label="Componentes 3D da casa V2">
      <div className="land-carousel-head reveal">
        <p className="land-kicker">Componentes da casa V2</p>
        <h2 className="fx-title">Os módulos, em órbita.</h2>
        <p>Arraste para girar. Cada peça é o modelo 3D real que vai dentro da maquete.</p>
      </div>
      <div
        className="land-carousel-stage"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerEnter={() => { spin.current.hold = Math.max(spin.current.hold, 0.6); }}
      >
        <Canvas
          camera={{ position: [0, 1.75, 8.9], fov: 30, near: 0.1, far: 40 }}
          onCreated={({ camera }) => camera.lookAt(0, 1.05, 0)}
          dpr={[1, 1.75]}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
        >
          <FitCamera />
          <color attach="background" args={['#05070d']} />
          <fog attach="fog" args={['#05070d', 7, 26]} />
          <Suspense fallback={<Html center><span className="loading-3d">Carregando componentes…</span></Html>}>
            <Carousel spin={spin} onFront={setIndex} still={still} />
            <StudioEnv />
            <Reflector radius={9} color="#090d18" />
          </Suspense>
          <ambientLight intensity={0.25} />
          <directionalLight position={[3, 5, 4]} intensity={2} color="#fff2e2" />
          <pointLight position={[-5, 2, -2]} color="#7c8cff" intensity={9} distance={12} />
          <pointLight position={[5, 1.5, -1]} color="#ff9fd2" intensity={6} distance={10} />
          <Rings still={still} radius={RADIUS + 0.55} />
          <Sparkles count={120} scale={[11, 3.4, 7]} position={[0, 1.6, 0]} size={2.2} speed={still ? 0 : 0.3} color="#cfe1ff" opacity={0.7} />
          <Fireflies still={still} count={140} area={10} height={3.4} color="#ffd9a8" />
          <CarouselFx />
        </Canvas>
        <div className="land-carousel-info" aria-live="polite">
          <span>{String(index + 1).padStart(2, '0')} / {String(COUNT).padStart(2, '0')}</span>
          <b key={part.prefix}>{part.title}</b>
          <p key={`${part.prefix}-text`}>{part.text}</p>
        </div>
        <button type="button" className="land-carousel-arrow prev" aria-label="Componente anterior" onPointerDown={(e) => e.stopPropagation()} onClick={() => goTo(index - 1)}>‹</button>
        <button type="button" className="land-carousel-arrow next" aria-label="Próximo componente" onPointerDown={(e) => e.stopPropagation()} onClick={() => goTo(index + 1)}>›</button>
      </div>
      <div className="land-part-row">
        {SHOW_PARTS.map((item, i) => (
          <button key={item.prefix} type="button" className={i === index ? 'on' : ''} onClick={() => goTo(i)}>
            {item.title}
          </button>
        ))}
      </div>
    </section>
  );
}

useGLTF.preload(PARTS_V2_URL);
