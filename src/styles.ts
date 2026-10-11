/**
 * Default styles, injected once into the document head. Everything can be
 * overridden with regular CSS; the custom properties below are the easy way.
 */
export const DEFAULT_CSS = `
.pv-root {
  --pv-accent: #ffffff;
  --pv-hotspot-size: 32px;
  --pv-hotspot-bg: rgba(20, 20, 24, 0.55);
  --pv-hotspot-border: rgba(255, 255, 255, 0.9);
  --pv-tooltip-bg: rgba(20, 20, 24, 0.88);
  --pv-tooltip-color: #fff;
  --pv-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 100%;
  min-height: 120px;
  background: #000;
  outline: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  cursor: grab;
  font-family: var(--pv-font);
  contain: strict;
}
.pv-root:focus-visible { box-shadow: inset 0 0 0 2px var(--pv-accent); }
.pv-root.pv-dragging { cursor: grabbing; }
.pv-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.pv-hotspots { position: absolute; inset: 0; pointer-events: none; }

.pv-hotspot {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: auto;
  cursor: pointer;
  will-change: transform;
  outline: none;
}
.pv-hotspot > * { transform: translate(-50%, -50%); }
.pv-hotspot > .pv-hotspot__tooltip { transform: none; }

.pv-hotspot__marker {
  display: block;
  position: absolute;
  width: var(--pv-hotspot-size);
  height: var(--pv-hotspot-size);
  border-radius: 50%;
  background: var(--pv-hotspot-bg);
  border: 2px solid var(--pv-hotspot-border);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
  transition: transform 0.15s ease, background-color 0.15s ease;
  box-sizing: border-box;
}
.pv-hotspot__marker::after {
  content: "";
  position: absolute;
  inset: 0;
  margin: auto;
  background: var(--pv-hotspot-border);
}
/* scene link: chevron pointing up ("go there") */
.pv-hotspot--scene .pv-hotspot__marker::after {
  width: 34%;
  height: 34%;
  background: none;
  border-left: 2.5px solid var(--pv-hotspot-border);
  border-top: 2.5px solid var(--pv-hotspot-border);
  transform: translateY(18%) rotate(45deg);
}
/* info: an "i" */
.pv-hotspot--info .pv-hotspot__marker::after {
  content: "i";
  background: none;
  color: var(--pv-hotspot-border);
  font: italic 700 calc(var(--pv-hotspot-size) * 0.5) / var(--pv-hotspot-size) Georgia, serif;
  text-align: center;
  inset: -2px 0 0;
}
/* custom: a dot */
.pv-hotspot--custom .pv-hotspot__marker::after { width: 30%; height: 30%; border-radius: 50%; }

.pv-hotspot:hover .pv-hotspot__marker,
.pv-hotspot:focus-visible .pv-hotspot__marker {
  transform: translate(-50%, -50%) scale(1.15);
  background: rgba(20, 20, 24, 0.8);
}
.pv-hotspot:focus-visible .pv-hotspot__marker { box-shadow: 0 0 0 3px var(--pv-accent); }

.pv-hotspot__tooltip {
  position: absolute;
  left: 0;
  bottom: calc(var(--pv-hotspot-size) / 2 + 10px);
  translate: -50% 0;
  width: max-content;
  max-width: 260px;
  padding: 7px 11px;
  border-radius: 6px;
  background: var(--pv-tooltip-bg);
  color: var(--pv-tooltip-color);
  font-size: 13px;
  line-height: 1.4;
  text-align: center;
  white-space: normal;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.15s ease, visibility 0.15s;
}
.pv-hotspot__tooltip::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 100%;
  margin-left: -6px;
  border: 6px solid transparent;
  border-top-color: var(--pv-tooltip-bg);
}
.pv-hotspot:hover .pv-hotspot__tooltip,
.pv-hotspot:focus-visible .pv-hotspot__tooltip,
.pv-hotspot--open .pv-hotspot__tooltip,
.pv-hotspot--tooltip-always .pv-hotspot__tooltip {
  opacity: 1;
  visibility: visible;
}
.pv-hotspot--open .pv-hotspot__tooltip { pointer-events: auto; }
/* out of view: the tooltip must not outlive its (visibility: hidden) hotspot */
.pv-hotspot.pv-hotspot--hidden .pv-hotspot__tooltip {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.pv-loader {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 36px;
  height: 36px;
  margin: -18px 0 0 -18px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.25);
  border-top-color: #fff;
  animation: pv-spin 0.8s linear infinite;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease;
}
.pv-root.pv-loading .pv-loader { opacity: 1; }
@keyframes pv-spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .pv-hotspot__marker, .pv-hotspot__tooltip { transition: none; }
  .pv-loader { animation-duration: 2.4s; }
}
`;

const STYLE_ID = 'pv-default-styles';

export function injectStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = DEFAULT_CSS;
  doc.head.prepend(style); // prepend so user styles win without !important
}
