# Drawings

[English](drawings.md) · [简体中文](zh-CN/drawings.md)

## Letting the user draw

```ts
chart.drawings.startTool('trend-line');

chart.on('drawingsChange', ({ reason, ids }) => console.log(reason, ids)); // 'create', ['trend-line-1']
chart.on('toolChange', () => toolbar.reset()); // the tool ended
```

Anchors are placed with clicks, or by pressing, dragging and releasing for two-point tools. Open-ended tools such as `path` finish with a double click. The tool ends when the drawing is complete, when the user presses Escape, or when you call `cancelTool()`. A completed drawing is selected.

`startTool()` accepts the style and text of the new drawing:

```ts
chart.drawings.startTool('text', {
  text: 'Breakout',
  style: { textColor: '#f5b942', fontSize: 14 }
});
```

With `options.drawings.magnet`, anchors on the main pane snap to the nearest open, high, low or close of the bar under the pointer. Anchors always snap to bar times, including times beyond the latest bar.

## Built-in types

| Type               | Anchors   | Notes                                                                     |
| ------------------ | --------- | ------------------------------------------------------------------------- |
| `trend-line`       | 2         | Segment                                                                   |
| `ray`              | 2         | Extends past the second anchor                                            |
| `extended-line`    | 2         | Extends both ways                                                         |
| `arrow`            | 2         | Segment with an arrowhead                                                 |
| `horizontal-line`  | 1         | Full width, with a value label                                            |
| `horizontal-ray`   | 1         | From the anchor to the right edge                                         |
| `vertical-line`    | 1         | Full height                                                               |
| `rectangle`        | 2         | Opposite corners, filled                                                  |
| `parallel-channel` | 3         | Base line through anchors 1–2, parallel line through anchor 3             |
| `fib-retracement`  | 2         | Levels 0, 0.236, 0.382, 0.5, 0.618, 0.786 and 1 from anchor 1 to anchor 2 |
| `price-range`      | 2         | Price and percent change between the anchors                              |
| `path`             | 2 or more | Polyline, finished with a double click                                    |
| `text`             | 1         | Shows `text`                                                              |

## Editing

Users select a drawing by clicking it, move it by dragging, and move a single anchor by dragging its handle. Escape during a drag restores the drawing. Locked drawings can be selected but not moved. `Delete` removes the selected drawing.

Programmatic changes:

```ts
const id = chart.drawings.add({
  type: 'horizontal-line',
  points: [{ time: Date.now(), price: 104.5 }],
  style: { color: '#f2495e', lineStyle: 'dashed' },
  locked: true
});

chart.drawings.update(id, { visible: false });
chart.select({ kind: 'drawing', id });
```

```ts
interface DrawingInput {
  id?: string;
  type: string;
  pane?: string; // default 'main'
  points: Array<{ time: TimeInput; price: number }>;
  style?: Partial<{
    color: string;
    lineWidth: number;
    lineStyle: 'solid' | 'dashed' | 'dotted';
    fillColor: string;
    textColor: string;
    fontSize: number;
  }>;
  text?: string;
  locked?: boolean;
  visible?: boolean;
}
```

## Undo and redo

User actions (creating, moving, deleting) and `add()`, `update()`, `remove()` and `clear()` are undoable steps. `set()` replaces all drawings, for example when loading a document, and clears the history.

```ts
chart.drawings.undo();
chart.drawings.redo();
chart.drawings.canUndo();
```

`Ctrl/⌘ + Z`, `Ctrl/⌘ + Shift + Z` and `Ctrl + Y` work while the chart has focus.

## Persisting drawings

Drawings are part of `chart.saveState()`. To store them separately, listen to `drawingsChange` and save `chart.drawings.list()`; restore them with `chart.drawings.set(saved)`.

## Custom drawing types

A drawing type paints its shape and reports hits; the chart handles placement, selection, anchor handles, dragging, undo and persistence. All coordinates are relative to the pane's plot area.

```ts
import type { DrawingTypeDefinition } from '@trading-chart-sdk/core';

const crossHair: DrawingTypeDefinition = {
  points: 1,
  defaultStyle: (theme) => ({ color: theme.alert }),
  paint: ({ ctx, geometry, hovered }) => {
    const [anchor] = geometry.points;

    if (!anchor) {
      return;
    }

    ctx.strokeStyle = geometry.style.color;
    ctx.lineWidth = geometry.style.lineWidth + (hovered ? 1 : 0);
    ctx.beginPath();
    ctx.moveTo(anchor.x - 12, anchor.y);
    ctx.lineTo(anchor.x + 12, anchor.y);
    ctx.moveTo(anchor.x, anchor.y - 12);
    ctx.lineTo(anchor.x, anchor.y + 12);
    ctx.stroke();
  },
  hitTest: (geometry, point, tolerance) => {
    const [anchor] = geometry.points;
    const distance = anchor ? Math.hypot(point.x - anchor.x, point.y - anchor.y) : Infinity;
    return distance <= 12 + tolerance ? { part: 'body', distance } : null;
  }
};

chart.drawings.registerType('cross', crossHair);
chart.drawings.startTool('cross');
```

`geometry` provides the anchors in pixels (`points`) and in data (`anchors`), the plot size, the resolved `style`, `text`, the `theme`, and helpers to convert values (`valueToY`), format them (`formatValue`) and measure text (`measureText`). Use `points: 0` for tools with any number of anchors.
