import type { View } from './types';

export interface ControlsHost {
  readonly element: HTMLElement;
  getView(): View;
  /** Apply a view change immediately (clamping happens in the host). */
  applyView(view: Partial<View>): void;
  /** Called on any user interaction (stops auto-rotate, cancels animations). */
  onUserInteraction(): void;
  /** A click on the panorama without dragging. */
  onPanoramaClick(clientX: number, clientY: number, event: MouseEvent): void;
  /** Request a new frame. */
  invalidate(): void;
}

export interface ControlsOptions {
  draggable: boolean;
  zoom: boolean;
  keyboard: boolean;
  inertia: boolean;
  dragSensitivity: number;
  trackpadRotate: boolean;
}

interface PointerInfo {
  x: number;
  y: number;
}

const CLICK_TOLERANCE_PX = 6;
const KEY_SPEED = 75; // degrees per second
const KEY_ZOOM_SPEED = 1.6; // fov multiplier per second
const MOUSE_WHEEL_MIN_STEP_PX = 40; // one notch of a mouse wheel is at least this much
const WHEEL_GESTURE_GAP_MS = 200; // wheel events closer together belong to one gesture

/** Mouse, touch, pen, wheel and keyboard input. */
export class Controls {
  private pointers = new Map<number, PointerInfo>();
  private dragStart: { x: number; y: number; time: number; moved: boolean } | null = null;
  private pinchStart: { dist: number; fov: number } | null = null;
  private lastMove: { x: number; y: number; time: number } | null = null;
  /** Inertia velocity in degrees per millisecond. */
  private velocity = { yaw: 0, pitch: 0 };
  private keys = new Set<string>();
  private wheelGesture: { trackpad: boolean; time: number } | null = null;
  private disposers: Array<() => void> = [];

  constructor(
    private host: ControlsHost,
    private options: ControlsOptions,
  ) {
    const el = host.element;
    this.listen(el, 'pointerdown', this.onPointerDown as EventListener);
    this.listen(el, 'pointermove', this.onPointerMove as EventListener);
    this.listen(el, 'pointerup', this.onPointerUp as EventListener);
    this.listen(el, 'pointercancel', this.onPointerUp as EventListener);
    this.listen(el, 'wheel', this.onWheel as EventListener, { passive: false });
    this.listen(el, 'keydown', this.onKeyDown as EventListener);
    this.listen(el, 'keyup', this.onKeyUp as EventListener);
    this.listen(el, 'blur', () => this.keys.clear());
    // Prevent the browser's own touch gestures (scroll/zoom) inside the viewer.
    el.style.touchAction = 'none';
  }

  setOptions(options: Partial<ControlsOptions>): void {
    Object.assign(this.options, options);
  }

  /** True while the user is actively dragging or holding keys. */
  get isInteracting(): boolean {
    return this.pointers.size > 0 || this.keys.size > 0;
  }

  /** Advance inertia and keyboard movement. Returns true if the view changed. */
  step(dt: number): boolean {
    let changed = false;
    const view = this.host.getView();

    if (this.keys.size > 0) {
      const s = (KEY_SPEED * dt) / 1000;
      let dyaw = 0;
      let dpitch = 0;
      let zoom = 1;
      if (this.keys.has('ArrowLeft') || this.keys.has('a')) dyaw -= s;
      if (this.keys.has('ArrowRight') || this.keys.has('d')) dyaw += s;
      if (this.keys.has('ArrowUp') || this.keys.has('w')) dpitch += s;
      if (this.keys.has('ArrowDown') || this.keys.has('s')) dpitch -= s;
      if (this.options.zoom) {
        const z = Math.pow(KEY_ZOOM_SPEED, dt / 1000);
        if (this.keys.has('+') || this.keys.has('=')) zoom /= z;
        if (this.keys.has('-') || this.keys.has('_')) zoom *= z;
      }
      // Scale with zoom level so movement feels the same at every fov.
      const k = view.fov / 75;
      if (dyaw || dpitch || zoom !== 1) {
        this.host.applyView({
          yaw: view.yaw + dyaw * k,
          pitch: view.pitch + dpitch * k,
          fov: view.fov * zoom,
        });
        changed = true;
      }
    }

    if (this.pointers.size === 0 && (this.velocity.yaw || this.velocity.pitch)) {
      const v = this.host.getView();
      this.host.applyView({
        yaw: v.yaw + this.velocity.yaw * dt,
        pitch: v.pitch + this.velocity.pitch * dt,
      });
      const decay = Math.pow(0.004, dt / 1000); // lose ~99.6% of speed per second
      this.velocity.yaw *= decay;
      this.velocity.pitch *= decay;
      if (Math.abs(this.velocity.yaw) < 1e-4 && Math.abs(this.velocity.pitch) < 1e-4) {
        this.velocity.yaw = this.velocity.pitch = 0;
      }
      changed = true;
    }
    return changed;
  }

  stopInertia(): void {
    this.velocity.yaw = this.velocity.pitch = 0;
  }

  destroy(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
    this.pointers.clear();
    this.keys.clear();
  }

