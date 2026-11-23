import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  ContactShadows,
  Environment,
  Html,
  Lightformer,
  OrbitControls,
} from '@react-three/drei';
import * as THREE from 'three';

const HARDWARE_PARTS: Array<{
  id: string;
  label: string;
  explodedY: number;
  labelSide: 'left' | 'right';
}> = [
  {
    id: 'tpu-ring',
    label: 'Soft-touch, ergonomic TPU contact ring',
    explodedY: 2.05,
    labelSide: 'left',
  },
  {
    id: 'diaphragm',
    label: 'High-tension diaphragm membrane',
    explodedY: 1.35,
    labelSide: 'right',
  },
  {
    id: 'petg-housing',
    label: '3D-printed PETG housing',
    explodedY: 0.65,
    labelSide: 'left',
  },
  {
    id: 'mems-mount',
    label: 'Precision MEMS microphone mount',
    explodedY: 0.0,
    labelSide: 'right',
  },
  {
    id: 'esp32-pcb',
    label: 'ESP32-S3 PCB',
    explodedY: -0.7,
    labelSide: 'left',
  },
  {
    id: 'usbc-port',
    label: 'USB-C Charging Port',
    explodedY: -1.3,
    labelSide: 'right',
  },
  {
    id: 'base-cover',
    label: 'Modular base cover',
    explodedY: -1.95,
    labelSide: 'left',
  },
];

function checkWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return Boolean(
      c.getContext('webgl2') ||
        c.getContext('webgl') ||
        c.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}

