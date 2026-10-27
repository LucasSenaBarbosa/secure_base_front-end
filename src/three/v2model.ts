import * as THREE from 'three';
import type { ModuleId } from '../sim/types';
import { replaceEsp32 } from './esp32board';

export const HOUSE_V2_URL = '/models/casa_smart_premium_v02.glb';
export const PARTS_V2_URL = '/models/componentes_casa_premium_v02.glb';

/** Target height of the maquette in the lab, in the same units as the wooden house. */
const HOUSE_HEIGHT = 2.05;

const GROUP_MODULE: Record<string, ModuleId> = {
  ESP32: 'esp32',
  LCD1602: 'lcd',
  BOTAO_01: 'btnL',
  BOTAO_02: 'btnR',
  BATERIA: 'battery',
  RFID: 'rfid',
  PIR: 'pir',
  DHT11: 'dht',
  SENSOR_AGUA: 'steam',
  MQ2: 'gas',
  BUZZER: 'buzzer',
  LED_AMARELO: 'led',
  RGB6812: 'rgb',
  SERVO_PORTA: 'doorServo',
  SERVO_JANELA: 'windowServo',
  VENTOINHA: 'fan',
  PIVO_PORTA_ENTRADA: 'door',
};

const SKIP_CAST = /^(Folhas|ESP32|LCD|BOTAO|BATERIA|RFID|PIR|DHT|SENSOR|MQ2|BUZZER|LED_|RGB|SERVO|VENTOINHA|Internal|External|Eletroduto)/;

export interface ExplodePiece {
  obj: THREE.Object3D;
  base: THREE.Vector3;
  dir: THREE.Vector3;
}

export interface V2House {
  root: THREE.Group;
  door: THREE.Object3D | null;
  fan: THREE.Object3D | null;
  windowHorn: THREE.Object3D | null;
  modules: Map<ModuleId, THREE.Mesh[]>;
  wallMats: THREE.MeshStandardMaterial[];
  wallMeshes: THREE.Mesh[];
  pieces: ExplodePiece[];
  warmLeds: THREE.MeshStandardMaterial[];
  yellow: THREE.MeshStandardMaterial | null;
  rgb: THREE.MeshStandardMaterial | null;
  blade: THREE.MeshStandardMaterial | null;
  lcd: THREE.Mesh | null;
  pir: THREE.Object3D | null;
  buzzer: THREE.Object3D | null;
  gas: THREE.Object3D | null;
  ledAnchor: THREE.Object3D | null;
  rgbAnchor: THREE.Object3D | null;
}

export interface ShowPart {
  prefix: string;
  title: string;
  text: string;
  object: THREE.Group;
  spin: THREE.Object3D | null;
  glow: THREE.MeshStandardMaterial[];
}

export const SHOW_PARTS: { prefix: string; title: string; text: string }[] = [
  { prefix: 'ESP32', title: 'ESP32 PLUS', text: 'O cérebro do kit. Wi-Fi, Bluetooth e um pino para cada módulo.' },
  { prefix: 'LCD1602', title: 'LCD 1602', text: 'O que o firmware escreve aparece no visor.' },
  { prefix: 'DHT11', title: 'DHT11', text: 'Temperatura e umidade, lidas o tempo todo.' },
  { prefix: 'SERVO_PORTA', title: 'Servo da porta', text: 'Abre a porta quando a cena pede.' },
  { prefix: 'PIR', title: 'Sensor PIR', text: 'Percebe presença e acende o aviso no laboratório.' },
  { prefix: 'MQ2', title: 'MQ-2', text: 'Sente gás e dispara o alarme no modelo.' },
  { prefix: 'LED_AMARELO', title: 'LED amarelo', text: 'Luz principal da casa, com brilho por PWM.' },
  { prefix: 'VENTOINHA', title: 'Ventilador', text: 'A velocidade sobe e desce com o PWM.' },
  { prefix: 'RGB6812', title: 'LED RGB', text: 'Quatro LEDs endereçáveis para a luz ambiente.' },
  { prefix: 'RFID', title: 'Leitor RFID', text: 'Lê o cartão e o chaveiro na entrada.' },
  { prefix: 'BUZZER', title: 'Buzzer', text: 'Campainha, aviso e sirene.' },
  { prefix: 'SENSOR_AGUA', title: 'Sensor de vapor', text: 'Detecta chuva e manda fechar a janela.' },
];

function moduleOfName(name: string): ModuleId | null {
  if (GROUP_MODULE[name]) return GROUP_MODULE[name];
  const head = name.split('__')[0];
  return GROUP_MODULE[head] ?? null;
}

function asStandard(material: THREE.Material | THREE.Material[]): THREE.MeshStandardMaterial | null {
  const mat = Array.isArray(material) ? material[0] : material;
  if (!mat || !('emissive' in mat)) return null;
  return mat as THREE.MeshStandardMaterial;
}

