import { clamp } from '../utils/math';

export interface LogicalRange {
  /** Logical index at the left edge of the plot. Bar `i` is centered on index `i`. */
  from: number;
  /** Logical index at the right edge of the plot. */
  to: number;
}

export interface TimeScaleSettings {
  minBarSpacing: number;
  maxBarSpacing: number;
  /** Space after the latest bar, in pixels, at the real-time position. */
  rightOffset: number;
}

export type ViewAlign = 'left' | 'center' | 'right';

const MIN_VISIBLE_BARS = 2;

/**
 * Maps logical bar indices to x coordinates of the plot. The view is stored as the bar spacing
 * and the distance, in bars, from the latest bar to the right edge of the plot. Prepending history
 * therefore never moves the view, and appending bars keeps the latest bar in place only while it
 * is visible.
 */
export class TimeScale {
  private width = 0;
  private count = 0;
  private spacing: number;
  private offset: number;
  /**
   * Whether new bars scroll into view. It is decided when the view changes, not when bars
   * arrive, so updates while the plot has no width (a hidden container) keep following.
   */
  private following = true;

  constructor(
    private settings: TimeScaleSettings,
    barSpacing: number
  ) {
    this.spacing = clamp(barSpacing, settings.minBarSpacing, settings.maxBarSpacing);
    this.offset = this.realTimeOffset();
  }

  get barSpacing(): number {
    return this.spacing;
  }

  get plotWidth(): number {
    return this.width;
  }

  configure(settings: TimeScaleSettings): void {
    const wasRealTime = this.isRealTime();
    this.settings = settings;
    this.spacing = clamp(this.spacing, settings.minBarSpacing, settings.maxBarSpacing);

    if (wasRealTime) {
      this.offset = this.realTimeOffset();
    }

    this.constrain();
  }

  setWidth(width: number): void {
    this.width = Math.max(0, width);
    this.constrain();
  }

  /** Index of the logical position at the right edge of the plot. */
  rightEdge(): number {
    return this.count - 1 + this.offset;
  }

  indexToX(index: number): number {
    return this.width - (this.rightEdge() - index) * this.spacing;
  }

  xToIndex(x: number): number {
    return this.rightEdge() - (this.width - x) / this.spacing;
  }

  logicalRange(): LogicalRange {
    const to = this.rightEdge();
    return { from: to - this.width / this.spacing, to };
  }

  /** Integer indices of the bars that intersect the plot, or `null` when none do. */
  visibleBars(): { from: number; to: number } | null {
    if (this.count === 0 || this.width === 0) {
      return null;
    }

    const range = this.logicalRange();
    const from = Math.max(0, Math.floor(range.from + 0.5));
    const to = Math.min(this.count - 1, Math.ceil(range.to - 0.5));
    return from <= to ? { from, to } : null;
  }

  /** Whether the view follows new bars because the latest bar is visible. */
  isFollowing(): boolean {
    return this.following;
  }

  isRealTime(): boolean {
    return Math.abs(this.offset - this.realTimeOffset()) < 1e-6;
  }

  /** Adapts the view to a new bar count. */
  setBarCount(count: number, change: 'reset' | 'prepend' | 'tail'): void {
    const previous = this.count;
    this.count = count;

    if (change === 'reset') {
      this.offset = this.realTimeOffset();
      this.following = true;
    } else if (change === 'tail' && count > previous && !this.following && previous > 0) {
      // The latest index grew; shrink the offset so the right edge stays on the same bar.
      this.offset -= count - previous;
    }

    this.constrain();
  }

  scrollBy(deltaX: number): void {
    this.offset -= deltaX / this.spacing;
    this.viewChanged();
  }

  scrollToRealTime(): void {
    this.offset = this.realTimeOffset();
    this.constrain();
    this.following = true;
  }

  scrollToIndex(index: number, align: ViewAlign): void {
    const anchorX =
      align === 'left'
        ? this.spacing / 2
        : align === 'right'
          ? this.width - this.spacing / 2
          : this.width / 2;
    this.placeIndexAt(index, anchorX);
  }

  /** Zooms by `factor` (> 1 zooms in) keeping the index under `anchorX` in place. */
  zoom(factor: number, anchorX: number): void {
    const anchorIndex = this.xToIndex(anchorX);
    this.spacing = clamp(
      this.spacing * factor,
      this.settings.minBarSpacing,
      this.settings.maxBarSpacing
    );
    this.placeIndexAt(anchorIndex, anchorX);
  }

  setBarSpacing(spacing: number): void {
    const realTime = this.isRealTime();
    const anchorX = this.width;
    const anchorIndex = this.xToIndex(anchorX);
    this.spacing = clamp(spacing, this.settings.minBarSpacing, this.settings.maxBarSpacing);

    if (realTime) {
      this.offset = this.realTimeOffset();
      this.constrain();
      this.following = true;
    } else {
      this.placeIndexAt(anchorIndex, anchorX);
    }
  }

  setLogicalRange(range: LogicalRange): void {
    const span = range.to - range.from;

    if (!(span > 0) || this.width === 0) {
      return;
    }

    this.spacing = clamp(
      this.width / span,
      this.settings.minBarSpacing,
      this.settings.maxBarSpacing
    );
    this.offset = (range.from + range.to) / 2 + this.width / this.spacing / 2 - (this.count - 1);
    this.viewChanged();
  }

  /** Shows every bar, keeping the real-time right offset. */
  fitContent(): void {
    if (this.count === 0 || this.width === 0) {
      return;
    }

    const available = Math.max(1, this.width - this.settings.rightOffset);
    this.spacing = clamp(
      available / this.count,
      this.settings.minBarSpacing,
      this.settings.maxBarSpacing
    );
    this.offset = this.realTimeOffset();
    this.constrain();
    this.following = true;
  }

  /** The persisted view: bar spacing and distance of the right edge from the latest bar. */
  state(): { barSpacing: number; offset: number } {
    return { barSpacing: this.spacing, offset: this.offset };
  }

  restore(state: { barSpacing: number; offset: number }): void {
    this.spacing = clamp(
      state.barSpacing,
      this.settings.minBarSpacing,
      this.settings.maxBarSpacing
    );
    this.offset = state.offset;
    this.viewChanged();
  }

  private placeIndexAt(index: number, anchorX: number): void {
    this.offset = index + (this.width - anchorX) / this.spacing - (this.count - 1);
    this.viewChanged();
  }

  /** Re-decides following after the user or the API moved the view. */
  private viewChanged(): void {
    this.constrain();

    if (this.width > 0 && this.count > 0) {
      const visible = this.visibleBars();
      this.following = visible !== null && visible.to === this.count - 1;
    }
  }

  private realTimeOffset(): number {
    return 0.5 + this.settings.rightOffset / this.spacing;
  }

  private constrain(): void {
    if (this.count === 0 || this.width === 0) {
      return;
    }

    const minVisible = Math.min(MIN_VISIBLE_BARS, this.count);
    const visibleSpan = this.width / this.spacing;
    // Keep at least `minVisible` of the oldest bars visible on the right…
    const minOffset = minVisible - 0.5 - (this.count - 1);
    // …and at least `minVisible` of the newest bars visible on the left.
    const maxOffset = Math.max(minOffset, visibleSpan + 0.5 - minVisible);
    this.offset = clamp(this.offset, minOffset, maxOffset);
  }
}
