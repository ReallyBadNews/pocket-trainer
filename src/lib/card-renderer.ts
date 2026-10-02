import type { ExpoWebGLRenderingContext } from 'expo-gl';
import model from '../../assets/crafted/card-model.json';
import { clampCardPose, DEFAULT_CARD_POSE, surfaceUniform, type CardPose, type CardSurface } from './card-inspection';
import { loadCardTexture, type CardTextureImage } from './card-texture';

const VERTEX = `
precision highp float;
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aUv;
attribute float aSurface;
uniform vec2 uRotation;
uniform float uCamera;
uniform float uAspect;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying float vSurface;
void main() {
  float x = uRotation.x, y = uRotation.y;
  mat3 rx = mat3(1.,0.,0., 0.,cos(x),sin(x), 0.,-sin(x),cos(x));
  mat3 ry = mat3(cos(y),0.,-sin(y), 0.,1.,0., sin(y),0.,cos(y));
  mat3 rotation = rx * ry;
  vPosition = rotation * aPosition;
  vNormal = rotation * aNormal;
  vUv = aUv;
  vSurface = aSurface;
  float distance = uCamera - vPosition.z;
  // 32-degree lens, 1 mm near plane, 1000 mm far plane.
  gl_Position = vec4(vPosition.x * 3.4874 / uAspect, vPosition.y * 3.4874,
    1.002002 * distance - 2.002002, distance);
}`;

const FRAGMENT = `
precision highp float;
uniform sampler2D uFront;
uniform sampler2D uBack;
uniform float uHasBack;
uniform float uFinish;
uniform float uCamera;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying float vSurface;
float artworkMask(vec2 uv) {
  vec2 low = smoothstep(vec2(.09, .46), vec2(.10, .47), uv);
  vec2 high = 1. - smoothstep(vec2(.90, .84), vec2(.91, .85), uv);
  return low.x * low.y * high.x * high.y;
}
void main() {
  vec3 normal = normalize(vNormal);
  vec3 eye = normalize(vec3(0., 0., uCamera) - vPosition);
  vec3 light = normalize(vec3(-.45, .7, 1.2));
  vec3 halfway = normalize(light + eye);
  bool front = vSurface < .5;
  bool back = vSurface > .5 && vSurface < 1.5;
  vec3 color = front ? texture2D(uFront, vUv).rgb :
    back && uHasBack > .5 ? texture2D(uBack, vUv).rgb : vec3(.75, .77, .70);
  if (!front && !back) {
    // The card's thin paper edge catches light without a plastic frame.
    color *= .5 + .45 * max(dot(normal, light), 0.);
  } else {
    float coat = pow(max(dot(normal, halfway), 0.), 42.);
    color = mix(color, vec3(1.), coat * .065);
    if (front && uFinish > .5) {
      float mask = uFinish < 1.5 ? 1. : uFinish < 2.5 ? artworkMask(vUv) : 1. - artworkMask(vUv);
      // View-dependent diffraction, not a looping rainbow on top of the image.
      vec3 reflection = reflect(-eye, normal);
      float phase = dot(vUv, vec2(1.2, .7)) + reflection.x * 1.8 + reflection.y * 1.1;
      vec3 spectrum = .5 + .5 * cos(6.283185 * (phase + vec3(0., .33, .67)));
      float band = pow(.5 + .5 * sin(phase * 8.), 3.);
      float glint = pow(max(dot(normal, halfway), 0.), 16.);
      vec3 foil = 1. - (1. - color) * (1. - spectrum * .65);
      color = mix(color, foil, mask * (.04 + band * .38 + glint * .12));
      color = mix(color, vec3(1.), mask * coat * .12);
    }
  }
  gl_FragColor = vec4(color, 1.);
}`;

export type CardRenderer = {
  setPose: (pose: CardPose, animated?: boolean) => void;
  getPose: () => CardPose;
  dispose: () => void;
};

