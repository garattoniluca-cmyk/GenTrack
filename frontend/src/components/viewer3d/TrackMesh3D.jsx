// TrackMesh3D.jsx — Fase 3B: rende le fasce del tubo di flusso.
// Le geometrie arrivano già pronte (array indicizzati dal modulo puro
// flowTubeMesh.js) e vengono solo avvolte in BufferGeometry.

import { useMemo, useEffect } from 'react';
import * as THREE from 'three';

const MATERIALS = {
  asphalt: { color: '#141416', roughness: 0.95, metalness: 0 },
  lines: { color: '#f2f2f2', roughness: 0.7, metalness: 0 },
  grass: { color: '#1d5a28', roughness: 1, metalness: 0 },
  walls: { color: '#e8e8e8', roughness: 0.85, metalness: 0, side: THREE.DoubleSide },
};

function toGeometry(band) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(band.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(band.normals, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(band.uvs, 2));
  g.setIndex(new THREE.BufferAttribute(band.indices, 1));
  return g;
}

export default function TrackMesh3D({ bands, wireframe }) {
  const geometries = useMemo(() => {
    if (!bands) return null;
    return Object.fromEntries(
      Object.entries(bands).map(([name, band]) => [name, toGeometry(band)])
    );
  }, [bands]);

  // libera la GPU quando le geometrie cambiano
  useEffect(() => {
    return () => {
      if (geometries) Object.values(geometries).forEach((g) => g.dispose());
    };
  }, [geometries]);

  if (!geometries) return null;

  return (
    <group>
      {Object.entries(geometries).map(([name, geo]) => (
        <mesh key={name} geometry={geo}>
          <meshStandardMaterial {...MATERIALS[name]} wireframe={wireframe} />
        </mesh>
      ))}
    </group>
  );
}
