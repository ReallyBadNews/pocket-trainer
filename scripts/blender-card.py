"""Build the editable collector card and its small runtime triangle mesh.

Run without touching an open Blender scene:
    blender --background --python scripts/blender-card.py

Optional inspection render and standard interchange model:
    blender --background --python scripts/blender-card.py -- \
        --preview /private/tmp/card-3d-review/collector-card.png --glb

The .blend uses meters internally, with the UI set to millimeters. The runtime
JSON uses millimeters, centered at the origin, Y up, and the front facing +Z.
The app replaces the three generic preview materials with its own card images
and finish shader. No card art, network download, or baked texture is required.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "blender" / "collector-card.blend"
MESH_JSON = ROOT / "assets" / "crafted" / "card-model.json"
GLB = ROOT / "assets" / "crafted" / "collector-card.glb"
WIDTH, HEIGHT, THICKNESS = 63.0, 88.0, 0.3
CORNER_RADIUS = 3.0
BEVEL = 0.05
CORNER_SEGMENTS = 8
MILLIMETER = 0.001


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview", type=Path, help="Optional studio render PNG")
    parser.add_argument("--glb", action="store_true", help="Also export a GLB")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def rounded_outline(inset):
    """Counterclockwise perimeter, retaining full-rectangle image coordinates."""
    radius = CORNER_RADIUS - inset
    cx = WIDTH / 2 - CORNER_RADIUS
    cy = HEIGHT / 2 - CORNER_RADIUS
    corners = ((cx, cy, 0), (-cx, cy, 90), (-cx, -cy, 180), (cx, -cy, 270))
    points = []
    for x, y, start in corners:
        for step in range(CORNER_SEGMENTS + 1):
            angle = math.radians(start + 90 * step / CORNER_SEGMENTS)
            points.append((x + radius * math.cos(angle), y + radius * math.sin(angle)))
    return points


def material(name, color, roughness, metallic=0.0):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    result.diffuse_color = (*color, 1.0)
    bsdf = result.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Coat Weight"].default_value = 0.45 if metallic else 0.18
    bsdf.inputs["Coat Roughness"].default_value = 0.16
    return result


def front_material():
    """Self-contained foil swatch for editing; not an authentic card finish."""
    result = material("00 Front — replace with card art", (0.06, 0.22, 0.25), 0.27, 0.68)
    tree = result.node_tree
    bsdf = tree.nodes.get("Principled BSDF")
    for name, value in (("Thin Film Thickness", 430), ("Thin Film IOR", 1.35)):
        if name in bsdf.inputs:
            bsdf.inputs[name].default_value = value

    texture = tree.nodes.new("ShaderNodeTexCoord")
    texture.location = (-750, 0)
    facing = tree.nodes.new("ShaderNodeLayerWeight")
    facing.location = (-750, 220)
    facing.inputs["Blend"].default_value = 0.28
    rainbow = tree.nodes.new("ShaderNodeValToRGB")
    rainbow.name = "Angle-dependent preview foil"
    rainbow.location = (-480, 220)
    colors = (
        (0.0, (0.08, 0.21, 0.25, 1)),
        (0.24, (0.13, 0.42, 0.39, 1)),
        (0.50, (0.52, 0.23, 0.39, 1)),
        (0.76, (0.45, 0.39, 0.16, 1)),
        (1.0, (0.10, 0.19, 0.38, 1)),
    )
    ramp = rainbow.color_ramp
    ramp.elements.remove(ramp.elements[1])
    for index, (position, color) in enumerate(colors):
        element = ramp.elements[0] if index == 0 else ramp.elements.new(position)
        element.position = position
        element.color = color
    tree.links.new(facing.outputs["Facing"], rainbow.inputs["Fac"])
    tree.links.new(rainbow.outputs["Color"], bsdf.inputs["Base Color"])

    wave = tree.nodes.new("ShaderNodeTexWave")
    wave.location = (-480, -80)
    wave.wave_type = "BANDS"
    wave.bands_direction = "DIAGONAL"
    wave.inputs["Scale"].default_value = 170
    wave.inputs["Distortion"].default_value = 0.14
    bump = tree.nodes.new("ShaderNodeBump")
    bump.location = (-200, -40)
    bump.inputs["Strength"].default_value = 0.045
    bump.inputs["Distance"].default_value = 0.000003
    tree.links.new(texture.outputs["UV"], wave.inputs["Vector"])
    tree.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.location = (30, 200)
    tree.nodes.get("Material Output").location = (350, 200)
    return result


def build_card():
    # Four explicit perimeter rings keep the physical thickness and bevel
    # editable, avoiding a modifier whose output depends on Blender defaults.
    rings = (
        (BEVEL, -THICKNESS / 2),
        (0.0, -THICKNESS / 2 + BEVEL),
        (0.0, THICKNESS / 2 - BEVEL),
        (BEVEL, THICKNESS / 2),
    )
    count = len(rounded_outline(0))
    vertices = [
        (x * MILLIMETER, y * MILLIMETER, z * MILLIMETER)
        for inset, z in rings
        for x, y in rounded_outline(inset)
    ]
    # Front / back are separate n-gons; side walls and rim remain real quads.
    faces = [tuple(range(3 * count, 4 * count)), tuple(reversed(range(count)))]
    for ring in range(len(rings) - 1):
        for index in range(count):
            following = (index + 1) % count
            faces.append(
                (ring * count + index, ring * count + following,
                 (ring + 1) * count + following, (ring + 1) * count + index)
            )

    mesh = bpy.data.meshes.new("Collector card — rounded paper and beveled rim")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    card = bpy.data.objects.new("Collector card · 63 × 88 × 0.3 mm", mesh)
    bpy.context.collection.objects.link(card)
    mesh.materials.append(front_material())
    mesh.materials.append(material("01 Back — replace with card back", (0.022, 0.065, 0.20), 0.40))
    mesh.materials.append(material("02 Edge — laminated cardstock", (0.78, 0.74, 0.66), 0.58))

    uv = mesh.uv_layers.new(name="Card art · full rectangle")
    for polygon in mesh.polygons:
        polygon.material_index = polygon.index if polygon.index < 2 else 2
        polygon.use_smooth = polygon.index >= 2
        for loop_index in polygon.loop_indices:
            position = mesh.vertices[mesh.loops[loop_index].vertex_index].co / MILLIMETER
            # Back U is mirrored in object space so it reads upright when the
            # card rotates around Y and the -Z face points at the viewer.
            u = 0.5 + position.x / WIDTH * (-1 if polygon.material_index == 1 else 1)
            v = 0.5 + position.y / HEIGHT
            uv.data[loop_index].uv = (u, v)
    # Keep both printed surfaces flat while allowing continuous corner shading
    # around the paper edge. The bevel is small but physically present.
    for edge in mesh.edges:
        a, b = edge.vertices
        if (a < count and b < count) or (a >= 3 * count and b >= 3 * count):
            edge.use_edge_sharp = True
    mesh.update()

    card["dimensions_mm"] = [WIDTH, HEIGHT, THICKNESS]
    card["corner_radius_mm"] = CORNER_RADIUS
    card["beveled_rim_mm"] = BEVEL
    card["runtime_material_ids"] = "0 = front, 1 = back, 2 = edge and bevel"
    card["texture_coordinates"] = "Full rectangular UVs; back U reversed; Y up"
    card["foil_preview"] = "Procedural demonstration only; app shader follows selected printing"
    bpy.context.view_layer.objects.active = card
    card.select_set(True)
    return card


def export_mesh(card):
    mesh = card.data
    mesh.calc_loop_triangles()
    uv = mesh.uv_layers.active.data
    packed = []
    for triangle in mesh.loop_triangles:
        surface = mesh.polygons[triangle.polygon_index].material_index
        for loop_index in triangle.loops:
            position = mesh.vertices[mesh.loops[loop_index].vertex_index].co / MILLIMETER
            normal = mesh.corner_normals[loop_index].vector
            values = (*position, *normal, *uv[loop_index].uv)
            packed.extend(0.0 if abs(value) < 0.0000005 else round(value, 6) for value in values)
            packed.append(surface)
    data = {"dimensions": [WIDTH, HEIGHT, THICKNESS], "stride": 9, "vertices": packed}
    MESH_JSON.parent.mkdir(parents=True, exist_ok=True)
    MESH_JSON.write_text(json.dumps(data, separators=(",", ":")) + "\n")
    return len(mesh.vertices), len(mesh.loop_triangles), len(packed) // 9


def studio():
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "MILLIMETERS"
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 960
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.world = bpy.data.worlds.new("Soft collector studio")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (0.17, 0.20, 0.25, 1)
    background.inputs["Strength"].default_value = 0.45
    scene.view_settings.view_transform = "AgX"

    bpy.ops.object.camera_add(location=(0.043, 0.015, 0.14))
    camera = bpy.context.object
    camera.name = "Front three-quarter inspection camera"
    # The card's up axis is Y, rather than Blender's default world Z. Supply an
    # explicit look-at basis so the portrait card remains upright in the studio.
    direction = camera.location.normalized()
    right = Vector((0, 1, 0)).cross(direction).normalized()
    up = direction.cross(right)
    camera.rotation_euler = Matrix((right, up, direction)).transposed().to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 0.112
    scene.camera = camera
    for name, location, energy, size, color in (
        ("Warm strip", (-0.055, 0.075, 0.085), 0.30, 0.08, (1.0, 0.88, 0.75)),
        ("Cool fill", (0.070, -0.045, 0.050), 0.15, 0.06, (0.72, 0.87, 1.0)),
        ("Edge softbox", (-0.035, -0.035, -0.045), 0.25, 0.06, (0.85, 0.93, 1.0)),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.data.color = color
        light.rotation_euler = (-light.location).to_track_quat("-Z", "Y").to_euler()
    return scene


def main():
    options = arguments()
    # This script is designed for a separate --background Blender process.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    card = build_card()
    counts = export_mesh(card)
    scene = studio()
    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    card.select_set(True)
    bpy.context.view_layer.objects.active = card
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE), compress=True)
    if options.glb:
        bpy.ops.export_scene.gltf(filepath=str(GLB), export_format="GLB", use_selection=True)
    if options.preview:
        options.preview.parent.mkdir(parents=True, exist_ok=True)
        scene.render.filepath = str(options.preview)
        bpy.ops.render.render(write_still=True)
    print(f"Collector card: {counts[0]} mesh vertices, {counts[1]} triangles, {counts[2]} expanded vertices")
    print(f"Runtime mesh: {MESH_JSON} ({MESH_JSON.stat().st_size:,} bytes)")
    print(f"Editable source: {SOURCE} ({SOURCE.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
