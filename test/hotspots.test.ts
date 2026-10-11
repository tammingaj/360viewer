import { describe, expect, it, vi } from 'vitest';
import { HotspotLayer } from '../src/HotspotLayer';
import { normalizeHotspot } from '../src/Viewer';

describe('normalizeHotspot', () => {
  it('generates a unique id when none is given', () => {
    const a = normalizeHotspot({ yaw: 0, pitch: 0 });
    const b = normalizeHotspot({ yaw: 0, pitch: 0 });
    expect(a.id).toMatch(/^hotspot-\d+$/);
    expect(b.id).toMatch(/^hotspot-\d+$/);
    expect(a.id).not.toBe(b.id);
  });

  it('keeps a given id', () => {
    expect(normalizeHotspot({ id: 'door', yaw: 0, pitch: 0 }).id).toBe('door');
  });

  it("defaults the type to 'scene' with a target and 'info' without", () => {
    expect(normalizeHotspot({ yaw: 0, pitch: 0, target: 'kitchen' }).type).toBe('scene');
    expect(normalizeHotspot({ yaw: 0, pitch: 0 }).type).toBe('info');
  });

  it('keeps an explicit type', () => {
    expect(normalizeHotspot({ yaw: 0, pitch: 0, type: 'custom' }).type).toBe('custom');
    expect(normalizeHotspot({ yaw: 0, pitch: 0, type: 'custom', target: 'kitchen' }).type).toBe('custom');
  });

  it('wraps yaw into (-180, 180] and clamps pitch to ±90', () => {
    expect(normalizeHotspot({ yaw: 270, pitch: 0 }).yaw).toBeCloseTo(-90);
    expect(normalizeHotspot({ yaw: -180, pitch: 0 }).yaw).toBe(180);
    expect(normalizeHotspot({ yaw: 0, pitch: 120 }).pitch).toBe(90);
    expect(normalizeHotspot({ yaw: 0, pitch: -120 }).pitch).toBe(-90);
  });

  it('passes the other properties through and leaves the input alone', () => {
    const onClick = vi.fn();
    const config = { yaw: 400, pitch: 5, tooltip: 'Hi', data: { price: 3 }, className: 'x', onClick };
    const hotspot = normalizeHotspot(config);
    expect(hotspot).toMatchObject({ tooltip: 'Hi', data: { price: 3 }, className: 'x', onClick });
    expect(config.yaw).toBe(400);
    expect(config).not.toHaveProperty('id');
  });
});

