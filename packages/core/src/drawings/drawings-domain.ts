import type { DragSession, HitTarget, Point, ToolSession } from '../interaction/types';
import { applyStroke } from '../canvas/canvas';
import type { PaneFrame } from '../render/frame';
import {
  HitPriority,
  paneOf,
  timeToX,
  type ObjectContext,
  type ObjectDomain,
  type ObjectHit,
  type ObjectPaintContext
} from '../objects/types';
import { deepMerge } from '../utils/merge';
import {
  checkStyle,
  checkTextValue,
  DrawingHistory,
  type DrawingEntry,
  type DrawingSnapshot,
  type DrawingStore
} from './drawing-store';
import type { DrawingGeometry, DrawingPoint, DrawingStyle } from './types';

const DRAG_SLOP = 4;

export type DrawingsChangeReason = 'create' | 'edit' | 'remove' | 'undo' | 'redo';

export interface DrawingsHost {
  context(): ObjectContext;
  /** Repaints the objects layer. */
  repaint(): void;
  formatValue(pane: PaneFrame, value: number): string;
  /** A user action changed drawings. */
  changed(reason: DrawingsChangeReason, ids: readonly string[]): void;
  /** A user action finished or cancelled the active tool. */
  toolEnded(): void;
  /** A user action selected a drawing (or cleared the selection). */
  selected(id: string | null): void;
}

export interface ToolOptions {
  style?: Partial<DrawingStyle>;
  text?: string;
}

function baseStyle(
  context: ObjectContext,
  entry: Pick<DrawingEntry, 'definition' | 'style'>
): DrawingStyle {
  const theme = context.options.theme;
  const defaults: DrawingStyle = {
    color: theme.accent,
    lineWidth: 1.5,
    lineStyle: 'solid',
    fillColor: theme.grid,
    textColor: theme.text,
    fontSize: context.options.font.size
  };
  return deepMerge<DrawingStyle>(
    deepMerge<DrawingStyle>(defaults, entry.definition.defaultStyle?.(theme)),
    entry.style
  );
}

export function geometryOf(
  context: ObjectContext,
  host: DrawingsHost,
  entry: Pick<DrawingEntry, 'definition' | 'style' | 'text'>,
  points: readonly DrawingPoint[],
  pane: PaneFrame
): DrawingGeometry {
  const style = baseStyle(context, entry);
  return {
    points: points.map((point) => ({
      x: timeToX(context, point.time),
      y: pane.scale.valueToY(point.price)
    })),
    anchors: points,
    width: pane.plot.width,
    height: pane.plot.height,
    style,
    text: entry.text,
    theme: context.options.theme,
    fontFamily: context.options.font.family,
    valueToY: (value) => pane.scale.valueToY(value),
    formatValue: (value) => host.formatValue(pane, value),
    measureText: (text) => context.measureText(text, style.fontSize)
  };
}

/** Converts a plot-relative point into a drawing anchor, snapped to the bar grid (and OHLC with the magnet). */
export function anchorAt(context: ObjectContext, pane: PaneFrame, local: Point): DrawingPoint {
  const { bars, timeScale, options } = context;
  const index = Math.round(timeScale.xToIndex(local.x));
  const time = bars.timeOfLogicalIndex(index);
  let price = pane.scale.yToValue(local.y);
  const bar = bars.bar(index);

  if (options.drawings.magnet && bar && pane.id === 'main') {
    const candidates = [bar.open, bar.high, bar.low, bar.close];
    price = candidates.reduce((best, value) =>
      Math.abs(pane.scale.valueToY(value) - local.y) < Math.abs(pane.scale.valueToY(best) - local.y)
        ? value
        : best
    );
  }

  return { time, price };
}

function paneAtPoint(context: ObjectContext, point: Point): PaneFrame | undefined {
  return context.frame.panes.find(
    (pane) =>
      point.y >= pane.plot.y &&
      point.y < pane.plot.y + pane.plot.height &&
      point.x < pane.plot.width
  );
}

function local(pane: PaneFrame, point: Point): Point {
  return { x: point.x - pane.plot.x, y: point.y - pane.plot.y };
}

/** The active drawing tool: places anchors with clicks or a press-drag-release. */
class DrawingTool implements ToolSession {
  points: DrawingPoint[] = [];
  preview: DrawingPoint | null = null;
  pane: PaneFrame | null = null;
  private downAt: Point | null = null;

  constructor(
    readonly type: string,
    readonly options: ToolOptions,
    private readonly domain: DrawingsDomain
  ) {}

  private required(): number {
    return this.domain.store.registry.require(this.type).points;
  }

  pointerDown(point: Point): void {
    const context = this.domain.host.context();
    this.pane ??= paneAtPoint(context, point) ?? null;

    if (!this.pane) {
      return;
    }

    this.downAt = point;
    this.points.push(anchorAt(context, this.pane, local(this.pane, point)));
    this.preview = null;
    this.completeWhenReady();
    this.domain.host.repaint();
  }

