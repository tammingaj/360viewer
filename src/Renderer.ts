import { DEG } from './math';
import type { View } from './types';

type TexSource = TexImageSource;

const VERT = `
attribute vec2 aPos;
varying vec2 vNdc;
void main() {
  vNdc = aPos;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/*
 * Every pixel casts a ray from the camera, rotates it into world space and looks
 * up the matching longitude/latitude in the equirectangular texture. This gives
 * an exact projection with no sphere mesh and no pole distortion.
 */
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex0;
uniform sampler2D uTex1;
uniform float uMix;
uniform vec3 uCam0; // yaw, pitch, tan(fov / 2) of the base panorama
uniform vec3 uCam1; // same for the panorama being faded in
uniform float uAspect;
varying vec2 vNdc;
const float PI = 3.141592653589793;

vec2 equirectUv(vec3 cam) {
  vec3 d = vec3(vNdc.x * cam.z * uAspect, vNdc.y * cam.z, -1.0);
  float cp = cos(cam.y), sp = sin(cam.y);
  float y1 = d.y * cp - d.z * sp;
  float z1 = d.y * sp + d.z * cp;
  float cy = cos(cam.x), sy = sin(cam.x);
  vec3 dir = normalize(vec3(d.x * cy - z1 * sy, y1, d.x * sy + z1 * cy));
  float lon = atan(dir.x, -dir.z);
  float lat = asin(clamp(dir.y, -1.0, 1.0));
  return vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
}

void main() {
  vec4 c0 = texture2D(uTex0, equirectUv(uCam0));
  if (uMix <= 0.0) { gl_FragColor = c0; return; }
  vec4 c1 = texture2D(uTex1, equirectUv(uCam1));
  gl_FragColor = mix(c0, c1, uMix);
}`;
/** A panorama uploaded to the GPU. */
export interface PanoTexture {
  readonly width: number;
  readonly height: number;
  /** @internal */
  _tex: WebGLTexture | null;
  /** @internal kept to re-upload after a lost context */
  _source: TexSource;
}

/**
 * Low-level WebGL renderer for equirectangular panoramas.
 * Uses WebGL 1 only, so it runs on practically every browser and device.
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private gl!: WebGLRenderingContext;
  private program!: WebGLProgram;
  private uniforms!: Record<string, WebGLUniformLocation | null>;
  private textures = new Set<PanoTexture>();
  private maxTextureSize = 4096;
  private lost = false;
  private onLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
  };
  private onRestored = () => {
    this.lost = false;
    this.init();
    for (const t of this.textures) t._tex = this.upload(t._source);
    this.onContextRestored?.();
  };

  /** Called after a lost WebGL context has been restored and textures re-uploaded. */
  onContextRestored?: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.addEventListener('webglcontextlost', this.onLost, false);
    canvas.addEventListener('webglcontextrestored', this.onRestored, false);
    this.init();
  }

  private init(): void {
    const gl = this.canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      preserveDrawingBuffer: false,
      premultipliedAlpha: false,
    }) as WebGLRenderingContext | null;
    if (!gl) throw new Error('[360viewer] WebGL is not supported in this browser.');
    this.gl = gl;
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

    const program = gl.createProgram()!;
    gl.attachShader(program, this.compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, this.compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error(`[360viewer] Shader link failed: ${gl.getProgramInfoLog(program)}`);
    }
    gl.useProgram(program);
    this.program = program;

    // One triangle that covers the whole viewport.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.uniforms = {};
    for (const name of ['uTex0', 'uTex1', 'uMix', 'uCam0', 'uCam1', 'uAspect']) {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }
    gl.uniform1i(this.uniforms.uTex0, 0);
    gl.uniform1i(this.uniforms.uTex1, 1);
  }

  private compile(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      throw new Error(`[360viewer] Shader compile failed: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  }

  /** Scale the source down if it exceeds the GPU's texture size limit. */
  private fit(source: TexSource): TexSource {
    const { w, h } = sourceSize(source);
    const max = this.maxTextureSize;
    if (w <= max && h <= max) return source;
    const scale = Math.min(max / w, max / h);
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(w * scale);
    canvas.height = Math.floor(h * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  private upload(source: TexSource): WebGLTexture | null {
    const gl = this.gl;
    if (gl.isContextLost()) return null;
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
    // No mipmaps: they cause a visible seam where atan() wraps around, and
    // non-power-of-two textures can't use them in WebGL 1 anyway.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  createTexture(source: TexSource): PanoTexture {
    const fitted = this.fit(source);
    const { w, h } = sourceSize(fitted);
    const t: PanoTexture = { width: w, height: h, _tex: this.upload(fitted), _source: fitted };
    this.textures.add(t);
    return t;
  }

  deleteTexture(t: PanoTexture | null | undefined): void {
    if (!t || !this.textures.has(t)) return;
    this.textures.delete(t);
    if (t._tex && !this.gl.isContextLost()) this.gl.deleteTexture(t._tex);
    t._tex = null;
  }

  /** Match the drawing buffer to the canvas' CSS size. Returns true if it changed. */
  resize(cssWidth: number, cssHeight: number, pixelRatio: number): boolean {
    const w = Math.max(1, Math.round(cssWidth * pixelRatio));
    const h = Math.max(1, Math.round(cssHeight * pixelRatio));
    if (this.canvas.width === w && this.canvas.height === h) return false;
    this.canvas.width = w;
    this.canvas.height = h;
    return true;
  }

  /**
   * Draw a frame. When `next` is given and `mix` > 0, `next` (seen through
   * `nextView`) is cross-faded over `current` (used for scene transitions).
   */
  render(
    view: View,
    current: PanoTexture | null,
    next: PanoTexture | null = null,
    nextView: View = view,
    mix = 0,
  ): void {
    if (this.lost) return;
    const gl = this.gl;
    const { width, height } = this.canvas;
    gl.viewport(0, 0, width, height);
    if (!current?._tex) {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, current._tex);
    const useNext = !!next?._tex && mix > 0;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, useNext ? next!._tex : current._tex);
    const u = this.uniforms;
    gl.uniform1f(u.uMix, useNext ? Math.min(1, mix) : 0);
    gl.uniform3f(u.uCam0, view.yaw * DEG, view.pitch * DEG, Math.tan((view.fov * DEG) / 2));
    gl.uniform3f(
      u.uCam1,
      nextView.yaw * DEG,
      nextView.pitch * DEG,
      Math.tan((nextView.fov * DEG) / 2),
    );
    gl.uniform1f(u.uAspect, width / height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  destroy(): void {
    for (const t of [...this.textures]) this.deleteTexture(t);
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

function sourceSize(s: TexSource): { w: number; h: number } {
  if (s instanceof HTMLImageElement) return { w: s.naturalWidth, h: s.naturalHeight };
  if (typeof HTMLVideoElement !== 'undefined' && s instanceof HTMLVideoElement) {
    return { w: s.videoWidth, h: s.videoHeight };
  }
  if (typeof VideoFrame !== 'undefined' && s instanceof VideoFrame) {
    return { w: s.displayWidth, h: s.displayHeight };
  }
  const anyS = s as { width: number; height: number };
  return { w: anyS.width, h: anyS.height };
}
