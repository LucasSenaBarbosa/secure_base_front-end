import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { create } from 'zustand';
import { moduleForMesh } from '../sim/hardware';
import { replaceEsp32 } from './esp32board';
import { LCD_H, LCD_W } from '../sim/lcd';
import type { ModuleId } from '../sim/types';

export interface Part {
  obj: THREE.Object3D;
  base: THREE.Vector3;
  dir: THREE.Vector3;
}

export interface Rig {
  root: THREE.Object3D;
  parts: Part[];
  fan: THREE.Group;
  fanAxis: THREE.Vector3;
  fanBlur: THREE.Mesh;
  bladeMat: THREE.MeshStandardMaterial;
  door: THREE.Group;
  doorHorn: THREE.Group;
  windowHorn: THREE.Group;
  btnL: THREE.Group;
  btnR: THREE.Group;
  ledMat: THREE.MeshStandardMaterial;
  rgbMats: THREE.MeshStandardMaterial[];
  lcdCanvas: HTMLCanvasElement;
  lcdTex: THREE.CanvasTexture;
  wallMats: THREE.MeshStandardMaterial[];
  wallMeshes: THREE.Mesh[];
  modules: Map<ModuleId, THREE.Mesh[]>;
}

export const useRig = create<{ rig: Rig | null; setRig(r: Rig | null): void }>()((set) => ({ rig: null, setRig: (rig) => set({ rig }) }));

const WALL = /^(FrontWall|BackWall|LeftWall|RightWall|Roof_|Left_Roof|Right_Gable|FrontPanel_Tabs|Flat_Extension|Side_Laser|Side_Engraving|Gable_Engraving|Back_Engraving|Front_Engraving|Engraving_K|ControlPanel_Index|Door_Arch|Door_Recess|Door_Adjacent|Front_Vent|Right_Service|Window_Interior|Window_Wooden|Window_Glass)/;
const METAL = /(Fasteners|_Pins|PlateScrews|MetalShield|GoldPads|Springs|Spring_Contacts|StandOff|Shaft|Power_Jack|_USB|_Fastener|MetalMountingPlate|_Pin$|Door_Knob)/;
const WIRE = /(Internal_Dupont|External_Wiring|InternalWire)/;
const PCB = /(_PCB|ControlBoard|Resistors|EspressifChip)/;

function center(mesh: THREE.Mesh) {
  mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox!.getCenter(new THREE.Vector3());
}

