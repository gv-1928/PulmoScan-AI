import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import * as THREE from 'three';
import {
  BreathPhaseSpan,
  ClassifierOutput,
  PhoneStatus,
} from '../types/pulmoscan';
import { getDominantClass } from '../features/pipeline';

interface HeroBreathSceneProps {
  breathsPerMin: number;
  breathPhases: BreathPhaseSpan[];
  status: PhoneStatus;
  classifier: ClassifierOutput;
  isPlaying: boolean;
  playheadSec: number;
  scrollOpacity: number;
}

function detectWebGLAndRenderer(): {
  supported: boolean;
  isSoftware: boolean;
} {
  if (typeof document === 'undefined') {
    return { supported: false, isSoftware: false };
  }
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    if (!gl) return { supported: false, isSoftware: false };
    const webgl = gl as WebGLRenderingContext;
    const dbg = webgl.getExtension('WEBGL_debug_renderer_info');
    let rendererStr = '';
    if (dbg) {
      rendererStr = String(
        webgl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '',
      ).toLowerCase();
    } else {
      rendererStr = String(webgl.getParameter(webgl.RENDERER) || '').toLowerCase();
    }
    const isSoftware =
      rendererStr.includes('swiftshader') ||
      rendererStr.includes('llvmpipe') ||
      rendererStr.includes('software') ||
      rendererStr.includes('microsoft basic render');
    return { supported: true, isSoftware };
  } catch {
    return { supported: false, isSoftware: false };
  }
}

function getTargetColor(status: PhoneStatus): THREE.Color {
  switch (status) {
    case PhoneStatus.ELEVATED:
      return new THREE.Color('#FB7185');
    case PhoneStatus.EARLY_WATCH:
      return new THREE.Color('#FBBF24');
    case PhoneStatus.CENSORED_TODAY:
      return new THREE.Color('#94A3B8');
    case PhoneStatus.STABLE:
    case PhoneStatus.CALIBRATING:
    case PhoneStatus.READY:
    default:
      return new THREE.Color('#2DD4BF');
  }
}

function computeBreathExpansion(
  timeSec: number,
  bpm: number,
  isPlaying: boolean,
  breathPhases: BreathPhaseSpan[],
): { expansion: number; inInhale: boolean } {
  if (isPlaying && breathPhases.length > 0) {
    for (const span of breathPhases) {
      if (timeSec >= span.startSec && timeSec <= span.endSec) {
        const len = Math.max(0.05, span.endSec - span.startSec);
        const u = (timeSec - span.startSec) / len;
        if (span.phase === 'inhale') {
          return { expansion: 0.5 - 0.5 * Math.cos(Math.PI * u), inInhale: true };
        }
        return { expansion: 0.5 + 0.5 * Math.cos(Math.PI * u), inInhale: false };
      }
    }
  }

  const cycle = 60 / Math.max(10, Math.min(28, bpm));
  const inhaleDur = 0.40 * cycle;
  const pauseDur = 0.06 * cycle;
  const exhaleDur = 0.46 * cycle;
  const pos = ((timeSec % cycle) + cycle) % cycle;

  if (pos < inhaleDur) {
    const u = pos / inhaleDur;
    return { expansion: 0.5 - 0.5 * Math.cos(Math.PI * u), inInhale: true };
  }
  if (pos < inhaleDur + pauseDur) {
    return { expansion: 1, inInhale: false };
  }
  if (pos < inhaleDur + pauseDur + exhaleDur) {
    const u = (pos - inhaleDur - pauseDur) / exhaleDur;
    return { expansion: 0.5 + 0.5 * Math.cos(Math.PI * u), inInhale: false };
  }
  return { expansion: 0, inInhale: false };
}

interface LungPointData {
  baseX: Float32Array;
  baseY: Float32Array;
  baseZ: Float32Array;
  phase: Float32Array;
  count: number;
}

