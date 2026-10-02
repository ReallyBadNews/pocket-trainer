export type BadgePose = { yaw: number; pitch: number; zoom: number };
export const DEFAULT_BADGE_POSE: BadgePose = { yaw: -.22, pitch: .10, zoom: 1 };
export const BADGE_FOCAL_LENGTH = 1 / Math.tan(16 * Math.PI / 180);
export const BADGE_VERTEX_STRIDE = 11;

export const clampBadgePose = (pose: BadgePose): BadgePose => ({
  yaw: Number.isFinite(pose.yaw) ? pose.yaw : 0,
  pitch: Number.isFinite(pose.pitch) ? Math.max(-.75, Math.min(.75, pose.pitch)) : 0,
  zoom: Number.isFinite(pose.zoom) ? Math.max(1, Math.min(1.6, pose.zoom)) : 1,
});
export const isBadgeBackVisible = (pose: BadgePose) => Math.cos(clampBadgePose(pose).yaw) < 0;

/** Choose the shortest animated turn; an exact half-turn keeps its requested sign. */
export function badgeYawDelta(from: number, to: number): number {
  const requested = to - from;
  const shortest = Math.atan2(Math.sin(requested), Math.cos(requested));
  return Math.abs(Math.abs(shortest) - Math.PI) < 1e-9 ? Math.sign(requested) * Math.PI : shortest;
}

/** Land on the opposite face by the nearest half-turn, retaining magnification. */
export function flippedBadgePose(input: BadgePose): BadgePose {
  const pose = clampBadgePose(input), turn = 2 * Math.PI;
  const yaw = isBadgeBackVisible(pose)
    ? Math.round(pose.yaw / turn) * turn
    : Math.round((pose.yaw - Math.PI) / turn) * turn + Math.PI;
  return { yaw: yaw === 0 ? 0 : yaw, pitch: 0, zoom: pose.zoom };
}

/** Fit the actual bounding sphere inside the narrower axis with breathing room. */
export function badgeCameraDistance(aspect: number, zoom = 1, radius = 1): number {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 1;
  const magnification = clampBadgePose({ yaw: 0, pitch: 0, zoom }).zoom;
  const tangent = BADGE_FOCAL_LENGTH / (.82 * Math.min(safeAspect, 1));
  return Math.max(safeRadius + .08, safeRadius * Math.hypot(1, tangent) / magnification);
}

/** Keep native depth precision around the object rather than an empty studio. */
export const badgeClipPlanes = (camera: number, radius: number) => ({
  near: Math.max(.04, camera - radius * 1.25),
  far: camera + radius * 1.25,
});

export type BadgeMesh = {
  stride: number;
  vertices: readonly number[];
  indices: readonly number[];
  materials: readonly { color: readonly number[]; metalness: number; roughness: number }[];
  bounds: { radius: number };
};

export function srgbChannelToLinear(value: number): number {
  return value <= .04045 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4);
}

/** Expand each local palette once and offset indices into a single 16-bit mesh. */
export function packBadgeMeshes(meshes: readonly BadgeMesh[]) {
  let vertexCount = 0, indexCount = 0, radius = 0;
  for (const mesh of meshes) {
    if (mesh.stride !== 7 || mesh.vertices.length % 7 || mesh.indices.length % 3) throw new Error('Invalid badge mesh layout.');
    if (!Number.isFinite(mesh.bounds.radius) || mesh.bounds.radius <= 0) throw new Error('Invalid badge bounds.');
    vertexCount += mesh.vertices.length / 7;
    indexCount += mesh.indices.length;
    radius = Math.max(radius, mesh.bounds.radius);
  }
  if (!vertexCount || !indexCount || vertexCount > 65_536) throw new Error('Badge mesh exceeds the 16-bit index budget.');
  const vertices = new Float32Array(vertexCount * BADGE_VERTEX_STRIDE);
  const indices = new Uint16Array(indexCount);
  let vertexOffset = 0, indexOffset = 0;
  for (const mesh of meshes) {
    const count = mesh.vertices.length / 7;
    const palette = mesh.materials.map(material => {
      if (material.color.length !== 3 || ![...material.color, material.metalness, material.roughness].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) {
        throw new Error('Invalid badge material.');
      }
      return [...material.color.map(srgbChannelToLinear), material.metalness, material.roughness];
    });
    for (let index = 0; index < count; index++) {
      const source = index * 7, target = (vertexOffset + index) * BADGE_VERTEX_STRIDE;
      const materialId = mesh.vertices[source + 6];
      if (!Number.isInteger(materialId) || !palette[materialId]) throw new Error('Unknown badge material.');
      for (let component = 0; component < 6; component++) {
        const value = mesh.vertices[source + component];
        if (!Number.isFinite(value)) throw new Error('Invalid badge vertex.');
        vertices[target + component] = value;
      }
      vertices.set(palette[materialId], target + 6);
    }
    for (const index of mesh.indices) {
      if (!Number.isInteger(index) || index < 0 || index >= count) throw new Error('Invalid badge triangle index.');
      indices[indexOffset++] = vertexOffset + index;
    }
    vertexOffset += count;
  }
  return { vertices, indices, radius, stride: BADGE_VERTEX_STRIDE };
}
