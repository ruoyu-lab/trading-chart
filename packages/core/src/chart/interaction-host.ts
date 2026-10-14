import type {
  DragSession,
  HitTarget,
  InteractionHost,
  PaneResizeSession,
  Point,
  Region,
  ToolSession
} from '../interaction/types';
import { MAIN_PANE_ID } from '../panes/pane-store';
import type { Frame } from '../render/frame';
import { clamp } from '../utils/math';
import type { ChartCore } from './chart-core';
import { crosshairAt } from './cursor';
import type { ChartPointerEvent } from './events';

const SEPARATOR_GRAB = 3;

export function regionAt(frame: Frame, point: Point): Region {
  const { layout } = frame;

  for (const separator of layout.separators) {
    if (
      point.y >= separator.y - SEPARATOR_GRAB &&
      point.y <= separator.y + separator.height + SEPARATOR_GRAB
    ) {
      return { kind: 'separator', above: separator.above, below: separator.below };
    }
  }

  for (const pane of frame.panes) {
    if (point.y >= pane.plot.y && point.y < pane.plot.y + pane.plot.height) {
      return point.x < layout.plotWidth
        ? { kind: 'plot', paneId: pane.id }
        : { kind: 'price-axis', paneId: pane.id };
    }
  }

  const axis = layout.timeAxis;

  if (axis && point.y >= axis.y && point.y < axis.y + axis.height && point.x < layout.plotWidth) {
    return { kind: 'time-axis' };
  }

  return { kind: 'outside' };
}

function pointerEvent(core: ChartCore, point: Point, target: HitTarget | null): ChartPointerEvent {
  const crosshair = crosshairAt(core, core.frame(), point.x, point.y);
  return {
    x: point.x,
    y: point.y,
    paneId: crosshair?.paneId ?? null,
    index: crosshair?.index ?? null,
    time: crosshair?.time ?? null,
    price: crosshair?.price ?? null,
    target: target ? { kind: target.kind, id: target.id, part: target.part } : null
  };
}

function paneResize(core: ChartCore, above: string, below: string): PaneResizeSession {
  const frame = core.frame();
  const height = (id: string) => frame.panes.find((pane) => pane.id === id)?.plot.height ?? 0;
  const startAbove = height(above);
  const startBelow = height(below);
  const stored = {
    above: core.panes.require(above).height,
    below: core.panes.require(below).height
  };
  const total = startAbove + startBelow;
  const min = Math.min(core.options.panes.minHeight, total / 2);
  let changed = false;

  // The main pane stretches, so only the other pane's height is stored.
  const apply = (nextAbove: number, nextBelow: number) => {
    core.run(() => {
      if (above !== MAIN_PANE_ID) {
        core.panes.update(above, { height: nextAbove });
      }

      if (below !== MAIN_PANE_ID) {
        core.panes.update(below, { height: nextBelow });
      }

      core.invalidate();
    });
  };

  return {
    move: (deltaY) => {
      const nextAbove = clamp(startAbove + deltaY, min, total - min);
      apply(nextAbove, total - nextAbove);
      changed = true;
    },
    cancel: () => {
      if (changed) {
        apply(stored.above, stored.below);
      }
    },
    end: () => {
      if (!changed) {
        return;
      }

      core.run(() => {
        for (const id of [above, below]) {
          if (id !== MAIN_PANE_ID) {
            core.bus.emit('paneResize', { paneId: id, height: core.panes.require(id).height });
          }
        }
      });
    }
  };
}

/** A drag whose steps run as chart operations, so their events are dispatched after each step. */
function dragOperations(core: ChartCore, session: DragSession): DragSession {
  return {
    move: (point) => {
      core.run(() => {
        session.move(point);
      });
    },
    end: () => {
      core.run(() => {
        session.end();
      });
    },
    cancel: () => {
      core.run(() => {
        session.cancel();
      });
    }
  };
}

