/** Shared geometry of the simulated world, in scene units (1 unit = 100 mm). */

export const PIR_POS = { x: -0.39, y: 0.86, z: 0.8 };
export const PIR_RANGE = 1.75;

const A = { x: 2.9, z: 2.6 };
const B = { x: 0.3, z: 1.4 };
const C = { x: -2.9, z: 2.6 };

/** Visitor walking path: arrives at the door around t = 0.5 and leaves to the left. */
export function personPos(t: number) {
  const k = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const ease = k * k * (3 - 2 * k);
  const [p, q] = t < 0.5 ? [A, B] : [B, C];
  const x = p.x + (q.x - p.x) * ease;
  const z = p.z + (q.z - p.z) * ease;
  const heading = Math.atan2(q.x - p.x, q.z - p.z);
  return { x, z, heading };
}

export function pirSees(t: number | null) {
  if (t === null) return false;
  const p = personPos(t);
  const dx = p.x - PIR_POS.x;
  const dz = p.z - PIR_POS.z;
  if (dz <= 0.05) return false;
  const dist = Math.hypot(dx, dz);
  const angle = Math.abs(Math.atan2(dx, dz));
  return dist < PIR_RANGE && angle < (55 * Math.PI) / 180;
}
