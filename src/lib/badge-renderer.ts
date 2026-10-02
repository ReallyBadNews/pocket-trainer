import type { ExpoWebGLRenderingContext } from 'expo-gl';
import base from '../../assets/crafted/badges/base.json';
import medal from '../../assets/crafted/badges/medal.json';
import starters from '../../assets/crafted/badges/starters.json';
import eevee from '../../assets/crafted/badges/eevee.json';
import birds from '../../assets/crafted/badges/birds.json';
import fossil from '../../assets/crafted/badges/fossil.json';
import dex from '../../assets/crafted/badges/dex.json';
import binder from '../../assets/crafted/badges/binder.json';
import type { BadgeEmblem } from './badges';
import { BADGE_FOCAL_LENGTH, badgeCameraDistance, badgeClipPlanes, badgeYawDelta, clampBadgePose, DEFAULT_BADGE_POSE, packBadgeMeshes, type BadgePose } from './badge-geometry';

const EMBLEMS = { medal, starters, eevee, birds, fossil, dex, binder };
const VERTEX = `
precision highp float;
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec3 aColor;
attribute vec2 aMaterial;
uniform vec2 uRotation;
uniform float uCamera;
uniform float uAspect;
uniform vec2 uDepth;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vColor;
varying vec2 vMaterial;
void main() {
  float x = uRotation.x, y = uRotation.y;
  mat3 rx = mat3(1.,0.,0., 0.,cos(x),sin(x), 0.,-sin(x),cos(x));
  mat3 ry = mat3(cos(y),0.,-sin(y), 0.,1.,0., sin(y),0.,cos(y));
  mat3 rotation = rx * ry;
  vPosition = rotation * aPosition;
  vNormal = rotation * aNormal;
  vColor = aColor;
  vMaterial = aMaterial;
  float distance = uCamera - vPosition.z;
  gl_Position = vec4(vPosition.x * ${BADGE_FOCAL_LENGTH.toFixed(7)} / uAspect,
    vPosition.y * ${BADGE_FOCAL_LENGTH.toFixed(7)}, uDepth.x * distance + uDepth.y, distance);
}`;

const FRAGMENT = `
precision highp float;
uniform float uCamera;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vColor;
varying vec2 vMaterial;
vec3 encodeSrgb(vec3 linear) {
  vec3 color = clamp(linear, 0., 1.);
  return mix(color * 12.92, 1.055 * pow(color, vec3(1. / 2.4)) - .055, step(vec3(.0031308), color));
}
void main() {
  vec3 normal = normalize(vNormal);
  vec3 eye = normalize(vec3(0., 0., uCamera) - vPosition);
  vec3 key = normalize(vec3(-.48, .72, 1.2));
  vec3 fill = normalize(vec3(.85, .12, .7));
  vec3 reflection = reflect(-eye, normal);
  float metal = vMaterial.x, rough = clamp(vMaterial.y, .12, .7);
  vec3 f0 = mix(vec3(.04), vColor, metal);
  vec3 fresnel = f0 + (1. - f0) * pow(1. - max(dot(normal, eye), 0.), 5.);
  float exponent = max(8., 2. / (rough * rough) - 2.);
  float keySpec = pow(max(dot(normal, normalize(key + eye)), 0.), exponent);
  float fillSpec = pow(max(dot(normal, normalize(fill + eye)), 0.), exponent);
  float hemisphere = .34 + .10 * normal.y;
  float diffuse = hemisphere + .48 * max(dot(normal, key), 0.) + .24 * max(dot(normal, fill), 0.);
  // Broad studio reflections travel across the real bevels when the user turns it.
  float softbox = pow(max(dot(reflection, key), 0.), 8.);
  float strip = pow(max(dot(reflection, fill), 0.), 18.);
  vec3 studio = vec3(.40, .43, .47) + vec3(.68, .60, .48) * softbox + vec3(.43, .55, .68) * strip;
  vec3 color = vColor * diffuse * (1. - metal) + fresnel * studio * metal;
  color += f0 * (keySpec * .55 + fillSpec * .30);
  // Vitreous enamel has a small clear coat; gold keeps its colored reflection.
  color += vec3(.055) * keySpec * (1. - metal);
  gl_FragColor = vec4(encodeSrgb(color), 1.);
}`;

export type BadgeRenderer = {
  setPose: (pose: BadgePose, animated?: boolean) => void;
  getPose: () => BadgePose;
  redraw: () => void;
  dispose: () => void;
};

