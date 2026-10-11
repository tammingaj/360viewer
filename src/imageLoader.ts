import type { PanoramaSource } from './types';

type Loaded = Exclude<PanoramaSource, string>;

const MAX_CACHE = 8;
const cache = new Map<string, Promise<HTMLImageElement>>();

/**
 * Load an image URL (cached, least-recently-used). Non-string sources are
 * returned as-is once ready.
 */
export function loadPanorama(
  src: PanoramaSource,
  crossOrigin: '' | 'anonymous' | 'use-credentials' | null = 'anonymous',
): Promise<Loaded> {
  if (typeof src !== 'string') {
    if (src instanceof HTMLImageElement && !src.complete) return waitForImage(src);
    return Promise.resolve(src);
  }
  const key = `${crossOrigin ?? ''}|${src}`;
  const hit = cache.get(key);
  if (hit) {
    // refresh LRU position
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const img = new Image();
  if (crossOrigin !== null) img.crossOrigin = crossOrigin;
  img.decoding = 'async';
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`[360viewer] Failed to load image: ${src}`));
  }).then(async (loaded) => {
    // Decode off the main thread where supported, so upload doesn't stall.
    try {
      await loaded.decode();
    } catch {
      /* decode() can reject for valid images in some browsers; onload is enough */
    }
    return loaded;
  });
  promise.catch(() => cache.delete(key));
  img.src = src;
  cache.set(key, promise);
  while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string);
  return promise;
}

function waitForImage(img: HTMLImageElement): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    img.addEventListener('load', () => resolve(img), { once: true });
    img.addEventListener('error', () => reject(new Error('[360viewer] Failed to load image')), {
      once: true,
    });
  });
}

/** Remove all cached images (e.g. to free memory). */
export function clearImageCache(): void {
  cache.clear();
}