describe('HotspotLayer', () => {
  const view = { yaw: 0, pitch: 0, fov: 80 };

  it('renders a focusable, labelled button with a text-only tooltip', () => {
    const layer = new HotspotLayer(() => {});
    layer.add(normalizeHotspot({ id: 'a', yaw: 0, pitch: 0, tooltip: '<b>Kitchen</b>', className: 'mine' }));
    const el = layer.getElement('a')!;
    expect(el.parentElement).toBe(layer.element);
    expect(el.classList.contains('pv-hotspot--info')).toBe(true);
    expect(el.classList.contains('mine')).toBe(true);
    expect(el.getAttribute('role')).toBe('button');
    expect(el.tabIndex).toBe(0);
    expect(el.getAttribute('aria-label')).toBe('<b>Kitchen</b>');
    const tip = el.querySelector('.pv-hotspot__tooltip')!;
    expect(tip.textContent).toBe('<b>Kitchen</b>');
    expect(tip.querySelector('b')).toBeNull();
  });

  it("omits the tooltip when tooltipMode is 'never'", () => {
    const layer = new HotspotLayer(() => {});
    layer.add(normalizeHotspot({ id: 'a', yaw: 0, pitch: 0, tooltip: 'Hi', tooltipMode: 'never' }));
    expect(layer.getElement('a')!.querySelector('.pv-hotspot__tooltip')).toBeNull();
  });

  it('uses a custom element instead of the default marker', () => {
    const layer = new HotspotLayer(() => {});
    const custom = document.createElement('img');
    layer.add(normalizeHotspot({ id: 'a', yaw: 0, pitch: 0, element: custom }));
    const el = layer.getElement('a')!;
    expect(el.contains(custom)).toBe(true);
    expect(el.querySelector('.pv-hotspot__marker')).toBeNull();
  });

  it('activates on click and on Enter / Space', () => {
    const onActivate = vi.fn();
    const layer = new HotspotLayer(onActivate);
    const hotspot = normalizeHotspot({ id: 'a', yaw: 0, pitch: 0 });
    layer.add(hotspot);
    const el = layer.getElement('a')!;
    el.click();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    expect(onActivate).toHaveBeenCalledTimes(3);
    expect(onActivate.mock.calls[0][0]).toBe(hotspot);
  });

  it('replaces a hotspot that has the same id', () => {
    const layer = new HotspotLayer(() => {});
    layer.add(normalizeHotspot({ id: 'a', yaw: 0, pitch: 0 }));
    layer.add(normalizeHotspot({ id: 'a', yaw: 10, pitch: 0 }));
    expect(layer.element.children).toHaveLength(1);
  });

  it('remove(), setHotspots() and clear() keep the DOM in sync', () => {
    const layer = new HotspotLayer(() => {});
    layer.setHotspots([
      normalizeHotspot({ id: 'a', yaw: 0, pitch: 0 }),
      normalizeHotspot({ id: 'b', yaw: 10, pitch: 0 }),
    ]);
    expect(layer.element.children).toHaveLength(2);
    layer.remove('a');
    expect(layer.getElement('a')).toBeUndefined();
    expect(layer.element.children).toHaveLength(1);
    layer.setHotspots([normalizeHotspot({ id: 'c', yaw: 0, pitch: 0 })]);
    expect(layer.getElement('b')).toBeUndefined();
    expect(layer.getElement('c')).toBeDefined();
    layer.clear();
    expect(layer.element.children).toHaveLength(0);
  });

  it('positions visible hotspots and hides the ones out of view', () => {
    const layer = new HotspotLayer(() => {});
    layer.setHotspots([
      normalizeHotspot({ id: 'front', yaw: 0, pitch: 0 }),
      normalizeHotspot({ id: 'behind', yaw: 180, pitch: 0 }),
    ]);
    layer.update(view, 800, 600);
    const front = layer.getElement('front')!;
    const behind = layer.getElement('behind')!;
    expect(front.style.visibility).toBe('');
    expect(front.style.transform).toContain('400.0px, 300.0px');
    expect(behind.style.visibility).toBe('hidden');
    expect(behind.classList.contains('pv-hotspot--hidden')).toBe(true);

    // Turn around: the two swap.
    layer.update({ ...view, yaw: 180 }, 800, 600);
    expect(front.style.visibility).toBe('hidden');
    expect(behind.style.visibility).toBe('');
    expect(behind.classList.contains('pv-hotspot--hidden')).toBe(false);
  });

  it('closeTooltips() closes every open tooltip except the given element', () => {
    const layer = new HotspotLayer(() => {});
    layer.setHotspots([
      normalizeHotspot({ id: 'a', yaw: 0, pitch: 0, tooltip: 'A' }),
      normalizeHotspot({ id: 'b', yaw: 10, pitch: 0, tooltip: 'B' }),
    ]);
    const a = layer.getElement('a')!;
    const b = layer.getElement('b')!;
    a.classList.add('pv-hotspot--open');
    b.classList.add('pv-hotspot--open');
    layer.closeTooltips(a);
    expect(a.classList.contains('pv-hotspot--open')).toBe(true);
    expect(b.classList.contains('pv-hotspot--open')).toBe(false);
    layer.closeTooltips();
    expect(a.classList.contains('pv-hotspot--open')).toBe(false);
  });
});
