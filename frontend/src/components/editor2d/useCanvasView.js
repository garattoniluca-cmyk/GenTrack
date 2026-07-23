// useCanvasView.js — logica vista condivisa degli editor 2D su Konva:
// dimensioni responsive, fit iniziale dell'area 5000×5000 m, conversioni
// schermo↔mondo (y-up), zoom sulla rotellina, pan (Space+drag o rotellina
// premuta), posizione cursore in coordinate mondo, barra di scala.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  WORLD_HALF_EXTENT,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_DEFAULT,
} from '../../config.js';

export function useCanvasView() {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [view, setView] = useState({ x: 0, y: 0, scale: ZOOM_DEFAULT }); // px per metro
  const [cursorWorld, setCursorWorld] = useState(null);
  const [spacePan, setSpacePan] = useState(false);

  // dimensioni responsive del canvas
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // vista iniziale: TUTTA l'area 5000×5000 m visibile, centrata sull'origine
  const centeredRef = useRef(false);
  useEffect(() => {
    if (centeredRef.current || size.width === 0) return;
    centeredRef.current = true;
    const fitScale =
      (Math.min(size.width, size.height) / (2 * WORLD_HALF_EXTENT)) * 0.95;
    setView({
      x: size.width / 2,
      y: size.height / 2,
      scale: Math.max(ZOOM_MIN, fitScale),
    });
  }, [size]);

  // Space = pan
  useEffect(() => {
    const down = (e) => {
      if (e.code === 'Space') setSpacePan(true);
    };
    const up = (e) => {
      if (e.code === 'Space') setSpacePan(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // conversioni schermo ↔ mondo (y-up)
  const screenToWorld = useCallback(
    (sx, sy) => ({
      x: (sx - view.x) / view.scale,
      y: -(sy - view.y) / view.scale,
    }),
    [view]
  );
  const worldToScreen = useCallback(
    (w) => ({ x: w.x * view.scale + view.x, y: -w.y * view.scale + view.y }),
    [view]
  );

  const pointerWorld = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    return screenToWorld(pos.x, pos.y);
  }, [screenToWorld]);

  // zoom sulla rotellina, centrato sul puntatore
  const onWheel = (e) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const pos = stage.getPointerPosition();
    const factor = e.evt.deltaY < 0 ? 1.15 : 1 / 1.15;
    setView((v) => {
      const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.scale * factor));
      const k = scale / v.scale;
      return {
        scale,
        x: pos.x - (pos.x - v.x) * k,
        y: pos.y - (pos.y - v.y) * k,
      };
    });
  };

  // pan con drag rotellina o Space+drag
  const panState = useRef(null);
  const onStageMouseDown = (e) => {
    if (e.evt.button === 1 || (e.evt.button === 0 && spacePan)) {
      e.evt.preventDefault();
      panState.current = {
        startX: e.evt.clientX,
        startY: e.evt.clientY,
        viewX: view.x,
        viewY: view.y,
      };
    }
  };
  const onStageMouseMove = () => {
    const w = pointerWorld();
    if (w) setCursorWorld(w);
  };
  useEffect(() => {
    const move = (e) => {
      if (!panState.current) return;
      const { startX, startY, viewX, viewY } = panState.current;
      setView((v) => ({
        ...v,
        x: viewX + (e.clientX - startX),
        y: viewY + (e.clientY - startY),
      }));
    };
    const up = () => (panState.current = null);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []);

  // barra di scala stile cartina: lunghezze "tonde" 1-2-5×10^n
  const rawLen = 120 / view.scale;
  const pow10 = Math.pow(10, Math.floor(Math.log10(rawLen)));
  const niceLen =
    [1, 2, 5, 10].map((m) => m * pow10).find((c) => c * view.scale >= 70) ??
    10 * pow10;
  const scaleBarPx = niceLen * view.scale;
  const scaleBarLabel = niceLen >= 1000 ? `${niceLen / 1000} km` : `${niceLen} m`;

  return {
    containerRef,
    stageRef,
    size,
    view,
    cursorWorld,
    spacePan,
    screenToWorld,
    worldToScreen,
    pointerWorld,
    onWheel,
    onStageMouseDown,
    onStageMouseMove,
    scaleBarPx,
    scaleBarLabel,
  };
}