  // ---------------------------------------------------------------- pointer

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.host.element.focus({ preventScroll: true });
    try {
      this.host.element.setPointerCapture(e.pointerId);
    } catch {
      /* not supported for synthetic events */
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.stopInertia();
    this.host.onUserInteraction();

    if (this.pointers.size === 1) {
      this.dragStart = { x: e.clientX, y: e.clientY, time: performance.now(), moved: false };
      this.lastMove = { x: e.clientX, y: e.clientY, time: performance.now() };
      this.host.element.classList.add('pv-dragging');
    } else if (this.pointers.size === 2) {
      this.pinchStart = { dist: this.pinchDistance(), fov: this.host.getView().fov };
      if (this.dragStart) this.dragStart.moved = true; // a pinch is never a click
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    this.pointers.set(e.pointerId, cur);
    this.host.onUserInteraction();

    if (this.pointers.size >= 2) {
      if (this.options.zoom && this.pinchStart) {
        const dist = this.pinchDistance();
        if (dist > 0) this.host.applyView({ fov: (this.pinchStart.fov * this.pinchStart.dist) / dist });
      }
      return;
    }

    if (this.dragStart && !this.dragStart.moved) {
      const d = Math.hypot(cur.x - this.dragStart.x, cur.y - this.dragStart.y);
      if (d > CLICK_TOLERANCE_PX) this.dragStart.moved = true;
    }
    if (!this.options.draggable) return;

    const view = this.host.getView();
    const height = this.host.element.clientHeight || 1;
    const degPerPx = (view.fov / height) * this.options.dragSensitivity;
    const dyaw = -(cur.x - prev.x) * degPerPx;
    const dpitch = (cur.y - prev.y) * degPerPx;
    this.host.applyView({ yaw: view.yaw + dyaw, pitch: view.pitch + dpitch });

    const now = performance.now();
    if (this.lastMove) {
      const dt = Math.max(1, now - this.lastMove.time);
      // Smooth the velocity so a jittery last event doesn't dominate.
      const a = 0.6;
      this.velocity.yaw = a * (dyaw / dt) + (1 - a) * this.velocity.yaw;
      this.velocity.pitch = a * (dpitch / dt) + (1 - a) * this.velocity.pitch;
    }
    this.lastMove = { x: cur.x, y: cur.y, time: now };
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    try {
      this.host.element.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (this.pointers.size === 1) {
      // Went from pinch back to one finger: restart drag from that finger.
      const [p] = this.pointers.values();
      this.pinchStart = null;
      this.lastMove = { x: p.x, y: p.y, time: performance.now() };
      this.velocity.yaw = this.velocity.pitch = 0;
      return;
    }
    if (this.pointers.size > 0) return;

    this.host.element.classList.remove('pv-dragging');
    const start = this.dragStart;
    this.dragStart = null;
    this.pinchStart = null;

    // Released after holding still: no inertia.
    const idle = this.lastMove ? performance.now() - this.lastMove.time : Infinity;
    if (!this.options.inertia || idle > 80 || e.type === 'pointercancel') this.stopInertia();
    this.lastMove = null;

    if (start && !start.moved && e.type === 'pointerup') {
      this.stopInertia();
      this.host.onPanoramaClick(e.clientX, e.clientY, e);
    }
    this.host.invalidate();
  };

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  // ---------------------------------------------------------------- wheel

  private onWheel = (e: WheelEvent): void => {
    const view = this.host.getView();

    // A two-finger swipe on a trackpad looks around, like a drag.
    if (this.options.trackpadRotate && !e.ctrlKey && this.isTrackpadSwipe(e)) {
      if (!this.options.draggable) return;
      e.preventDefault();
      this.stopInertia();
      this.host.onUserInteraction();
      const height = this.host.element.clientHeight || 1;
      const degPerPx = (view.fov / height) * this.options.dragSensitivity;
      this.host.applyView({
        yaw: view.yaw + e.deltaX * degPerPx,
        pitch: view.pitch - e.deltaY * degPerPx,
      });
      return;
    }

    if (!this.options.zoom) return;
    e.preventDefault();
    this.host.onUserInteraction();
    // Normalise line/page deltas to pixels.
    const delta = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
    // Browsers report a trackpad pinch as ctrl + wheel, with much smaller deltas.
    const speed = e.ctrlKey && e.deltaMode === 0 ? 0.01 : 0.0015;
    this.host.applyView({ fov: view.fov * Math.exp(delta * speed) });
  };

  /**
   * Browsers don't say whether a wheel event comes from a mouse wheel or a
   * trackpad, so guess: a trackpad sends pixel deltas that are small or have a
   * horizontal part, a mouse wheel sends big vertical steps. The guess is made
   * at the start of a gesture and kept for its duration, so the shrinking
   * deltas of a wheel's tail or a fast swipe's peak don't flip it.
   */
  private isTrackpadSwipe(e: WheelEvent): boolean {
    const now = performance.now();
    const g = this.wheelGesture;
    let trackpad: boolean;
    if (e.deltaMode !== 0) trackpad = false;
    else if (e.deltaX !== 0) trackpad = true;
    else if (g && now - g.time < WHEEL_GESTURE_GAP_MS) trackpad = g.trackpad;
    else trackpad = Math.abs(e.deltaY) < MOUSE_WHEEL_MIN_STEP_PX;
    this.wheelGesture = { trackpad, time: now };
    return trackpad;
  }

  // ---------------------------------------------------------------- keyboard

  private static readonly KEYS = new Set([
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's', '+', '=', '-', '_',
  ]);

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.options.keyboard || e.ctrlKey || e.metaKey || e.altKey) return;
    // Ignore keys typed into form fields placed inside the viewer (e.g. in a tooltip).
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!Controls.KEYS.has(key)) return;
    e.preventDefault();
    this.keys.add(key);
    this.stopInertia();
    this.host.onUserInteraction();
    this.host.invalidate();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    this.keys.delete(key);
  };

  private listen(
    target: EventTarget,
    type: string,
    fn: EventListener,
    opts?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, fn, opts);
    this.disposers.push(() => target.removeEventListener(type, fn, opts));
  }
}
