import { Registry } from '../../utils/registry';
import type { DrawingTypeDefinition } from '../types';
import { fibRetracement } from './fibonacci';
import {
  arrow,
  extendedLine,
  horizontalLine,
  horizontalRay,
  ray,
  trendLine,
  verticalLine
} from './lines';
import { parallelChannel, path, priceRange, rectangle, text } from './shapes';

export function createDrawingRegistry(): Registry<DrawingTypeDefinition> {
  const builtIns: Record<string, DrawingTypeDefinition> = {
    'trend-line': trendLine,
    ray,
    'extended-line': extendedLine,
    arrow,
    'horizontal-line': horizontalLine,
    'horizontal-ray': horizontalRay,
    'vertical-line': verticalLine,
    rectangle,
    'parallel-channel': parallelChannel,
    'fib-retracement': fibRetracement,
    text,
    path,
    'price-range': priceRange
  };
  return new Registry('drawing type', builtIns);
}
