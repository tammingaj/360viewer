import { Controls } from './Controls';
import { EventEmitter } from './EventEmitter';
import { HotspotLayer } from './HotspotLayer';
import { loadPanorama } from './imageLoader';
import {
  clamp,
  easeInOutCubic,
  normalizeYaw,
  projectToScreen,
  unprojectFromScreen,
  yawDelta,
  type ScreenPoint,
} from './math';
import { Renderer, type PanoTexture } from './Renderer';
import { injectStyles } from './styles';
import type {
  Hotspot,
  HotspotConfig,
  Scene,
  SceneConfig,
  View,
  ViewerEvents,
  ViewerLike,
  ViewerOptions,
} from './types';

const DEFAULT_VIEW: View = { yaw: 0, pitch: 0, fov: 75 };

type ResolvedOptions = Required<Omit<ViewerOptions, 'scenes' | 'firstScene' | 'view' | 'className'>> &
  Pick<ViewerOptions, 'className'> & { view: View };

interface Animation {
  from: View;
  to: View;
  start: number;
  duration: number;
  resolve: () => void;
}

interface Transition {
  from: PanoTexture;
  fromView: View;
  start: number;
  duration: number;
}

let hotspotCounter = 0;

/**
 * An interactive 360° panorama viewer.
 *
 * ```ts
 * const viewer = new Viewer360('#pano', {
 *   scenes: [
 *     { id: 'hall', src: 'hall.jpg', hotspots: [{ yaw: 40, pitch: -5, target: 'kitchen', tooltip: 'Kitchen' }] },
 *     { id: 'kitchen', src: 'kitchen.jpg' },
 *   ],
 * });
 * viewer.on('hotspotclick', ({ hotspot }) => console.log(hotspot.id));
 * ```
 */
export class Viewer360 extends EventEmitter<ViewerEvents> implements ViewerLike {
  /** The root element created inside your container. */
  readonly element: HTMLElement;
  readonly canvas: HTMLCanvasElement;

  private options: ResolvedOptions;
  private renderer: Renderer;
  private hotspotLayer: HotspotLayer;
  private controls: Controls;
  private loader: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;

  private scenes = new Map<string, Scene>();
  private currentScene: Scene | null = null;
  private texture: PanoTexture | null = null;
  private view: View;
  private width = 1;
  private height = 1;

  private animation: Animation | null = null;
  private transition: Transition | null = null;
  private loadToken = 0;
  private lastInteraction = 0;
  private frameId = 0;
  private lastFrameTime = 0;
  private dirty = true;
  private viewChanged = false;
  private isReady = false;
  private destroyed = false;

