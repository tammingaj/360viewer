import { Viewer360, type HotspotConfig } from '../src/index';

// ------------------------------------------------------------ panoramas
// The panoramas are painted on a canvas so the demo works offline. They carry
// a degree grid and direction labels, which makes it easy to see that the
// image isn't mirrored and that hotspots stay glued to their spot.

const W = 2048;
const H = 1024;
const px = (yaw: number): number => (yaw / 360 + 0.5) * W;
const py = (pitch: number): number => (0.5 - pitch / 180) * H;

interface Palette {
  skyTop: string;
  skyHorizon: string;
  groundHorizon: string;
  groundBottom: string;
  grid: string;
  text: string;
}

type Decorate = (ctx: CanvasRenderingContext2D) => void;

function paintPanorama(
  palette: Palette,
  targets: Array<{ yaw: number; pitch: number }>,
  decorate: Decorate,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const sky = ctx.createLinearGradient(0, 0, 0, H / 2);
  sky.addColorStop(0, palette.skyTop);
  sky.addColorStop(1, palette.skyHorizon);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H / 2);
  const ground = ctx.createLinearGradient(0, H / 2, 0, H);
  ground.addColorStop(0, palette.groundHorizon);
  ground.addColorStop(1, palette.groundBottom);
  ctx.fillStyle = ground;
  ctx.fillRect(0, H / 2, W, H / 2);

  decorate(ctx);

  // Grid: a meridian and a parallel every 30°.
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let yaw = -180; yaw <= 180; yaw += 30) {
    ctx.moveTo(px(yaw), 0);
    ctx.lineTo(px(yaw), H);
  }
  for (let pitch = -60; pitch <= 60; pitch += 30) {
    ctx.moveTo(0, py(pitch));
    ctx.lineTo(W, py(pitch));
  }
  ctx.stroke();

  // Labels. ±180° is drawn on both edges so it also shows the seam is clean.
  ctx.fillStyle = palette.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const names: Record<number, string> = { 0: 'FRONT', 90: 'RIGHT', 180: 'BACK', [-90]: 'LEFT', [-180]: 'BACK' };
  for (let yaw = -180; yaw <= 180; yaw += 30) {
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillText(`${yaw === -180 ? 180 : yaw}°`, px(yaw), py(-7));
    const name = names[yaw];
    if (name) {
      ctx.font = '700 44px system-ui, sans-serif';
      ctx.fillText(name, px(yaw), py(9));
    }
  }

  // A bullseye under every hotspot.
  ctx.strokeStyle = palette.text;
  ctx.lineWidth = 3;
  for (const t of targets) {
    for (const r of [10, 22, 34]) {
      ctx.beginPath();
      ctx.arc(px(t.yaw), py(t.pitch), r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  return canvas;
}

/** Small deterministic PRNG so the night sky looks the same on every load. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function glow(ctx: CanvasRenderingContext2D, yaw: number, pitch: number, radius: number, color: string): void {
  const x = px(yaw);
  const y = py(pitch);
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color);
  g.addColorStop(0.25, color);
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

const dayHotspots: HotspotConfig[] = [
  { id: 'to-night', yaw: 40, pitch: -5, target: 'night', targetView: { yaw: -140 }, tooltip: 'Go to the night scene' },
  {
    id: 'sun-info',
    yaw: -30,
    pitch: 12,
    type: 'info',
    tooltip: 'An info hotspot. Hover or focus shows this tooltip; a click or tap keeps it open.',
  },
  {
    id: 'spin',
    yaw: 120,
    pitch: 0,
    type: 'custom',
    tooltip: 'Custom action: turn around',
    onClick: (_hotspot, viewer) => {
      void viewer.setView({ yaw: viewer.getView().yaw + 180 }, { duration: 1200 });
    },
  },
];

const nightHotspots: HotspotConfig[] = [
  { id: 'to-day', yaw: -140, pitch: -5, target: 'day', targetView: { yaw: 40 }, tooltip: 'Back to the day scene' },
  { id: 'moon-info', yaw: 60, pitch: 40, type: 'info', tooltip: 'The moon', tooltipMode: 'always' },
  {
    id: 'pin',
    yaw: -20,
    pitch: -15,
    type: 'custom',
    label: 'Custom element hotspot',
    element: () => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'pin';
      el.textContent = 'Custom element';
      return el;
    },
  },
];

const day = paintPanorama(
  {
    skyTop: '#2f6fc4',
    skyHorizon: '#cfe6f7',
    groundHorizon: '#8fbf6a',
    groundBottom: '#2f5d2a',
    grid: 'rgba(255, 255, 255, 0.35)',
    text: '#10233b',
  },
  dayHotspots,
  (ctx) => glow(ctx, -60, 40, 110, 'rgba(255, 244, 200, 1)'),
);

const night = paintPanorama(
  {
    skyTop: '#05060f',
    skyHorizon: '#27305c',
    groundHorizon: '#1b2133',
    groundBottom: '#07080d',
    grid: 'rgba(140, 170, 255, 0.3)',
    text: '#dfe6ff',
  },
  nightHotspots,
  (ctx) => {
    const random = mulberry32(360);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 500; i++) {
      const x = random() * W;
      const y = random() * (H / 2 - 12);
      ctx.globalAlpha = 0.35 + random() * 0.65;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
    glow(ctx, 60, 40, 60, 'rgba(240, 240, 255, 1)');
  },
);

// ------------------------------------------------------------ viewer

const viewer = new Viewer360('#pano', {
  scenes: [
    { id: 'day', title: 'Day', src: day, hotspots: dayHotspots },
    { id: 'night', title: 'Night', src: night, hotspots: nightHotspots },
  ],
});

// Handy for poking at the API from the browser console.
(window as unknown as { viewer: Viewer360 }).viewer = viewer;

// ------------------------------------------------------------ UI

const $ = <T extends HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
const sceneButtons = $<HTMLDivElement>('#scenes');
const logList = $<HTMLUListElement>('#log');
const hud = $<HTMLDivElement>('#hud');
const dropCheckbox = $<HTMLInputElement>('#drop');
const fileInput = $<HTMLInputElement>('#file');
const autoRotateButton = $<HTMLButtonElement>('#autorotate');

// On a phone the panel would cover most of the panorama, so start collapsed.
if (window.innerWidth < 640) $<HTMLDetailsElement>('.panel').open = false;

function log(text: string): void {
  const li = document.createElement('li');
  li.textContent = text;
  logList.prepend(li);
  while (logList.childElementCount > 30) logList.lastElementChild!.remove();
  console.log(`[demo] ${text}`);
}

function renderSceneButtons(): void {
  sceneButtons.replaceChildren(
    ...viewer.getScenes().map((scene) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = scene.title ?? scene.id;
      button.setAttribute('aria-pressed', String(scene === viewer.getCurrentScene()));
      button.addEventListener('click', () => {
        viewer.loadScene(scene.id).catch(() => {
          /* logged through the 'error' event */
        });
      });
      return button;
    }),
  );
}
renderSceneButtons();

