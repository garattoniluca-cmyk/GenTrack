// FlyCamera.jsx — fly-cam libera (Fase 3B).
//   drag col mouse  → guarda intorno (yaw/pitch; Y invertibile)
//   frecce / WASD   → ↑W avanti, ↓S indietro, ←A / →D strafe
//   Shift           → boost ×4 · rotellina → velocità base
// Niente pointer-lock: più affidabile nel pannello embedded.

import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';

const LOOK_SENS = 0.0035; // rad per px
const BASE_SPEED = 30; // m/s

export default function FlyCamera({ spawn, invertY }) {
  const { camera, gl } = useThree();
  const state = useRef({
    yaw: 0,
    pitch: 0,
    keys: new Set(),
    dragging: false,
    lastX: 0,
    lastY: 0,
    speed: BASE_SPEED,
    spawned: null,
  });

  // spawn: sopra la linea di start, guardando nel verso di marcia
  useEffect(() => {
    const s = state.current;
    if (!spawn || s.spawned === spawn) return;
    s.spawned = spawn;
    camera.position.set(spawn.pos[0], spawn.pos[1], spawn.pos[2]);
    s.yaw = spawn.yaw;
    s.pitch = spawn.pitch;
  }, [spawn, camera]);

  useEffect(() => {
    const el = gl.domElement;
    const s = state.current;

    const down = (e) => {
      if (e.button !== 0) return;
      s.dragging = true;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
    };
    const up = () => (s.dragging = false);
    const move = (e) => {
      if (!s.dragging) return;
      const dx = e.clientX - s.lastX;
      const dy = e.clientY - s.lastY;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      s.yaw -= dx * LOOK_SENS;
      s.pitch -= dy * LOOK_SENS * (invertY ? -1 : 1);
      s.pitch = Math.max(-1.55, Math.min(1.55, s.pitch));
    };
    const wheel = (e) => {
      e.preventDefault();
      s.speed = Math.max(2, Math.min(300, s.speed * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    };
    const keyDown = (e) => {
      const k = e.code;
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(k)
      ) {
        e.preventDefault();
        s.keys.add(k);
      }
    };
    const keyUp = (e) => s.keys.delete(e.code);

    el.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
    window.addEventListener('mousemove', move);
    el.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    return () => {
      el.removeEventListener('mousedown', down);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('mousemove', move);
      el.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    };
  }, [gl, invertY]);

  useFrame((_, delta) => {
    const s = state.current;
    // orientamento dalla coppia yaw/pitch
    camera.rotation.order = 'YXZ';
    camera.rotation.y = s.yaw;
    camera.rotation.x = s.pitch;
    camera.rotation.z = 0;

    const k = s.keys;
    if (k.size === 0) return;
    const boost = k.has('ShiftLeft') || k.has('ShiftRight') ? 4 : 1;
    const v = s.speed * boost * delta;

    // avanti lungo lo sguardo (yaw+pitch), strafe orizzontale
    const cp = Math.cos(s.pitch);
    const fwd = [-Math.sin(s.yaw) * cp, Math.sin(s.pitch), -Math.cos(s.yaw) * cp];
    const right = [Math.cos(s.yaw), 0, -Math.sin(s.yaw)];

    let mx = 0;
    let my = 0;
    let mz = 0;
    if (k.has('ArrowUp') || k.has('KeyW')) {
      mx += fwd[0]; my += fwd[1]; mz += fwd[2];
    }
    if (k.has('ArrowDown') || k.has('KeyS')) {
      mx -= fwd[0]; my -= fwd[1]; mz -= fwd[2];
    }
    if (k.has('ArrowRight') || k.has('KeyD')) {
      mx += right[0]; mz += right[2];
    }
    if (k.has('ArrowLeft') || k.has('KeyA')) {
      mx -= right[0]; mz -= right[2];
    }
    camera.position.x += mx * v;
    camera.position.y += my * v;
    camera.position.z += mz * v;
  });

  return null;
}
