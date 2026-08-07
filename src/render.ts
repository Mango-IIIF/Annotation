import { elementToImage, imageToElement, type CoordinateOptions } from './coordinates';
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

/**
 * Applies every declared style field.
 *
 * `fillOpacity` and `activeColor` were previously declared in
 * `AnnotationStyle`, set in `DEFAULT_STYLE`, and then never read — selection
 * was signalled only by adding one to the stroke width, and a host setting
 * either field saw nothing happen.
 */
export function applyShapeStyle(
  element: SVGElement,
  style: AnnotationStyle,
  options?: { active?: boolean; fill?: boolean },
) {
  const active = options?.active ?? false;
  // The stroke stays the layer colour even when selected: that colour is how a
  // reader tells which layer a shape belongs to, and losing it on selection
  // would hide exactly the thing the layer palette exists to show. Selection is
  // signalled by the heavier stroke and by `activeColor` on the handles.
  element.setAttribute('stroke', style.strokeColor);
  element.setAttribute(
    'stroke-width',
    String(active ? style.strokeWidth + 1 : style.strokeWidth),
  );
  element.setAttribute('vector-effect', 'non-scaling-stroke');
  element.setAttribute('opacity', String(style.opacity));

  if (options?.fill === false) {
    element.setAttribute('fill', 'none');
    return;
  }
  element.setAttribute('fill', style.fillColor);
  if (style.fillOpacity !== undefined) {
    element.setAttribute('fill-opacity', String(style.fillOpacity));
  }
}

/**
 * Image coordinates to viewer-element coordinates.
 *
 * Delegates to the coordinate module. Kept as a named export because the editor
 * and its tests import it directly.
 */
export function pointToElement(
  viewer: OSDLikeViewer,
  point: Point,
  canvasSize: CanvasSize,
  options?: CoordinateOptions,
): Point {
  return imageToElement(viewer, point, canvasSize, options);
}

/** Viewer-element coordinates to image coordinates. */
export function elementToPoint(
  viewer: OSDLikeViewer,
  point: Point,
  canvasSize: CanvasSize,
  options?: CoordinateOptions,
): Point {
  return elementToImage(viewer, point, canvasSize, options);
}

export function svgPoints(points: Point[]) {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}
