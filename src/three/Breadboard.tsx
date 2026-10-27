import { Html, OrbitControls, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { MODULE_NET, NET_BY_ID, netFocus, netLevel } from '../sim/wiring';
import { useSim } from '../sim/store';

export const PROTO_URL = '/models/protoboard.glb';

const netOf = (obj: THREE.Object3D | null): string | null => {
  for (let n = obj; n; n = n.parent) {
    const wire = /^Wire_([A-Za-z0-9]+)/.exec(n.name);
    if (wire) return wire[1];
    const mod = /^Mod_([A-Za-z0-9]+)/.exec(n.name);
    if (mod) return MODULE_NET[mod[1]] ?? null;
  }
  return null;
};

function Board({
  selected,
  onSelect,
  onHover,
}: {
  selected: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}) {
  const { scene } = useGLTF(PROTO_URL);
  const gl = useThree((s) => s.gl);
  const wires = useMemo(() => {
    const list: { id: string; mat: THREE.MeshStandardMaterial }[] = [];
    const solid = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = mesh.name.startsWith('BB_');
      if (!mesh.geometry.getAttribute('normal')) mesh.geometry.computeVertexNormals();
      const id = /^Wire_([A-Za-z0-9]+)/.exec(mesh.name)?.[1];
      if (!id) {
        mesh.material = solid;
        return;
      }
      const color = new THREE.Color(NET_BY_ID[id]?.color ?? '#ffffff');
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.2,
        roughness: 0.38,
        metalness: 0.08,
        side: THREE.DoubleSide,
      });
      mesh.material = mat;
      list.push({ id, mat });
    });
    return list;
  }, [scene]);

  const focus = selected ? netFocus(selected) : null;
  const focusRef = useRef(focus);
  focusRef.current = focus;

  useFrame((_, dt) => {
    const { sensors, act } = useSim.getState();
    const hot = focusRef.current;
    const t = performance.now() / 1000;
    for (const wire of wires) {
      let level = netLevel(wire.id, sensors, act);
      if (wire.id === 'buzzer' && level > 0.2) level = 0.35 + 0.65 * Math.abs(Math.sin(t * 18));
      if ((wire.id === 'sda' || wire.id === 'scl') && level > 0) {
        level = Math.min(1, level * 0.65 + 0.2 + 0.18 * Math.abs(Math.sin(t * 8)));
      }
      const on = !hot || hot.includes(wire.id);
      const target = on ? 0.16 + level * 1.55 : 0.025;
      wire.mat.emissiveIntensity = THREE.MathUtils.damp(wire.mat.emissiveIntensity, target, 8, dt);
    }
  });

  const hover = (e: { stopPropagation: () => void; object: THREE.Object3D }) => {
    e.stopPropagation();
    const id = netOf(e.object);
    onHover(id);
    gl.domElement.style.cursor = id ? 'pointer' : '';
  };

  return (
    <primitive
      object={scene}
      onClick={(e: { stopPropagation: () => void; object: THREE.Object3D }) => {
        e.stopPropagation();
        onSelect(netOf(e.object));
      }}
      onPointerOver={hover}
      onPointerOut={() => {
        onHover(null);
        gl.domElement.style.cursor = '';
      }}
    />
  );
}

function Tags() {
  return (
    <>
      <Html position={[0, 0.55, 2.35]} center><span className="bb-tag">5 V</span></Html>
      <Html position={[0, 0.55, -2.35]} center><span className="bb-tag">5 V</span></Html>
      <Html position={[4.4, 0.55, 1.35]} center><span className="bb-tag">GND</span></Html>
      <Html position={[4.4, 0.55, -1.35]} center><span className="bb-tag">GND</span></Html>
      <Html position={[-1.78, 0.85, 0.55]} center><span className="bb-tag">3V3 · DHT11</span></Html>
      <Html position={[0, 0.95, 0]} center><span className="bb-tag">ESP32</span></Html>
      <Html position={[-9.15, 1.25, 0]} center><span className="bb-tag">6×AA</span></Html>
    </>
  );
}

function Rig() {
  const camera = useThree((s) => s.camera);
  const aimed = useRef(false);
  useFrame(() => {
    if (aimed.current) return;
    aimed.current = true;
    camera.position.set(-1.2, 19, 7.2);
    camera.lookAt(-1.2, 0, 0);
  }, -2);
  return (
    <OrbitControls
      makeDefault
      target={[-1.2, 0, 0]}
      minDistance={6}
      maxDistance={28}
      minPolarAngle={0.12}
      maxPolarAngle={Math.PI / 2.08}
      enableDamping
    />
  );
}

export function BreadboardScene({
  selected,
  onSelect,
  onHover,
}: {
  selected: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}) {
  return (
    <Canvas
      camera={{ position: [-1.2, 19, 7.2], fov: 36, near: 0.05, far: 90 }}
      onCreated={({ camera }) => camera.lookAt(-1.2, 0, 0)}
      shadows
      dpr={[1, 1.75]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={['#10182b']} />
      <ambientLight intensity={0.34} />
      <hemisphereLight args={['#d5e2ff', '#2a2118', 0.55]} />
      <directionalLight
        position={[6, 12, 7]}
        intensity={2.2}
        color="#fff4e8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-near={2}
        shadow-camera-far={40}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <directionalLight position={[-7, 5, -4]} intensity={0.45} color="#8ea4ff" />
      <Suspense fallback={<Html center><span className="loading-3d">Carregando protoboard…</span></Html>}>
        <Board selected={selected} onSelect={onSelect} onHover={onHover} />
        <Tags />
      </Suspense>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.92, 0]} receiveShadow>
        <circleGeometry args={[16, 64]} />
        <meshStandardMaterial color="#16324a" roughness={0.94} metalness={0} />
      </mesh>
      <Rig />
    </Canvas>
  );
}