  constructor(container: HTMLElement | string, options: ViewerOptions = {}) {
    super();
    const host =
      typeof container === 'string' ? document.querySelector<HTMLElement>(container) : container;
    if (!host) throw new Error(`[360viewer] Container not found: ${String(container)}`);

    this.options = {
      minFov: 30,
      maxFov: 100,
      minPitch: -90,
      maxPitch: 90,
      autoRotate: 0,
      autoRotateDelay: 3000,
      transitionDuration: 600,
      keyboard: true,
      zoom: true,
      draggable: true,
      inertia: true,
      dragSensitivity: 1,
      trackpadRotate: true,
      crossOrigin: 'anonymous',
      showLoader: true,
      preloadLinkedScenes: true,
      ...stripUndefined(options),
      view: { ...DEFAULT_VIEW, ...options.view },
    } as ResolvedOptions;
    this.view = this.clampView(this.options.view);

    injectStyles(host.ownerDocument);
    const root = host.ownerDocument.createElement('div');
    root.className = 'pv-root' + (this.options.className ? ` ${this.options.className}` : '');
    root.tabIndex = 0;
    root.setAttribute('role', 'region');
    root.setAttribute('aria-roledescription', '360° panorama');
    root.setAttribute('aria-label', '360° panorama');
    this.element = root;

    this.canvas = host.ownerDocument.createElement('canvas');
    this.canvas.className = 'pv-canvas';
    root.appendChild(this.canvas);

    this.hotspotLayer = new HotspotLayer((h, e) => this.activateHotspot(h, e));
    root.appendChild(this.hotspotLayer.element);

    this.loader = host.ownerDocument.createElement('div');
    this.loader.className = 'pv-loader';
    this.loader.setAttribute('aria-hidden', 'true');
    root.appendChild(this.loader);

    host.appendChild(root);

    this.renderer = new Renderer(this.canvas);
    this.renderer.onContextRestored = () => this.invalidate();

    this.controls = new Controls(
      {
        element: root,
        getView: () => ({ ...this.view }),
        applyView: (v) => this.applyView(v),
        onUserInteraction: () => this.onUserInteraction(),
        onPanoramaClick: (x, y, e) => this.onPanoramaClick(x, y, e),
        invalidate: () => this.invalidate(),
      },
      {
        draggable: this.options.draggable,
        zoom: this.options.zoom,
        keyboard: this.options.keyboard,
        inertia: this.options.inertia,
        dragSensitivity: this.options.dragSensitivity,
        trackpadRotate: this.options.trackpadRotate,
      },
    );

    this.updateSize();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.updateSize()) this.renderFrame(performance.now());
      });
      this.resizeObserver.observe(root);
    }

    for (const s of options.scenes ?? []) this.addScene(s);
    const first = options.firstScene ?? options.scenes?.[0]?.id;
    if (first) {
      this.loadScene(first).catch(() => {
        /* reported through the 'error' event */
      });
    }
    this.invalidate();
  }

  // ================================================================ scenes

  /** Register a scene. Replaces an existing scene with the same id. */
  addScene(config: SceneConfig): Scene {
    const scene: Scene = {
      ...config,
      hotspots: (config.hotspots ?? []).map((h) => normalizeHotspot(h)),
    };
    this.scenes.set(scene.id, scene);
    return scene;
  }

  /** Remove a scene. The scene that is currently displayed cannot be removed. */
  removeScene(id: string): boolean {
    if (this.currentScene?.id === id) return false;
    return this.scenes.delete(id);
  }

  getScene(id: string): Scene | undefined {
    return this.scenes.get(id);
  }

  getScenes(): Scene[] {
    return [...this.scenes.values()];
  }

  getCurrentScene(): Scene | null {
    return this.currentScene;
  }

  /**
   * Show a scene. Resolves when the image is loaded and the cross-fade has
   * started; rejects if the image fails to load. If another `loadScene` call
   * supersedes this one before it finishes, the promise simply resolves.
   */
  async loadScene(id: string, view?: Partial<View>): Promise<void> {
    this.assertAlive();
    const scene = this.scenes.get(id);
    if (!scene) {
      const error = new Error(`[360viewer] Unknown scene: ${id}`);
      this.emit('error', { error, sceneId: id });
      throw error;
    }
    const token = ++this.loadToken;
    this.emit('loadstart', { sceneId: id });
    this.setLoading(true);

    let source: Exclude<SceneConfig['src'], string>;
    try {
      source = await loadPanorama(scene.src, this.options.crossOrigin);
    } catch (error) {
      if (token === this.loadToken) this.setLoading(false);
      this.emit('error', { error, sceneId: id });
      throw error;
    }
    if (token !== this.loadToken || this.destroyed) return; // superseded

    this.setLoading(false);
    this.emit('load', { sceneId: id });

    const texture = this.renderer.createTexture(source as TexImageSource);
    const previousScene = this.currentScene;
    const now = performance.now();

    // Finish any running transition right away.
    if (this.transition) {
      this.renderer.deleteTexture(this.transition.from);
      this.transition = null;
    }
    this.cancelAnimation();
    this.controls.stopInertia();

    const prevTexture = this.texture;
    const fromView = { ...this.view };
    this.texture = texture;
    this.currentScene = scene;
    this.view = this.clampView({ ...this.options.view, ...scene.view, ...view });
    this.viewChanged = true;

    if (prevTexture && this.options.transitionDuration > 0 && !prefersReducedMotion()) {
      this.transition = {
        from: prevTexture,
        fromView,
        start: now,
        duration: this.options.transitionDuration,
      };
    } else {
      this.renderer.deleteTexture(prevTexture);
    }

    this.hotspotLayer.setHotspots(scene.hotspots);
    this.element.setAttribute('aria-label', scene.title ?? '360° panorama');
    this.lastInteraction = now;
    this.invalidate();

    this.emit('scenechange', { scene, previousScene });
    if (!this.isReady) {
      this.isReady = true;
      this.emit('ready', { scene });
    }
    if (this.options.preloadLinkedScenes) this.preloadLinked(scene);
  }

  // ================================================================ hotspots

  /** Add a hotspot to a scene (default: the current scene). */
  addHotspot(config: HotspotConfig, sceneId?: string): Hotspot {
    const scene = this.requireScene(sceneId);
    const hotspot = normalizeHotspot(config);
    const i = scene.hotspots.findIndex((h) => h.id === hotspot.id);
    if (i >= 0) scene.hotspots[i] = hotspot;
    else scene.hotspots.push(hotspot);
    if (scene === this.currentScene) {
      this.hotspotLayer.add(hotspot);
      this.invalidate();
    }
    return hotspot;
  }

  /** Change properties of an existing hotspot (e.g. move it while editing). */
  updateHotspot(id: string, changes: Partial<HotspotConfig>, sceneId?: string): Hotspot | undefined {
    const scene = this.requireScene(sceneId);
    const existing = scene.hotspots.find((h) => h.id === id);
    if (!existing) return undefined;
    return this.addHotspot({ ...existing, ...changes, id }, scene.id);
  }

  removeHotspot(id: string, sceneId?: string): boolean {
    const scene = this.requireScene(sceneId);
    const i = scene.hotspots.findIndex((h) => h.id === id);
    if (i < 0) return false;
    scene.hotspots.splice(i, 1);
    if (scene === this.currentScene) this.hotspotLayer.remove(id);
    return true;
  }

  getHotspots(sceneId?: string): Hotspot[] {
    return [...this.requireScene(sceneId).hotspots];
  }

  /** The DOM element of a hotspot in the current scene. */
  getHotspotElement(id: string): HTMLElement | undefined {
    return this.hotspotLayer.getElement(id);
  }

  // ================================================================ camera

  getView(): View {
    return { ...this.view };
  }

  /**
   * Point the camera. With `duration` (ms) the move is animated and the
   * promise resolves when it ends (or is interrupted by the user).
   */
  setView(view: Partial<View>, { duration = 0 }: { duration?: number } = {}): Promise<void> {
    this.assertAlive();
    this.cancelAnimation();
    this.controls.stopInertia();
    this.lastInteraction = performance.now();
    const target = this.clampView({ ...this.view, ...view });
    if (duration <= 0 || prefersReducedMotion()) {
      this.applyView(target);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.animation = {
        from: { ...this.view },
        to: target,
        start: performance.now(),
        duration,
        resolve,
      };
      this.invalidate();
    });
  }

  /** Turn the camera towards a hotspot of the current scene. */
  lookAtHotspot(id: string, options?: { duration?: number; fov?: number }): Promise<void> {
    const h = this.currentScene?.hotspots.find((x) => x.id === id);
    if (!h) return Promise.resolve();
    return this.setView(
      { yaw: h.yaw, pitch: h.pitch, ...(options?.fov ? { fov: options.fov } : {}) },
      { duration: options?.duration ?? 800 },
    );
  }

  /** Set auto-rotation speed in degrees per second (0 = off, negative = left). */
  setAutoRotate(speed: number): void {
    this.options.autoRotate = speed;
    this.lastInteraction = -Infinity;
    this.invalidate();
  }

  /** Change interaction options at runtime. */
  setOptions(
    options: Partial<
      Pick<
        ViewerOptions,
        | 'minFov' | 'maxFov' | 'minPitch' | 'maxPitch' | 'keyboard' | 'zoom' | 'draggable'
        | 'inertia' | 'dragSensitivity' | 'trackpadRotate' | 'transitionDuration' | 'autoRotate' | 'autoRotateDelay'
      >
    >,
  ): void {
    Object.assign(this.options, stripUndefined(options));
    this.controls.setOptions({
      keyboard: this.options.keyboard,
      zoom: this.options.zoom,
      draggable: this.options.draggable,
      inertia: this.options.inertia,
      dragSensitivity: this.options.dragSensitivity,
      trackpadRotate: this.options.trackpadRotate,
    });
    this.applyView(this.view);
    this.invalidate();
  }

  // ================================================================ coordinates

  /**
   * The yaw/pitch under a point given in client (viewport) coordinates, e.g.
   * from a mouse event. Useful for placing hotspots.
   */
  getViewAt(clientX: number, clientY: number): { yaw: number; pitch: number } {
    const r = this.element.getBoundingClientRect();
    return unprojectFromScreen(clientX - r.left, clientY - r.top, this.view, this.width, this.height);
  }

  /** Where a yaw/pitch appears, in pixels relative to the viewer's top-left. */
  getScreenPosition(yaw: number, pitch: number): ScreenPoint {
    return projectToScreen(yaw, pitch, this.view, this.width, this.height);
  }

  // ================================================================ misc

  /** Toggle browser fullscreen for the viewer. */
  async toggleFullscreen(): Promise<void> {
    const doc = this.element.ownerDocument;
    if (doc.fullscreenElement) await doc.exitFullscreen();
    else await this.element.requestFullscreen?.();
  }

  /** Recalculate the size. Called automatically when the element is resized. */
  resize(): void {
    this.updateSize();
    this.invalidate();
  }

  /** Remove the viewer from the page and release all resources. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.frameId);
    this.cancelAnimation();
    this.resizeObserver?.disconnect();
    this.controls.destroy();
    this.hotspotLayer.clear();
    this.renderer.destroy();
    this.element.remove();
    this.removeAllListeners();
    this.texture = null;
    this.transition = null;
  }

  // ================================================================ internals

  private requireScene(sceneId?: string): Scene {
    const scene = sceneId ? this.scenes.get(sceneId) : this.currentScene;
    if (!scene) throw new Error(`[360viewer] Unknown scene: ${sceneId ?? '(no current scene)'}`);
    return scene;
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('[360viewer] Viewer has been destroyed.');
  }

  private clampView(v: View): View {
    const o = this.options;
    const fov = clamp(v.fov, o.minFov, o.maxFov);
    return {
      yaw: normalizeYaw(v.yaw),
      pitch: clamp(v.pitch, o.minPitch, o.maxPitch),
      fov,
    };
  }

  private applyView(v: Partial<View>): void {
    const next = this.clampView({ ...this.view, ...v });
    if (next.yaw === this.view.yaw && next.pitch === this.view.pitch && next.fov === this.view.fov) {
      return;
    }
    this.view = next;
    this.viewChanged = true;
    this.invalidate();
  }

  private onUserInteraction(): void {
    this.lastInteraction = performance.now();
    this.cancelAnimation();
  }

  private cancelAnimation(): void {
    if (!this.animation) return;
    const { resolve } = this.animation;
    this.animation = null;
    resolve();
  }

  private onPanoramaClick(clientX: number, clientY: number, event: MouseEvent): void {
    this.hotspotLayer.closeTooltips();
    const { yaw, pitch } = this.getViewAt(clientX, clientY);
    this.emit('click', { yaw, pitch, originalEvent: event });
  }

  private activateHotspot(hotspot: Hotspot, event: Event): void {
    const scene = this.currentScene;
    if (!scene) return;
    this.onUserInteraction();
    const el = this.hotspotLayer.getElement(hotspot.id);
    this.hotspotLayer.closeTooltips(el);

    let proceed = true;
    if (hotspot.onClick) {
      try {
        proceed = hotspot.onClick(hotspot, this) !== false;
      } catch (err) {
        console.error('[360viewer] error in hotspot onClick', err);
      }
    }
    this.emit('hotspotclick', { hotspot, scene, originalEvent: event });
    if (!proceed) return;

    if (hotspot.type === 'scene' && hotspot.target) {
      this.loadScene(hotspot.target, hotspot.targetView).catch(() => {
        /* reported through 'error' */
      });
    } else if (hotspot.type === 'info' && el) {
      el.classList.toggle('pv-hotspot--open');
    }
  }

  private preloadLinked(scene: Scene): void {
    for (const h of scene.hotspots) {
      if (h.type !== 'scene' || !h.target) continue;
      const target = this.scenes.get(h.target);
      if (target && typeof target.src === 'string') {
        loadPanorama(target.src, this.options.crossOrigin).catch(() => {
          /* will be reported if the user navigates there */
        });
      }
    }
  }

  private setLoading(loading: boolean): void {
    this.element.classList.toggle('pv-loading', loading && this.options.showLoader);
    this.element.setAttribute('aria-busy', String(loading));
  }

  private updateSize(): boolean {
    const w = this.element.clientWidth || 1;
    const h = this.element.clientHeight || 1;
    const sizeChanged = w !== this.width || h !== this.height;
    this.width = w;
    this.height = h;
    const dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2);
    const changed = this.renderer.resize(w, h, dpr) || sizeChanged;
    if (changed) this.dirty = true;
    return changed;
  }

  private invalidate(): void {
    this.dirty = true;
    if (!this.frameId && !this.destroyed) {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private tick = (time: number): void => {
    this.frameId = 0;
    if (this.destroyed) return;
    this.renderFrame(time);
    if (!this.frameId && this.isAnimating()) this.frameId = requestAnimationFrame(this.tick);
  };

  private isAnimating(): boolean {
    return (
      !!this.animation ||
      !!this.transition ||
      this.controls.isInteracting ||
      this.controlsHaveMomentum ||
      this.options.autoRotate !== 0
    );
  }

  private controlsHaveMomentum = false;

  private renderFrame(time: number): void {
    const dt = this.lastFrameTime ? Math.min(100, Math.max(0, time - this.lastFrameTime)) : 16;
    this.lastFrameTime = time;

    this.controlsHaveMomentum = this.controls.step(dt);

    // Animated camera move.
    if (this.animation) {
      const a = this.animation;
      const t = Math.min(1, (time - a.start) / a.duration);
      const k = easeInOutCubic(t);
      this.applyView({
        yaw: a.from.yaw + yawDelta(a.from.yaw, a.to.yaw) * k,
        pitch: a.from.pitch + (a.to.pitch - a.from.pitch) * k,
        fov: a.from.fov + (a.to.fov - a.from.fov) * k,
      });
      if (t >= 1) this.cancelAnimation();
    }

    // Auto-rotation after a period of inactivity.
    const o = this.options;
    if (
      o.autoRotate !== 0 &&
      !this.animation &&
      !this.controls.isInteracting &&
      !this.controlsHaveMomentum &&
      this.currentScene &&
      time - this.lastInteraction > o.autoRotateDelay
    ) {
      this.applyView({ yaw: this.view.yaw + (o.autoRotate * dt) / 1000 });
    }

    // Scene cross-fade.
    let mix = 0;
    if (this.transition) {
      mix = Math.min(1, (time - this.transition.start) / this.transition.duration);
      this.dirty = true;
      if (mix >= 1) {
        this.renderer.deleteTexture(this.transition.from);
        this.transition = null;
      }
    }

    if (!this.dirty) return;
    this.dirty = false;

    if (this.transition) {
      // The old scene zooms in slightly while it fades out: a "step forward" feel.
      const from = this.transition.fromView;
      const eased = easeInOutCubic(mix);
      const fromView = { ...from, fov: from.fov * (1 - 0.25 * eased) };
      this.renderer.render(fromView, this.transition.from, this.texture, this.view, eased);
      this.hotspotLayer.element.style.opacity = String(eased);
    } else {
      this.renderer.render(this.view, this.texture);
      this.hotspotLayer.element.style.opacity = '';
    }
    this.hotspotLayer.update(this.view, this.width, this.height);

    if (this.viewChanged) {
      this.viewChanged = false;
      this.emit('viewchange', { ...this.view });
    }
  }
}

/** @internal exported for tests */
export function normalizeHotspot(config: HotspotConfig): Hotspot {
  return {
    ...config,
    id: config.id ?? `hotspot-${++hotspotCounter}`,
    type: config.type ?? (config.target ? 'scene' : 'info'),
    yaw: normalizeYaw(config.yaw),
    pitch: clamp(config.pitch, -90, 90),
  };
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(o) as Array<keyof T>) {
    if (o[k] !== undefined) out[k] = o[k];
  }
  return out;
}

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
