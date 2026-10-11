import { describe, expect, it } from 'vitest';
import {
  cameraToWorld,
  clamp,
  directionFromYawPitch,
  easeInOutCubic,
  normalizeYaw,
  projectToScreen,
  unprojectFromScreen,
  worldToCamera,
  yawDelta,
  yawPitchFromDirection,
  type Vec3,
} from '../src/math';

const expectVec = (actual: Vec3, expected: Vec3): void => {
  for (let i = 0; i < 3; i++) expect(actual[i]).toBeCloseTo(expected[i], 9);
};

describe('clamp', () => {
  it('limits a value to the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe('normalizeYaw', () => {
  it('wraps into (-180, 180]', () => {
    expect(normalizeYaw(0)).toBeCloseTo(0);
    expect(normalizeYaw(90)).toBeCloseTo(90);
    expect(normalizeYaw(190)).toBeCloseTo(-170);
    expect(normalizeYaw(-190)).toBeCloseTo(170);
    expect(normalizeYaw(360)).toBeCloseTo(0);
    expect(normalizeYaw(725)).toBeCloseTo(5);
    expect(normalizeYaw(-725)).toBeCloseTo(-5);
  });

  it('maps both ends of the range to +180', () => {
    expect(normalizeYaw(180)).toBe(180);
    expect(normalizeYaw(-180)).toBe(180);
    expect(normalizeYaw(540)).toBe(180);
  });
});

describe('yawDelta', () => {
  it('takes the short way around', () => {
    expect(yawDelta(10, 30)).toBeCloseTo(20);
    expect(yawDelta(30, 10)).toBeCloseTo(-20);
    expect(yawDelta(170, -170)).toBeCloseTo(20);
    expect(yawDelta(-170, 170)).toBeCloseTo(-20);
  });
});

describe('directionFromYawPitch', () => {
  it('follows the conventions: -z ahead, +x right, +y up', () => {
    expectVec(directionFromYawPitch(0, 0), [0, 0, -1]);
    expectVec(directionFromYawPitch(90, 0), [1, 0, 0]);
    expectVec(directionFromYawPitch(-90, 0), [-1, 0, 0]);
    expectVec(directionFromYawPitch(180, 0), [0, 0, 1]);
    expectVec(directionFromYawPitch(0, 90), [0, 1, 0]);
    expectVec(directionFromYawPitch(0, -90), [0, -1, 0]);
  });

  it('returns unit vectors', () => {
    const [x, y, z] = directionFromYawPitch(37, -52);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
  });
});

describe('yawPitchFromDirection', () => {
  it('round-trips with directionFromYawPitch', () => {
    for (let yaw = -170; yaw <= 180; yaw += 35) {
      for (let pitch = -80; pitch <= 80; pitch += 20) {
        const back = yawPitchFromDirection(directionFromYawPitch(yaw, pitch));
        expect(back.yaw).toBeCloseTo(yaw, 8);
        expect(back.pitch).toBeCloseTo(pitch, 8);
      }
    }
  });

  it('accepts vectors that are not normalised', () => {
    const { yaw, pitch } = yawPitchFromDirection([5, 5, 0]);
    expect(yaw).toBeCloseTo(90);
    expect(pitch).toBeCloseTo(45);
  });
});

describe('cameraToWorld / worldToCamera', () => {
  it('points the camera forward axis at the view direction', () => {
    expectVec(cameraToWorld([0, 0, -1], 40, 25), directionFromYawPitch(40, 25));
    expectVec(cameraToWorld([0, 0, -1], -130, -60), directionFromYawPitch(-130, -60));
  });

  it('are inverses of each other', () => {
    const v: Vec3 = [0.3, -0.7, -1.2];
    for (const [yaw, pitch] of [[0, 0], [45, 30], [-120, -75], [180, 89]]) {
      expectVec(worldToCamera(cameraToWorld(v, yaw, pitch), yaw, pitch), v);
      expectVec(cameraToWorld(worldToCamera(v, yaw, pitch), yaw, pitch), v);
    }
  });
});

describe('projectToScreen', () => {
  const view = { yaw: 20, pitch: 10, fov: 80 };
  const width = 800;
  const height = 600;

  it('puts the view direction in the centre', () => {
    const p = projectToScreen(view.yaw, view.pitch, view, width, height);
    expect(p.visible).toBe(true);
    expect(p.x).toBeCloseTo(width / 2);
    expect(p.y).toBeCloseTo(height / 2);
  });

  it('is not mirrored: +yaw is to the right, +pitch is up', () => {
    const level = { yaw: 0, pitch: 0, fov: 80 };
    expect(projectToScreen(10, 0, level, width, height).x).toBeGreaterThan(width / 2);
    expect(projectToScreen(-10, 0, level, width, height).x).toBeLessThan(width / 2);
    expect(projectToScreen(0, 10, level, width, height).y).toBeLessThan(height / 2);
    expect(projectToScreen(0, -10, level, width, height).y).toBeGreaterThan(height / 2);
  });

  it('maps half the vertical fov to the top and bottom edges', () => {
    const level = { yaw: 0, pitch: 0, fov: 80 };
    expect(projectToScreen(0, 40, level, width, height).y).toBeCloseTo(0);
    expect(projectToScreen(0, -40, level, width, height).y).toBeCloseTo(height);
  });

  it('flags points behind the camera as not visible', () => {
    expect(projectToScreen(view.yaw + 180, -view.pitch, view, width, height).visible).toBe(false);
    expect(projectToScreen(view.yaw + 90, 0, { ...view, pitch: 0 }, width, height).visible).toBe(false);
  });

  it('works across the ±180° seam', () => {
    const p = projectToScreen(-175, 0, { yaw: 175, pitch: 0, fov: 80 }, width, height);
    expect(p.visible).toBe(true);
    expect(p.x).toBeGreaterThan(width / 2);
  });
});

describe('unprojectFromScreen', () => {
  const width = 1024;
  const height = 512;

  it('returns the view direction for the centre pixel', () => {
    const view = { yaw: -75, pitch: 33, fov: 60 };
    const { yaw, pitch } = unprojectFromScreen(width / 2, height / 2, view, width, height);
    expect(yaw).toBeCloseTo(view.yaw);
    expect(pitch).toBeCloseTo(view.pitch);
  });

  it('round-trips with projectToScreen', () => {
    for (const view of [
      { yaw: 0, pitch: 0, fov: 75 },
      { yaw: 170, pitch: 40, fov: 100 },
      { yaw: -95, pitch: -70, fov: 30 },
    ]) {
      for (const [x, y] of [[0, 0], [width, height], [300, 100], [900, 500], [512, 256]]) {
        const { yaw, pitch } = unprojectFromScreen(x, y, view, width, height);
        const p = projectToScreen(yaw, pitch, view, width, height);
        expect(p.visible).toBe(true);
        expect(p.x).toBeCloseTo(x, 6);
        expect(p.y).toBeCloseTo(y, 6);
      }
    }
  });
});

describe('easeInOutCubic', () => {
  it('starts at 0, ends at 1 and is symmetric', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeInOutCubic(0.25) + easeInOutCubic(0.75)).toBeCloseTo(1);
  });
});
