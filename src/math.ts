/**
 * Spherical math shared by the renderer (via the shader, which mirrors these
 * formulas) and the hotspot layer.
 *
 * World space: right-handed, +y up, the camera at yaw 0 / pitch 0 looks down -z.
 */

export const DEG = Math.PI / 180;

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

/** Wrap an angle in degrees into (-180, 180]. */
export function normalizeYaw(yaw: number): number {
  let y = ((yaw + 180) % 360 + 360) % 360 - 180;
  if (y === -180) y = 180;
  return y;
}

/** Shortest signed difference `to - from` in degrees, in (-180, 180]. */
export function yawDelta(from: number, to: number): number {
  return normalizeYaw(to - from);
}

export type Vec3 = [number, number, number];

/** Unit direction vector for a yaw/pitch (degrees). */
export function directionFromYawPitch(yaw: number, pitch: number): Vec3 {
  const y = yaw * DEG;
  const p = pitch * DEG;
  const cp = Math.cos(p);
  return [cp * Math.sin(y), Math.sin(p), -cp * Math.cos(y)];
}

/** Yaw/pitch (degrees) of a direction vector. */
export function yawPitchFromDirection([x, y, z]: Vec3): { yaw: number; pitch: number } {
  const len = Math.hypot(x, y, z) || 1;
  return {
    yaw: normalizeYaw(Math.atan2(x, -z) / DEG),
    pitch: Math.asin(clamp(y / len, -1, 1)) / DEG,
  };
}

/** Rotate a camera-space vector into world space for the given camera yaw/pitch. */
export function cameraToWorld([x, y, z]: Vec3, yaw: number, pitch: number): Vec3 {
  const p = pitch * DEG;
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  // pitch: rotate around X
  const y1 = y * cp - z * sp;
  const z1 = y * sp + z * cp;
  const yw = yaw * DEG;
  const cy = Math.cos(yw);
  const sy = Math.sin(yw);
  // yaw: rotate around Y (clockwise seen from above, so +yaw turns right)
  return [x * cy - z1 * sy, y1, x * sy + z1 * cy];
}

/** Inverse of {@link cameraToWorld}. */
export function worldToCamera([x, y, z]: Vec3, yaw: number, pitch: number): Vec3 {
  const yw = yaw * DEG;
  const cy = Math.cos(yw);
  const sy = Math.sin(yw);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const p = pitch * DEG;
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  return [x1, y * cp + z1 * sp, -y * sp + z1 * cp];
}

export interface ScreenPoint {
  /** Pixels from the left of the viewport. */
  x: number;
  /** Pixels from the top of the viewport. */
  y: number;
  /** False when the point is behind the camera. */
  visible: boolean;
}

/**
 * Project a yaw/pitch onto the screen (rectilinear projection).
 * `fov` is the vertical field of view in degrees.
 */
export function projectToScreen(
  yaw: number,
  pitch: number,
  view: { yaw: number; pitch: number; fov: number },
  width: number,
  height: number,
): ScreenPoint {
  const [cx, cy, cz] = worldToCamera(directionFromYawPitch(yaw, pitch), view.yaw, view.pitch);
  if (cz >= -1e-6) return { x: NaN, y: NaN, visible: false };
  const t = Math.tan((view.fov * DEG) / 2);
  const aspect = width / height;
  const ndcX = cx / -cz / (t * aspect);
  const ndcY = cy / -cz / t;
  return {
    x: (ndcX + 1) * 0.5 * width,
    y: (1 - ndcY) * 0.5 * height,
    visible: true,
  };
}

/** Inverse of {@link projectToScreen}: the yaw/pitch under a screen pixel. */
export function unprojectFromScreen(
  x: number,
  y: number,
  view: { yaw: number; pitch: number; fov: number },
  width: number,
  height: number,
): { yaw: number; pitch: number } {
  const t = Math.tan((view.fov * DEG) / 2);
  const aspect = width / height;
  const ndcX = (x / width) * 2 - 1;
  const ndcY = 1 - (y / height) * 2;
  const dir = cameraToWorld([ndcX * t * aspect, ndcY * t, -1], view.yaw, view.pitch);
  return yawPitchFromDirection(dir);
}

/** Smooth ease-in-out used for animated camera moves. */
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
