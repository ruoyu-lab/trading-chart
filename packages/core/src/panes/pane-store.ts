import type { PriceScaleMode } from '../options/types';
import { PriceScale } from '../scales/price-scale';
import { fail } from '../utils/errors';
import { checkBoolean, checkNumber, checkOneOf, checkString } from '../utils/validate';

export const MAIN_PANE_ID = 'main';

const SCALE_MODES = ['normal', 'log', 'percent', 'indexed'] as const;

export interface PaneInput {
  id: string;
  /** Shown in the legend. */
  title?: string;
  /** Height in CSS pixels. Ignored for the main pane, which takes the remaining space. */
  height?: number;
}

/** A pane as reported by the API. */
export interface Pane {
  readonly id: string;
  readonly title: string;
  readonly height: number;
  /** Created for an indicator or series and removed with its last occupant. */
  readonly auto: boolean;
}

export interface PaneEntry {
  readonly id: string;
  title: string;
  height: number;
  readonly auto: boolean;
  readonly scale: PriceScale;
  mode: PriceScaleMode;
  invert: boolean;
}

export interface ScaleMargins {
  top: number;
  bottom: number;
}

export function validatePaneInput(input: PaneInput, label: string): void {
  checkString(`${label}.id`, input.id);

  if (input.title !== undefined) {
    if (typeof input.title !== 'string') {
      fail(`${label}.title must be a string.`);
    }
  }

  if (input.height !== undefined) {
    checkNumber(`${label}.height`, input.height, { min: 1 });
  }
}

/** Ordered panes, each owning its price scale. The main pane is always first. */
export class PaneStore {
  private readonly entries: PaneEntry[] = [];
  private margins: ScaleMargins;

  constructor(
    private defaultHeight: number,
    margins: ScaleMargins
  ) {
    this.margins = margins;
    this.entries.push(this.createEntry({ id: MAIN_PANE_ID, title: '' }, false));
  }

  list(): readonly PaneEntry[] {
    return this.entries;
  }

  get(id: string): PaneEntry | undefined {
    return this.entries.find((entry) => entry.id === id);
  }

  require(id: string): PaneEntry {
    return this.get(id) ?? fail(`Unknown pane "${id}".`);
  }

  info(entry: PaneEntry): Pane {
    return { id: entry.id, title: entry.title, height: entry.height, auto: entry.auto };
  }

  configure(defaultHeight: number, margins: ScaleMargins): void {
    this.defaultHeight = defaultHeight;
    this.margins = margins;
    this.entries.forEach((entry) => {
      this.syncScale(entry);
    });
  }

  add(input: PaneInput, auto: boolean): PaneEntry {
    validatePaneInput(input, 'pane');

    if (this.get(input.id)) {
      fail(`A pane with id "${input.id}" already exists.`);
    }

    const entry = this.createEntry(input, auto);
    this.entries.push(entry);
    return entry;
  }

  update(id: string, patch: Omit<PaneInput, 'id'>): void {
    const entry = this.require(id);
    validatePaneInput({ ...patch, id }, 'pane');

    if (patch.title !== undefined) {
      entry.title = patch.title;
    }

    if (patch.height !== undefined) {
      entry.height = patch.height;
    }
  }

  remove(id: string): void {
    if (id === MAIN_PANE_ID) {
      fail('The main pane cannot be removed.');
    }

    const index = this.entries.findIndex((entry) => entry.id === id);

    if (index < 0) {
      fail(`Unknown pane "${id}".`);
    }

    this.entries.splice(index, 1);
  }

  /** Moves a pane to `index` (1 or more; the main pane stays first). */
  move(id: string, index: number): void {
    if (id === MAIN_PANE_ID) {
      fail('The main pane always stays first.');
    }

    checkNumber('index', index, { min: 1, max: this.entries.length - 1, integer: true });
    const from = this.entries.findIndex((entry) => entry.id === id);

    if (from < 0) {
      fail(`Unknown pane "${id}".`);
    }

    const [entry] = this.entries.splice(from, 1);

    if (entry) {
      this.entries.splice(index, 0, entry);
    }
  }

  /** Takes over the panes of a fully validated staging store. */
  adopt(staging: PaneStore): void {
    this.entries.splice(0, this.entries.length, ...staging.entries);
    this.entries.forEach((entry) => {
      this.syncScale(entry);
    });
  }

  setScaleMode(id: string, mode: PriceScaleMode): void {
    const entry = this.require(id);
    entry.mode = checkOneOf('mode', mode, SCALE_MODES);
    this.syncScale(entry);
  }

  setScaleInverted(id: string, invert: boolean): void {
    const entry = this.require(id);
    entry.invert = checkBoolean('inverted', invert);
    this.syncScale(entry);
  }

  private createEntry(input: PaneInput, auto: boolean): PaneEntry {
    const entry: PaneEntry = {
      id: input.id,
      title: input.title ?? '',
      height: input.height ?? this.defaultHeight,
      auto,
      mode: 'normal',
      invert: false,
      scale: new PriceScale({ mode: 'normal', invert: false, margins: this.margins })
    };
    return entry;
  }

  private syncScale(entry: PaneEntry): void {
    entry.scale.configure({ mode: entry.mode, invert: entry.invert, margins: this.margins });
  }
}