const ExplodedPartWrapper: React.FC<{
  partId: string;
  label: string;
  explodedY: number;
  labelSide: 'left' | 'right';
  index: number;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  children: React.ReactNode;
}> = ({
  partId,
  label,
  explodedY,
  labelSide,
  index,
  hoveredId,
  onHover,
  children,
}) => {
  const groupRef = useRef<THREE.Group | null>(null);
  const openClockRef = useRef(0);
  const isHovered = hoveredId === partId;

  useFrame((_, delta) => {
    openClockRef.current = Math.min(10, openClockRef.current + delta);
    const delay = index * 0.065;
    const rawT = Math.max(0, Math.min(1, (openClockRef.current - delay) / 0.72));
    // Smooth spring-like overshoot curve
    const ease = 1 - Math.pow(1 - rawT, 3);
    const targetY = explodedY * ease + (isHovered ? 0.14 : 0);
    if (groupRef.current) {
      groupRef.current.position.y +=
        (targetY - groupRef.current.position.y) * Math.min(1, delta * 12);
    }
  });

  const labelOffsetX = labelSide === 'left' ? -2.3 : 2.3;

  return (
    <group
      ref={groupRef}
      position={[0, 0, 0]}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(partId);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onHover(null);
        document.body.style.cursor = 'auto';
      }}
    >
      {children}
      <Html
        position={[labelOffsetX, 0, 0]}
        center
        distanceFactor={7.5}
        style={{ pointerEvents: 'none' }}
      >
        <div
          className={`flex items-center gap-2 whitespace-nowrap transition-all duration-200 ${
            labelSide === 'left' ? 'flex-row-reverse text-right' : 'flex-row text-left'
          }`}
        >
          <span
            className={`h-px transition-all ${
              isHovered ? 'w-12 bg-[#0F766E]' : 'w-8 bg-slate-500/70'
            }`}
          />
          <span
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border shadow-sm transition-all ${
              isHovered
                ? 'bg-[#0F172A] text-[#5EEAD4] border-[#2DD4BF] scale-105'
                : 'bg-white/90 text-slate-800 border-slate-300/80'
            }`}
          >
            {label}
          </span>
        </div>
      </Html>
    </group>
  );
};

const SensorAssembly: React.FC<{
  hoveredId: string | null;
  onHover: (id: string | null) => void;
}> = ({ hoveredId, onHover }) => {
  // Custom wavy TPU torus geometry
  const tpuGeo = useMemo(() => {
    const geo = new THREE.TorusGeometry(1.18, 0.16, 24, 64);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const angle = Math.atan2(y, x);
      const wave = Math.sin(angle * 3) * 0.045;
      pos.setZ(i, pos.getZ(i) + wave);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  useEffect(() => {
    return () => {
      tpuGeo.dispose();
    };
  }, [tpuGeo]);

  return (
    <group position={[0, 0, 0]}>
      {/* 1. TPU Contact Ring */}
      <ExplodedPartWrapper
        partId="tpu-ring"
        label={HARDWARE_PARTS[0].label}
        explodedY={HARDWARE_PARTS[0].explodedY}
        labelSide={HARDWARE_PARTS[0].labelSide}
        index={0}
        hoveredId={hoveredId}
        onHover={onHover}
      >
        <mesh geometry={tpuGeo} rotation={[Math.PI / 2, 0, 0]}>
          <meshStandardMaterial
            color={hoveredId === 'tpu-ring' ? '#7AA4BA' : '#94A9BC'}
            roughness={0.55}
            metalness={0.08}
          />
        </mesh>
      </ExplodedPartWrapper>

      {/* 2. High-tension diaphragm membrane */}
      <ExplodedPartWrapper
        partId="diaphragm"
        label={HARDWARE_PARTS[1].label}
        explodedY={HARDWARE_PARTS[1].explodedY}
        labelSide={HARDWARE_PARTS[1].labelSide}
        index={1}
        hoveredId={hoveredId}
        onHover={onHover}
      >
        <mesh>
          <cylinderGeometry args={[1.05, 1.05, 0.035, 48]} />
          <meshPhysicalMaterial
            color="#DCE9F5"
            transparent
            opacity={0.74}
            roughness={0.18}
            metalness={0.05}
            clearcoat={0.6}
          />
        </mesh>
      </ExplodedPartWrapper>

      {/* 3. 3D-printed PETG housing */}
      <ExplodedPartWrapper
        partId="petg-housing"
        label={HARDWARE_PARTS[2].label}
        explodedY={HARDWARE_PARTS[2].explodedY}
        labelSide={HARDWARE_PARTS[2].labelSide}
        index={2}
        hoveredId={hoveredId}
        onHover={onHover}
      >
        <mesh>
          <cylinderGeometry args={[0.96, 1.24, 0.48, 48]} />
          <meshStandardMaterial
            color={hoveredId === 'petg-housing' ? '#FFFFFF' : '#EEF3F8'}
            roughness={0.35}
            metalness={0.06}
          />
        </mesh>
      </ExplodedPartWrapper>

      {/* 4. Precision MEMS microphone mount */}
      <ExplodedPartWrapper
        partId="mems-mount"
        label={HARDWARE_PARTS[3].label}
        explodedY={HARDWARE_PARTS[3].explodedY}
        labelSide={HARDWARE_PARTS[3].labelSide}
        index={3}
        hoveredId={hoveredId}
        onHover={onHover}
      >
        <group>
          <mesh>
            <cylinderGeometry args={[0.52, 0.52, 0.07, 32]} />
            <meshStandardMaterial color="#CBD5E1" roughness={0.4} metalness={0.25} />
          </mesh>
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.14, 0.14, 0.12, 24]} />
            <meshStandardMaterial color="#94A3B8" roughness={0.3} metalness={0.7} />
          </mesh>
          <mesh position={[0, 0.145, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.02, 16]} />
            <meshStandardMaterial color="#0F172A" roughness={0.8} />
          </mesh>
        </group>
      </ExplodedPartWrapper>

      {/* 5. ESP32-S3 PCB */}
      <ExplodedPartWrapper
        partId="esp32-pcb"
        label={HARDWARE_PARTS[4].label}
        explodedY={HARDWARE_PARTS[4].explodedY}
        labelSide={HARDWARE_PARTS[4].labelSide}
        index={4}
        hoveredId={hoveredId}
        onHover={onHover}
      >
        <group>
          <mesh>
            <cylinderGeometry args={[0.98, 0.98, 0.06, 48]} />
            <meshStandardMaterial
              color={hoveredId === 'esp32-pcb' ? '#15803D' : '#166534'}
              roughness={0.45}
              metalness={0.18}
            />
          </mesh>
          {/* ESP32-S3 module shield */}
          <mesh position={[-0.18, 0.07, 0.05]}>
            <boxGeometry args={[0.48, 0.08, 0.42]} />
            <meshStandardMaterial color="#CBD5E1" roughness={0.25} metalness={0.82} />
          </mesh>
          {/* LiPo cell */}
          <mesh position={[0.38, 0.08, -0.1]}>
            <boxGeometry args={[0.45, 0.1, 0.62]} />
            <meshStandardMaterial color="#94A3B8" roughness={0.35} metalness={0.65} />
          </mesh>
          {/* Supporting IC */}
          <mesh position={[-0.2, 0.05, -0.45]}>
            <boxGeometry args={[0.2, 0.04, 0.2]} />
            <meshStandardMaterial color="#1E293B" roughness={0.6} />
          </mesh>
        </group>
      </ExplodedPartWrapper>

      {/* 6. USB-C Charging Port */}
      <ExplodedPartWrapper
        partId="usbc-port"
        label={HARDWARE_PARTS[5].label}
        explodedY={HARDWARE_PARTS[5].explodedY}
        labelSide={HARDWARE_PARTS[5].labelSide}
        index={5}
        hoveredId={hoveredId}
        onHover={onHover}
      >
        <group position={[0.88, 0, 0]}>
          <mesh>
            <boxGeometry args={[0.26, 0.11, 0.28]} />
            <meshStandardMaterial
              color={hoveredId === 'usbc-port' ? '#E2E8F0' : '#94A3B8'}
              roughness={0.25}
              metalness={0.85}
            />
          </mesh>
          <mesh position={[0.132, 0, 0]}>
            <boxGeometry args={[0.02, 0.05, 0.18]} />
            <meshStandardMaterial color="#0F172A" roughness={0.9} />
          </mesh>
        </group>
      </ExplodedPartWrapper>

      {/* 7. Modular base cover */}
      <ExplodedPartWrapper
        partId="base-cover"
        label={HARDWARE_PARTS[6].label}
        explodedY={HARDWARE_PARTS[6].explodedY}
        labelSide={HARDWARE_PARTS[6].labelSide}
        index={6}
        hoveredId={hoveredId}
        onHover={onHover}
      >
        <group>
          <mesh>
            <cylinderGeometry args={[1.18, 1.12, 0.14, 48]} />
            <meshStandardMaterial
              color={hoveredId === 'base-cover' ? '#E2E8F0' : '#CBD5E1'}
              roughness={0.42}
              metalness={0.12}
            />
          </mesh>
          {/* Vent ring */}
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.072, 0]}>
            <torusGeometry args={[0.65, 0.015, 8, 40]} />
            <meshStandardMaterial color="#64748B" roughness={0.6} />
          </mesh>
        </group>
      </ExplodedPartWrapper>
    </group>
  );
};

export const HardwareExplodedModel: React.FC = () => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [contextLost, setContextLost] = useState(false);

  const webglOk = useMemo(() => checkWebGL(), []);

  if (!webglOk || contextLost) {
    return (
      <div className="rounded-2xl p-6 bg-gradient-to-br from-[#DCE7F2] to-[#ECF2F8] text-slate-900 space-y-4 border border-slate-300/80">
        <div className="text-xl font-bold tracking-tight text-slate-900">
          The Hardware
        </div>
        <ol className="space-y-2 text-sm list-decimal list-inside">
          {HARDWARE_PARTS.map((p) => (
            <li key={p.id} className="font-medium text-slate-800">
              {p.label}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div
      className="relative w-full h-[460px] rounded-2xl overflow-hidden border border-slate-300/60"
      style={{
        background:
          'radial-gradient(circle at 50% 35%, #F2F7FC 0%, #DCE7F2 65%, #CBD8E6 100%)',
      }}
    >
      <div className="absolute top-4 left-5 z-10 pointer-events-none">
        <div className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800">
          The Hardware
        </div>
        <div className="text-xs text-slate-600 font-mono">
          Drag to orbit · Hover layers to inspect
        </div>
      </div>

      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0.4, 1.35, 6.9], fov: 40, near: 0.1, far: 40 }}
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
        <ambientLight intensity={0.65} />
        <directionalLight position={[5, 8, 6]} intensity={1.1} color="#ffffff" />
        <directionalLight position={[-6, 3, -4]} intensity={0.5} color="#dbeafe" />

        <Environment resolution={128}>
          <Lightformer
            form="rect"
            intensity={2.2}
            position={[0, 5, 3]}
            scale={[8, 4, 1]}
            rotation={[Math.PI / 2, 0, 0]}
          />
          <Lightformer
            form="rect"
            intensity={1.2}
            position={[-5, 2, 2]}
            scale={[5, 4, 1]}
            rotation={[0, Math.PI / 2, 0]}
            color="#e0f2fe"
          />
        </Environment>

        <SensorAssembly hoveredId={hoveredId} onHover={setHoveredId} />

        <ContactShadows
          position={[0, -2.55, 0]}
          opacity={0.35}
          scale={8}
          blur={2.4}
          far={6}
        />

        <OrbitControls
          enableDamping
          dampingFactor={0.06}
          enablePan={false}
          minDistance={4.8}
          maxDistance={10}
          minPolarAngle={Math.PI * 0.18}
          maxPolarAngle={Math.PI * 0.82}
          autoRotate={autoRotate}
          autoRotateSpeed={0.85}
          onStart={() => setAutoRotate(false)}
        />
      </Canvas>
    </div>
  );
};
