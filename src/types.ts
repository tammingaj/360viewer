/**
 * Public type definitions for 360viewer.
 *
 * Angles are always in **degrees**:
 * - `yaw`   — horizontal angle. 0 is the centre of the equirectangular image,
 *             positive values turn to the right, range (-180, 180].
 * - `pitch` — vertical angle. 0 is the horizon, +90 straight up, -90 straight down.
 * - `fov`   — vertical field of view of the camera.
 */

/** Anything that can be uploaded as a panorama texture. */
export type PanoramaSource =
  | string
  | HTMLImageElement
  | HTMLCanvasElement
  | ImageBitmap
  | OffscreenCanvas;

/** A camera orientation. */
export interface View {
  yaw: number;
  pitch: number;
  fov: number;
}

/** Built-in hotspot behaviours. */
export type HotspotType =
  /** Navigates to another scene (`target`) when clicked. */
  | 'scene'
  /** Shows its tooltip; clicking toggles it (useful on touch devices). */
  | 'info'
  /** Does nothing by itself — handle it with `onClick` or the `hotspotclick` event. */
  | 'custom';

/** When a hotspot's tooltip is visible. */
export type TooltipMode = 'hover' | 'always' | 'never';

export interface HotspotConfig<TData = unknown> {
  /** Unique id within the scene. Generated when omitted. */
  id?: string;
  yaw: number;
  pitch: number;
  /** Defaults to `'scene'` when `target` is set, otherwise `'info'`. */
  type?: HotspotType;
  /** Scene id to navigate to (for `type: 'scene'`). */
  target?: string;
  /** Camera orientation to use when arriving in the target scene. */
  targetView?: Partial<View>;
  /** Tooltip text (rendered as text, never as HTML) or a ready-made element. */
  tooltip?: string | HTMLElement;
  /** When the tooltip is shown. Default `'hover'`. */
  tooltipMode?: TooltipMode;
  /** Accessible label. Defaults to the tooltip text. */
  label?: string;
  /** Extra CSS class(es) added to the hotspot element. */
  className?: string;
  /**
   * Replace the default marker with your own element. The library positions it;
   * everything else (look, animation) is up to you.
   */
  element?: HTMLElement | ((hotspot: Hotspot<TData>) => HTMLElement);
  /** Free-form data that is passed back in events. */
  data?: TData;
  /** Called on click, before the built-in behaviour. Return `false` to prevent it. */
  onClick?: (hotspot: Hotspot<TData>, viewer: ViewerLike) => void | boolean;
}

/** A hotspot after it has been added to a scene (id is always set). */
export interface Hotspot<TData = unknown> extends HotspotConfig<TData> {
  id: string;
  type: HotspotType;
}

export interface SceneConfig {
  id: string;
  /** URL of an equirectangular (2:1) image, or an already loaded image/canvas. */
  src: PanoramaSource;
  title?: string;
  /** Initial camera orientation when the scene is entered. */
  view?: Partial<View>;
  hotspots?: HotspotConfig[];
}

export interface Scene extends Omit<SceneConfig, 'hotspots'> {
  hotspots: Hotspot[];
}

export interface ViewerOptions {
  scenes?: SceneConfig[];
  /** Scene to show first. Defaults to the first scene in `scenes`. */
  firstScene?: string;
  /** Default view for scenes that don't define one. */
  view?: Partial<View>;
  /** Field-of-view limits in degrees. Default 30 – 100. */
  minFov?: number;
  maxFov?: number;
  /** Pitch limits in degrees. Default -90 – 90. */
  minPitch?: number;
  maxPitch?: number;
  /** Auto-rotation speed in degrees per second. 0 disables. Default 0. */
  autoRotate?: number;
  /** Milliseconds of inactivity before auto-rotation resumes. Default 3000. */
  autoRotateDelay?: number;
  /** Cross-fade duration between scenes in ms. Default 600. 0 disables. */
  transitionDuration?: number;
  /** Enable arrow keys / +/- when the viewer has focus. Default true. */
  keyboard?: boolean;
  /** Enable mouse-wheel and pinch zoom. Default true. */
  zoom?: boolean;
  /** Enable drag-to-look. Default true. */
  draggable?: boolean;
  /** Keep spinning after a drag is released. Default true. */
  inertia?: boolean;
  /** Multiplier for drag speed. Default 1. */
  dragSensitivity?: number;
  /**
   * Look around with a two-finger swipe on a trackpad (pinch still zooms).
   * Trackpads are told apart from mouse wheels by a heuristic; set to false to
   * make every wheel event zoom. Default true.
   */
  trackpadRotate?: boolean;
  /** `crossOrigin` attribute for images loaded from URLs. Default `'anonymous'`. */
  crossOrigin?: '' | 'anonymous' | 'use-credentials' | null;
  /** Extra CSS class on the root element. */
  className?: string;
  /** Show a loading indicator while images load. Default true. */
  showLoader?: boolean;
  /** Preload the target images of scene hotspots in the current scene. Default true. */
  preloadLinkedScenes?: boolean;
}

/** Map of event names to payloads. */
export interface ViewerEvents {
  /** First scene has been displayed. */
  ready: { scene: Scene };
  /** An image started loading. */
  loadstart: { sceneId: string };
  /** An image finished loading. */
  load: { sceneId: string };
  /** The visible scene changed. */
  scenechange: { scene: Scene; previousScene: Scene | null };
  /** The camera moved (fired at most once per frame). */
  viewchange: View;
  /** A hotspot was clicked or activated with the keyboard. */
  hotspotclick: { hotspot: Hotspot; scene: Scene; originalEvent: Event };
  /** The panorama (not a hotspot) was clicked without dragging. Handy for placing hotspots. */
  click: { yaw: number; pitch: number; originalEvent: MouseEvent };
  /** Something went wrong (e.g. an image failed to load). */
  error: { error: unknown; sceneId?: string };
}

/** The subset of the viewer API passed to `onClick` callbacks. */
export interface ViewerLike {
  loadScene(id: string, view?: Partial<View>): Promise<void>;
  setView(view: Partial<View>, options?: { duration?: number }): Promise<void>;
  getView(): View;
}