function generateLungParticles(count: number): LungPointData {
  const baseX = new Float32Array(count);
  const baseY = new Float32Array(count);
  const baseZ = new Float32Array(count);
  const phase = new Float32Array(count);

  // Deterministic LCG so particles never jump between mounts
  let s = 133742;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  let idx = 0;
  while (idx < count) {
    const isRight = idx % 2 === 0;
    const u = rand() * 2 - 1; // vertical normalized [-1, 1]
    const theta = rand() * Math.PI * 2;
    const shell = Math.pow(rand(), 0.42);

    // Tapered lobe silhouette: narrower apex at top (u > 0), broader base at bottom (u < 0)
    const apexTaper = 0.72 - 0.38 * u;
    const verticalEnv = Math.sqrt(Math.max(0.04, 1 - u * u * 0.92));
    const rx = 0.95 * verticalEnv * apexTaper * shell;
    const rz = 0.76 * verticalEnv * apexTaper * shell;

    let x = Math.cos(theta) * rx + (isRight ? -1.18 : 1.18);
    const y = u * 1.65;
    const z = Math.sin(theta) * rz;

    // Cardiac notch on medial-lower left lobe
    if (!isRight && y < -0.15 && x < 0.75) {
      x += 0.25 * (1 - Math.abs(y + 0.45));
    }

    baseX[idx] = x;
    baseY[idx] = y;
    baseZ[idx] = z;
    phase[idx] = rand() * Math.PI * 2;
    idx++;
  }

  return { baseX, baseY, baseZ, phase, count };
}

function buildBronchialTreeGeometry(): THREE.BufferGeometry {
  const segments: number[] = [];
  const addLine = (
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
  ) => {
    segments.push(x1, y1, z1, x2, y2, z2);
  };

  // Trachea
  addLine(0, 2.15, 0, 0, 0.95, 0);
  // Carina left/right main bronchi
  addLine(0, 0.95, 0, -0.82, 0.45, 0.05);
  addLine(0, 0.95, 0, 0.82, 0.45, 0.05);

  // Secondary & tertiary branches
  const branches: Array<[number, number, number, number, number, number]> = [
    [-0.82, 0.45, 0.05, -1.25, 0.85, 0.12],
    [-0.82, 0.45, 0.05, -1.35, 0.12, -0.08],
    [-0.82, 0.45, 0.05, -1.12, -0.58, 0.14],
    [-1.35, 0.12, -0.08, -1.62, -0.35, -0.22],
    [-1.12, -0.58, 0.14, -1.38, -1.05, 0.18],
    [0.82, 0.45, 0.05, 1.25, 0.85, -0.08],
    [0.82, 0.45, 0.05, 1.38, 0.12, 0.12],
    [0.82, 0.45, 0.05, 1.15, -0.58, -0.14],
    [1.38, 0.12, 0.12, 1.62, -0.35, 0.22],
    [1.15, -0.58, -0.14, 1.38, -1.05, -0.18],
  ];
  for (const b of branches) {
    addLine(...b);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(segments, 3));
  return geo;
}

const LungSceneContent: React.FC<
  HeroBreathSceneProps & { isSoftware: boolean; pointerRef: React.MutableRefObject<{ x: number; y: number }> }