viewer.on('ready', ({ scene }) => log(`ready: ${scene.id}`));
viewer.on('scenechange', ({ scene, previousScene }) => {
  renderSceneButtons();
  log(`scenechange: ${previousScene?.id ?? '(none)'} → ${scene.id}`);
});
viewer.on('hotspotclick', ({ hotspot }) => log(`hotspotclick: ${hotspot.id} (${hotspot.type})`));
viewer.on('error', ({ error, sceneId }) => {
  log(`error${sceneId ? ` in ${sceneId}` : ''}: ${error instanceof Error ? error.message : String(error)}`);
});

const showView = ({ yaw, pitch, fov }: { yaw: number; pitch: number; fov: number }): void => {
  hud.textContent = `yaw ${yaw.toFixed(1)}°  pitch ${pitch.toFixed(1)}°  fov ${fov.toFixed(0)}°`;
};
viewer.on('viewchange', showView);
showView(viewer.getView());

// Authoring helper: the logged line can be pasted straight into a hotspot config.
viewer.on('click', ({ yaw, pitch }) => {
  const position = `yaw: ${yaw.toFixed(1)}, pitch: ${pitch.toFixed(1)}`;
  log(`{ ${position} }`);
  if (dropCheckbox.checked) {
    viewer.addHotspot({ yaw, pitch, type: 'info', tooltip: position });
  }
});

let photoCount = 0;
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const id = `photo-${++photoCount}`;
  viewer.addScene({ id, title: file.name, src: URL.createObjectURL(file) });
  renderSceneButtons();
  viewer.loadScene(id).catch(() => {
    /* logged through the 'error' event */
  });
  fileInput.value = '';
});

autoRotateButton.addEventListener('click', () => {
  const on = autoRotateButton.getAttribute('aria-pressed') !== 'true';
  autoRotateButton.setAttribute('aria-pressed', String(on));
  viewer.setAutoRotate(on ? 8 : 0);
});

$<HTMLButtonElement>('#fullscreen').addEventListener('click', () => {
  void viewer.toggleFullscreen();
});