function retargetMaterials(root: THREE.Object3D) {
  const clones = new Map<string, THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!src) return;
    let copy = clones.get(src.uuid);
    if (!copy) {
      copy = src.clone();
      const std = copy as THREE.MeshStandardMaterial;
      if (std.map) std.map.anisotropy = 8;
      clones.set(src.uuid, copy);
    }
    mesh.material = copy;
  });
}

function prepareSurface(mesh: THREE.Mesh) {
  const mat = asStandard(mesh.material);
  if (!mat) return;
  const glass = mat.transparent && mat.opacity < 0.9;
  const leaves = mesh.name.startsWith('Folhas');
  mesh.castShadow = !glass && !leaves && !SKIP_CAST.test(mesh.name);
  mesh.receiveShadow = !glass;
  if (leaves) mat.side = THREE.DoubleSide;
  if (glass) {
    mat.depthWrite = false;
    mat.envMapIntensity = 1.35;
    mat.roughness = Math.min(mat.roughness ?? 0.2, 0.16);
  } else if ('envMapIntensity' in mat) {
    mat.envMapIntensity = 0.9;
  }
}

export function buildHouseV2(scene: THREE.Group): V2House {
  const clone = scene.clone(true);
  retargetMaterials(clone);
  clone.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) prepareSurface(mesh);
  });

  const modules = new Map<ModuleId, THREE.Mesh[]>();
  clone.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    let id: ModuleId | null = null;
    for (let n: THREE.Object3D | null = mesh; n; n = n.parent) {
      id = moduleOfName(n.name);
      if (id) break;
    }
    if (!id) return;
    mesh.userData.module = id;
    const list = modules.get(id);
    if (list) list.push(mesh);
    else modules.set(id, [mesh]);
  });

  const wallMats: THREE.MeshStandardMaterial[] = [];
  const wallMeshes: THREE.Mesh[] = [];
  const wallClones = new Map<string, THREE.MeshStandardMaterial>();
  clone.getObjectByName('01_Arquitetura')?.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const src = asStandard(mesh.material);
    if (!src || (src.transparent && src.opacity < 0.9)) return;
    let mat = wallClones.get(src.uuid);
    if (!mat) {
      mat = src.clone();
      wallClones.set(src.uuid, mat);
      wallMats.push(mat);
    }
    mesh.material = mat;
    wallMeshes.push(mesh);
  });

  const warmLeds: THREE.MeshStandardMaterial[] = [];
  clone.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = asStandard(mesh.material);
    if (!mat?.emissive) return;
    const glow = mat.emissive.r + mat.emissive.g + mat.emissive.b;
    if (glow < 0.2) return;
    mat.toneMapped = false;
    mat.emissiveIntensity = 1.4;
    if (!warmLeds.includes(mat)) warmLeds.push(mat);
  });

  const yellow = new THREE.MeshStandardMaterial({
    color: '#ffe1a8',
    emissive: new THREE.Color('#ffb21a'),
    emissiveIntensity: 0.4,
    roughness: 0.28,
    toneMapped: false,
  });
  clone.traverse((o) => {
    if (o.name.includes('Yellow_LED_Lens') || o.name.includes('Yellow_LED_Chip')) {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.material = yellow;
    }
  });

  const rgb = new THREE.MeshStandardMaterial({
    color: '#f4f4f4',
    emissive: new THREE.Color('#000000'),
    emissiveIntensity: 2,
    roughness: 0.32,
    toneMapped: false,
  });
  const rgbMesh = clone.getObjectByName('RGB6812__RGB6812_LED_Emit') as THREE.Mesh | undefined;
  if (rgbMesh?.isMesh) rgbMesh.material = rgb;

  const bladeMesh = clone.getObjectByName('VENTOINHA__Fan_Rotor_Blades') as THREE.Mesh | undefined;
  const bladeSrc = bladeMesh && asStandard(bladeMesh.material);
  const blade = bladeSrc ? bladeSrc.clone() : null;
  if (blade && bladeMesh) {
    blade.transparent = true;
    blade.opacity = 1;
    blade.side = THREE.DoubleSide;
    blade.depthWrite = true;
    bladeMesh.material = blade;
  }

  const door = clone.getObjectByName('PIVO_PORTA_ENTRADA');
  const fan = clone.getObjectByName('PIVO_ROTOR');
  if (fan) fan.userData.baseQuat = fan.quaternion.clone();
  const windowHorn = clone.getObjectByName('SERVO_JANELA__Servo_Window_Horn');
  if (windowHorn) windowHorn.userData.baseRot = windowHorn.rotation.z;

  const esp = replaceEsp32(clone);
  esp?.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = modules.get('esp32') ?? [];
    list.push(mesh);
    modules.set('esp32', list);
  });

  clone.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(clone);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  clone.position.set(-center.x, -bounds.min.y, -center.z);

  const house = clone.getObjectByName('CASA_PREMIUM_V02') ?? clone;
  house.updateMatrixWorld(true);
  const houseCenter = new THREE.Box3().setFromObject(house).getCenter(new THREE.Vector3());
  house.worldToLocal(houseCenter);
  const pieces: ExplodePiece[] = house.children.map((obj) => {
    const local = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
    house.worldToLocal(local);
    const dir = local.sub(houseCenter);
    dir.y *= 1.45;
    if (obj.name.startsWith('00_')) dir.set(0, -0.06, 0);
    if (obj.name.startsWith('01_')) dir.multiplyScalar(0.2);
    if (obj.name.startsWith('03_')) dir.y += 0.1;
    if (obj.name.startsWith('06_')) dir.y -= 0.04;
    return { obj, base: obj.position.clone(), dir: dir.multiplyScalar(0.62) };
  });

  const root = new THREE.Group();
  root.name = 'house-v2';
  root.add(clone);
  root.scale.setScalar(HOUSE_HEIGHT / Math.max(size.y, 0.001));

  return {
    root,
    door: door ?? null,
    fan: fan ?? null,
    windowHorn: windowHorn ?? null,
    modules,
    wallMats,
    wallMeshes,
    pieces,
    warmLeds,
    yellow,
    rgb: rgbMesh?.isMesh ? rgb : null,
    blade: blade ?? null,
    lcd: (clone.getObjectByName('LCD1602__LCD1602_Front_LCDText') as THREE.Mesh | undefined) ?? null,
    pir: clone.getObjectByName('PIR') ?? null,
    buzzer: clone.getObjectByName('BUZZER') ?? null,
    gas: clone.getObjectByName('MQ2') ?? null,
    ledAnchor: clone.getObjectByName('LED_AMARELO') ?? null,
    rgbAnchor: clone.getObjectByName('RGB6812') ?? null,
  };
}

