import type { DragSession, HitTarget, Point } from '../interaction/types';
import type { LineStyle } from '../options/types';
import { MAIN_PANE_ID } from '../panes/pane-store';
import type { PaneFrame } from '../render/frame';
import type { ObjectContext, ObjectDomain, ObjectHit, ObjectPaintContext } from '../objects/types';
import { paneOf } from '../objects/types';
import { fail } from '../utils/errors';
import { checkBoolean, checkNumber, checkObject, checkOneOf, checkString } from '../utils/validate';
import {
  hitPriceLines,
  IconCache,
  layoutPriceLines,
  paintPriceLines,
  validateButtons,
  type PriceLineButton,
  type PriceLineLayout,
  type PriceLineView
} from './price-line';

export interface OrderInput {
  /** Usually the broker's order id. */
  id: string;
  price: number;
  side: 'buy' | 'sell';
  /** Label text such as `LIMIT` or `TP`; defaults to `BUY`/`SELL`. */
  label?: string;
  /** Shown after the label. */
  quantity?: number | string;
  /** Lets the user drag the order to a new price. Default `true`. */
  draggable?: boolean;
  visible?: boolean;
  /** Defaults to the theme's buy or sell color. */
  color?: string;
  lineStyle?: LineStyle;
  buttons?: PriceLineButton[];
}

export interface Order {
  readonly id: string;
  readonly price: number;
  readonly side: 'buy' | 'sell';
  readonly label: string | null;
  readonly quantity: number | string | null;
  readonly draggable: boolean;
  readonly visible: boolean;
  readonly color: string | null;
  readonly lineStyle: LineStyle;
  readonly buttons: readonly PriceLineButton[];
}

export type DragPhase = 'start' | 'move' | 'end' | 'cancel';

export interface PriceDragEvent {
  readonly id: string;
  readonly phase: DragPhase;
  /** Price at this phase (the restored price for `cancel`). */
  readonly price: number;
  /** Price before the drag started. */
  readonly initialPrice: number;
}

export interface PriceLineHost {
  context(): ObjectContext;
  repaint(): void;
  formatValue(pane: PaneFrame, value: number): string;
  /** Decimals used to round dragged prices in a pane. */
  precision(pane: PaneFrame): number;
  dragged(event: PriceDragEvent): void;
}

const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const;

export function parseOrder(input: OrderInput, label = 'order'): Order {
  checkObject(label, input);

  checkString(`${label}.id`, input.id);

  if (input.label !== undefined) {
    checkString(`${label}.label`, input.label);
  }

  if (input.quantity !== undefined && typeof input.quantity !== 'string') {
    checkNumber(`${label}.quantity`, input.quantity);
  }

  return {
    id: input.id,
    price: checkNumber(`${label}.price`, input.price),
    side: checkOneOf(`${label}.side`, input.side, ['buy', 'sell']),
    label: input.label ?? null,
    quantity: input.quantity ?? null,
    draggable:
      input.draggable === undefined ? true : checkBoolean(`${label}.draggable`, input.draggable),
    visible: input.visible === undefined ? true : checkBoolean(`${label}.visible`, input.visible),
    color: input.color === undefined ? null : checkString(`${label}.color`, input.color),
    lineStyle:
      input.lineStyle === undefined
        ? 'dashed'
        : checkOneOf(`${label}.lineStyle`, input.lineStyle, LINE_STYLES),
    buttons: validateButtons(input.buttons, `${label}.buttons`)
  };
}

function orderInput(order: Order): OrderInput {
  return {
    id: order.id,
    price: order.price,
    side: order.side,
    draggable: order.draggable,
    visible: order.visible,
    lineStyle: order.lineStyle,
    buttons: order.buttons.map((button) => ({ ...button })),
    ...(order.label !== null ? { label: order.label } : {}),
    ...(order.quantity !== null ? { quantity: order.quantity } : {}),
    ...(order.color !== null ? { color: order.color } : {})
  };
}

/** Orders drawn as draggable price lines on the main pane. */
export class OrdersDomain implements ObjectDomain {
  readonly kind = 'order';
  private orders = new Map<string, Order>();
  private readonly icons = new IconCache();

  constructor(private readonly host: PriceLineHost) {}

  has(id: string): boolean {
    return this.orders.has(id);
  }

  list(): Order[] {
    return [...this.orders.values()];
  }

  get(id: string): Order | undefined {
    return this.orders.get(id);
  }

  require(id: string): Order {
    return this.orders.get(id) ?? fail(`Unknown order "${id}".`);
  }

  set(inputs: readonly OrderInput[]): void {
    const next = new Map<string, Order>();

    inputs.forEach((input, index) => {
      const order = parseOrder(input, `orders[${index}]`);

      if (next.has(order.id)) {
        fail(`orders contains the id "${order.id}" twice.`);
      }

      next.set(order.id, order);
    });

    this.orders = next;
  }