/** One indexed Blender mesh and one draw call, with no rendering loop at rest. */
export function createBadgeRenderer(gl: ExpoWebGLRenderingContext, options: {
  emblem: BadgeEmblem;
  pose?: BadgePose;
  onReady: () => void;
  onError: () => void;
}): BadgeRenderer {
  let disposed = false, ready = false, failed = false, presented = false;
  let frame: number | undefined;
  let pose = clampBadgePose(options.pose ?? DEFAULT_BADGE_POSE);
  let animation: { start: number; from: BadgePose; to: BadgePose; yawDelta: number } | undefined;
  let program: WebGLProgram | null = null, vertexBuffer: WebGLBuffer | null = null, indexBuffer: WebGLBuffer | null = null;
  let mesh: ReturnType<typeof packBadgeMeshes>;
  let uniforms: Record<string, WebGLUniformLocation | null> = {};

  function fail(error: unknown) {
    if (disposed || failed) return;
    failed = true; ready = false; animation = undefined;
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    if (__DEV__) console.warn('Badge preview:', error);
    options.onError();
  }
  function compile(type: number, source: string) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Unable to prepare the badge preview.');
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Badge shader failed.');
    return shader;
  }
  function sampleAnimation() {
    if (!animation) return;
    const t = Math.min(1, Math.max(0, (performance.now() - animation.start) / 220));
    const eased = 1 - Math.pow(1 - t, 3);
    pose = t === 1 ? animation.to : {
      yaw: animation.from.yaw + animation.yawDelta * eased,
      pitch: animation.from.pitch + (animation.to.pitch - animation.from.pitch) * eased,
      zoom: animation.from.zoom + (animation.to.zoom - animation.from.zoom) * eased,
    };
    if (t === 1) animation = undefined;
  }
  function draw() {
    frame = undefined;
    if (disposed || !ready) return;
    try {
      sampleAnimation();
      const width = Math.max(1, gl.drawingBufferWidth), height = Math.max(1, gl.drawingBufferHeight);
      const aspect = width / height, camera = badgeCameraDistance(aspect, pose.zoom, mesh.radius);
      const { near, far } = badgeClipPlanes(camera, mesh.radius);
      gl.viewport(0, 0, width, height);
      gl.clearColor(37 / 255, 56 / 255, 47 / 255, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.uniform2f(uniforms.uRotation, pose.pitch, pose.yaw);
      gl.uniform1f(uniforms.uCamera, camera);
      gl.uniform1f(uniforms.uAspect, aspect);
      gl.uniform2f(uniforms.uDepth, (far + near) / (far - near), -2 * far * near / (far - near));
      gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
      gl.endFrameEXP();
      if (!presented && !disposed) { presented = true; options.onReady(); }
      if (animation && !disposed) invalidate();
    } catch (error) { fail(error); }
  }
  function invalidate() {
    if (!disposed && !failed && ready && frame === undefined) frame = requestAnimationFrame(draw);
  }
  function prepare() {
    if (disposed) return;
    try {
      mesh = packBadgeMeshes([base, EMBLEMS[options.emblem]]);
      program = gl.createProgram();
      if (!program) throw new Error('Unable to prepare the badge preview.');
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Badge program failed.');
      gl.useProgram(program);
      vertexBuffer = gl.createBuffer(); indexBuffer = gl.createBuffer();
      if (!vertexBuffer || !indexBuffer) throw new Error('Unable to upload the badge mesh.');
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
      for (const [name, count, offset] of [['aPosition', 3, 0], ['aNormal', 3, 3], ['aColor', 3, 6], ['aMaterial', 2, 9]] as const) {
        const location = gl.getAttribLocation(program, name);
        if (location < 0) throw new Error('Badge shader attribute unavailable.');
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, count, gl.FLOAT, false, mesh.stride * 4, offset * 4);
      }
      uniforms = Object.fromEntries(['uRotation', 'uCamera', 'uAspect', 'uDepth'].map(name => [name, gl.getUniformLocation(program!, name)]));
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
      ready = true; invalidate();
    } catch (error) { fail(error); }
  }
  // Let the caller retain the disposer before preparing this context.
  void Promise.resolve().then(prepare);
  return {
    getPose: () => ({ ...pose }),
    redraw: invalidate,
    setPose: (next, animated = false) => {
      if (disposed || failed) return;
      sampleAnimation();
      const to = clampBadgePose(next);
      if (to.yaw === pose.yaw && to.pitch === pose.pitch && to.zoom === pose.zoom) { animation = undefined; return; }
      animation = animated ? { start: performance.now(), from: { ...pose }, to, yawDelta: badgeYawDelta(pose.yaw, to.yaw) } : undefined;
      if (!animated) pose = to;
      invalidate();
    },
    dispose: () => {
      disposed = true; animation = undefined;
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      // GLView releases its context. Avoid queued native deletes after unmount.
    },
  };
}
