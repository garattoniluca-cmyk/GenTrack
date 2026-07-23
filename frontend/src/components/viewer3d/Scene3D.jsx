// Scene3D.jsx — Fase 3B: scena 3D del tubo di flusso con fly-cam.
// Coordinate three (Y-up): X = mondo.x, Y = quota, Z = −mondo.y.

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import TrackMesh3D from './TrackMesh3D.jsx';
import FlyCamera from './FlyCamera.jsx';

export default function Scene3D({ mesh, resampled, elevation, invertY, wireframe }) {
  // spawn: sopra la linea di start (s=0), guardando nel verso di marcia
  const spawn = useMemo(() => {
    const s = resampled?.samples;
    if (!s || s.length < 2 || !elevation) return null;
    const p0 = s[0];
    const p1 = s[2] ?? s[1];
    const z0 = elevation.z[0] ?? 0;
    // direzione di marcia in coordinate three (x, −y)
    const dx = p1.x - p0.x;
    const dz = -(p1.y - p0.y);
    const yaw = Math.atan2(-dx, -dz); // fwd = (−sin yaw, 0, −cos yaw)
    return {
      pos: [p0.x - dx * 3, z0 + 12, -p0.y - dz * 3], // dietro e sopra lo start
      yaw,
      pitch: -0.25,
    };
  }, [resampled, elevation]);

  const minY = elevation ? elevation.stats.minZ : 0;

  return (
    <div className="canvas-container canvas3d">
      <Canvas
        gl={{ antialias: true }}
        camera={{ fov: 70, near: 0.1, far: 20000, position: [0, 50, 100] }}
      >
        <color attach="background" args={['#0d1420']} />
        <fog attach="fog" args={['#0d1420', 2500, 9000]} />
        <hemisphereLight args={['#bcd4ff', '#26221a', 0.9]} />
        <directionalLight position={[1500, 2500, 800]} intensity={1.4} />

        <TrackMesh3D bands={mesh?.bands} wireframe={wireframe} />

        {/* piano scuro di riferimento (il terreno vero arriva in Fase 6) */}
        <mesh position={[0, minY - 15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[12000, 12000]} />
          <meshStandardMaterial color="#0a0f16" roughness={1} />
        </mesh>
        <gridHelper args={[10000, 100, '#1c2635', '#141c28']} position={[0, minY - 14.9, 0]} />

        <FlyCamera spawn={spawn} invertY={invertY} />
      </Canvas>

      <div className="canvas-hud">
        <span>
          <b>Drag</b> guarda · <b>frecce/WASD</b> vola · <b>Shift</b> boost ·{' '}
          <b>rotellina</b> velocità
        </span>
      </div>
    </div>
  );
}
