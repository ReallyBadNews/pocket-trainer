const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_BADGE_POSE, BADGE_FOCAL_LENGTH, BADGE_VERTEX_STRIDE,
  clampBadgePose, flippedBadgePose, isBadgeBackVisible, badgeCameraDistance, badgeClipPlanes, badgeYawDelta,
  packBadgeMeshes, srgbChannelToLinear,
} = require('../.test-build/lib/badge-geometry');
const names = ['medal', 'starters', 'eevee', 'birds', 'fossil', 'dex', 'binder'];
const base = require('../assets/crafted/badges/base.json');
const symbols = Object.fromEntries(names.map(name => [name, require(`../assets/crafted/badges/${name}.json`)]));

test('all crafted badges have complete finite geometry, unit normals and valid local palettes', () => {
  let bytes = 0;
  for (const [name, mesh] of Object.entries({ base, ...symbols })) {
    assert.equal(mesh.version, 1, name);
    assert.equal(mesh.stride, 7, name);
    assert.equal(mesh.colorSpace, 'srgb', name);
    assert.equal(mesh.vertices.length % mesh.stride, 0, name);
    assert.equal(mesh.indices.length, mesh.triangleCount * 3, name);
    assert.ok(mesh.indices.every(index => Number.isInteger(index) && index >= 0 && index < mesh.vertices.length / 7), name);
    const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
    let radius = 0;
    for (let index = 0; index < mesh.vertices.length; index += 7) {
      const vertex = mesh.vertices.slice(index, index + 7);
      assert.ok(vertex.every(Number.isFinite), name);
      assert.ok(Math.abs(Math.hypot(...vertex.slice(3, 6)) - 1) < 1e-4, name);
      assert.ok(Number.isInteger(vertex[6]) && vertex[6] >= 0 && vertex[6] < mesh.materials.length, name);
      radius = Math.max(radius, Math.hypot(...vertex.slice(0, 3)));
      for (let axis = 0; axis < 3; axis++) {
        minimum[axis] = Math.min(minimum[axis], vertex[axis]);
        maximum[axis] = Math.max(maximum[axis], vertex[axis]);
      }
    }
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(Math.abs(minimum[axis] - mesh.bounds.min[axis]) < 2e-5, name);
      assert.ok(Math.abs(maximum[axis] - mesh.bounds.max[axis]) < 2e-5, name);
    }
    assert.ok(Math.abs(radius - mesh.bounds.radius) < 2e-5, name);
    assert.ok(radius < 1.2, name);
    for (const material of mesh.materials) {
      assert.equal(material.color.length, 3, name);
      assert.ok([...material.color, material.metalness, material.roughness].every(value => Number.isFinite(value) && value >= 0 && value <= 1), name);
    }
    if (name !== 'base') assert.ok(mesh.triangleCount + base.triangleCount < 4000, name);
    bytes += Buffer.byteLength(JSON.stringify(mesh));
  }
  assert.ok(bytes < 1_000_000, `The complete badge family uses ${bytes} bytes`);
  assert.ok(base.bounds.min[2] < -.2, 'A real pin projects behind the badge body');
  assert.ok(base.bounds.max[2] > .1, 'The front bezel has physical depth');
});

test('every emblem combines with the base without index overflow or lost detail', () => {
  for (const name of names) {
    const symbol = symbols[name], packed = packBadgeMeshes([base, symbol]);
    const offset = base.vertices.length / 7;
    assert.equal(packed.stride, BADGE_VERTEX_STRIDE);
    assert.ok(packed.vertices instanceof Float32Array);
    assert.ok(packed.indices instanceof Uint16Array);
    assert.equal(packed.vertices.length / packed.stride, offset + symbol.vertices.length / 7);
    assert.equal(packed.indices.length, base.indices.length + symbol.indices.length);
    assert.deepEqual(Array.from(packed.indices.slice(0, base.indices.length)), base.indices);
    assert.deepEqual(Array.from(packed.indices.slice(base.indices.length)), symbol.indices.map(index => index + offset));
    assert.ok(packed.indices.every(index => index < packed.vertices.length / packed.stride));
    assert.ok(packed.vertices.every(Number.isFinite));
    assert.equal(packed.radius, Math.max(base.bounds.radius, symbol.bounds.radius));
  }
});

