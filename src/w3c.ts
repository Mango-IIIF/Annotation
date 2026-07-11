import type { Point, ShapeData } from './types';

export type W3CFragmentSelector = {
  type: 'FragmentSelector';
  conformsTo: 'http://www.w3.org/TR/media-frags/';
  value: string;
};

export type W3CSvgSelector = {
  type: 'SvgSelector';
  value: string;
};

export type W3CTextualBody = {
  type: 'TextualBody';
  value: string;
  format?: 'text/html' | 'text/plain' | string;
  language?: string;
  purpose?: string;
};

export type W3CAnnotation = {
  id: string;
  type: 'Annotation';
  motivation: string;
  body?: W3CTextualBody[];
  target: {
    type: 'SpecificResource';
    source: string;
    selector: W3CFragmentSelector | W3CSvgSelector;
  };
};

export type W3CConversionOptions = {
  source: string;
  motivation?: string;
  body?: W3CTextualBody[];
};

const MEDIA_FRAG = 'http://www.w3.org/TR/media-frags/' as const;

export function shapeToW3C(annotation: ShapeData, options: W3CConversionOptions): W3CAnnotation {
  const body =
    options.body ??
    (annotation.text
      ? [{ type: 'TextualBody' as const, value: annotation.text, format: 'text/plain' }]
      : []);
  return {
    id: annotation.id,
    type: 'Annotation',
    motivation: options.motivation ?? 'commenting',
    body,
    target: {
      type: 'SpecificResource',
      source: options.source,
      selector: shapeToSelector(annotation),
    },
  };
}

export function w3cToShape(annotation: W3CAnnotation): ShapeData | null {
  const selector = annotation.target?.selector;
  if (!selector) return null;
  const text = annotation.body?.find((body) => body.value)?.value;
  if (selector.type === 'FragmentSelector') {
    const rect = parseXYWH(selector.value);
    if (!rect) return null;
    if (rect.w === 1 && rect.h === 1) {
      return {
        id: annotation.id,
        type: 'point',
        geometry: { x: rect.x, y: rect.y },
        text,
      };
    }
    return {
      id: annotation.id,
      type: 'rect',
      geometry: rect,
      text,
    };
  }
  const parsed = parseSvgSelector(selector.value);
  if (!parsed) return null;
  return {
    id: annotation.id,
    type: parsed.type,
    geometry: { points: parsed.points },
    text,
  };
}

export function shapeToSelector(annotation: ShapeData): W3CFragmentSelector | W3CSvgSelector {
  if (annotation.type === 'rect') {
    const { x, y, w, h } = annotation.geometry;
    return {
      type: 'FragmentSelector',
      conformsTo: MEDIA_FRAG,
      value: `xywh=pixel:${round(x)},${round(y)},${round(w)},${round(h)}`,
    };
  }
  if (annotation.type === 'point') {
    return {
      type: 'FragmentSelector',
      conformsTo: MEDIA_FRAG,
      value: `xywh=pixel:${round(annotation.geometry.x)},${round(annotation.geometry.y)},1,1`,
    };
  }
  if (annotation.type === 'line') {
    return {
      type: 'SvgSelector',
      value: `<svg><polyline points="${pointPair(annotation.geometry.start)} ${pointPair(
        annotation.geometry.end,
      )}" /></svg>`,
    };
  }
  const tag = annotation.type === 'polygon' ? 'polygon' : 'polyline';
  return {
    type: 'SvgSelector',
    value: `<svg><${tag} points="${annotation.geometry.points.map(pointPair).join(' ')}" /></svg>`,
  };
}

export function parseXYWH(value: string) {
  const match = value.match(/^xywh=pixel:([^,]+),([^,]+),([^,]+),([^,]+)$/);
  if (!match) return null;
  const [x, y, w, h] = match.slice(1).map(Number);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  return { x, y, w, h };
}

export function parseSvgSelector(value: string): { type: 'polygon' | 'freehand'; points: Point[] } | null {
  const pointsMatch = value.match(/points\s*=\s*["']([^"']+)["']/i);
  if (!pointsMatch) return null;
  const points = pointsMatch[1]
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number))
    .filter((parts) => parts.length === 2 && parts.every(Number.isFinite))
    .map(([x, y]) => ({ x, y }));
  if (points.length < 2) return null;
  return {
    type: /<polyline/i.test(value) ? 'freehand' : 'polygon',
    points,
  };
}

function pointPair(point: Point) {
  return `${round(point.x)},${round(point.y)}`;
}

function round(value: number) {
  return Math.round(value);
}
