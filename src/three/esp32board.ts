import * as THREE from 'three';

const L = 0.052;
const W = 0.028;
const T = 0.0016;
const PIN = 0.0031;

const MATCH = /^(ESP32PLUS_|ESP32__)/;

function pcbTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 552;
  const g = c.getContext('2d')!;
  g.fillStyle = '#161616';
  g.fillRect(0, 0, 1024, 552);
  g.strokeStyle = '#2a2a2a';
  g.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    g.beginPath();
    g.moveTo(150, 70 + i * 30);
    g.lineTo(430, 90 + ((i * 47) % 80));
    g.stroke();
  }
  const top = ['VIN', 'GND', 'D13', 'D12', 'D14', 'D27', 'D26', 'D25', 'D33', 'D32', 'D35', 'D34', 'VN', 'VP', 'EN'];
  const bot = ['3V3', 'GND', 'D15', 'D2', 'D4', 'RX2', 'TX2', 'D5', 'D18', 'D19', 'D21', 'RX0', 'TX0', 'D22', 'D23'];
  g.fillStyle = '#f4f4f4';
  g.font = '600 20px sans-serif';
  g.textAlign = 'center';
  top.forEach((label, i) => g.fillText(label, 150 + i * 54, 36));
  bot.forEach((label, i) => g.fillText(label, 150 + i * 54, 530));
  g.font = '700 26px sans-serif';
  g.fillText('EN', 78, 150);
  g.fillText('BOOT', 78, 430);
  g.font = '600 18px sans-serif';
  g.fillStyle = '#d8d8d8';
  g.fillText('ESP32 DEVKIT', 250, 250);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function moduleTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 680;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 512, 680);
  grad.addColorStop(0, '#efeae0');
  grad.addColorStop(1, '#c8c2b6');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 680);
  g.strokeStyle = '#9a9488';
  g.lineWidth = 10;
  g.strokeRect(8, 8, 496, 664);
  g.fillStyle = '#2a2a2a';
  g.textAlign = 'center';
  g.font = '700 64px sans-serif';
  g.fillText('ESP32', 256, 250);
  g.font = '600 42px sans-serif';
  g.fillText('WROOM-32', 256, 320);
  g.strokeStyle = '#3a3a3a';
  g.lineWidth = 6;
  g.beginPath();
  for (let i = 1; i <= 3; i++) g.arc(400, 120, 16 * i, -0.9, 0.9);
  g.stroke();
  g.font = '700 28px sans-serif';
  g.fillText('CE   FCC', 256, 560);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const maps = { pcb: null as THREE.CanvasTexture | null, mod: null as THREE.CanvasTexture | null };

function makeEsp32Board() {
  if (!maps.pcb) maps.pcb = pcbTexture();
  if (!maps.mod) maps.mod = moduleTexture();
  const group = new THREE.Group();
  group.name = 'ESP32__Devkit';

  const pcbMat = new THREE.MeshStandardMaterial({ map: maps.pcb, color: '#ffffff', roughness: 0.62, metalness: 0.08 });
  const black = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.5, metalness: 0.15 });
  const silver = new THREE.MeshStandardMaterial({ color: '#c5ccd2', roughness: 0.32, metalness: 0.85 });
  const gold = new THREE.MeshStandardMaterial({ color: '#d7b15a', roughness: 0.34, metalness: 0.9 });
  const button = new THREE.MeshStandardMaterial({ color: '#dedede', roughness: 0.4, metalness: 0.2 });
  const can = new THREE.MeshStandardMaterial({ map: maps.mod, color: '#ffffff', roughness: 0.38, metalness: 0.72 });

  const add = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `ESP32__Devkit_${name}`;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  add('PCB', new THREE.BoxGeometry(L, T, W), pcbMat, 0, PIN + T / 2, 0);
  add('USB', new THREE.BoxGeometry(0.0072, 0.0032, 0.0082), silver, -L / 2 - 0.0016, PIN + 0.0022, 0);
  add('USBSlot', new THREE.BoxGeometry(0.0012, 0.0014, 0.0054), black, -L / 2 - 0.005, PIN + 0.0022, 0);
  add('EN', new THREE.CylinderGeometry(0.0015, 0.0015, 0.0013, 16), button, -L / 2 + 0.0065, PIN + T + 0.0007, -0.0065);
  add('BOOT', new THREE.CylinderGeometry(0.0015, 0.0015, 0.0013, 16), button, -L / 2 + 0.0065, PIN + T + 0.0007, 0.0065);
  add('Chip', new THREE.BoxGeometry(0.006, 0.0011, 0.006), black, -0.008, PIN + T + 0.0005, 0.004);
  add('Regulator', new THREE.BoxGeometry(0.0045, 0.0016, 0.0032), black, -0.006, PIN + T + 0.0008, -0.006);
  add('LEDRed', new THREE.BoxGeometry(0.0014, 0.0008, 0.0007), new THREE.MeshStandardMaterial({ color: '#ff3030', emissive: '#ff2020', emissiveIntensity: 0.7, roughness: 0.35, toneMapped: false }), -0.012, PIN + T + 0.0004, -0.008);
  add('Module', new THREE.BoxGeometry(0.0182, 0.0031, 0.0254), can, 0.009, PIN + T + 0.00155, 0);
  add('Antenna', new THREE.BoxGeometry(0.0042, 0.00035, 0.016), gold, 0.0202, PIN + T + 0.0003, 0);

  const pinGeo = new THREE.BoxGeometry(0.00105, PIN, 0.00105);
  for (let i = 0; i < 15; i++) {
    const x = -L / 2 + 0.0042 + i * (L - 0.0084) / 14;
    add(`PinT${i}`, pinGeo, gold, x, PIN / 2, -W / 2 + 0.0013);
    add(`PinB${i}`, pinGeo, gold, x, PIN / 2, W / 2 - 0.0013);
  }
  return group;
}

/** Hides the Uno-shaped kit board and puts a DevKit ESP32 (WROOM-32) in its place. */
export function replaceEsp32(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && MATCH.test(mesh.name) && !mesh.name.includes('Devkit')) meshes.push(mesh);
  });
  if (!meshes.length) return null;

  const box = new THREE.Box3();
  meshes.forEach((mesh) => box.expandByObject(mesh));
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  meshes.forEach((mesh) => {
    mesh.visible = false;
    mesh.raycast = () => {};
  });

  const parent = meshes[0].parent ?? root;
  const board = makeEsp32Board();
  const reach = 0.052 + 0.0072;
  board.scale.setScalar((Math.max(size.x, size.z) * 0.94) / reach);

  const long = size.x >= size.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const zAxis = new THREE.Vector3().crossVectors(long, up).normalize();
  const worldQuat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(long, up, zAxis));
  const parentQuat = new THREE.Quaternion();
  parent.getWorldQuaternion(parentQuat);
  board.quaternion.copy(parentQuat).invert().multiply(worldQuat);

  const worldPos = new THREE.Vector3(center.x, box.min.y, center.z);
  parent.worldToLocal(worldPos);
  board.position.copy(worldPos);
  parent.add(board);
  board.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.userData.module = 'esp32';
  });
  return board;
}
