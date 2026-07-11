import { DEFAULT_STYLE } from './defaults';
import type {
  AnnotationStyle,
  AnnotationTheme,
  CanvasSize,
  OSDLikeViewer,
  Point,
  ShapeData,
} from './types';

export const SVG_NS = 'http://www.w3.org/2000/svg';

export function createSvgElement<K extends keyof SVGElementTagNameMap>(
  tagName: K,
): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tagName);
}

export function resolveStyle(
  annotation: ShapeData | null,
  theme: AnnotationTheme | undefined,
  baseStyle: Partial<AnnotationStyle> | undefined,
) {
  return {
    ...DEFAULT_STYLE,
    ...baseStyle,
    ...theme?.defaults,
    ...(annotation?.layer ? theme?.layers?.[annotation.layer] : null),
    ...(annotation?.style ?? null),
  };
}

export function applyShapeStyle(
  element: SVGElement,
  style: AnnotationStyle,
  options?: { active?: boolean; fill?: boolean },
) {
  element.setAttribute('stroke', style.strokeColor);
  element.setAttribute('stroke-width', String(options?.active ? style.strokeWidth + 1 : style.strokeWidth));
  element.setAttribute('vector-effect', 'non-scaling-stroke');
  element.setAttribute('opacity', String(style.opacity));
  element.setAttribute('fill', options?.fill === false ? 'none' : style.fillColor);
}

export function pointToElement(
  viewer: OSDLikeViewer,
  point: Point,
  canvasSize: CanvasSize,
): Point {
  const viewport = viewer.viewport as any;
  const viewportPoint =
    typeof viewport?.imageToViewportCoordinates === 'function'
      ? viewport.imageToViewportCoordinates(point.x, point.y)
      : null;
  const projected =
    viewportPoint && numericViewportToViewerElement(viewer, viewportPoint)
      ? numericViewportToViewerElement(viewer, viewportPoint)
      : viewer.viewport?.imageToViewerElementCoordinates?.(
          createViewportPoint(viewer, point),
        );
  if (projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
    return projected;
  }
  const rect = viewer.container.getBoundingClientRect();
  return {
    x: (point.x / canvasSize.width) * rect.width,
    y: (point.y / canvasSize.height) * rect.height,
  };
}

export function elementToPoint(
  viewer: OSDLikeViewer,
  point: Point,
  canvasSize: CanvasSize,
): Point {
  const viewport = viewer.viewport as any;
  const viewportPoint = numericViewerElementToViewport(viewer, point);
  const converted =
    viewportPoint && typeof viewport?.viewportToImageCoordinates === 'function'
      ? viewport.viewportToImageCoordinates(viewportPoint.x, viewportPoint.y)
      : viewer.viewport?.viewerElementToImageCoordinates?.(
          createViewportPoint(viewer, point),
        );
  if (converted && Number.isFinite(converted.x) && Number.isFinite(converted.y)) {
    return converted;
  }
  const rect = viewer.container.getBoundingClientRect();
  return {
    x: (point.x / Math.max(1, rect.width)) * canvasSize.width,
    y: (point.y / Math.max(1, rect.height)) * canvasSize.height,
  };
}

export function svgPoints(points: Point[]) {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function createViewportPoint(viewer: OSDLikeViewer, point: Point) {
  const viewport = viewer.viewport as any;
  const center = viewport?.getCenter?.(true) ?? viewport?.getCenter?.();
  const PointCtor = center?.constructor;
  if (typeof PointCtor === 'function') {
    return new PointCtor(point.x, point.y);
  }
  return point;
}

function numericViewerElementToViewport(viewer: OSDLikeViewer, point: Point): Point | null {
  const viewport = viewer.viewport as any;
  const bounds = viewport?.getBoundsNoRotate?.(true);
  const innerSize = viewport?._containerInnerSize;
  const margins = viewport?._margins ?? { left: 0, top: 0 };
  if (
    !bounds ||
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !innerSize ||
    !Number.isFinite(innerSize.x) ||
    innerSize.x === 0
  ) {
    return null;
  }
  const scale = innerSize.x / bounds.width;
  return {
    x: (point.x - margins.left) / scale + bounds.x,
    y: (point.y - margins.top) / scale + bounds.y,
  };
}

function numericViewportToViewerElement(viewer: OSDLikeViewer, point: Point): Point | null {
  const viewport = viewer.viewport as any;
  const bounds = viewport?.getBoundsNoRotate?.(true);
  const innerSize = viewport?._containerInnerSize;
  const margins = viewport?._margins ?? { left: 0, top: 0 };
  if (
    !bounds ||
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !innerSize ||
    !Number.isFinite(innerSize.x) ||
    innerSize.x === 0
  ) {
    return null;
  }
  const scale = innerSize.x / bounds.width;
  return {
    x: (point.x - bounds.x) * scale + margins.left,
    y: (point.y - bounds.y) * scale + margins.top,
  };
}
