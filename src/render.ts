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
