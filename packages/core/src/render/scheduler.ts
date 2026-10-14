import type { LayerName } from './surface';

/**
 * Coalesces repaint requests into one animation frame. Each request names the layers that changed;
 * a frame repaints every requested layer once.
 */
export class FrameScheduler {
  private handle = 0;
  private pending = new Set<LayerName>();

  constructor(
    private readonly view: Window,
    private readonly run: (layers: ReadonlySet<LayerName>) => void
  ) {}

  request(...layers: LayerName[]): void {
    layers.forEach((layer) => this.pending.add(layer));

    if (this.handle === 0 && this.pending.size > 0) {
      this.handle = this.view.requestAnimationFrame(() => {
        this.handle = 0;
        this.flush();
      });
    }
  }

  /** Paints the pending layers now. */
  flush(): void {
    if (this.handle !== 0) {
      this.view.cancelAnimationFrame(this.handle);
      this.handle = 0;
    }

    if (this.pending.size === 0) {
      return;
    }

    const layers = this.pending;
    this.pending = new Set();
    this.run(layers);
  }

  destroy(): void {
    if (this.handle !== 0) {
      this.view.cancelAnimationFrame(this.handle);
      this.handle = 0;
    }

    this.pending.clear();
  }
}