> = ({
  breathsPerMin,
  breathPhases,
  status,
  classifier,
  isPlaying,
  playheadSec,
  isSoftware,
  pointerRef,
}) => {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group | null>(null);
  const instancedRef = useRef<THREE.InstancedMesh | null>(null);

  const particleCount = useMemo(() => {
    const lowCores =
      typeof navigator !== 'undefined' &&
      typeof navigator.hardwareConcurrency === 'number' &&
      navigator.hardwareConcurrency <= 4;
    return lowCores || isSoftware ? 3000 : 6800;
  }, [isSoftware]);

  const points = useMemo(
    () => generateLungParticles(particleCount),
    [particleCount],
  );
  const particleGeo = useMemo(() => new THREE.OctahedronGeometry(0.022, 0), []);
  const particleMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#2DD4BF',
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  const bronchialGeo = useMemo(() => buildBronchialTreeGeometry(), []);
  const bronchialMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: '#5EEAD4',
        transparent: true,
        opacity: 0.24,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      particleGeo.dispose();
      particleMat.dispose();
      bronchialGeo.dispose();
      bronchialMat.dispose();
    };
  }, [bronchialGeo, bronchialMat, particleGeo, particleMat]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const currentColor = useMemo(() => new THREE.Color('#2DD4BF'), []);
  const dominant = getDominantClass(classifier);

  useFrame((state, delta) => {
    const t = isPlaying ? playheadSec : state.clock.getElapsedTime();
    const { expansion, inInhale } = computeBreathExpansion(
      t,
      breathsPerMin,
      isPlaying,
      breathPhases,
    );

    // Smooth status tint
    const targetCol = getTargetColor(status);
    currentColor.lerp(targetCol, Math.min(1, delta * 3.5));
    particleMat.color.copy(currentColor);
    bronchialMat.color.copy(currentColor);

    const dominantProb =
      dominant === 'Wheeze'
        ? classifier.wheeze
        : dominant === 'Crackle'
          ? classifier.crackle
          : classifier.normal;
    const isWheeze = dominant === 'Wheeze';
    const isCrackle = dominant === 'Crackle';

    // Gentle camera parallax (±4 degrees)
    const targetCamX = pointerRef.current.x * 0.42;
    const targetCamY = pointerRef.current.y * 0.32 + 0.15;
    camera.position.x += (targetCamX - camera.position.x) * Math.min(1, delta * 3);
    camera.position.y += (targetCamY - camera.position.y) * Math.min(1, delta * 3);
    camera.lookAt(0, 0, 0);

    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.getElapsedTime() * 0.18) * 0.22;
      const breathScale = 1 + 0.13 * expansion;
      groupRef.current.scale.set(breathScale, 1 + 0.08 * expansion, breathScale);
    }

    const mesh = instancedRef.current;
    if (!mesh) return;

    const elapsed = state.clock.getElapsedTime();
    for (let i = 0; i < points.count; i++) {
      let x = points.baseX[i];
      const y = points.baseY[i];
      let z = points.baseZ[i];
      const ph = points.phase[i];

      let sc = 0.78 + 0.34 * expansion;

      if (isWheeze) {
        const ripple =
          Math.sin(y * 10 + elapsed * 14 + ph) * 0.045 * (0.4 + dominantProb);
        x += ripple;
        z += ripple * 0.6;
      }

      if (isCrackle && inInhale) {
        const spark = Math.sin(elapsed * 22 + ph * 9.7);
        if (spark > 0.94) {
          sc *= 1.85 + dominantProb * 0.8;
        }
      }

      dummy.position.set(x, y, z);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <fog attach="fog" args={['#050B10', 4.5, 11.5]} />
      <group ref={groupRef} position={[1.4, -0.1, 0]}>
        <instancedMesh
          ref={instancedRef}
          args={[particleGeo, particleMat, points.count]}
        />
        <lineSegments geometry={bronchialGeo} material={bronchialMat} />
      </group>
      {!isSoftware && (
        <EffectComposer multisampling={0}>
          <Bloom
            intensity={0.42}
            luminanceThreshold={0.25}
            luminanceSmoothing={0.8}
            mipmapBlur
          />
        </EffectComposer>
      )}
    </>
  );
};

export const HeroBreathScene: React.FC<HeroBreathSceneProps> = (props) => {
  const [hidden, setHidden] = useState(
    typeof document !== 'undefined' ? document.hidden : false,
  );
  const [contextLost, setContextLost] = useState(false);
  const pointerRef = useRef({ x: 0, y: 0 });

  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isSmallDevice =
    typeof window !== 'undefined' && window.innerWidth < 640;

  const glCaps = useMemo(() => detectWebGLAndRenderer(), []);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);

    const onMove = (e: PointerEvent) => {
      if (prefersReduced) return;
      pointerRef.current.x = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      pointerRef.current.y = -(e.clientY / Math.max(1, window.innerHeight)) * 2 + 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
    };
  }, [prefersReduced]);

  const opacity = Math.max(0, Math.min(1, props.scrollOpacity));

  if (prefersReduced || isSmallDevice || !glCaps.supported || contextLost) {
    return (
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-0 transition-opacity duration-300"
        style={{
          opacity: opacity * 0.55,
          background:
            'radial-gradient(ellipse 65% 45% at 72% 28%, rgba(45,212,191,0.18), transparent 70%), radial-gradient(ellipse 45% 40% at 25% 22%, rgba(139,92,246,0.1), transparent 70%)',
        }}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity }}
    >
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0.15, 6.2], fov: 42, near: 0.1, far: 30 }}
        frameloop={hidden || opacity <= 0.02 ? 'never' : 'always'}
        gl={{
          alpha: true,
          antialias: !glCaps.isSoftware,
          powerPreference: 'high-performance',
        }}
        onCreated={({ gl }) => {
          const dom = gl.domElement;
          dom.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            setContextLost(true);
          });
          dom.addEventListener('webglcontextrestored', () => {
            setContextLost(false);
          });
        }}
      >
        <LungSceneContent
          {...props}
          isSoftware={glCaps.isSoftware}
          pointerRef={pointerRef}
        />
      </Canvas>
    </div>
  );
};
