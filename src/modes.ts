import type { CanonicalEditorMode, EditorMode } from './types';

export function normalizeMode(mode: EditorMode | undefined): CanonicalEditorMode {
  switch (mode) {
    case 'rectangle':
      return 'draw-rect';
    case 'polygon':
      return 'draw-polygon';
    case 'point':
      return 'draw-point';
    case 'line':
      return 'draw-line';
    case 'freehand':
      return 'draw-freehand';
    case 'draw-rect':
    case 'draw-polygon':
    case 'draw-point':
    case 'draw-line':
    case 'draw-freehand':
    case 'select':
    case 'none':
      return mode;
    default:
      return 'select';
  }
}

export function modeToShape(mode: CanonicalEditorMode) {
  switch (mode) {
    case 'draw-rect':
      return 'rect';
    case 'draw-polygon':
      return 'polygon';
    case 'draw-point':
      return 'point';
    case 'draw-line':
      return 'line';
    case 'draw-freehand':
      return 'freehand';
    default:
      return null;
  }
}
