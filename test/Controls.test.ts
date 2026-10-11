import { afterEach, describe, expect, it, vi } from 'vitest';
import { Controls, type ControlsOptions } from '../src/Controls';
import type { View } from '../src/types';

function setup(options: Partial<ControlsOptions> = {}) {
  const element = document.createElement('div');
  let view: View = { yaw: 0, pitch: 0, fov: 60 };
  const controls = new Controls(
    {
      element,
      getView: () => ({ ...view }),
      applyView: (v) => {
        view = { ...view, ...v };
      },
      onUserInteraction: () => {},
      onPanoramaClick: () => {},
      invalidate: () => {},
    },
    {
      draggable: true,
      zoom: true,
      keyboard: true,
      inertia: true,
      dragSensitivity: 1,
      trackpadRotate: true,
      ...options,
    },
  );
  const wheel = (init: WheelEventInit): WheelEvent => {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
    element.dispatchEvent(event);
    return event;
  };
  return { controls, wheel, getView: () => view };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Controls wheel handling', () => {
  it('zooms with a mouse wheel', () => {
    const { wheel, getView } = setup();
    const event = wheel({ deltaY: 100 });
    expect(getView().fov).toBeGreaterThan(60);
    expect(getView().yaw).toBe(0);
    expect(getView().pitch).toBe(0);
    expect(event.defaultPrevented).toBe(true);

    wheel({ deltaY: -100 });
    expect(getView().fov).toBeCloseTo(60);
  });

  it('zooms with a line-based wheel (Firefox mouse), even for small deltas', () => {
    const { wheel, getView } = setup();
    wheel({ deltaY: -3, deltaMode: 1 });
    expect(getView().fov).toBeLessThan(60);
    expect(getView().pitch).toBe(0);
  });

  it('looks around with a two-finger trackpad swipe', () => {
    const { wheel, getView } = setup();
    const event = wheel({ deltaX: 5, deltaY: 0 });
    expect(getView().yaw).toBeGreaterThan(0); // scrolling right turns right
    expect(getView().fov).toBe(60);
    expect(event.defaultPrevented).toBe(true);

    wheel({ deltaX: 0, deltaY: 5 });
    expect(getView().pitch).toBeLessThan(0); // scrolling down looks down
    expect(getView().fov).toBe(60);
  });

  it('zooms with a trackpad pinch (ctrl + wheel)', () => {
    const { wheel, getView } = setup();
    wheel({ deltaY: -4, ctrlKey: true });
    expect(getView().fov).toBeLessThan(60);
    expect(getView().yaw).toBe(0);
    expect(getView().pitch).toBe(0);
  });

  it('keeps the guess for the rest of a gesture', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const { wheel, getView } = setup();

    // A fast swipe: starts small, peaks above the mouse-wheel threshold.
    wheel({ deltaY: 6 });
    now += 16;
    wheel({ deltaY: 90 });
    expect(getView().fov).toBe(60);
    expect(getView().pitch).toBeLessThan(0);

    // After a pause, a big step is a mouse wheel again.
    now += 500;
    wheel({ deltaY: 100 });
    expect(getView().fov).toBeGreaterThan(60);
  });

  it('zooms on every wheel event when trackpadRotate is off', () => {
    const { wheel, getView } = setup({ trackpadRotate: false });
    wheel({ deltaX: 5, deltaY: 5 });
    expect(getView().yaw).toBe(0);
    expect(getView().pitch).toBe(0);
    expect(getView().fov).toBeGreaterThan(60);
  });

  it('leaves a swipe to the page when dragging is disabled', () => {
    const { wheel, getView } = setup({ draggable: false });
    const event = wheel({ deltaX: 5, deltaY: 5 });
    expect(getView()).toEqual({ yaw: 0, pitch: 0, fov: 60 });
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves the mouse wheel to the page when zoom is disabled, but still swipes', () => {
    const { wheel, getView } = setup({ zoom: false });
    const mouse = wheel({ deltaY: 100 });
    expect(getView().fov).toBe(60);
    expect(mouse.defaultPrevented).toBe(false);

    wheel({ deltaX: 5 });
    expect(getView().yaw).toBeGreaterThan(0);
  });
});
