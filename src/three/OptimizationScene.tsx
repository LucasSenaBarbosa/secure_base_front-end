import { CameraControls, Environment, Html } from '@react-three/drei';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { CandidatePoint, HomeLayout, PointCoverage, Room, SensorPlacement } from '../optimization/types';
import { HouseV2 } from './HouseV2';
import { Lights } from './Scene';

export const TYPE_COLORS = ['#7eb6ff', '#ffb547', '#c38bff', '#38f5a8', '#ff7aa8', '#f4e06d'];

export function typeColor(layout: HomeLayout, typeId: string): string {
  const index = layout.sensor_types.findIndex((t) => t.id === typeId);
  return TYPE_COLORS[(index < 0 ? 0 : index) % TYPE_COLORS.length];
}

/** Mesmo cálculo de direção do backend: `direction` ou centro do ambiente. */
function headingAngle(candidate: CandidatePoint, room: Room | undefined): number | null {
  let hx: number;
  let hz: number;
  if (candidate.direction) {
    [hx, , hz] = candidate.direction;
  } else if (room) {
    hx = (room.min_xz[0] + room.max_xz[0]) / 2 - candidate.position[0];
    hz = (room.min_xz[1] + room.max_xz[1]) / 2 - candidate.position[2];
  } else return null;
  if (Math.hypot(hx, hz) < 1e-9) return null;
  // CircleGeometry no plano XY girado −90° em X: ângulo θ aponta para (cos θ, 0, −sin θ).
  return Math.atan2(-hz, hx);
}

function RoomFloor({ room, selected }: { room: Room; selected: boolean }) {
  const w = room.max_xz[0] - room.min_xz[0];
  const d = room.max_xz[1] - room.min_xz[1];
  const cx = (room.min_xz[0] + room.max_xz[0]) / 2;
  const cz = (room.min_xz[1] + room.max_xz[1]) / 2;
  return (
    <group position={[cx, room.floor_y + 0.006, cz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial color={selected ? '#9b8cff' : '#5b7bb0'} transparent opacity={selected ? 0.22 : 0.1} depthWrite={false} toneMapped={false} />
      </mesh>
      <lineSegments rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
        <edgesGeometry args={[new THREE.PlaneGeometry(w, d)]} />
        <lineBasicMaterial color="#8fb0e8" transparent opacity={0.55} toneMapped={false} />
      </lineSegments>
      <Html center position={[0, room.height * 0.02, 0]} style={{ pointerEvents: 'none' }}>
        <span className="opt-room-tag">{room.name}</span>
      </Html>
    </group>
  );
}

function SensorRange({ layout, candidate, typeId }: { layout: HomeLayout; candidate: CandidatePoint; typeId: string }) {
  const type = layout.sensor_types.find((t) => t.id === typeId);
  const room = layout.rooms.find((r) => r.id === candidate.room_id);
  const geometry = useMemo(() => {
    if (!type) return null;
    const heading = type.field_of_view_deg < 360 ? headingAngle(candidate, room) : null;
    const fov = THREE.MathUtils.degToRad(Math.min(type.field_of_view_deg, 360));
    return heading === null
      ? new THREE.CircleGeometry(type.range, 48)
      : new THREE.CircleGeometry(type.range, 36, heading - fov / 2, fov);
  }, [type, candidate, room]);
  if (!type || !geometry) return null;
  const color = typeColor(layout, typeId);
  return (
    <mesh geometry={geometry} position={candidate.position} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
      <meshBasicMaterial color={color} transparent opacity={0.13} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

interface SceneProps {
  layout: HomeLayout;
  sensors: SensorPlacement[];
  coverage: PointCoverage[] | null;
  interactive: boolean;
  moving: string | null;
  selectedRoom: string | null;
  onCandidate: (id: string) => void;
}

function Overlay({ layout, sensors, coverage, interactive, moving, selectedRoom, onCandidate }: SceneProps) {
  const [hover, setHover] = useState<string | null>(null);
  const placed = new Map(sensors.map((s) => [s.candidate_id, s.sensor_type_id]));
  const covered = new Map(coverage?.map((p) => [p.critical_point_id, p]) ?? []);

  const pick = (id: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (interactive && e.delta <= 6) onCandidate(id);
  };

  return (
    <group>
      {layout.rooms.map((room) => <RoomFloor key={room.id} room={room} selected={room.id === selectedRoom} />)}

      {layout.critical_points.map((point) => {
        const state = covered.get(point.id);
        const color = !state ? '#9aa6bd' : state.covered ? '#38f5a8' : '#ff5d73';
        return (
          <mesh key={point.id} position={point.position} raycast={() => {}}>
            <sphereGeometry args={[0.022 + point.importance * 0.006, 20, 14]} />
            <meshBasicMaterial color={color} transparent opacity={0.92} toneMapped={false} />
          </mesh>
        );
      })}

      {layout.candidate_points.map((candidate) => {
        const typeId = placed.get(candidate.id);
        const isHover = hover === candidate.id;
        const isMoving = moving === candidate.id;
        return (
          <group key={candidate.id} position={candidate.position}>
            <mesh
              onClick={pick(candidate.id)}
              onPointerOver={(e) => { e.stopPropagation(); setHover(candidate.id); if (interactive) document.body.style.cursor = 'pointer'; }}
              onPointerOut={() => { setHover(null); document.body.style.cursor = 'default'; }}
            >
              {typeId ? <boxGeometry args={[0.07, 0.07, 0.07]} /> : <octahedronGeometry args={[0.035]} />}
              <meshBasicMaterial
                color={typeId ? typeColor(layout, typeId) : isHover ? '#ffffff' : '#c7d2e6'}
                transparent
                opacity={typeId ? 1 : isHover ? 0.95 : 0.55}
                toneMapped={false}
              />
            </mesh>
            {(isHover || isMoving) && (
              <Html center position={[0, 0.09, 0]} style={{ pointerEvents: 'none' }}>
                <span className="opt-cand-tag">
                  {candidate.name}
                  {typeId ? ` · ${layout.sensor_types.find((t) => t.id === typeId)?.name ?? typeId}` : ''}
                  {isMoving ? ' · movendo' : ''}
                </span>
              </Html>
            )}
          </group>
        );
      })}

      {sensors.map((s) => {
        const candidate = layout.candidate_points.find((c) => c.id === s.candidate_id);
        return candidate ? <SensorRange key={s.candidate_id} layout={layout} candidate={candidate} typeId={s.sensor_type_id} /> : null;
      })}
    </group>
  );
}

export function OptimizationScene(props: SceneProps) {
  return (
    <Canvas
      camera={{ position: [3.2, 3.4, 3.9], fov: 35, near: 0.05, far: 80 }}
      onCreated={({ camera }) => camera.lookAt(0, 0.6, -0.2)}
      dpr={[1, 1.75]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.92 }}
    >
      <color attach="background" args={['#10182b']} />
      <Suspense fallback={<Html center><span className="loading-3d">Carregando maquete…</span></Html>}>
        <HouseV2 mode="show" xray />
        <Environment preset="city" environmentIntensity={0.6} />
      </Suspense>
      <Lights />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
        <circleGeometry args={[7.5, 72]} />
        <meshStandardMaterial color="#0c1322" roughness={0.92} metalness={0.04} />
      </mesh>
      <Overlay {...props} />
      <CameraControls makeDefault minDistance={1.2} maxDistance={11} maxPolarAngle={Math.PI * 0.49} dollySpeed={0.5} />
    </Canvas>
  );
}
