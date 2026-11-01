export type Tool =
  | 'select'
  | 'rectangle'
  | 'polygon'
  | 'ellipse'
  | 'path'
  | 'line'
  | 'intelligent-scissors'
  | 'magnetic-cursor'
  | 'smart-select';

export type SamState =
  | { state: 'idle' }
  | { state: 'loading'; progress: number }
  | { state: 'ready'; busy: boolean; hasSelection: boolean }
  | { state: 'unsupported' }
  | { state: 'error'; message: string };

export type SamCommand = 'done' | 'reset';