  pointerMove(point: Point): void {
    const pane = this.pane ?? paneAtPoint(this.domain.host.context(), point);

    if (pane) {
      this.preview = anchorAt(this.domain.host.context(), pane, local(pane, point));
      this.domain.host.repaint();
    }
  }

  pointerUp(point: Point): void {
    const down = this.downAt;
    this.downAt = null;

    // Press-drag-release places the next anchor where the pointer was released.
    if (
      this.pane &&
      down &&
      Math.hypot(point.x - down.x, point.y - down.y) > DRAG_SLOP &&
      this.points.length < this.required()
    ) {
      this.points.push(anchorAt(this.domain.host.context(), this.pane, local(this.pane, point)));
      this.preview = null;
      this.completeWhenReady();
      this.domain.host.repaint();
    }
  }

  doubleClick(): void {
    if (this.required() === 0 && this.points.length >= 2) {
      this.domain.finishTool();
    }
  }

  private completeWhenReady(): void {
    const required = this.required();

    if (required > 0 && this.points.length >= required) {
      this.domain.finishTool();
    }
  }
}

/** Drawings: storage, undo history, the active tool, editing, hit testing and painting. */
export class DrawingsDomain implements ObjectDomain {
  readonly kind = 'drawing';
  readonly history = new DrawingHistory();
  private tool: DrawingTool | null = null;

  constructor(
    readonly store: DrawingStore,
    readonly host: DrawingsHost
  ) {}

  has(id: string): boolean {
    return this.store.get(id) !== undefined;
  }

  // ─── Tool ──────────────────────────────────────────────────────────────────

  activeTool(): ToolSession | null {
    return this.tool;
  }

  activeToolType(): string | null {
    return this.tool?.type ?? null;
  }

  startTool(type: string, options: ToolOptions): void {
    this.store.registry.require(type);
    const validated: ToolOptions = {
      ...(options.style !== undefined ? { style: checkStyle(options.style) } : {}),
      ...(options.text !== undefined ? { text: checkTextValue(options.text) } : {})
    };
    this.tool = new DrawingTool(type, validated, this);
    this.host.repaint();
  }

  cancelTool(): void {
    if (this.tool) {
      this.tool = null;
      this.host.repaint();
    }
  }

  /** Creates the drawing placed with the tool. */
  finishTool(): void {
    const tool = this.tool;

    if (!tool?.pane) {
      return;
    }

    this.tool = null;
    const pane = tool.pane;
    const entry = this.store.create(
      {
        type: tool.type,
        pane: pane.id,
        points: tool.points,
        ...(tool.options.style ? { style: tool.options.style } : {}),
        ...(tool.options.text !== undefined ? { text: tool.options.text } : {})
      },
      () => true
    );
    this.history.record(this.store.snapshot());
    this.store.add(entry);
    this.host.selected(entry.id);
    this.host.changed('create', [entry.id]);
    this.host.toolEnded();
    this.host.repaint();
  }

  // ─── History ───────────────────────────────────────────────────────────────

  /** Applies a mutation as one undoable step. */
  mutate(operation: () => void): void {
    const before = this.store.snapshot();
    operation();
    this.history.record(before);
    this.host.repaint();
  }

  restore(direction: 'undo' | 'redo'): boolean {
    const current = this.store.snapshot();
    const target: DrawingSnapshot | null =
      direction === 'undo' ? this.history.undo(current) : this.history.redo(current);

    if (!target) {
      return false;
    }

    this.store.restore(target);
    this.host.repaint();
    return true;
  }

  // ─── Hit testing ───────────────────────────────────────────────────────────

  hitTest(context: ObjectContext, point: Point): ObjectHit | null {
    const selected =
      context.selection?.kind === 'drawing' ? this.store.get(context.selection.id) : undefined;
    const radius = context.options.drawings.handleRadius + 3;

    if (selected?.visible) {
      const pane = paneOf(context.frame, selected.pane);

      if (pane) {
        const geometry = geometryOf(context, this.host, selected, selected.points, pane);
        const position = local(pane, point);
        let handle = -1;
        let closest = radius;

        geometry.points.forEach((anchor, index) => {
          const distance = Math.hypot(anchor.x - position.x, anchor.y - position.y);

          if (distance <= closest) {
            handle = index;
            closest = distance;
          }
        });

        if (handle >= 0) {
          return {
            target: {
              kind: 'drawing',
              id: selected.id,
              part: `handle:${handle}`,
              cursor: selected.locked ? 'pointer' : 'move',
              draggable: !selected.locked
            },
            priority: HitPriority.handle,
            distance: closest
          };
        }
      }
    }

    const entries = this.store.list();

    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      const pane = entry && entry.visible ? paneOf(context.frame, entry.pane) : undefined;

      if (!entry || !pane || point.y < pane.plot.y || point.y >= pane.plot.y + pane.plot.height) {
        continue;
      }

      const geometry = geometryOf(context, this.host, entry, entry.points, pane);
      const hit = entry.definition.hitTest(
        geometry,
        local(pane, point),
        context.options.drawings.hitTolerance
      );

      if (hit) {
        return {
          target: {
            kind: 'drawing',
            id: entry.id,
            part: hit.part,
            cursor: entry.locked ? 'pointer' : 'move',
            draggable: !entry.locked
          },
          priority: hit.part === 'line' ? HitPriority.line : HitPriority.body,
          distance: hit.distance
        };
      }
    }

