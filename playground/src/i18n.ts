export type Language = 'en' | 'zh';

const MESSAGES = {
  en: {
    interval: 'Interval',
    chartType: 'Chart',
    indicators: 'Indicators',
    theme: 'Theme',
    dark: 'Dark',
    light: 'Light',
    live: 'Live',
    paused: 'Paused',
    fit: 'Fit',
    realTime: 'Latest',
    undo: 'Undo',
    redo: 'Redo',
    save: 'Save layout',
    restore: 'Restore layout',
    screenshot: 'Screenshot',
    clearDrawings: 'Clear drawings',
    magnet: 'Magnet',
    cursor: 'Cursor',
    events: 'Events',
    bars: 'bars',
    alertFired: 'Alert fired',
    orderCancelled: 'Order cancelled',
    noLayout: 'No saved layout yet'
  },
  zh: {
    interval: '周期',
    chartType: '图表',
    indicators: '指标',
    theme: '主题',
    dark: '深色',
    light: '浅色',
    live: '实时',
    paused: '暂停',
    fit: '全部',
    realTime: '最新',
    undo: '撤销',
    redo: '重做',
    save: '保存布局',
    restore: '恢复布局',
    screenshot: '截图',
    clearDrawings: '清空绘图',
    magnet: '磁吸',
    cursor: '光标',
    events: '事件',
    bars: '根 K 线',
    alertFired: '告警触发',
    orderCancelled: '订单已撤销',
    noLayout: '还没有保存的布局'
  }
} as const;

export type MessageKey = keyof (typeof MESSAGES)['en'];

export function translate(language: Language, key: MessageKey): string {
  return MESSAGES[language][key];
}
