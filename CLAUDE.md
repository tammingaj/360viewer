# 360viewer

A dependency-free TypeScript library that displays 360° (equirectangular) photos in the browser, with clickable hotspots that navigate to other photos, show tooltips, or trigger custom actions in the host web app.

## Architecture (src/)

- `Viewer.ts`: public `Viewer360` class. Manages scenes, hotspots, camera (yaw/pitch/fov in degrees), the render loop (renders only when something changed), cross-fade scene transitions, auto-rotate and events.
- `Renderer.ts`: raw WebGL 1 renderer. Draws one full-screen triangle; the fragment shader casts a ray per pixel and samples the equirectangular texture. No mipmaps, to avoid a seam where atan() wraps. Downscales images larger than MAX_TEXTURE_SIZE and handles context loss.
- `HotspotLayer.ts`: hotspots are DOM elements laid over the canvas, positioned each frame through `projectToScreen`, so they're CSS-styleable, keyboard-focusable and accessible.
- `Controls.ts`: pointer drag with inertia, pinch, wheel zoom, trackpad two-finger swipe to look around (told apart from a mouse wheel by a heuristic in `isTrackpadSwipe`; ctrl+wheel is a trackpad pinch), keyboard (arrows/WASD, +/-), and click-vs-drag detection.
- `math.ts`: spherical math. The shader in Renderer.ts mirrors `cameraToWorld`, so keep them in sync. Conventions: +y is up, yaw 0 / pitch 0 looks down -z, and +yaw turns right.
- `imageLoader.ts`: LRU-cached image loading and decoding.
- `styles.ts`: default CSS, injected once and overridable through `--pv-*` custom properties.
- `EventEmitter.ts`, `types.ts`, `index.ts` (public exports).

Events: ready, loadstart, load, scenechange, viewchange, hotspotclick, click (yaw/pitch of a click on the panorama, for placing hotspots), error.

Hotspot types: `scene` (navigates to `target`), `info` (tooltip, toggles on click), `custom` (handle via `onClick` or `hotspotclick`). `onClick` returning `false` skips the built-in behaviour.

## Tooling

- `npm run build`: tsc emits .d.ts, vite builds ES + UMD into dist/
- `npm run dev`: serves the demo from `demo/`
- `npm test`: vitest (jsdom), tests in `test/`
- `npm run typecheck`

## Status / next steps

The source, demo (`demo/`), tests (`test/`), README.md and LICENSE are written; typecheck, tests and build pass. The demo was checked in a desktop browser: drag direction, hotspots on their bullseyes (the demo panoramas have a degree grid, direction labels and a bullseye painted under each hotspot), the cross-fade, wheel and keyboard. Touch was only checked with synthetic pointer events. Remaining work: try the demo on a real phone or tablet (drag, pinch, tapping info hotspots).