export function buildRig(scene: THREE.Group): Rig {
  const clone = scene.clone(true);
  const root = clone.getObjectByName('world') ?? clone;
  const meshes: THREE.Mesh[] = [];
  clone.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  const byName = (n: string) => meshes.find((m) => m.name === n)!;

  const vc = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ vertexColors: true, ...p });
  const mats = {
    wood: vc({ roughness: 0.86, metalness: 0, envMapIntensity: 0.45 }),
    woodSolid: vc({ roughness: 0.86, metalness: 0, envMapIntensity: 0.45 }),
    pcb: vc({ roughness: 0.38, metalness: 0.08 }),
    metal: vc({ roughness: 0.26, metalness: 0.9 }),
    plastic: vc({ roughness: 0.48, metalness: 0 }),
    wire: vc({ roughness: 0.42, metalness: 0 }),
    glass: vc({ roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false }),
    glassWall: vc({ roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.3, depthWrite: false }),
  };
  const bladeMat = vc({ roughness: 0.4, metalness: 0, transparent: true, side: THREE.DoubleSide });
  const ledMat = vc({ roughness: 0.2, emissive: new THREE.Color('#ffb21a'), emissiveIntensity: 0, transparent: true, opacity: 0.92, toneMapped: false });
  const wallMats: THREE.MeshStandardMaterial[] = [mats.wood, mats.glassWall];
  const wallMeshes: THREE.Mesh[] = [];
  const modules = new Map<ModuleId, THREE.Mesh[]>();

  const lcdCanvas = document.createElement('canvas');
  lcdCanvas.width = LCD_W;
  lcdCanvas.height = LCD_H;
  const lcdTex = new THREE.CanvasTexture(lcdCanvas);
  lcdTex.flipY = false;
  lcdTex.center.set(0.5, 0.5);
  lcdTex.rotation = Math.PI;
  lcdTex.colorSpace = THREE.SRGBColorSpace;
  lcdTex.anisotropy = 8;

  for (const mesh of meshes) {
    const name = mesh.name;
    const src = mesh.material as THREE.MeshStandardMaterial;
    if (!mesh.geometry.attributes.normal) mesh.geometry = toCreasedNormals(mesh.geometry, Math.PI / 5);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const isWall = WALL.test(name);

    if (name === 'LCD1602_Front_LCDText') {
      mesh.material = new THREE.MeshBasicMaterial({ map: lcdTex, toneMapped: false });
      mesh.castShadow = false;
    } else if (src.map) {
      const m = new THREE.MeshStandardMaterial({ map: src.map, color: '#ece0cf', roughness: 0.86, metalness: 0, envMapIntensity: 0.45, side: THREE.DoubleSide });
      src.map.anisotropy = 8;
      mesh.material = m;
      if (isWall) wallMats.push(m);
    } else if (name === 'Fan_Rotor_Blades') mesh.material = bladeMat;
    else if (name.startsWith('Yellow_LED_Lens') || name.startsWith('Yellow_LED_Chip')) mesh.material = ledMat;
    else if (name === 'Window_Glass_Pane') mesh.material = mats.glassWall;
    else if (name.includes('Glass')) mesh.material = mats.glass;
    else if (isWall) mesh.material = mats.wood;
    else if (METAL.test(name)) mesh.material = mats.metal;
    else if (WIRE.test(name)) mesh.material = mats.wire;
    else if (PCB.test(name)) mesh.material = mats.pcb;
    else if (/Chassis|Door_Leaf|Floor/.test(name)) mesh.material = mats.woodSolid;
    else mesh.material = mats.plastic;

    if (isWall) wallMeshes.push(mesh);
    const mod = moduleForMesh(name);
    if (mod) {
      mesh.userData.module = mod;
      if (!modules.has(mod)) modules.set(mod, []);
      modules.get(mod)!.push(mesh);
    }
  }

  const pivot = (names: string[], at: THREE.Vector3) => {
    const g = new THREE.Group();
    g.position.copy(at);
    root.add(g);
    for (const n of names) {
      const m = byName(n);
      if (!m) continue;
      m.position.sub(at);
      g.add(m);
    }
    return g;
  };

  const hub = center(byName('Fan_Rotor_Hub'));
  const housing = center(byName('Fan_Motor_Housing'));
  const fanAxis = hub.clone().sub(housing).normalize();
  const fan = pivot(['Fan_Rotor_Blades', 'Fan_Rotor_Hub', 'Fan_Rotor_Hubcap'], hub);
  fan.userData.baseQuat = fan.quaternion.clone();
  const fanBlur = new THREE.Mesh(
    new THREE.CircleGeometry(0.026, 48),
    new THREE.MeshBasicMaterial({ color: '#f4f2ea', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  fanBlur.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), fanAxis);
  fanBlur.position.copy(fanAxis).multiplyScalar(0.0015);
  fanBlur.raycast = () => {};
  fan.add(fanBlur);

  const leaf = byName('Door_Leaf');
  leaf.geometry.computeBoundingBox();
  const lb = leaf.geometry.boundingBox!;
  const door = pivot(['Door_Leaf', 'Door_Leaf_Edge', 'Door_Knob'], new THREE.Vector3(lb.min.x, (lb.min.y + lb.max.y) / 2, (lb.min.z + lb.max.z) / 2));
  const doorHorn = pivot(['Servo_Right_Horn'], center(byName('Servo_Right_Gear')));
  const windowHorn = pivot(['Servo_Window_Horn'], center(byName('Servo_Window_Gear')));
  const btnL = pivot(['Button_Left_Yellow', 'Button_Left_YellowCap'], center(byName('Button_Left_Yellow')));
  const btnR = pivot(['Button_Right_Yellow', 'Button_Right_YellowCap'], center(byName('Button_Right_Yellow')));

  const emit = byName('RGB6812_LED_Emit');
  const ec = center(emit);
  emit.visible = false;
  const rgbGroup = new THREE.Group();
  rgbGroup.position.copy(ec).add(new THREE.Vector3(0, 0, 0.0008));
  const rgbMats: THREE.MeshStandardMaterial[] = [];
  const ledGeo = new THREE.BoxGeometry(0.0052, 0.0052, 0.0016);
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sy]) => {
    const m = new THREE.MeshStandardMaterial({ color: '#f6f6f6', roughness: 0.3, emissive: new THREE.Color('#000000'), emissiveIntensity: 5, toneMapped: false });
    const led = new THREE.Mesh(ledGeo, m);
    led.position.set(sx * 0.0045, sy * 0.0038, 0);
    led.userData.module = 'rgb';
    modules.get('rgb')?.push(led);
    rgbGroup.add(led);
    rgbMats.push(m);
  });
  root.add(rgbGroup);

  const esp = replaceEsp32(clone);
  esp?.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = modules.get('esp32') ?? [];
    list.push(mesh);
    modules.set('esp32', list);
  });

  clone.updateMatrixWorld(true);
  const houseCenter = new THREE.Vector3(0, 0.07, 0);
  const box = new THREE.Box3();
  const parts: Part[] = root.children.map((obj) => {
    box.setFromObject(obj);
    const c = box.isEmpty() ? obj.position.clone() : box.getCenter(new THREE.Vector3());
    const dir = c.sub(houseCenter).multiply(new THREE.Vector3(1.15, 0.9, 1.25));
    if (/Chassis/.test(obj.name)) dir.set(0, -0.02, 0);
    return { obj, base: obj.position.clone(), dir };
  });

  return { root: clone, parts, fan, fanAxis, fanBlur, bladeMat, door, doorHorn, windowHorn, btnL, btnR, ledMat, rgbMats, lcdCanvas, lcdTex, wallMats, wallMeshes, modules };
}