function pivotRotors(group: THREE.Group) {
  const rotors = group.children.filter((child) => child.name.includes('Rotor'));
  if (rotors.length < 2) return null;
  const box = new THREE.Box3();
  rotors.forEach((rotor) => box.expandByObject(rotor));
  const pivot = new THREE.Group();
  pivot.name = 'rotor-spin';
  const center = box.getCenter(new THREE.Vector3());
  group.worldToLocal(center);
  pivot.position.copy(center);
  group.add(pivot);
  group.updateMatrixWorld(true);
  rotors.forEach((rotor) => pivot.attach(rotor));
  return pivot;
}

export function buildShowParts(scene: THREE.Group): ShowPart[] {
  const clone = scene.clone(true);
  retargetMaterials(clone);
  replaceEsp32(clone);
  const buckets = new Map<string, THREE.Mesh[]>();
  clone.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || !mesh.name.includes('__') || mesh.name.includes('Devkit')) return;
    prepareSurface(mesh);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const key = mesh.name.split('__')[0];
    const list = buckets.get(key);
    if (list) list.push(mesh);
    else buckets.set(key, [mesh]);
  });

  return SHOW_PARTS.flatMap((part) => {
    const devkit = part.prefix === 'ESP32' ? clone.getObjectByName('ESP32__Devkit') : null;
    const meshes = buckets.get(part.prefix);
    if (!devkit && !meshes?.length) return [];
    const group = new THREE.Group();
    group.name = part.prefix;
    if (devkit) {
      devkit.quaternion.identity();
      devkit.rotateX(Math.PI / 2);
      group.add(devkit);
    } else meshes!.forEach((mesh) => group.add(mesh));
    group.updateMatrixWorld(true);
    const spin = part.prefix === 'VENTOINHA' ? pivotRotors(group) : null;
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    group.children.forEach((child) => child.position.sub(center));
    group.scale.setScalar(1.25 / Math.max(size.x, size.y, size.z, 1e-4));

    const glow: THREE.MeshStandardMaterial[] = [];
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const lens = mesh.name.includes('Yellow_LED_Lens') || mesh.name.includes('Yellow_LED_Chip') || mesh.name.includes('LED_Emit');
      const mat = asStandard(mesh.material);
      if (!mat) return;
      if (lens) {
        const lit = mat.clone();
        lit.emissive = new THREE.Color(mesh.name.includes('LED_Emit') ? '#8b5cf6' : '#ffb21a');
        lit.emissiveIntensity = 1.6;
        lit.toneMapped = false;
        mesh.material = lit;
        glow.push(lit);
      } else if (mat.emissive && mat.emissive.r + mat.emissive.g + mat.emissive.b > 0.2) {
        mat.toneMapped = false;
        glow.push(mat);
      }
    });
    return [{ ...part, object: group, spin, glow }];
  });
}

export function disposeMaterials(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((mat) => mat?.dispose());
  });
}
