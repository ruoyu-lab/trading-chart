import { toTime } from '../data/time';
import { fail } from '../utils/errors';
import type { Registry } from '../utils/registry';
import { checkArray, checkBoolean, checkNumber, checkOneOf, checkString } from '../utils/validate';
import type {
  Drawing,
  DrawingInput,
  DrawingPoint,
  DrawingPointInput,
  DrawingStyle,
  DrawingTypeDefinition
} from './types';

const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const;
const HISTORY_LIMIT = 100;

export interface DrawingEntry {
  readonly id: string;
  readonly type: string;
  readonly definition: DrawingTypeDefinition;
  pane: string;
  points: DrawingPoint[];
  style: Partial<DrawingStyle>;
  text: string;
  locked: boolean;
  visible: boolean;
}

export type DrawingSnapshot = readonly DrawingEntry[];

function copyEntry(entry: DrawingEntry): DrawingEntry {
  return {
    ...entry,
    points: entry.points.map((point) => ({ ...point })),
    style: { ...entry.style }
  };
}

export function parsePoints(points: readonly DrawingPointInput[], label: string): DrawingPoint[] {
  checkArray(label, points);

  return points.map((point, index) => ({
    time: toTime(point.time, `${label}[${index}].time`),
    price: checkNumber(`${label}[${index}].price`, point.price)
  }));
}

export function checkStyle(style: Partial<DrawingStyle>): Partial<DrawingStyle> {
  const result: Partial<DrawingStyle> = {};

  for (const key of ['color', 'fillColor', 'textColor'] as const) {
    if (style[key] !== undefined) {
      result[key] = checkString(`style.${key}`, style[key]);
    }
  }

  if (style.lineWidth !== undefined) {
    result.lineWidth = checkNumber('style.lineWidth', style.lineWidth, { min: 0.5, max: 20 });
  }

  if (style.fontSize !== undefined) {
    result.fontSize = checkNumber('style.fontSize', style.fontSize, { min: 6, max: 72 });
  }

  if (style.lineStyle !== undefined) {
    result.lineStyle = checkOneOf('style.lineStyle', style.lineStyle, LINE_STYLES);
  }

  return result;
}

function checkPointCount(
  definition: DrawingTypeDefinition,
  points: readonly DrawingPoint[],
  type: string
): void {
  const valid = definition.points === 0 ? points.length >= 2 : points.length === definition.points;

  if (!valid) {
    const expected = definition.points === 0 ? 'at least 2' : String(definition.points);
    fail(`A "${type}" drawing needs ${expected} points, received ${points.length}.`);
  }
}

/** The drawings of a chart in z-order, with snapshots for undo and redo. */
export class DrawingStore {
  private entries: DrawingEntry[] = [];
  private nextId = 1;

  constructor(readonly registry: Registry<DrawingTypeDefinition>) {}

  list(): readonly DrawingEntry[] {
    return this.entries;
  }

  get(id: string): DrawingEntry | undefined {
    return this.entries.find((entry) => entry.id === id);
  }

  require(id: string): DrawingEntry {
    return this.get(id) ?? fail(`Unknown drawing "${id}".`);
  }

  info(entry: DrawingEntry): Drawing {
    return {
      id: entry.id,
      type: entry.type,
      pane: entry.pane,
      points: entry.points.map((point) => ({ ...point })),
      style: { ...entry.style },
      text: entry.text,
      locked: entry.locked,
      visible: entry.visible
    };
  }

  /** Validates an input into an entry without adding it. */
  create(input: DrawingInput, paneExists: (id: string) => boolean): DrawingEntry {
    checkString('drawing.type', input.type);
    const definition = this.registry.require(input.type);
    const id = input.id ?? this.generateId(input.type);
    checkString('drawing.id', id);

    if (this.get(id)) {
      fail(`A drawing with id "${id}" already exists.`);
    }

    const pane = input.pane ?? 'main';

    if (!paneExists(pane)) {
      fail(`Unknown pane "${pane}".`);
    }

    const points = parsePoints(input.points, 'drawing.points');
    checkPointCount(definition, points, input.type);

    return {
      id,
      type: input.type,
      definition,
      pane,
      points,
      style: checkStyle(input.style ?? {}),
      text: input.text === undefined ? '' : checkTextValue(input.text),
      locked: input.locked === undefined ? false : checkBoolean('drawing.locked', input.locked),
      visible: input.visible === undefined ? true : checkBoolean('drawing.visible', input.visible)
    };
  }

