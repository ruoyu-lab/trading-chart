# 画线工具

[English](../drawings.md) · **简体中文**

## 让用户画线

```ts
chart.drawings.startTool('trend-line');

chart.on('drawingsChange', ({ reason, ids }) => console.log(reason, ids)); // 'create', ['trend-line-1']
chart.on('toolChange', () => toolbar.reset()); // 工具已结束
```

锚点通过点击放置；两点工具也可以按下、拖动再松开来放置。`path` 这类不限点数的工具通过双击结束。画线完成、用户按下 Escape 或你调用 `cancelTool()` 时，工具结束。画完的画线会处于选中状态。

`startTool()` 可以指定新画线的样式和文字：

```ts
chart.drawings.startTool('text', {
  text: 'Breakout',
  style: { textColor: '#f5b942', fontSize: 14 }
});
```

启用 `options.drawings.magnet` 后，主图上的锚点会吸附到指针下方 K 线的开盘价、最高价、最低价或收盘价中最近的一个。锚点的时间总是对齐到 K 线时间，包括最新 K 线之后的时间。

## 内置类型

| 类型               | 锚点数     | 说明                                                              |
| ------------------ | ---------- | ----------------------------------------------------------------- |
| `trend-line`       | 2          | 线段                                                              |
| `ray`              | 2          | 越过第二个锚点继续延伸                                            |
| `extended-line`    | 2          | 向两端延伸                                                        |
| `arrow`            | 2          | 带箭头的线段                                                      |
| `horizontal-line`  | 1          | 横跨整个宽度，带数值标签                                          |
| `horizontal-ray`   | 1          | 从锚点延伸到右边缘                                                |
| `vertical-line`    | 1          | 贯穿整个高度                                                      |
| `rectangle`        | 2          | 对角两点，带填充                                                  |
| `parallel-channel` | 3          | 基准线经过锚点 1–2，平行线经过锚点 3                              |
| `fib-retracement`  | 2          | 从锚点 1 到锚点 2 的 0、0.236、0.382、0.5、0.618、0.786 和 1 各档 |
| `price-range`      | 2          | 两个锚点之间的价格差和百分比变化                                  |
| `path`             | 2 个及以上 | 折线，双击结束                                                    |
| `text`             | 1          | 显示 `text`                                                       |

## 编辑

用户点击画线即可选中，拖动可移动整条画线，拖动控制点可单独移动对应的锚点。拖动过程中按 Escape 会还原画线。锁定的画线可以选中，但不能移动。`Delete` 删除选中的画线。

通过代码修改：

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
  pane?: string; // 默认 'main'
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

## 撤销与重做

用户操作（创建、移动、删除）以及 `add()`、`update()`、`remove()` 和 `clear()` 都是可撤销的步骤。`set()` 会替换全部画线（例如加载文档时），并清空历史记录。

```ts
chart.drawings.undo();
chart.drawings.redo();
chart.drawings.canUndo();
```

图表获得焦点时，可以使用 `Ctrl/⌘ + Z`、`Ctrl/⌘ + Shift + Z` 和 `Ctrl + Y`。

## 持久化画线

画线包含在 `chart.saveState()` 中。如果要单独保存，可以监听 `drawingsChange` 并保存 `chart.drawings.list()`，之后用 `chart.drawings.set(saved)` 恢复。

## 自定义画线类型

画线类型只负责绘制自身形状并报告命中；放置、选中、锚点控制点、拖动、撤销和持久化都由图表处理。所有坐标都相对于子图的绘图区。

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

`geometry` 提供以像素表示的锚点（`points`）和以数据表示的锚点（`anchors`）、绘图区尺寸、解析后的 `style`、`text`、`theme`，以及用于转换数值（`valueToY`）、格式化数值（`formatValue`）和测量文字（`measureText`）的辅助函数。锚点数量不定的工具请使用 `points: 0`。