/** A single Blender mesh, two textures, one draw call. It renders only on change. */
export function createCardRenderer(gl: ExpoWebGLRenderingContext, options: {
  frontSources: string[];
  backSource?: number;
  surface: CardSurface;
  pose?: CardPose;
  onReady: (hasBack: boolean) => void;
  onError: () => void;
}): CardRenderer {
  let disposed = false;
  let frame: number | undefined;
  let ready = false;
  let pose = clampCardPose(options.pose ?? DEFAULT_CARD_POSE);
  let animation: { start: number; from: CardPose; to: CardPose } | undefined;
  let buffer: WebGLBuffer | null = null, program: WebGLProgram | null = null;
  let uniforms: Record<string, WebGLUniformLocation | null> = {};

  function compile(type: number, source: string) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Unable to prepare the card preview.');
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Card shader failed.');
    return shader;
  }
  function upload(image: CardTextureImage) {
    const texture = gl.createTexture();
    if (!texture) throw new Error('Unable to load the card texture.');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // On iOS/Android Expo accepts {localUri}; on web this is a decoded image.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image as TexImageSource);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('The card image could not be uploaded.');
    return texture;
  }
  function draw() {
    frame = undefined;
    if (disposed || !ready) return;
    if (animation) {
      const t = Math.min(1, Math.max(0, (performance.now() - animation.start) / 220));
      const eased = 1 - Math.pow(1 - t, 3);
      pose = { yaw: animation.from.yaw + (animation.to.yaw - animation.from.yaw) * eased,
        pitch: animation.from.pitch + (animation.to.pitch - animation.from.pitch) * eased,
        zoom: animation.from.zoom + (animation.to.zoom - animation.from.zoom) * eased };
      if (t === 1) animation = undefined;
    }
    const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    const aspect = width / Math.max(1, height);
    const camera = Math.max(88, 63 / aspect) * 3.4874 * .61 / pose.zoom;
    gl.viewport(0, 0, width, height);
    gl.clearColor(37 / 255, 56 / 255, 47 / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniform2f(uniforms.uRotation, pose.pitch, pose.yaw);
    gl.uniform1f(uniforms.uCamera, camera);
    gl.uniform1f(uniforms.uAspect, aspect);
    gl.drawArrays(gl.TRIANGLES, 0, model.vertices.length / model.stride);
    gl.endFrameEXP();
    if (animation) frame = requestAnimationFrame(draw);
  }
  function invalidate() { if (!disposed && frame === undefined) frame = requestAnimationFrame(draw); }
  async function frontImage() {
    for (const source of options.frontSources) {
      if (disposed) return;
      try { return await loadCardTexture(source); } catch { /* Try catalog/local fallback. */ }
    }
    throw new Error('Card artwork unavailable.');
  }
  async function prepare() {
    try {
      const [front, back] = await Promise.all([frontImage(), options.backSource ? loadCardTexture(options.backSource).catch(() => undefined) : undefined]);
      if (disposed || !front) return;
      program = gl.createProgram();
      if (!program) throw new Error('Unable to prepare the card preview.');
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Card program failed.');
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(model.vertices), gl.STATIC_DRAW);
      for (const [name, count, offset] of [['aPosition', 3, 0], ['aNormal', 3, 3], ['aUv', 2, 6], ['aSurface', 1, 8]] as const) {
        const location = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, count, gl.FLOAT, false, model.stride * 4, offset * 4);
      }
      uniforms = Object.fromEntries(['uRotation', 'uCamera', 'uAspect', 'uFront', 'uBack', 'uFinish', 'uHasBack'].map(name => [name, gl.getUniformLocation(program!, name)]));
      gl.activeTexture(gl.TEXTURE0); upload(front); gl.uniform1i(uniforms.uFront, 0);
      gl.activeTexture(gl.TEXTURE1); upload(back ?? front); gl.uniform1i(uniforms.uBack, 1);
      gl.uniform1f(uniforms.uHasBack, back ? 1 : 0);
      gl.uniform1f(uniforms.uFinish, surfaceUniform(options.surface));
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
      ready = true; invalidate(); options.onReady(!!back);
    } catch (error) {
      if (!disposed) { if (__DEV__) console.warn('Card preview:', error); options.onError(); }
    }
  }
  void prepare();
  return {
    getPose: () => ({ ...pose }),
    setPose: (next, animated = false) => {
      const to = clampCardPose(next);
      animation = animated ? { start: performance.now(), from: { ...pose }, to } : undefined;
      if (!animated) pose = to;
      invalidate();
    },
    dispose: () => {
      disposed = true;
      if (frame !== undefined) cancelAnimationFrame(frame);
      // GLView owns its context and releases GPU resources when it unmounts.
      animation = undefined;
    },
  };
}
