// GridLayer.jsx — griglia + bordo dell'area di lavoro, condivisi dagli editor.
// Disegna solo le linee visibili nel viewport (l'area è 5000×5000 m).

import { Layer, Line } from 'react-konva';
import { WORLD_HALF_EXTENT } from '../../config.js';
import { COLORS } from './colors.js';

export default function GridLayer({ view, size, effGrid }) {
  const E = WORLD_HALF_EXTENT;
  const visXMin = Math.max(-E, (0 - view.x) / view.scale);
  const visXMax = Math.min(E, (size.width - view.x) / view.scale);
  const visYMin = Math.max(-E, -(size.height - view.y) / view.scale);
  const visYMax = Math.min(E, -(0 - view.y) / view.scale);

  const lines = [];
  const startX = Math.ceil(visXMin / effGrid) * effGrid;
  for (let v = startX; v <= visXMax; v += effGrid) {
    const major = Math.abs(v % (effGrid * 5)) < 1e-9;
    lines.push(
      <Line
        key={`v${v}`}
        points={[v, visYMin, v, visYMax]}
        stroke={v === 0 ? COLORS.axis : major ? COLORS.gridMajor : COLORS.grid}
        strokeWidth={(v === 0 ? 1.5 : 1) / view.scale}
        listening={false}
      />
    );
  }
  const startY = Math.ceil(visYMin / effGrid) * effGrid;
  for (let v = startY; v <= visYMax; v += effGrid) {
    const major = Math.abs(v % (effGrid * 5)) < 1e-9;
    lines.push(
      <Line
        key={`h${v}`}
        points={[visXMin, v, visXMax, v]}
        stroke={v === 0 ? COLORS.axis : major ? COLORS.gridMajor : COLORS.grid}
        strokeWidth={(v === 0 ? 1.5 : 1) / view.scale}
        listening={false}
      />
    );
  }
  lines.push(
    <Line
      key="worldBounds"
      points={[-E, -E, E, -E, E, E, -E, E]}
      closed
      stroke={COLORS.axis}
      strokeWidth={2 / view.scale}
      dash={[10 / view.scale, 6 / view.scale]}
      listening={false}
    />
  );

  return <Layer listening={false}>{lines}</Layer>;
}
