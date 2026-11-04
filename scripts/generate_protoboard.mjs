/**
 * Gera public/models/protoboard.glb para desenvolvimento e build.
 * O binário não entra no Git; a protoboard continua igual porque
 * os nomes Wire_<id> e Mod_<id> são o contrato de src/three/Breadboard.tsx.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      }).catch((error) => {
        this.error = error;
        this.onerror?.(error);
      });
    }
  };
}

const PITCH = 0.254;
const ZE = 0.17;

const BODY = [236, 237, 234];
const BODY_DARK = [206, 208, 204];
const HOLE = [36, 40, 46];
const RED = [198, 42, 48];
const BLUE = [32, 92, 196];
const BLACK = [22, 24, 28];
const GOLD = [214, 170, 62];
const PCB = [27, 46, 40];
const ESP = [18, 26, 34];
const SILVER = [176, 182, 188];
const WHITE = [236, 238, 236];
const YELLOW = [240, 196, 48];
const V3 = [255, 156, 122];

const group = new THREE.Group();
group.name = 'Protoboard';
const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });

const zTerm = (row, side) => side * (ZE + row * PITCH);
const xcol = (col) => (col - 31) * PITCH;
const Z_BLUE = zTerm(4, 1) + 0.38;
const Z_RED = Z_BLUE + PITCH + 0.12;

function paint(geo, color) {
  geo.clearGroups();
  geo.deleteAttribute('uv');
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const n = geo.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  const r = color[0] / 255;
  const g = color[1] / 255;
  const b = color[2] / 255;
  for (let i = 0; i < n; i++) {
    arr[i * 3] = r;
    arr[i * 3 + 1] = g;
    arr[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function box(size, at, color) {
  const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
  geo.translate(at[0], at[1], at[2]);
  return paint(geo, color);
}

function cyl(r, h, at, color, axis = 'y', sections = 8) {
  const geo = new THREE.CylinderGeometry(r, r, h, sections);
  if (axis === 'z') geo.rotateX(Math.PI / 2);
  else if (axis === 'x') geo.rotateZ(Math.PI / 2);
  geo.translate(at[0], at[1], at[2]);
  return paint(geo, color);
}

function merge(parts) {
  const geos = parts.filter(Boolean);
  if (!geos.length) return null;
  return geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
}

function add(geo, name) {
  if (!geo) return;
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  group.add(mesh);
}

function curve(a, b, lift, bulge = 0) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dist = b.distanceTo(a);
  mid.y += lift == null ? Math.min(2.5, 0.4 + dist * 0.2) : lift;
  mid.z += bulge;
  const pts = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const omt = 1 - t;
    pts.push(new THREE.Vector3(
      omt * omt * a.x + 2 * omt * t * mid.x + t * t * b.x,
      omt * omt * a.y + 2 * omt * t * mid.y + t * t * b.y,
      omt * omt * a.z + 2 * omt * t * mid.z + t * t * b.z,
    ));
  }
  return pts;
}

function tube(points, radius, color) {
  const parts = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const v = b.clone().sub(a);
    const h = v.length();
    if (h < 1e-4) continue;
    const geo = new THREE.CylinderGeometry(radius, radius, h, 7);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, v.normalize()));
    const mid = a.clone().add(b).multiplyScalar(0.5);
    geo.translate(mid.x, mid.y, mid.z);
    parts.push(paint(geo, color));
  }
  return parts;
}

const wireParts = new Map();

function jumper(wireId, color, start, end, lift = null, bulge = 0) {
  const parts = tube(curve(start, end, lift, bulge), 0.045, color);
  if (!parts.length) return;
  const list = wireParts.get(wireId) ?? [];
  list.push(...parts);
  wireParts.set(wireId, list);
}

const espPin = (i, side) => new THREE.Vector3((i - 7) * PITCH, 0.22, zTerm(0, side));
const modPin = (col, side, y = 0.4) => new THREE.Vector3(xcol(col), y, zTerm(4, side));
const rail = (x, which, side, y = 0.12) => new THREE.Vector3(x, y, side * (which === 'red' ? Z_RED : Z_BLUE));

function buildBoard() {
  const span = xcol(62) - xcol(0);
  const length = span + 0.9;
  const width = (Z_RED + 0.55) * 2;
  add(box([length, 0.86, width], [0, -0.43, 0], BODY), 'BB_Body');
  add(box([length * 0.94, 0.1, 0.2], [0, -0.04, 0], BODY_DARK), 'BB_Trench');
  add(box([length * 0.9, 0.025, 0.09], [0, 0.012, Z_RED + 0.16], RED), 'BB_StripeRedTop');
  add(box([length * 0.9, 0.025, 0.09], [0, 0.012, -Z_RED - 0.16], RED), 'BB_StripeRedBottom');
  add(box([length * 0.9, 0.025, 0.09], [0, 0.012, Z_BLUE - 0.18], BLUE), 'BB_StripeBlueTop');
  add(box([length * 0.9, 0.025, 0.09], [0, 0.012, -Z_BLUE + 0.18], BLUE), 'BB_StripeBlueBottom');

  const holes = [];
  for (let col = 0; col < 63; col++) {
    const x = xcol(col);
    for (const side of [1, -1]) {
      for (let row = 0; row < 5; row++) holes.push(cyl(0.055, 0.04, [x, 0.02, zTerm(row, side)], HOLE, 'y', 6));
      holes.push(cyl(0.055, 0.04, [x, 0.02, side * Z_RED], HOLE, 'y', 6));
      holes.push(cyl(0.055, 0.04, [x, 0.02, side * Z_BLUE], HOLE, 'y', 6));
    }
  }
  add(merge(holes), 'BB_Holes');
}

function buildEsp32() {
  const parts = [
    box([4.55, 0.18, 2.15], [0, 0.14, 0], ESP),
    box([0.72, 0.22, 0.62], [2.45, 0.18, 0], SILVER),
    box([1.55, 0.1, 1.15], [0.15, 0.26, 0.05], [12, 14, 16]),
    box([0.7, 0.04, 0.7], [0.15, 0.32, 0.05], SILVER),
  ];
  for (let i = 0; i < 15; i++) {
    const x = (i - 7) * PITCH;
    for (const side of [1, -1]) parts.push(cyl(0.042, 0.32, [x, 0.02, zTerm(0, side)], GOLD));
  }
  add(merge(parts), 'Mod_esp32');
}

function dress(kind, cx, zc, side) {
  const y = 0.28;
  const parts = [];
  if (kind === 'led') {
    parts.push(cyl(0.16, 0.16, [cx, y, zc], YELLOW, 'y', 12));
    parts.push(cyl(0.09, 0.08, [cx, y + 0.1, zc], [255, 236, 170], 'y', 10));
  } else if (kind === 'rgb') {
    for (const dx of [-0.28, -0.09, 0.09, 0.28]) parts.push(box([0.12, 0.06, 0.12], [cx + dx, y, zc], WHITE));
  } else if (kind === 'btnL' || kind === 'btnR') {
    parts.push(cyl(0.2, 0.12, [cx, y, zc], kind === 'btnL' ? YELLOW : [64, 158, 214], 'y', 14));
  } else if (kind === 'pir') {
    parts.push(cyl(0.22, 0.16, [cx, y, zc], WHITE, 'y', 14));
    parts.push(cyl(0.1, 0.08, [cx, y + 0.1, zc], [186, 196, 204], 'y', 12));
  } else if (kind === 'buzzer') {
    parts.push(cyl(0.22, 0.1, [cx, y, zc], BLACK, 'y', 14));
    parts.push(cyl(0.08, 0.04, [cx, y + 0.06, zc], [70, 74, 78], 'y', 10));
  } else if (kind === 'dht') {
    parts.push(box([0.42, 0.18, 0.28], [cx, y, zc], BLUE));
  } else if (kind === 'steam') {
    parts.push(box([0.55, 0.04, 0.36], [cx, y, zc], GOLD));
  } else if (kind === 'gas') {
    parts.push(cyl(0.2, 0.22, [cx, y, zc], SILVER, 'y', 12));
    parts.push(cyl(0.1, 0.08, [cx, y + 0.12, zc], [120, 90, 70], 'y', 10));
  } else if (kind === 'lcd') {
    parts.push(box([1.15, 0.08, 0.48], [cx, y, zc], [24, 58, 150]));
    parts.push(box([1.05, 0.03, 0.36], [cx, y + 0.05, zc], [170, 196, 255]));
  } else if (kind === 'rfid') {
    [0.28, 0.2, 0.12].forEach((r, i) => parts.push(cyl(r, 0.03, [cx, y + i * 0.02, zc], GOLD, 'y', 14)));
  } else if (kind === 'door' || kind === 'window') {
    parts.push(box([0.7, 0.28, 0.38], [cx, y, zc], BLACK));
    parts.push(box([0.34, 0.05, 0.1], [cx + 0.28 * side, y + 0.12, zc], WHITE));
  } else if (kind === 'fan') {
    parts.push(cyl(0.16, 0.12, [cx, y, zc], GOLD, 'y', 12));
    for (const ang of [0, 2.2, 4.2]) {
      const blade = new THREE.BoxGeometry(0.1, 0.03, 0.36);
      blade.rotateY(ang);
      blade.translate(cx, y + 0.1, zc);
      parts.push(paint(blade, WHITE));
    }
  }
  return parts;
}

function addModule(mid, kind, side, cols, supply, signals) {
  const cx = cols.reduce((sum, col) => sum + xcol(col), 0) / cols.length;
  const zc = side * zTerm(2, 1);
  const width = (cols[cols.length - 1] - cols[0]) * PITCH + 0.7;
  const parts = [box([width, 0.1, 1.2], [cx, 0.16, zc], PCB)];
  cols.forEach((col, index) => {
    parts.push(cyl(0.04, 0.34, [xcol(col), 0.08, zTerm(4, side)], GOLD));
    const cap = index === 0 ? BLACK : index === 1 ? RED : GOLD;
    parts.push(cyl(0.055, 0.05, [xcol(col), 0.28, zTerm(4, side)], cap));
  });
  for (const [wireId, index, , , color] of signals) {
    parts.push(cyl(0.06, 0.045, [xcol(cols[index]), 0.32, zTerm(4, side)], color));
    void wireId;
  }
  parts.push(...dress(kind, cx, zc + side * 0.12, side));
  add(merge(parts), `Mod_${mid}`);

  const gnd = modPin(cols[0], side);
  const vcc = modPin(cols[1], side);
  jumper('gnd', BLACK, gnd, rail(gnd.x, 'blue', side), 0.45, 0);
  if (supply === 'v5') jumper('v5', RED, vcc, rail(vcc.x, 'red', side), 0.55, 0.08 * side);
  else jumper('v3', V3, vcc, espPin(0, 1), 1.15, 0.25);
  for (const [wireId, index, espSide, espI, color] of signals) {
    const start = modPin(cols[index], side, 0.46);
    const end = espPin(espI, espSide).add(new THREE.Vector3(0, 0.06, 0.05 * side));
    jumper(wireId, color, start, end, null, 0.15 * side);
  }
}

function buildModules() {
  const C = {
    led: [245, 208, 48],
    rgb: [176, 132, 252],
    btnL: [96, 165, 250],
    btnR: [56, 189, 248],
    dht: [34, 211, 238],
    steam: [125, 211, 252],
    gas: [244, 63, 94],
    sda: [74, 222, 128],
    scl: [167, 139, 250],
    pir: [251, 113, 133],
    buzzer: [163, 230, 53],
    door: [251, 146, 60],
    window: [45, 212, 191],
    fanA: [244, 114, 182],
    fanB: [129, 140, 248],
  };
  const specs = [
    ['led', 'led', 1, [2, 3, 4], 'v5', [['led', 2, 1, 2, C.led]]],
    ['rgb', 'rgb', 1, [7, 8, 9], 'v5', [['rgb', 2, 1, 3, C.rgb]]],
    ['btnL', 'btnL', 1, [12, 13, 14], 'v5', [['btnL', 2, 1, 4, C.btnL]]],
    ['btnR', 'btnR', 1, [17, 18, 19], 'v5', [['btnR', 2, 1, 5, C.btnR]]],
    ['dht', 'dht', 1, [42, 43, 44], 'v3', [['dht', 2, 1, 8, C.dht]]],
    ['steam', 'steam', 1, [47, 48, 49], 'v5', [['steam', 2, 1, 9, C.steam]]],
    ['gas', 'gas', 1, [52, 53, 54, 55], 'v5', [['gas', 2, 1, 10, C.gas]]],
    ['lcd', 'lcd', 1, [58, 59, 60, 61], 'v5', [['sda', 2, 1, 11, C.sda], ['scl', 3, 1, 12, C.scl]]],
    ['pir', 'pir', -1, [2, 3, 4], 'v5', [['pir', 2, -1, 1, C.pir]]],
    ['buzzer', 'buzzer', -1, [8, 9, 10], 'v5', [['buzzer', 2, -1, 2, C.buzzer]]],
    ['door', 'door', -1, [14, 15, 16], 'v5', [['door', 2, -1, 3, C.door]]],
    ['window', 'window', -1, [42, 43, 44], 'v5', [['window', 2, -1, 10, C.window]]],
    ['fan', 'fan', -1, [48, 49, 50, 51], 'v5', [['fanA', 2, -1, 11, C.fanA], ['fanB', 3, -1, 12, C.fanB]]],
    ['rfid', 'rfid', -1, [56, 57, 58, 59], 'v5', [['sda', 2, 1, 11, C.sda], ['scl', 3, 1, 12, C.scl]]],
  ];
  for (const spec of specs) addModule(...spec);
}

function buildPower() {
  jumper('v5', RED, espPin(13, 1), rail(xcol(48), 'red', -1), 1.3, -0.2);
  jumper('v5', RED, rail(xcol(8), 'red', 1), rail(xcol(8), 'red', -1), 1.6, 0);
  jumper('gnd', BLACK, espPin(1, 1), rail(xcol(20), 'blue', 1), 0.7);
  jumper('gnd', BLACK, espPin(0, -1), rail(xcol(20), 'blue', -1), 0.7);
  jumper('gnd', BLACK, rail(xcol(54), 'blue', 1), rail(xcol(54), 'blue', -1), 1.35);

  const bx = -9.15;
  const bz = 0;
  const holder = [box([2.3, 0.7, 1.35], [bx, 0.35, bz], BLACK)];
  for (const dx of [-0.75, -0.25, 0.25, 0.75]) {
    holder.push(cyl(0.16, 0.85, [bx + dx, 0.55, bz - 0.22], [196, 162, 54], 'z', 10));
    holder.push(cyl(0.16, 0.85, [bx + dx, 0.55, bz + 0.22], [196, 162, 54], 'z', 10));
  }
  add(merge(holder), 'Mod_battery');
  jumper('v5', RED, new THREE.Vector3(bx + 1.05, 0.55, bz), rail(xcol(0), 'red', -1), 0.9);
  jumper('gnd', BLACK, new THREE.Vector3(bx + 1.05, 0.4, bz + 0.35), rail(xcol(0), 'blue', -1), 0.7);
}

buildBoard();
buildEsp32();
buildModules();
buildPower();
for (const [wireId, parts] of wireParts) add(merge(parts), `Wire_${wireId}`);

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/models/protoboard.glb');
mkdirSync(dirname(out), { recursive: true });
const exporter = new GLTFExporter();
const glb = await exporter.parseAsync(group, { binary: true });
writeFileSync(out, Buffer.from(glb));
console.log(`${out} ${Math.round(glb.byteLength / 1024)} KB ${group.children.length} meshes`);