  add(input: OrderInput): void {
    const order = parseOrder(input);

    if (this.orders.has(order.id)) {
      fail(`An order with id "${order.id}" already exists.`);
    }

    this.orders.set(order.id, order);
  }

  update(id: string, patch: Partial<Omit<OrderInput, 'id'>>): void {
    const current = this.require(id);
    this.orders.set(id, parseOrder({ ...orderInput(current), ...patch, id }));
  }

  remove(id: string): void {
    this.require(id);
    this.orders.delete(id);
  }

  private layouts(context: ObjectContext, pane: PaneFrame): PriceLineLayout[] {
    const { theme, font } = context.options;
    const views: PriceLineView[] = [];

    for (const order of this.orders.values()) {
      if (!order.visible) {
        continue;
      }

      const name = order.label ?? (order.side === 'buy' ? 'BUY' : 'SELL');
      const emphasized =
        (context.selection?.kind === 'order' && context.selection.id === order.id) ||
        (context.hovered?.kind === 'order' && context.hovered.id === order.id);
      views.push({
        id: order.id,
        y: pane.scale.valueToY(order.price),
        color: order.color ?? (order.side === 'buy' ? theme.buy : theme.sell),
        text: order.quantity === null ? name : `${name} ${String(order.quantity)}`,
        axisText: this.host.formatValue(pane, order.price),
        buttons: order.buttons,
        lineStyle: order.lineStyle,
        emphasized
      });
    }

    return layoutPriceLines(views, pane.plot.width, font.size, context.measureText);
  }

  hitTest(context: ObjectContext, point: Point): ObjectHit | null {
    const pane = paneOf(context.frame, MAIN_PANE_ID);

    if (!pane || point.y < pane.plot.y || point.y >= pane.plot.y + pane.plot.height) {
      return null;
    }

    const hit = hitPriceLines(
      this.layouts(context, pane),
      { x: point.x, y: point.y - pane.plot.y },
      context.options.drawings.hitTolerance
    );
    const order = hit ? this.orders.get(hit.id) : undefined;

    if (!hit || !order) {
      return null;
    }

    const button = hit.part.startsWith('button:');
    const draggable = order.draggable && !button;
    return {
      target: {
        kind: 'order',
        id: order.id,
        part: hit.part,
        cursor: draggable ? 'ns-resize' : 'pointer',
        draggable
      },
      priority: hit.priority,
      distance: hit.distance
    };
  }

  beginDrag(context: ObjectContext, target: HitTarget): DragSession | null {
    const order = this.orders.get(target.id);
    const pane = paneOf(context.frame, MAIN_PANE_ID);

    if (!order?.draggable || !pane) {
      return null;
    }

    const initialPrice = order.price;
    let price = initialPrice;
    this.host.dragged({ id: order.id, phase: 'start', price, initialPrice });

    const setPrice = (next: number) => {
      const current = this.orders.get(order.id);

      if (current) {
        this.orders.set(order.id, { ...current, price: next });
        this.host.repaint();
      }
    };

    return {
      move: (point) => {
        const currentPane = paneOf(this.host.context().frame, MAIN_PANE_ID);

        if (!currentPane || !this.orders.has(order.id)) {
          return;
        }

        const raw = currentPane.scale.yToValue(point.y - currentPane.plot.y);
        const factor = 10 ** this.host.precision(currentPane);
        const next = Math.round(raw * factor) / factor;

        if (Number.isFinite(next) && next !== price) {
          price = next;
          setPrice(price);
          this.host.dragged({ id: order.id, phase: 'move', price, initialPrice });
        }
      },
      end: () => {
        this.host.dragged({ id: order.id, phase: 'end', price, initialPrice });
      },
      cancel: () => {
        setPrice(initialPrice);
        this.host.dragged({ id: order.id, phase: 'cancel', price: initialPrice, initialPrice });
      }
    };
  }

  paint(context: ObjectPaintContext): void {
    const pane = paneOf(context.frame, MAIN_PANE_ID);

    if (!pane || this.orders.size === 0) {
      return;
    }

    const { ctx } = context;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, pane.plot.y, context.frame.layout.width, pane.plot.height);
    ctx.clip();
    paintPriceLines(
      ctx,
      this.layouts(context, pane),
      pane.plot,
      pane.axis,
      {
        fontSize: context.options.font.size,
        fontFamily: context.options.font.family,
        pixelRatio: context.pixelRatio,
        textColor: '#ffffff',
        showAxis: context.options.priceScale.visible
      },
      this.icons
    );
    ctx.restore();
  }
}
