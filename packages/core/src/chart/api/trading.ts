import type { Alert, AlertInput } from '../../alerts/types';
import type { Marker, MarkerInput } from '../../trading/markers';
import type { Order, OrderInput } from '../../trading/orders';
import type { ChartCore } from '../chart-core';

/** Orders drawn as price lines on the main pane. The application owns them; the chart only shows them. */
export interface OrdersApi {
  /** Replaces every order, e.g. with the latest state from the broker. */
  set(orders: readonly OrderInput[]): void;
  add(order: OrderInput): void;
  update(id: string, patch: Partial<Omit<OrderInput, 'id'>>): void;
  remove(id: string): void;
  get(id: string): Order | null;
  list(): Order[];
}

/** Executions and signals pinned to bars. */
export interface MarkersApi {
  set(markers: readonly MarkerInput[]): void;
  add(marker: MarkerInput): void;
  update(id: string, patch: Partial<Omit<MarkerInput, 'id'>>): void;
  remove(id: string): void;
  get(id: string): Marker | null;
  list(): Marker[];
}

/** Alerts evaluated on every data update; fixed levels are drawn as draggable lines. */
export interface AlertsApi {
  set(alerts: readonly AlertInput[]): void;
  add(alert: AlertInput): void;
  update(id: string, patch: Partial<Omit<AlertInput, 'id'>>): void;
  remove(id: string): void;
  get(id: string): Alert | null;
  list(): Alert[];
  /** Arms an alert that fired with frequency `once` again. */
  rearm(id: string): void;
}

interface Collection<Input, Item> {
  set(inputs: readonly Input[]): void;
  add(input: Input): void;
  update(id: string, patch: Partial<Omit<Input, 'id'>>): void;
  remove(id: string): void;
  get(id: string): Item | null | undefined;
  list(): Item[];
}

function collectionApi<Input, Item>(core: ChartCore, collection: Collection<Input, Item>) {
  const mutate = (operation: () => void) => {
    core.run(() => {
      operation();
      core.objects.prune();
      core.invalidateLayers('objects');
    });
  };

  return {
    set: (inputs: readonly Input[]) => {
      mutate(() => {
        collection.set(inputs);
      });
    },
    add: (input: Input) => {
      mutate(() => {
        collection.add(input);
      });
    },
    update: (id: string, patch: Partial<Omit<Input, 'id'>>) => {
      mutate(() => {
        collection.update(id, patch);
      });
    },
    remove: (id: string) => {
      mutate(() => {
        collection.remove(id);
      });
    },
    get: (id: string) => collection.get(id) ?? null,
    list: () => collection.list()
  };
}

export function createOrdersApi(core: ChartCore): OrdersApi {
  return collectionApi<OrderInput, Order>(core, core.orders);
}

export function createMarkersApi(core: ChartCore): MarkersApi {
  return collectionApi<MarkerInput, Marker>(core, core.markers);
}

export function createAlertsApi(core: ChartCore): AlertsApi {
  return {
    ...collectionApi<AlertInput, Alert>(core, core.alerts),
    rearm: (id) => {
      core.run(() => {
        core.alerts.rearm(id);
        core.invalidateLayers('objects');
      });
    }
  };
}