test('the discovery medal uses red upper and ivory lower enamel at the same surface height', () => {
  const vertices = symbols.medal.vertices;
  let red = 0, ivory = 0;
  for (let index = 0; index < vertices.length; index += 7) {
    const vertex = vertices.slice(index, index + 7);
    if (Math.abs(vertex[2] - .139) > 1e-5 || vertex[5] < .999) continue;
    if (vertex[6] === 9) { red++; assert.ok(vertex[1] >= -1e-5, 'Red enamel stays above the equator'); }
    else if (vertex[6] === 3) { ivory++; assert.ok(vertex[1] <= 1e-5, 'Ivory enamel stays below the equator'); }
    else assert.fail('Unexpected material in the Poké Ball enamel face');
  }
  assert.ok(red >= 20 && ivory >= 20, 'Both physical hemispheres are present');
});

const triangle = color => ({
  stride: 7,
  vertices: [0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0],
  indices: [0, 1, 2], materials: [{ color, metalness: .9, roughness: .2 }], bounds: { radius: 1 },
});
test('mesh packing keeps local palette IDs separate and supplies linear-light colors', () => {
  const packed = packBadgeMeshes([triangle([1, 0, 0]), triangle([0, .5, 1])]);
  assert.deepEqual(Array.from(packed.indices), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(Array.from(packed.vertices.slice(6, 9)), [1, 0, 0]);
  const blue = 3 * packed.stride + 6;
  assert.equal(packed.vertices[blue], 0);
  assert.ok(Math.abs(packed.vertices[blue + 1] - .21404114048223255) < 1e-7);
  assert.equal(packed.vertices[blue + 2], 1);
  assert.ok(Math.abs(packed.vertices[blue + 3] - .9) < 1e-7);
  assert.ok(Math.abs(packed.vertices[blue + 4] - .2) < 1e-7);
  assert.equal(srgbChannelToLinear(0), 0);
  assert.equal(srgbChannelToLinear(1), 1);
  assert.ok(Math.abs(srgbChannelToLinear(.04045) - .0031308049535603713) < 1e-12);
});

test('invalid mesh data is rejected before it can reach unchecked native GL calls', () => {
  const mesh = triangle([1, 0, 0]);
  assert.throws(() => packBadgeMeshes([{ ...mesh, indices: [0, 1, 3] }]), /triangle index/);
  assert.throws(() => packBadgeMeshes([{ ...mesh, indices: [0, 1, -1] }]), /triangle index/);
  assert.throws(() => packBadgeMeshes([{ ...mesh, stride: 8 }]), /layout/);
  assert.throws(() => packBadgeMeshes([{ ...mesh, bounds: { radius: NaN } }]), /bounds/);
  assert.throws(() => packBadgeMeshes([triangle([1, NaN, 0])]), /material/);
  const vertices = [...mesh.vertices]; vertices[6] = 20;
  assert.throws(() => packBadgeMeshes([{ ...mesh, vertices }]), /material/);
  assert.throws(() => packBadgeMeshes([{ ...mesh, vertices: new Array(65_537 * 7).fill(0) }]), /16-bit/);
});

test('gestures retain full revolutions while limiting pitch and magnification', () => {
  assert.deepEqual(clampBadgePose({ yaw: NaN, pitch: Infinity, zoom: NaN }), { yaw: 0, pitch: 0, zoom: 1 });
  assert.deepEqual(clampBadgePose({ yaw: 100, pitch: 7, zoom: 20 }), { yaw: 100, pitch: .75, zoom: 1.6 });
  assert.deepEqual(clampBadgePose({ yaw: -100, pitch: -7, zoom: 0 }), { yaw: -100, pitch: -.75, zoom: 1 });
  assert.equal(isBadgeBackVisible(DEFAULT_BADGE_POSE), false);
  assert.equal(isBadgeBackVisible({ yaw: Math.PI, pitch: .75, zoom: 1 }), true);
  assert.equal(isBadgeBackVisible({ yaw: 2 * Math.PI, pitch: -.75, zoom: 1 }), false);
});

test('flip changes faces by the shortest path even after multiple revolutions and at edge-on angles', () => {
  for (const yaw of [-100 * Math.PI - .3, -12, -3 * Math.PI / 2, -Math.PI, -Math.PI / 2, -1.2, 0, 1.2, Math.PI / 2, Math.PI, 3 * Math.PI / 2, 12, 100 * Math.PI + .3]) {
    const pose = { yaw, pitch: .4, zoom: 1.5 }, flipped = flippedBadgePose(pose);
    assert.notEqual(isBadgeBackVisible(flipped), isBadgeBackVisible(pose), String(yaw));
    assert.ok(Math.abs(flipped.yaw - yaw) <= Math.PI + 1e-12, String(yaw));
    assert.equal(flipped.pitch, 0);
    assert.equal(flipped.zoom, 1.5);
  }
});

test('animated half-turns retain a deterministic direction and reset avoids extra revolutions', () => {
  for (const offset of [-100 * Math.PI, -Math.PI, 0, Math.PI, 100 * Math.PI]) {
    assert.equal(badgeYawDelta(offset, offset + Math.PI), Math.PI);
    assert.equal(badgeYawDelta(offset, offset - Math.PI), -Math.PI);
  }
  assert.equal(flippedBadgePose({ yaw: Math.PI, pitch: 0, zoom: 1 }).yaw, 2 * Math.PI);
  assert.equal(flippedBadgePose({ yaw: -Math.PI, pitch: 0, zoom: 1 }).yaw, 0);
  assert.ok(Math.abs(badgeYawDelta(20 * Math.PI + .5, -.22) + .72) < 1e-12);
  assert.ok(Math.abs(badgeYawDelta(0, 2 * Math.PI)) < 1e-12);
});

test('camera fits the entire bounding sphere at any rotation in narrow and wide viewports', () => {
  const radius = base.bounds.radius;
  for (const aspect of [.25, .5, .8, 1, 1.8, 4]) {
    const camera = badgeCameraDistance(aspect, 1, radius);
    const projectedRadius = radius * BADGE_FOCAL_LENGTH / Math.sqrt(camera * camera - radius * radius);
    assert.ok(projectedRadius / Math.min(aspect, 1) <= .82 + 1e-12, String(aspect));
    assert.ok(camera - radius > .04, 'The near plane remains in front of the nearest surface');
    const zoomed = badgeCameraDistance(aspect, 1.6, radius);
    assert.ok(zoomed < camera && zoomed > radius + .04);
  }
  assert.equal(badgeCameraDistance(2), badgeCameraDistance(1), 'Wide viewports fit the vertical axis');
  assert.ok(badgeCameraDistance(.5) > badgeCameraDistance(1), 'Narrow viewports fit the horizontal axis');
  assert.equal(badgeCameraDistance(NaN), badgeCameraDistance(1));
  assert.equal(badgeCameraDistance(0), badgeCameraDistance(1));
  assert.equal(badgeCameraDistance(1, Infinity), badgeCameraDistance(1));
  assert.ok(Math.abs(badgeCameraDistance(1, 1, radius * 2) / badgeCameraDistance(1, 1, radius) - 2) < 1e-12);
});

test('tight clip planes retain every rotated surface and resolve layered enamel on a 16-bit depth buffer', () => {
  const radius = base.bounds.radius;
  for (const aspect of [.25, .8, 1, 2, 4]) for (const zoom of [1, 1.6]) {
    const camera = badgeCameraDistance(aspect, zoom, radius), { near, far } = badgeClipPlanes(camera, radius);
    assert.ok(near > 0 && near < camera - radius);
    assert.ok(far > camera + radius);
    assert.ok(far / near < 3, 'Useful depth range stays close to the object');
    const depth = distance => far / (far - near) - far * near / ((far - near) * distance);
    const farthest = camera + radius;
    // The discovery disk sits 0.020 units above its ivory foundation.
    assert.ok((depth(farthest) - depth(farthest - .020)) * 65_535 > 100,
      'Even the farthest layers have ample depth separation');
  }
});
