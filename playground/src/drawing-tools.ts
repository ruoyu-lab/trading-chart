/** Drawing tools of the playground toolbar with 24 × 24 SVG icon paths. */
export const DRAWING_TOOLS = [
  {
    type: 'trend-line',
    label: { en: 'Trend line', zh: '趋势线' },
    icon: 'M4 19L20 5M4 19h0M20 5h0'
  },
  { type: 'ray', label: { en: 'Ray', zh: '射线' }, icon: 'M4 19L20 5M4 19l2-2' },
  { type: 'extended-line', label: { en: 'Extended line', zh: '延长线' }, icon: 'M2 21L22 3' },
  { type: 'horizontal-line', label: { en: 'Horizontal line', zh: '水平线' }, icon: 'M3 12h18' },
  {
    type: 'horizontal-ray',
    label: { en: 'Horizontal ray', zh: '水平射线' },
    icon: 'M8 12h13M8 12h0'
  },
  { type: 'vertical-line', label: { en: 'Vertical line', zh: '垂直线' }, icon: 'M12 3v18' },
  { type: 'arrow', label: { en: 'Arrow', zh: '箭头' }, icon: 'M5 19L19 5M19 5h-7M19 5v7' },
  { type: 'rectangle', label: { en: 'Rectangle', zh: '矩形' }, icon: 'M4 6h16v12H4z' },
  {
    type: 'parallel-channel',
    label: { en: 'Parallel channel', zh: '平行通道' },
    icon: 'M3 15L15 3M9 21L21 9'
  },
  {
    type: 'fib-retracement',
    label: { en: 'Fib retracement', zh: '斐波那契回撤' },
    icon: 'M3 4h18M3 9h18M3 14h18M3 20h18'
  },
  {
    type: 'price-range',
    label: { en: 'Price range', zh: '价格区间' },
    icon: 'M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4'
  },
  { type: 'path', label: { en: 'Path', zh: '折线' }, icon: 'M3 18l5-8 5 5 8-11' },
  { type: 'text', label: { en: 'Text', zh: '文字' }, icon: 'M5 5h14M12 5v14' }
] as const;

export type DrawingToolType = (typeof DRAWING_TOOLS)[number]['type'];
