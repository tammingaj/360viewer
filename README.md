# 360viewer

A lightweight, dependency-free TypeScript library that displays 360° (equirectangular) photos in the browser, with clickable hotspots that navigate to other photos, show tooltips, or trigger your own code.

- No dependencies; plain WebGL 1, so it runs on practically every browser and device
- Mouse, touch (drag and pinch), trackpad (two-finger swipe and pinch), wheel and keyboard controls, with inertia
- Hotspots are real DOM elements: style them with CSS, focus them with the keyboard, read them with a screen reader
- Cross-fade transitions between scenes, auto-rotate, animated camera moves
- Typed API and events

See it in use in a real web app: [Look Inside](https://slow.web.app/look-inside).

## Install

```bash
npm install @tamminjp/360viewer
```

Or load the UMD build with a script tag; the library is then available as `Viewer360Lib`:

```html
<script src="dist/360viewer.umd.cjs"></script>
<script>
  const viewer = new Viewer360Lib.Viewer360('#pano', { /* ... */ });
</script>
```

## Quick start

```html
<div id="pano" style="width: 100%; height: 480px"></div>
```

```ts
import { Viewer360 } from '@tamminjp/360viewer';

const viewer = new Viewer360('#pano', {
  scenes: [
    {
      id: 'hall',
      src: 'hall.jpg',
      hotspots: [
        { yaw: 40, pitch: -5, target: 'kitchen', tooltip: 'Kitchen' },
        { yaw: -80, pitch: 10, tooltip: 'Painted in 1890' },
      ],
    },
    { id: 'kitchen', src: 'kitchen.jpg' },
  ],
});

viewer.on('hotspotclick', ({ hotspot }) => console.log(hotspot.id));
```

The container needs a height; the viewer fills it. Images must be equirectangular (2:1). Images loaded from another origin need CORS headers, because WebGL can't use them otherwise.

### Angles

All angles are in degrees.

| | Meaning |
| --- | --- |
| `yaw` | Horizontal angle. 0 is the centre of the image, positive turns right. Range (-180, 180]. |
| `pitch` | Vertical angle. 0 is the horizon, +90 is straight up, -90 straight down. |
| `fov` | Vertical field of view of the camera. |

## Hotspots

```ts
interface HotspotConfig {
  id?: string;               // generated when omitted
  yaw: number;
  pitch: number;
  type?: 'scene' | 'info' | 'custom';
  target?: string;           // scene id, for type 'scene'
  targetView?: Partial<View>; // camera orientation on arrival
  tooltip?: string | HTMLElement;
  tooltipMode?: 'hover' | 'always' | 'never'; // default 'hover'
  label?: string;            // accessible label, defaults to the tooltip text
  className?: string;
  element?: HTMLElement | ((hotspot) => HTMLElement); // replaces the default marker
  data?: unknown;            // passed back to you in events
  onClick?: (hotspot, viewer) => void | boolean;
}
```

| Type | Behaviour |
| --- | --- |
| `scene` | Navigates to the scene in `target`. The default when `target` is set. |
| `info` | Shows its tooltip on hover and focus; a click or tap toggles it. The default without `target`. |
| `custom` | Does nothing by itself. Handle it with `onClick` or the `hotspotclick` event. |

`onClick` runs before the built-in behaviour. Return `false` to skip that behaviour, for example to ask for confirmation before leaving a scene.

A string `tooltip` is rendered as text, never as HTML. Pass an `HTMLElement` for rich content.

### Finding the yaw/pitch for a hotspot

The `click` event reports the yaw and pitch under the cursor:

```ts
viewer.on('click', ({ yaw, pitch }) => {
  console.log(`{ yaw: ${yaw.toFixed(1)}, pitch: ${pitch.toFixed(1)} }`);
});
```

The demo (`npm run dev`) has this built in, and can load your own photo.

## Options

```ts
new Viewer360(container, options);
```

`container` is an element or a CSS selector.

| Option | Default | Description |
| --- | --- | --- |
| `scenes` | `[]` | Scenes to register: `{ id, src, title?, view?, hotspots? }`. `src` is a URL, or an image, canvas or `ImageBitmap`. |
| `firstScene` | first in `scenes` | Id of the scene to show first. |
| `view` | `{ yaw: 0, pitch: 0, fov: 75 }` | Default view for scenes that don't set their own. |
| `minFov` / `maxFov` | `30` / `100` | Zoom limits. |
| `minPitch` / `maxPitch` | `-90` / `90` | Vertical look limits. |
| `autoRotate` | `0` | Degrees per second. 0 is off, negative turns left. |
| `autoRotateDelay` | `3000` | Milliseconds of inactivity before auto-rotation resumes. |
| `transitionDuration` | `600` | Cross-fade between scenes in ms. 0 disables it. |
| `draggable` | `true` | Drag to look around. |
| `zoom` | `true` | Wheel and pinch zoom. |
| `keyboard` | `true` | Arrow keys or WASD to look, `+` / `-` to zoom, while the viewer has focus. |
| `inertia` | `true` | Keep moving after a drag is released. |
| `dragSensitivity` | `1` | Multiplier for drag speed. |
| `trackpadRotate` | `true` | Look around with a two-finger swipe on a trackpad; pinch still zooms. `false` makes every wheel event zoom. See the note below. |
| `crossOrigin` | `'anonymous'` | `crossOrigin` attribute for images loaded from URLs. `null` leaves it unset. |
| `showLoader` | `true` | Show a spinner while an image loads. |
| `preloadLinkedScenes` | `true` | Preload the images that the current scene's hotspots link to. |
| `className` | | Extra class on the root element. |

Browsers don't report whether a wheel event comes from a mouse wheel or a trackpad, so `trackpadRotate` guesses from the size and direction of the scroll. A mouse that scrolls in very small steps (some do on macOS) can be mistaken for a trackpad and look up and down instead of zooming; set `trackpadRotate: false` if that matters more to you than the swipe.

Animated moves and the cross-fade are skipped for users who have `prefers-reduced-motion` set.

## API

### Scenes

| Method | Description |
| --- | --- |
| `addScene(config)` | Register a scene. Replaces a scene with the same id. |
| `removeScene(id)` | Remove a scene. Returns `false` for the scene on display, which can't be removed. |
| `getScene(id)`, `getScenes()`, `getCurrentScene()` | Look up scenes. |
| `loadScene(id, view?)` | Show a scene. The promise resolves once the image is loaded and rejects when it fails to load. |

### Hotspots

`sceneId` defaults to the current scene.

| Method | Description |
| --- | --- |
| `addHotspot(config, sceneId?)` | Add a hotspot. Replaces one with the same id. |
| `updateHotspot(id, changes, sceneId?)` | Change an existing hotspot, for example to move it. |
| `removeHotspot(id, sceneId?)` | Remove a hotspot. |
| `getHotspots(sceneId?)` | The hotspots of a scene. |
| `getHotspotElement(id)` | The DOM element of a hotspot in the current scene. |

### Camera

| Method | Description |
| --- | --- |
| `getView()` | Current `{ yaw, pitch, fov }`. |
| `setView(view, { duration? })` | Point the camera. With a `duration` in ms the move is animated; the promise resolves when it ends or the user interrupts it. |
| `lookAtHotspot(id, { duration?, fov? })` | Turn towards a hotspot of the current scene. |
| `setAutoRotate(speed)` | Degrees per second; 0 stops. |
| `setOptions(options)` | Change limits and interaction options at runtime. |

### Coordinates

| Method | Description |
| --- | --- |
| `getViewAt(clientX, clientY)` | The yaw/pitch under a point in viewport coordinates, such as a mouse event's. |
| `getScreenPosition(yaw, pitch)` | Where a direction appears, in pixels from the viewer's top-left: `{ x, y, visible }`. |

### Other

| Member | Description |
| --- | --- |
| `on(event, listener)` | Subscribe. Returns a function that unsubscribes. |
| `once(event, listener)`, `off(event, listener?)` | Subscribe once; unsubscribe one listener or all listeners of an event. |
| `toggleFullscreen()` | Enter or leave browser fullscreen. |
| `resize()` | Recalculate the size. Happens automatically when the element is resized. |
| `destroy()` | Remove the viewer and release its resources. |
| `element`, `canvas` | The root element and the WebGL canvas. |

The package also exports `clearImageCache()`, the math helpers `projectToScreen`, `unprojectFromScreen`, `directionFromYawPitch`, `yawPitchFromDirection` and `normalizeYaw`, and `DEFAULT_CSS`.

## Events

| Event | Payload | When |
| --- | --- | --- |
| `ready` | `{ scene }` | The first scene is on screen. |
| `loadstart` | `{ sceneId }` | An image started loading. |
| `load` | `{ sceneId }` | An image finished loading. |
| `scenechange` | `{ scene, previousScene }` | The visible scene changed. |
| `viewchange` | `{ yaw, pitch, fov }` | The camera moved. At most once per frame. |
| `hotspotclick` | `{ hotspot, scene, originalEvent }` | A hotspot was clicked or activated with the keyboard. |
| `click` | `{ yaw, pitch, originalEvent }` | The panorama itself was clicked without dragging. |
| `error` | `{ error, sceneId? }` | Something went wrong, such as an image that failed to load. |

## Styling

The default styles are injected once, at the top of `<head>`, so your own CSS wins without `!important`. The quickest way to restyle is through custom properties on `.pv-root` or any ancestor:

```css
#pano {
  --pv-accent: #ffcf4d;              /* focus rings */
  --pv-hotspot-size: 40px;
  --pv-hotspot-bg: rgba(0, 0, 0, 0.5);
  --pv-hotspot-border: #ffcf4d;      /* marker border and icon */
  --pv-tooltip-bg: #fff;
  --pv-tooltip-color: #111;
  --pv-font: Georgia, serif;
}
```

For anything else, target the classes directly:

| Class | Element |
| --- | --- |
| `.pv-root` | Root element. Also gets `.pv-dragging` and `.pv-loading`. |
| `.pv-hotspot` | A hotspot. Also `.pv-hotspot--scene`, `--info`, `--custom`, `--open` (tooltip toggled open) and your own `className`. |
| `.pv-hotspot__marker` | The default round marker. |
| `.pv-hotspot__tooltip` | The tooltip. |
| `.pv-loader` | The loading spinner. |

To replace the marker altogether, give the hotspot an `element`. The library positions it; the rest is up to you.

## Development

```bash
npm install
npm run dev        # demo at http://localhost:5173
npm test           # vitest
npm run typecheck
npm run build      # ES + UMD bundles and .d.ts files in dist/
```

## License

[MIT](LICENSE)