  add(entry: DrawingEntry): void {
    this.entries.push(entry);
  }

  update(
    id: string,
    patch: Omit<Partial<DrawingInput>, 'id' | 'type'>,
    paneExists: (id: string) => boolean
  ): void {
    const entry = this.require(id);
    const points =
      patch.points === undefined ? entry.points : parsePoints(patch.points, 'drawing.points');
    checkPointCount(entry.definition, points, entry.type);

    if (patch.pane !== undefined && !paneExists(patch.pane)) {
      fail(`Unknown pane "${patch.pane}".`);
    }

    const style =
      patch.style === undefined ? entry.style : { ...entry.style, ...checkStyle(patch.style) };
    const text = patch.text === undefined ? entry.text : checkTextValue(patch.text);
    const locked =
      patch.locked === undefined ? entry.locked : checkBoolean('drawing.locked', patch.locked);
    const visible =
      patch.visible === undefined ? entry.visible : checkBoolean('drawing.visible', patch.visible);

    entry.points = points;
    entry.pane = patch.pane ?? entry.pane;
    entry.style = style;
    entry.text = text;
    entry.locked = locked;
    entry.visible = visible;
  }

  setPoints(id: string, points: DrawingPoint[]): void {
    this.require(id).points = points;
  }

  remove(id: string): DrawingEntry {
    const entry = this.require(id);
    this.entries = this.entries.filter((item) => item !== entry);
    return entry;
  }

  /** Removes the drawings of a pane that no longer exists. */
  removePane(paneId: string): void {
    this.entries = this.entries.filter((entry) => entry.pane !== paneId);
  }

  snapshot(): DrawingSnapshot {
    return this.entries.map(copyEntry);
  }

  restore(snapshot: DrawingSnapshot): void {
    this.entries = snapshot.map(copyEntry);
  }

  generateId(type: string): string {
    let id = `${type}-${this.nextId}`;

    while (this.get(id)) {
      this.nextId += 1;
      id = `${type}-${this.nextId}`;
    }

    this.nextId += 1;
    return id;
  }
}

export function checkTextValue(text: unknown): string {
  if (typeof text !== 'string') {
    return fail('drawing.text must be a string.');
  }

  return text;
}

/** Undo and redo stacks of drawing snapshots. */
export class DrawingHistory {
  private undoStack: DrawingSnapshot[] = [];
  private redoStack: DrawingSnapshot[] = [];

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Remembers the state before a change; a new change discards the redo stack. */
  record(before: DrawingSnapshot): void {
    this.undoStack.push(before);

    if (this.undoStack.length > HISTORY_LIMIT) {
      this.undoStack.shift();
    }

    this.redoStack = [];
  }

  undo(current: DrawingSnapshot): DrawingSnapshot | null {
    const previous = this.undoStack.pop();

    if (!previous) {
      return null;
    }

    this.redoStack.push(current);
    return previous;
  }

  redo(current: DrawingSnapshot): DrawingSnapshot | null {
    const next = this.redoStack.pop();

    if (!next) {
      return null;
    }

    this.undoStack.push(current);
    return next;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /** Drops the drawings of a removed pane from every snapshot, so undo cannot bring them back. */
  forgetPane(paneId: string): void {
    const keep = (snapshot: DrawingSnapshot) => snapshot.filter((entry) => entry.pane !== paneId);
    this.undoStack = this.undoStack.map(keep);
    this.redoStack = this.redoStack.map(keep);
  }
}
