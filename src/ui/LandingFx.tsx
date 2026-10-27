import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

const AURORA_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.999, 1.0);
}`;

const AURORA_FRAG = /* glsl */ `
uniform float uTime;
uniform float uScroll;
uniform vec2 uRes;
uniform vec2 uMouse;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uBg;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 p = gl_FragCoord.xy / uRes.y;
  float t = uTime * 0.035;
  vec2 drift = vec2(0.0, uScroll * 0.6);
  vec2 q = vec2(fbm(p * 1.3 + vec2(t, -t) + drift), fbm(p * 1.3 + vec2(-t * 0.8, t * 1.2) + 4.7 + drift));
  float n = fbm(p * 1.7 + q * 1.8 + drift);

  float curtain = smoothstep(0.42, 0.95, n) * (0.55 + 0.45 * sin(p.x * 3.0 + t * 6.0 + q.y * 4.0));
  vec3 col = uBg;
  col = mix(col, uA, clamp(curtain, 0.0, 1.0) * 0.62);
  col = mix(col, uB, smoothstep(0.5, 1.0, q.x * n * 1.7) * 0.5);

  float md = distance(p, uMouse);
  col += mix(uA, uB, 0.5) * 0.22 * exp(-md * md * 7.0);

  float vig = smoothstep(1.25, 0.25, distance(vUv, vec2(0.5, 0.42)));
  col *= 0.55 + 0.45 * vig;
  gl_FragColor = vec4(col, 1.0);
}`;

const STAR_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uPixel;
varying float vGlow;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float tw = 0.55 + 0.45 * sin(uTime * (1.2 + aSeed * 2.6) + aSeed * 40.0);
  vGlow = tw;
  gl_PointSize = (1.4 + aSeed * 3.2) * tw * uPixel * (14.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const STAR_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vGlow;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a = a * a;
  gl_FragColor = vec4(uColor * (0.7 + vGlow), a * vGlow);
}`;

const STARS = 900;

function readPalette() {
  const css = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) => new THREE.Color(css.getPropertyValue(name).trim() || fallback);
  return { a: pick('--accent', '#3b82f6'), b: pick('--accent-2', '#38bdf8'), bg: pick('--bg', '#070b14') };
}

function Field({ still }: { still: boolean }) {
  const { size, gl } = useThree();
  const pointer = useRef(new THREE.Vector2(0.9, 0.7));
  const scroll = useRef(0);

  const aurora = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: AURORA_VERT,
    fragmentShader: AURORA_FRAG,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uMouse: { value: new THREE.Vector2(0.9, 0.7) },
      uA: { value: new THREE.Color() },
      uB: { value: new THREE.Color() },
      uBg: { value: new THREE.Color() },
    },
  }), []);

  const stars = useMemo(() => {
    const pos = new Float32Array(STARS * 3);
    const seed = new Float32Array(STARS);
    for (let i = 0; i < STARS; i++) {
      pos.set([(Math.random() - 0.5) * 40, (Math.random() - 0.5) * 60, -4 - Math.random() * 26], i * 3);
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPixel: { value: 1 }, uColor: { value: new THREE.Color('#dbe7ff') } },
    });
    return { geo, mat };
  }, []);

  useEffect(() => {
    const apply = () => {
      const { a, b, bg } = readPalette();
      aurora.uniforms.uA.value.copy(a);
      aurora.uniforms.uB.value.copy(b);
      aurora.uniforms.uBg.value.copy(bg);
      stars.mat.uniforms.uColor.value.copy(a).lerp(new THREE.Color('#ffffff'), 0.75);
    };
    apply();
    const watch = new MutationObserver(apply);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] });
    const move = (e: PointerEvent) => {
      pointer.current.set(e.clientX / window.innerHeight, (window.innerHeight - e.clientY) / window.innerHeight);
    };
    const onScroll = () => { scroll.current = window.scrollY / window.innerHeight; };
    onScroll();
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      watch.disconnect();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('scroll', onScroll);
      aurora.dispose();
      stars.geo.dispose();
      stars.mat.dispose();
    };
  }, [aurora, stars]);

  useFrame((state, dt) => {
    const u = aurora.uniforms;
    if (!still) u.uTime.value += Math.min(dt, 0.05);
    u.uRes.value.set(size.width * gl.getPixelRatio(), size.height * gl.getPixelRatio());
    u.uMouse.value.lerp(pointer.current, 1 - Math.exp(-dt * 3));
    u.uScroll.value = THREE.MathUtils.damp(u.uScroll.value, scroll.current, 4, dt);
    stars.mat.uniforms.uTime.value = u.uTime.value;
    stars.mat.uniforms.uPixel.value = gl.getPixelRatio();
    state.camera.position.y = THREE.MathUtils.damp(state.camera.position.y, -u.uScroll.value * 6, 5, dt);
    state.camera.position.x = THREE.MathUtils.damp(state.camera.position.x, (pointer.current.x - 0.9) * 0.6, 3, dt);
  });

  return (
    <>
      <mesh frustumCulled={false} renderOrder={-1} material={aurora}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      <points geometry={stars.geo} material={stars.mat} frustumCulled={false} />
    </>
  );
}

export function LandingFx({ still }: { still: boolean }) {
  return (
    <div className="land-fx" aria-hidden="true">
      <Canvas
        dpr={[0.75, 1]}
        camera={{ position: [0, 0, 6], fov: 50, near: 0.1, far: 60 }}
        gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}
        frameloop={still ? 'demand' : 'always'}
      >
        <Field still={still} />
      </Canvas>
    </div>
  );
}
