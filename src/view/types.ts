export interface OverlayPoint {
  x: number;
  y: number;
}

export interface OverlayRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OverlayViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type OverlayProjector = (point: OverlayPoint) => OverlayPoint | null;

export interface OverlayStyle {
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  opacity?: number;
  /** Raw pre-sanitized CSS declarations (e.g. legacy inline style fallback). */
  raw?: string;
}

/** A single shape in canvas coordinates, before projection to overlay coordinates. */
export interface CanvasOverlayItem {
  id: string;
  rect?: OverlayRect;
  point?: OverlayPoint;
  polygon?: { points: OverlayPoint[] };
  /** True for open paths (line / freehand) rendered as `<polyline>` with no fill. */
  openPath?: boolean;
  label?: string;
  title?: string;
  ariaLabel?: string;
  className?: string;
  style?: OverlayStyle;
  isHighlight?: boolean;
  isActive?: boolean;
  isHover?: boolean;
  isDimmed?: boolean;
  pointNumber?: number;
}

/** A projected shape ready for SVG / HTML overlay rendering. */
export interface ProjectedOverlayShape {
  id: string;
  kind: 'rect' | 'polygon' | 'polyline' | 'point';
  rect?: { x: number; y: number; width: number; height: number };
  points?: OverlayPoint[];
  point?: OverlayPoint;
  /** Anchor bounds in overlay coordinates (used for label/tooltip placement). */
  bounds: { x: number; y: number; width: number; height: number };
  label?: string;
  title?: string;
  ariaLabel?: string;
  className?: string;
  style?: OverlayStyle;
  isHighlight?: boolean;
  isActive?: boolean;
  isHover?: boolean;
  isDimmed?: boolean;
  pointNumber?: number;
}

/** Projects canvas coordinates into pixel coordinates using a viewBox and viewport dimensions. */
export const viewBoxProjector = (
  viewBox: OverlayViewBox,
  width: number,
  height: number,
): OverlayProjector => {
  const safeW = viewBox.w || 1;
  const safeH = viewBox.h || 1;
  return (point) => ({
    x: ((point.x - viewBox.x) / safeW) * width,
    y: ((point.y - viewBox.y) / safeH) * height,
  });
};

/** Projects canvas-space items into overlay-space shapes using `project`. */
export const projectOverlayItems = (
  items: readonly CanvasOverlayItem[],
  project: OverlayProjector,
): ProjectedOverlayShape[] => {
  const projected: ProjectedOverlayShape[] = [];
  for (const item of items) {
    const shared = {
      id: item.id,
      label: item.label,
      title: item.title,
      ariaLabel: item.ariaLabel,
      className: item.className,
      style: item.style,
      isHighlight: item.isHighlight,
      isActive: item.isActive,
      isHover: item.isHover,
      isDimmed: item.isDimmed,
      pointNumber: item.pointNumber,
    };

    if (item.polygon?.points?.length) {
      const pts = item.polygon.points
        .map(project)
        .filter((p): p is OverlayPoint => p !== null);
      if (pts.length === 0) continue;
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      projected.push({
        ...shared,
        kind: item.openPath ? 'polyline' : 'polygon',
        points: pts,
        bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      });
      continue;
    }

    if (item.point) {
      const pt = project(item.point);
      if (!pt) continue;
      projected.push({
        ...shared,
        kind: 'point',
        point: pt,
        bounds: { x: pt.x, y: pt.y, width: 0, height: 0 },
      });
      continue;
    }

    if (item.rect) {
      const tl = project({ x: item.rect.x, y: item.rect.y });
      const br = project({ x: item.rect.x + item.rect.w, y: item.rect.y + item.rect.h });
      if (!tl || !br) continue;
      const x = Math.min(tl.x, br.x);
      const y = Math.min(tl.y, br.y);
      const width = Math.abs(br.x - tl.x);
      const height = Math.abs(br.y - tl.y);
      projected.push({
        ...shared,
        kind: 'rect',
        rect: { x, y, width, height },
        bounds: { x, y, width, height },
      });
    }
  }
  return projected;
};