/** The drawing tool, with each pointer step run as a chart operation. */
function toolOperations(core: ChartCore, tool: ToolSession): ToolSession {
  return {
    pointerDown: (point) => {
      core.run(() => {
        tool.pointerDown(point);
      });
    },
    pointerMove: (point) => {
      core.run(() => {
        tool.pointerMove(point);
      });
    },
    pointerUp: (point) => {
      core.run(() => {
        tool.pointerUp(point);
      });
    },
    doubleClick: (point) => {
      core.run(() => {
        tool.doubleClick(point);
      });
    }
  };
}

/** Connects the input controller to the chart. */
export function createInteractionHost(core: ChartCore): InteractionHost {
  const options = () => core.options.interaction;
  const perform = (operation: () => void) => {
    core.run(() => {
      core.frame();
      operation();
      core.invalidate();
    });
  };

  return {
    root: core.surface.root,
    enabled: (feature) => options()[feature],
    longPressMs: () => options().longPressMs,
    plotWidth: () => core.frame().layout.plotWidth,
    regionAt: (point) => regionAt(core.frame(), point),
    setPointer: (point) => {
      core.run(() => {
        core.setPointer(point);
      });
    },
    hitTest: (point) => core.hitTest(point),
    hover: (target) => {
      core.run(() => {
        core.setHovered(target);
      });
    },
    beginDrag: (target, point) => {
      const session = core.run(() => core.beginDrag(target, point));
      return session ? dragOperations(core, session) : null;
    },
    activeTool: () => {
      const tool = core.activeTool();
      return tool ? toolOperations(core, tool) : null;
    },
    click: (point, target) => {
      core.run(() => {
        if (
          target?.part.startsWith('button:') &&
          (target.kind === 'order' || target.kind === 'alert')
        ) {
          core.bus.emit('buttonClick', {
            kind: target.kind,
            id: target.id,
            buttonId: target.part.slice('button:'.length)
          });
          return;
        }

        core.selectByUser(target ? { kind: target.kind, id: target.id } : null);

        if (core.bus.has('click')) {
          core.bus.emit('click', pointerEvent(core, point, target));
        }
      });
    },
    doubleClick: (point, region) => {
      core.run(() => {
        if (region.kind === 'price-axis' && options().axisScale) {
          core.panes.require(region.paneId).scale.resetAutoScale();
          core.invalidate();
        } else if (region.kind === 'time-axis' && options().axisScale) {
          core.timeScale.setBarSpacing(core.options.timeScale.barSpacing);
          core.timeScale.scrollToRealTime();
          core.invalidate();
        }

        if (core.bus.has('doubleClick')) {
          core.bus.emit('doubleClick', pointerEvent(core, point, core.hitTest(point)));
        }
      });
    },
    contextMenu: (point, target) =>
      core.run(() => {
        if (!core.bus.has('contextMenu')) {
          return false;
        }

        core.bus.emit('contextMenu', pointerEvent(core, point, target));
        return true;
      }),
    scrollTime: (deltaX) => {
      perform(() => {
        core.timeScale.scrollBy(deltaX);
      });
    },
    zoomTime: (factor, anchorX) => {
      perform(() => {
        core.timeScale.zoom(factor, anchorX);
      });
    },
    isAutoScale: (paneId) => core.panes.require(paneId).scale.autoScale,
    panPrice: (paneId, deltaY) => {
      perform(() => {
        core.panes.require(paneId).scale.pan(deltaY);
      });
    },
    zoomPrice: (paneId, factor, anchorY) => {
      perform(() => {
        const pane = core.frame().panes.find((item) => item.id === paneId);

        if (pane) {
          pane.scale.zoom(factor, anchorY - pane.plot.y);
        }
      });
    },
    beginPaneResize: (above, below) => paneResize(core, above, below),
    escape: () => {
      core.run(() => {
        core.escape();
      });
    },
    deleteSelection: () => {
      core.run(() => {
        core.deleteSelection();
      });
    },
    undo: () => {
      core.run(() => {
        core.undo();
      });
    },
    redo: () => {
      core.run(() => {
        core.redo();
      });
    },
    scrollToRealTime: () => {
      perform(() => {
        core.timeScale.scrollToRealTime();
      });
    }
  };
}