    return null;
  }

  // ─── Editing ───────────────────────────────────────────────────────────────

  beginDrag(context: ObjectContext, target: HitTarget, point: Point): DragSession | null {
    const entry = this.store.get(target.id);
    const pane = entry ? paneOf(context.frame, entry.pane) : undefined;

    if (!entry || !pane || entry.locked) {
      return null;
    }

    const before = this.store.snapshot();
    const original = entry.points.map((anchor) => ({ ...anchor }));
    const handle = target.part.startsWith('handle:')
      ? Number(target.part.slice('handle:'.length))
      : null;
    const start = local(pane, point);
    let moved = false;

    return {
      move: (next) => {
        const current = this.host.context();
        const currentPane = paneOf(current.frame, entry.pane);

        // The drawing may have been removed or its pane closed while dragging.
        if (!currentPane || !this.has(entry.id)) {
          return;
        }

        const position = local(currentPane, next);

        if (handle !== null) {
          const points = original.map((anchor, index) =>
            index === handle ? anchorAt(current, currentPane, position) : anchor
          );
          this.store.setPoints(entry.id, points);
        } else {
          const indexShift = Math.round(
            current.timeScale.xToIndex(position.x) - current.timeScale.xToIndex(start.x)
          );
          const scaleShift =
            currentPane.scale.yToScale(position.y) - currentPane.scale.yToScale(start.y);
          this.store.setPoints(
            entry.id,
            original.map((anchor) => ({
              time: current.bars.timeOfLogicalIndex(
                current.bars.logicalIndexOf(anchor.time) + indexShift
              ),
              price: currentPane.scale.fromScale(
                (currentPane.scale.toScale(anchor.price) ?? Number.NaN) + scaleShift
              )
            }))
          );
        }

        moved = true;
        this.host.repaint();
      },
      end: () => {
        if (moved && this.has(entry.id)) {
          this.history.record(before);
          this.host.changed('edit', [entry.id]);
        }
      },
      cancel: () => {
        if (this.has(entry.id)) {
          this.store.setPoints(entry.id, original);
          this.host.repaint();
        }
      }
    };
  }

  // ─── Painting ──────────────────────────────────────────────────────────────

  paint(context: ObjectPaintContext): void {
    const { ctx, frame } = context;

    for (const entry of this.store.list()) {
      const pane = entry.visible ? paneOf(frame, entry.pane) : undefined;

      if (pane) {
        const selected = context.selection?.kind === 'drawing' && context.selection.id === entry.id;
        const hovered = context.hovered?.kind === 'drawing' && context.hovered.id === entry.id;
        this.paintEntry(context, pane, entry, entry.points, hovered, selected);
      }
    }

    const tool = this.tool;

    if (tool?.pane || tool?.preview) {
      const pane = tool.pane ?? frame.main;
      const points = tool.preview ? [...tool.points, tool.preview] : tool.points;
      const definition = this.store.registry.require(tool.type);
      const needed = definition.points === 0 ? 2 : definition.points;

      if (points.length >= needed) {
        this.paintEntry(
          context,
          pane,
          { definition, style: tool.options.style ?? {}, text: tool.options.text ?? '' },
          points,
          false,
          true
        );
      } else {
        this.paintHandles(ctx, context, pane, points);
      }
    }
  }

  private paintEntry(
    context: ObjectPaintContext,
    pane: PaneFrame,
    entry: Pick<DrawingEntry, 'definition' | 'style' | 'text'>,
    points: readonly DrawingPoint[],
    hovered: boolean,
    selected: boolean
  ): void {
    const { ctx, pixelRatio } = context;
    const geometry = geometryOf(context, this.host, entry, points, pane);
    ctx.save();
    ctx.beginPath();
    ctx.rect(pane.plot.x, pane.plot.y, pane.plot.width, pane.plot.height);
    ctx.clip();
    ctx.translate(pane.plot.x, pane.plot.y);
    entry.definition.paint({ ctx, pixelRatio, geometry, hovered, selected });
    ctx.restore();

    if (selected) {
      this.paintHandles(ctx, context, pane, points);
    }
  }

  private paintHandles(
    ctx: CanvasRenderingContext2D,
    context: ObjectPaintContext,
    pane: PaneFrame,
    points: readonly DrawingPoint[]
  ): void {
    const radius = context.options.drawings.handleRadius;
    ctx.beginPath();

    for (const point of points) {
      const x = pane.plot.x + timeToX(context, point.time);
      const y = pane.plot.y + pane.scale.valueToY(point.price);
      ctx.moveTo(x + radius, y);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }

    ctx.fillStyle = context.options.theme.background;
    ctx.fill();
    applyStroke(ctx, context.options.theme.accent, 1.5);
    ctx.stroke();
  }
}
