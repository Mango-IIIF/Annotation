import type { AnnotationStyle, EditorConfig } from './types';

export const DEFAULT_STYLE: AnnotationStyle = {
  strokeColor: '#a78bfa',
  strokeWidth: 2,
  fillColor: 'rgba(167, 139, 250, 0.16)',
  fillOpacity: 0.16,
  opacity: 1,
  activeColor: '#ffbf4d',
};

export const DEFAULT_CONFIG: Required<
  Omit<EditorConfig, 'shapes' | 'minShapeSize'>
> & {
  minShapeSize: { width: number; height: number };
  shapes: NonNullable<EditorConfig['shapes']>;
} = {
  handleSize: 10,
  handleColor: '#ffffff',
  handleStrokeColor: '#121922',
  hitTolerance: 8,
  polygonCloseTolerance: 12,
  polygonDoubleClickDelay: 500,
  polygonDoubleClickTolerance: 10,
  minShapeSize: { width: 8, height: 8 },
  rotation: {
    // Off by default: turning it on adds a handle to every selection, which
    // would change the UI of every existing host without warning.
    enabled: false,
    handleDistance: 28,
    snapIncrement: 15,
    cardinalTolerance: 4,
    snapModifier: 'shift',
    snapByDefault: true,
  },
  keyboard: {
    enabled: true,
    moveStep: 1,
    coarseMoveStep: 10,
    resizeStep: 1,
    rotateStep: 15,
  },
  shapes: {
    rect: {
      borderRadius: 0,
    },
    line: {
      lineCap: 'round',
      lineJoin: 'round',
      showDirectionArrow: false,
    },
    freehand: {
      simplifyTolerance: 1.2,
    },
  },
};

export const OSD_EVENTS = [
  'open',
  'animation',
  'animation-finish',
  'resize',
  'rotate',
  'flip',
  'update-viewport',
];
