import * as THREE from 'three';
import { INTERIOR_MODULES, moduleById } from '../sim/hardware';
import type { ModuleId } from '../sim/types';
import type { Rig } from './rig';
import { useRig } from './rig';

/** Screen rectangle of the component currently shown in the guide, in stage pixels. */
export const guideBox = {
  active: false,
  id: '' as ModuleId | '',
  ok: false,
  x: 0,
  y: 0,
  w: 0,
  h: 0,
};

const SKIP: Partial<Record<ModuleId, RegExp>> = {
  esp32: /Dupont|Wire/,
  doorServo: /^Door_/,
  fan: /Blur/,
};

const box = new THREE.Box3();
const scratch = new THREE.Box3();
const center = new THREE.Vector3();
const size = new THREE.Vector3();
const corner = new THREE.Vector3();

export function moduleBounds(rig: Rig, id: ModuleId) {
  box.makeEmpty();
  const skip = SKIP[id];
  const pieces: THREE.Box3[] = [];
  const spans: number[] = [];
  for (const mesh of rig.modules.get(id) ?? []) {
    if (!mesh.visible || skip?.test(mesh.name)) continue;
    scratch.setFromObject(mesh);
    if (scratch.isEmpty()) continue;
    const span = Math.max(scratch.max.x - scratch.min.x, scratch.max.y - scratch.min.y, scratch.max.z - scratch.min.z);
    pieces.push(scratch.clone());
    spans.push(span);
  }
  if (!pieces.length) return box;
  const ordered = [...spans].sort((a, b) => a - b);
  const median = ordered[Math.floor(ordered.length / 2)];
  pieces.forEach((piece, i) => {
    if (spans[i] <= median * 3 || pieces.length < 3) box.union(piece);
  });
  if (box.isEmpty()) pieces.forEach((piece) => box.union(piece));
  return box;
}

/** Aims the preset viewing direction at the real component, close enough to identify it. */
export function frameOf(id: ModuleId) {
  const preset = moduleById[id].view;
  const rig = useRig.getState().rig;
  const bounds = rig ? moduleBounds(rig, id) : box.makeEmpty();
  if (bounds.isEmpty()) return preset;
  bounds.getCenter(center);
  bounds.getSize(size);
  const radius = Math.max(size.x, size.y, size.z) * 0.62;
  const dir = new THREE.Vector3(...preset.pos).sub(new THREE.Vector3(...preset.target));
  if (INTERIOR_MODULES.includes(id)) dir.set(0.9, 1.55, 0.45);
  if (dir.lengthSq() < 1e-6) dir.set(0.35, 0.45, 1);
  dir.normalize();
  const dist = THREE.MathUtils.clamp(radius / Math.tan(THREE.MathUtils.degToRad(14)) / 0.42, 2.15, 6.8);
  const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir);
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize();
  const up = new THREE.Vector3().crossVectors(dir, side).normalize();
  const aim = center.clone().addScaledVector(up, -dist * 0.06);
  const pos = aim.clone().addScaledVector(dir, dist);
  return {
    pos: [pos.x, pos.y, pos.z] as [number, number, number],
    target: [aim.x, aim.y, aim.z] as [number, number, number],
  };
}

export function projectGuide(camera: THREE.Camera, width: number, height: number) {
  guideBox.ok = false;
  if (!guideBox.active || !guideBox.id) return;
  const rig = useRig.getState().rig;
  if (!rig) return;
  const bounds = moduleBounds(rig, guideBox.id);
  if (bounds.isEmpty()) return;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let visible = 0;
  for (let i = 0; i < 8; i++) {
    corner.set(
      i & 1 ? bounds.max.x : bounds.min.x,
      i & 2 ? bounds.max.y : bounds.min.y,
      i & 4 ? bounds.max.z : bounds.min.z,
    ).project(camera);
    if (corner.z < -1 || corner.z > 1) continue;
    const x = (corner.x * 0.5 + 0.5) * width;
    const y = (-corner.y * 0.5 + 0.5) * height;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    if (x >= 0 && x <= width && y >= 0 && y <= height) visible++;
  }
  if (visible < 2 || maxX - minX < 2 || maxY - minY < 2) return;

  const pad = 22;
  let x = minX - pad;
  let y = minY - pad;
  let w = maxX - minX + pad * 2;
  let h = maxY - minY + pad * 2;
  if (w < 92) { x -= (92 - w) / 2; w = 92; }
  if (h < 92) { y -= (92 - h) / 2; h = 92; }
  const maxW = width * 0.62;
  const maxH = height * 0.52;
  if (w > maxW) { x += (w - maxW) / 2; w = maxW; }
  if (h > maxH) { y += (h - maxH) / 2; h = maxH; }
  x = THREE.MathUtils.clamp(x, 12, Math.max(12, width - w - 12));
  y = THREE.MathUtils.clamp(y, 12, Math.max(12, height - h - 12));
  guideBox.x = x;
  guideBox.y = y;
  guideBox.w = w;
  guideBox.h = h;
  guideBox.ok = true;
}
