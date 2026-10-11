import { projectToScreen } from './math';
import type { Hotspot, View } from './types';

interface Entry {
  hotspot: Hotspot;
  el: HTMLElement;
  /** Last applied transform, to avoid needless style writes. */
  lastTransform: string;
  lastVisible: boolean;
}

export type HotspotActivateHandler = (hotspot: Hotspot, event: Event) => void;

/**
 * Renders hotspots as DOM elements laid over the WebGL canvas and keeps them
 * positioned as the camera moves. Using real DOM elements means hotspots can be
 * styled with CSS, are keyboard focusable and readable by screen readers.
 */
export class HotspotLayer {
  readonly element: HTMLElement;
  private entries = new Map<string, Entry>();

  constructor(private onActivate: HotspotActivateHandler) {
    this.element = document.createElement('div');
    this.element.className = 'pv-hotspots';
  }

  /** Replace all hotspots (used when the scene changes). */
  setHotspots(hotspots: Hotspot[]): void {
    this.clear();
    for (const h of hotspots) this.add(h);
  }

  add(hotspot: Hotspot): void {
    this.remove(hotspot.id);
    const el = this.createElement(hotspot);
    this.element.appendChild(el);
    this.entries.set(hotspot.id, { hotspot, el, lastTransform: '', lastVisible: true });
  }

  remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.el.remove();
    this.entries.delete(id);
  }

  clear(): void {
    for (const { el } of this.entries.values()) el.remove();
    this.entries.clear();
  }

  getElement(id: string): HTMLElement | undefined {
    return this.entries.get(id)?.el;
  }

  /** Close any open (click-toggled) tooltips. */
  closeTooltips(except?: HTMLElement): void {
    for (const { el } of this.entries.values()) {
      if (el !== except) el.classList.remove('pv-hotspot--open');
    }
  }

  /** Reposition every hotspot for the given camera view. */
  update(view: View, width: number, height: number): void {
    const margin = 64;
    for (const entry of this.entries.values()) {
      const { hotspot, el } = entry;
      const p = projectToScreen(hotspot.yaw, hotspot.pitch, view, width, height);
      const visible =
        p.visible && p.x > -margin && p.x < width + margin && p.y > -margin && p.y < height + margin;
      if (visible !== entry.lastVisible) {
        el.style.visibility = visible ? '' : 'hidden';
        el.classList.toggle('pv-hotspot--hidden', !visible);
        entry.lastVisible = visible;
      }
      if (!visible) continue;
      const transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
      if (transform !== entry.lastTransform) {
        el.style.transform = transform;
        entry.lastTransform = transform;
      }
    }
  }

  private createElement(hotspot: Hotspot): HTMLElement {
    const el = document.createElement('div');
    el.className = `pv-hotspot pv-hotspot--${hotspot.type}`;
    if (hotspot.className) el.className += ` ${hotspot.className}`;
    el.dataset.hotspotId = hotspot.id;

    const tooltipText = typeof hotspot.tooltip === 'string' ? hotspot.tooltip : undefined;
    const label = hotspot.label ?? tooltipText;
    const mode = hotspot.tooltipMode ?? 'hover';
    if (mode === 'always') el.classList.add('pv-hotspot--tooltip-always');

    if (hotspot.element) {
      const custom =
        typeof hotspot.element === 'function' ? hotspot.element(hotspot) : hotspot.element;
      el.classList.add('pv-hotspot--custom-element');
      el.appendChild(custom);
      if (label) el.setAttribute('aria-label', label);
    } else {
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      if (label) el.setAttribute('aria-label', label);
      const marker = document.createElement('span');
      marker.className = 'pv-hotspot__marker';
      marker.setAttribute('aria-hidden', 'true');
      el.appendChild(marker);
    }

    if (hotspot.tooltip && mode !== 'never') {
      const tip = document.createElement('span');
      tip.className = 'pv-hotspot__tooltip';
      tip.setAttribute('role', 'tooltip');
      if (typeof hotspot.tooltip === 'string') tip.textContent = hotspot.tooltip;
      else tip.appendChild(hotspot.tooltip);
      el.appendChild(tip);
    }

    // Don't let a press on a hotspot start a camera drag.
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onActivate(hotspot, e);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        this.onActivate(hotspot, e);
      }
    });
    return el;
  }
}
