import type { BarStore } from '../data/bar-store';
import type { PriceSource } from '../data/types';
import { fail } from '../utils/errors';
import type { Registry } from '../utils/registry';
import { checkBoolean, checkOneOf, checkString } from '../utils/validate';
import { IndicatorSeries, resolveParams } from './instance';
import type {
  Indicator,
  IndicatorDefinition,
  IndicatorInput,
  IndicatorOutput,
  ParamValues
} from './types';

const PRICE_SOURCES = ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4'] as const;

export interface IndicatorEntry {
  readonly id: string;
  readonly type: string;
  readonly definition: IndicatorDefinition;
  params: ParamValues;
  pane: string;
  source: PriceSource;
  visible: boolean;
  colors: Record<string, string>;
  outputs: readonly IndicatorOutput[];
  series: IndicatorSeries;
}

function checkColors(
  colors: Record<string, string> | undefined,
  outputs: readonly IndicatorOutput[],
  type: string
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, color] of Object.entries(colors ?? {})) {
    if (!outputs.some((output) => output.key === key)) {
      fail(`Indicator "${type}" has no output "${key}" to color.`);
    }

    result[key] = checkString(`colors.${key}`, color);
  }

  return result;
}

function checkOutputs(outputs: readonly IndicatorOutput[], type: string): void {
  const keys = new Set<string>();

  for (const output of outputs) {
    checkString(`outputs of "${type}": key`, output.key);

    if (keys.has(output.key)) {
      fail(
        `Indicator "${type}" produces the output key "${output.key}" twice; use distinct parameter values.`
      );
    }

    keys.add(output.key);
  }
}

/** The indicators of a chart and their computed values. */
export class IndicatorStore {
  private readonly entries = new Map<string, IndicatorEntry>();
  private nextId = 1;

  constructor(
    private readonly bars: BarStore,
    readonly registry: Registry<IndicatorDefinition>
  ) {}

  list(): IndicatorEntry[] {
    return [...this.entries.values()];
  }

  get(id: string): IndicatorEntry | undefined {
    return this.entries.get(id);
  }

  require(id: string): IndicatorEntry {
    return this.entries.get(id) ?? fail(`Unknown indicator "${id}".`);
  }

  info(entry: IndicatorEntry): Indicator {
    return {
      id: entry.id,
      type: entry.type,
      params: structuredClone(entry.params),
      pane: entry.pane,
      source: entry.source,
      visible: entry.visible,
      colors: { ...entry.colors }
    };
  }

  /** Default pane placement of a type: `main` or `new`. */
  defaultPane(type: string): 'main' | 'new' {
    return this.registry.require(type).pane;
  }

  add(input: IndicatorInput, pane: string): IndicatorEntry {
    checkString('indicator.type', input.type);
    const definition = this.registry.require(input.type);
    const id = input.id ?? this.generateId(input.type);
    checkString('indicator.id', id);

    if (this.entries.has(id)) {
      fail(`An indicator with id "${id}" already exists.`);
    }

    const params = resolveParams(definition, input.params, input.type);
    const outputs = definition.outputs(params);
    checkOutputs(outputs, input.type);
    const source =
      input.source === undefined
        ? 'close'
        : checkOneOf('indicator.source', input.source, PRICE_SOURCES);
    const entry: IndicatorEntry = {
      id,
      type: input.type,
      definition,
      params,
      pane,
      source,
      visible:
        input.visible === undefined ? true : checkBoolean('indicator.visible', input.visible),
      colors: checkColors(input.colors, outputs, input.type),
      outputs,
      series: new IndicatorSeries(this.bars, definition, params, outputs, source)
    };
    this.entries.set(id, entry);
    return entry;
  }

  /** Updates an indicator; `checkOutputs` may reject the new output keys before anything changes. */
  update(
    id: string,
    patch: Pick<IndicatorInput, 'params' | 'source' | 'visible' | 'colors'>,
    checkKeys: (keys: readonly string[]) => void
  ): void {
    const entry = this.require(id);
    const params =
      patch.params === undefined
        ? entry.params
        : resolveParams(entry.definition, { ...entry.params, ...patch.params }, entry.type);
    const source =
      patch.source === undefined
        ? entry.source
        : checkOneOf('indicator.source', patch.source, PRICE_SOURCES);
    const outputs = patch.params === undefined ? entry.outputs : entry.definition.outputs(params);
    checkOutputs(outputs, entry.type);
    checkKeys(outputs.map((output) => output.key));
    const colors =
      patch.colors === undefined
        ? entry.colors
        : checkColors({ ...entry.colors, ...patch.colors }, outputs, entry.type);
    const visible =
      patch.visible === undefined
        ? entry.visible
        : checkBoolean('indicator.visible', patch.visible);

    if (patch.params !== undefined || patch.source !== undefined) {
      entry.series = new IndicatorSeries(this.bars, entry.definition, params, outputs, source);
    }

    entry.params = params;
    entry.source = source;
    entry.outputs = outputs;
    entry.colors = colors;
    entry.visible = visible;
  }

  move(id: string, pane: string): void {
    this.require(id).pane = pane;
  }

  remove(id: string): IndicatorEntry {
    const entry = this.require(id);
    this.entries.delete(id);
    return entry;
  }

  /** Takes over the indicators of a fully validated staging store. */
  adopt(staging: IndicatorStore): void {
    this.entries.clear();
    staging.entries.forEach((entry, id) => this.entries.set(id, entry));
    this.nextId = Math.max(this.nextId, staging.nextId);
  }

  private generateId(type: string): string {
    let id = `${type.toLowerCase()}-${this.nextId}`;

    while (this.entries.has(id)) {
      this.nextId += 1;
      id = `${type.toLowerCase()}-${this.nextId}`;
    }

    this.nextId += 1;
    return id;
  }
}
