import { deepFreeze } from '../utils/merge';
import type { Theme } from './types';

export const darkTheme: Theme = deepFreeze({
  background: '#0b1622',
  text: '#d6e0ea',
  textMuted: '#7f93a8',
  grid: 'rgba(127, 147, 168, 0.12)',
  border: 'rgba(127, 147, 168, 0.24)',
  crosshair: 'rgba(214, 224, 234, 0.55)',
  crosshairLabelBackground: '#1f3347',
  crosshairLabelText: '#f4f8fb',
  up: '#22c58b',
  down: '#f2495e',
  volumeUp: 'rgba(34, 197, 139, 0.45)',
  volumeDown: 'rgba(242, 73, 94, 0.45)',
  accent: '#3b82f6',
  palette: ['#f5b942', '#5aa9fa', '#c084fc', '#2dd4bf', '#fb7185', '#a3e635', '#f97316', '#e879f9'],
  buy: '#22c58b',
  sell: '#f2495e',
  alert: '#f5b942'
});

export const lightTheme: Theme = deepFreeze({
  background: '#ffffff',
  text: '#1f2a37',
  textMuted: '#6b7a8c',
  grid: 'rgba(31, 42, 55, 0.07)',
  border: 'rgba(31, 42, 55, 0.18)',
  crosshair: 'rgba(31, 42, 55, 0.45)',
  crosshairLabelBackground: '#1f2a37',
  crosshairLabelText: '#ffffff',
  up: '#089981',
  down: '#e8384f',
  volumeUp: 'rgba(8, 153, 129, 0.4)',
  volumeDown: 'rgba(232, 56, 79, 0.4)',
  accent: '#2962ff',
  palette: ['#e08d00', '#2962ff', '#9c27b0', '#00897b', '#d81b60', '#558b2f', '#ef6c00', '#8e24aa'],
  buy: '#089981',
  sell: '#e8384f',
  alert: '#e08d00'
});
