"""Build and render the modular 3D trainer portrait library.

Run from the repository root:
    blender --background --python scripts/blender-trainer-avatar.py

The model is a stylized collectible rather than a flat illustration. Every
surface uses procedural materials, so the editable .blend remains portable.
The app combines three aligned transparent renders (body, face/hair, headwear)
to support the full trainer builder without shipping 1,500 complete portraits.
"""

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "crafted" / "trainers"
SOURCE = ROOT / "assets" / "blender"
PREVIEW = Path("/tmp/pocket-trainer-3d-preview.png")
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)

SKIN_TONES = {
    "porcelain": (0.93, 0.68, 0.55),
    "peach": (0.84, 0.50, 0.31),
    "golden": (0.63, 0.33, 0.15),
    "brown": (0.37, 0.16, 0.075),
    "deep": (0.16, 0.055, 0.030),
}
HAIR_COLORS = {
    "ink": (0.012, 0.016, 0.019),
    "chestnut": (0.16, 0.055, 0.028),
    "auburn": (0.34, 0.055, 0.020),
    "gold": (0.68, 0.34, 0.055),
    "blue": (0.045, 0.18, 0.32),
}
OUTFIT_COLORS = {
    "red": (0.49, 0.012, 0.030),
    "blue": (0.055, 0.24, 0.52),
    "green": (0.075, 0.33, 0.17),
    "violet": (0.25, 0.11, 0.43),
    "gold": (0.62, 0.27, 0.045),
}
HAIR_STYLES = ("short", "spiky", "bob", "ponytail")


def set_input(node, names, value):
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            socket.default_value = value
            return


def make_material(name, color, *, roughness=0.4, metallic=0.0, coat=0.0,
                  subsurface=0.0, micro=0.0, micro_scale=100.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    set_input(bsdf, ("Base Color",), (*color, 1.0))
    set_input(bsdf, ("Roughness",), roughness)
    set_input(bsdf, ("Metallic",), metallic)
    set_input(bsdf, ("Coat Weight", "Clearcoat"), coat)
    set_input(bsdf, ("Coat Roughness", "Clearcoat Roughness"), 0.18)
    set_input(bsdf, ("Subsurface Weight", "Subsurface"), subsurface)
    set_input(bsdf, ("IOR",), 1.43)
    if micro:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.name = f"{name} procedural microtexture"
        noise.inputs["Scale"].default_value = micro_scale
        noise.inputs["Detail"].default_value = 4.0
        noise.inputs["Roughness"].default_value = 0.72
        bump = nodes.new("ShaderNodeBump")
        bump.name = f"{name} micro-normal"
        bump.inputs["Strength"].default_value = micro
        bump.inputs["Distance"].default_value = 0.012
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def set_material_color(mat, color):
    mat.diffuse_color = (*color, 1.0)
    set_input(mat.node_tree.nodes.get("Principled BSDF"), ("Base Color",), (*color, 1.0))


def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 384
    scene.render.resolution_y = 384
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.quality = 91
    scene.render.film_transparent = True
    scene.render.image_settings.color_depth = "8"
    scene.world = bpy.data.worlds.new("Trainer portrait studio")
    scene.world.use_nodes = True
    world = scene.world.node_tree.nodes.get("Background")
    world.inputs[0].default_value = (0.055, 0.072, 0.065, 1.0)
    world.inputs[1].default_value = 0.28
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass

    bpy.ops.object.camera_add(location=(0, -9.5, 2.28))
    camera = bpy.context.object
    camera.name = "Trainer portrait orthographic camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 4.25
    camera.rotation_euler = (Vector((0, 0, 2.28)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera

    lights = (
        ("Warm portrait key", (-4.0, -5.0, 6.2), 690, 4.4, (1.0, 0.78, 0.63)),
        ("Cool portrait fill", (4.0, -3.2, 4.1), 430, 3.4, (0.60, 0.79, 1.0)),
        ("Hair rim light", (0.8, 2.6, 5.6), 850, 3.0, (0.76, 0.88, 1.0)),
    )
    for name, location, energy, size, color in lights:
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.data.color = color
        light.rotation_euler = (Vector((0, 0, 2.1)) - light.location).to_track_quat("-Z", "Y").to_euler()
    return scene


def collection(name):
    item = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(item)
    return item


def move_to(obj, target):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    target.objects.link(obj)
    return obj


def smooth(obj):
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def sphere(name, location, scale, mat, target, segments=48):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=max(16, segments // 2), location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(mat)
    move_to(obj, target)
    return smooth(obj)


def rounded_cube(name, location, dimensions, mat, target, bevel=0.08, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    modifier = obj.modifiers.new("Soft tailored edge", "BEVEL")
    modifier.width = bevel
    modifier.segments = 5
    move_to(obj, target)
    return obj


def cylinder(name, location, radius, depth, mat, target, *, rotation=(0, 0, 0), vertices=64, bevel=0.025):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("Rounded machined edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 4
    move_to(obj, target)
    return smooth(obj)


def torus(name, location, major, minor, mat, target, *, rotation=(math.pi / 2, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=64,
                                    minor_segments=16, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    move_to(obj, target)
    return smooth(obj)


def curve(name, points, bevel, mat, target):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 16
    data.bevel_depth = bevel
    data.bevel_resolution = 5
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, data)
    target.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def cone_between(name, base, direction, radius, length, mat, target):
    direction = Vector(direction).normalized()
    center = Vector(base) + direction * length * 0.5
    bpy.ops.mesh.primitive_cone_add(vertices=40, radius1=radius, radius2=0.015, depth=length, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    obj.data.materials.append(mat)
    move_to(obj, target)
    return smooth(obj)


def polygon_prism(name, coordinates, front_y, depth, mat, target, bevel=0.025):
    back_y = front_y + depth
    vertices = [(x, front_y, z) for x, z in coordinates] + [(x, back_y, z) for x, z in coordinates]
    count = len(coordinates)
    faces = [tuple(range(count)), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, nxt + count, index + count))
    mesh = bpy.data.meshes.new(f"{name} mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    target.objects.link(obj)
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("Tailored edge piping", "BEVEL")
        modifier.width = bevel
        modifier.segments = 4
    return obj


scene = setup_scene()
face = collection("FACE — skin and expression")
hair_collections = {style: collection(f"HAIR — {style}") for style in HAIR_STYLES}
outfit = collection("OUTFIT — jacket and badge")
cap = collection("HEADWEAR — field cap")
headband = collection("HEADWEAR — headband")
content_collections = [face, *hair_collections.values(), outfit, cap, headband]

skin = make_material("Skin with subtle subsurface and pores", SKIN_TONES["porcelain"], roughness=0.48,
                     coat=0.05, subsurface=0.085, micro=0.11, micro_scale=145)
skin_detail = make_material("Warm nose and ear detail", (0.70, 0.28, 0.20), roughness=0.52, subsurface=0.05)
hair = make_material("Groomed hair with strand microtexture", HAIR_COLORS["ink"], roughness=0.34,
                     coat=0.16, micro=0.20, micro_scale=82)
sclera = make_material("Natural eye white", (0.82, 0.88, 0.80), roughness=0.16, coat=0.55)
iris = make_material("Deep green iris", (0.014, 0.095, 0.052), roughness=0.12, coat=0.72)
catchlight = make_material("Eye catchlight", (0.98, 0.99, 0.96), roughness=0.06, coat=0.8)
lip = make_material("Soft lip color", (0.38, 0.055, 0.052), roughness=0.48, subsurface=0.025)
freckle = make_material("Faint freckles", (0.25, 0.065, 0.035), roughness=0.58)
shirt = make_material("Ivory woven shirt", (0.88, 0.88, 0.76), roughness=0.62,
                     micro=0.24, micro_scale=165)
jacket = make_material("Field jacket woven canvas", OUTFIT_COLORS["red"], roughness=0.56,
                      coat=0.05, micro=0.29, micro_scale=125)
thread = make_material("Contrast stitching", (0.76, 0.73, 0.61), roughness=0.68, micro=0.08)
dark_metal = make_material("Blackened badge metal", (0.018, 0.025, 0.023), roughness=0.25, metallic=0.72, coat=0.16)
badge_white = make_material("Ivory badge enamel", (0.84, 0.88, 0.77), roughness=0.15, coat=0.68)
zipper = make_material("Brushed zipper alloy", (0.34, 0.38, 0.34), roughness=0.28, metallic=0.84)
cap_fabric = make_material("Field cap brushed twill", OUTFIT_COLORS["red"], roughness=0.58,
                          coat=0.04, micro=0.32, micro_scale=132)
cap_under = make_material("Cap charcoal underside", (0.025, 0.032, 0.030), roughness=0.64, micro=0.18)

# Face core: soft collectible proportions with modeled features and glossy eyes.
sphere("Sculpted head", (0, 0.0, 2.61), (0.77, 0.60, 0.91), skin, face)
sphere("Left ear", (-0.76, 0.01, 2.59), (0.19, 0.15, 0.27), skin, face, 40)
sphere("Right ear", (0.76, 0.01, 2.59), (0.19, 0.15, 0.27), skin, face, 40)
for x in (-0.76, 0.76):
    sphere("Warm ear inset", (x, -0.135, 2.59), (0.075, 0.035, 0.12), skin_detail, face, 32)
cylinder("Neck", (0, 0.08, 1.72), 0.31, 0.76, skin, face, vertices=56, bevel=0.08)
for x in (-0.29, 0.29):
    sphere("Sclera", (x, -0.548, 2.70), (0.145, 0.075, 0.115), sclera, face, 40)
    sphere("Iris", (x, -0.618, 2.70), (0.071, 0.025, 0.078), iris, face, 36)
    sphere("Eye catchlight", (x - 0.022, -0.643, 2.737), (0.019, 0.008, 0.019), catchlight, face, 24)
    curve("Natural eyebrow", [(x - 0.15, -0.585, 2.93), (x, -0.625, 2.99), (x + 0.15, -0.585, 2.94)], 0.035, hair, face)
sphere("Modeled nose", (0, -0.605, 2.52), (0.105, 0.085, 0.14), skin, face, 36)
curve("Soft smile", [(-0.24, -0.622, 2.35), (0, -0.675, 2.25), (0.24, -0.622, 2.35)], 0.032, lip, face)
curve("Lower lip highlight", [(-0.12, -0.626, 2.265), (0, -0.648, 2.23), (0.12, -0.626, 2.265)], 0.014, skin_detail, face)
for x, z in ((-0.39, 2.43), (-0.46, 2.38), (0.39, 2.43), (0.46, 2.38)):
    sphere("Faint freckle", (x, -0.585, z), (0.018, 0.008, 0.018), freckle, face, 20)

# Hair style collections. The skull caps interpenetrate the head to create a
# clean hairline while retaining genuine 3D depth and self-shadowing.
short = hair_collections["short"]
sphere("Short sculpted crown", (0, 0.05, 3.16), (0.80, 0.61, 0.48), hair, short)
for x, z, rot in ((-0.50, 3.03, -0.18), (-0.22, 3.01, 0.12), (0.08, 3.02, -0.10), (0.38, 3.04, 0.18)):
    sphere("Short separated fringe lock", (x, -0.53, z), (0.23, 0.13, 0.19), hair, short, 36).rotation_euler.y = rot

spiky = hair_collections["spiky"]
sphere("Spiky hair crown", (0, 0.04, 3.14), (0.78, 0.60, 0.43), hair, spiky)
spikes = (
    ((-0.62, 0.02, 3.31), (-0.72, 0.03, 0.69), 0.21, 0.69),
    ((-0.34, 0.02, 3.43), (-0.38, 0.02, 0.92), 0.23, 0.72),
    ((-0.02, 0.03, 3.48), (-0.05, 0.01, 1.00), 0.24, 0.78),
    ((0.30, 0.04, 3.42), (0.36, 0.02, 0.93), 0.23, 0.72),
    ((0.58, 0.04, 3.30), (0.68, 0.04, 0.70), 0.21, 0.68),
)
for base, direction, radius, length in spikes:
    cone_between("Tapered hair spike", base, direction, radius, length, hair, spiky)
for x in (-0.36, -0.10, 0.17, 0.42):
    sphere("Spiky broken fringe", (x, -0.54, 3.02), (0.22, 0.13, 0.18), hair, spiky, 34)

bob = hair_collections["bob"]
sphere("Bob rounded crown", (0, 0.08, 3.12), (0.83, 0.63, 0.50), hair, bob)
for x in (-0.73, 0.73):
    sphere("Bob side curtain", (x, 0.00, 2.67), (0.24, 0.25, 0.68), hair, bob, 44)
for x in (-0.43, -0.14, 0.15, 0.43):
    sphere("Bob beveled fringe", (x, -0.54, 3.00), (0.23, 0.13, 0.20), hair, bob, 34)

pony = hair_collections["ponytail"]
sphere("Ponytail swept crown", (0, 0.07, 3.14), (0.80, 0.61, 0.47), hair, pony)
for x in (-0.38, -0.10, 0.19, 0.45):
    sphere("Swept front lock", (x, -0.54, 3.04 + x * 0.08), (0.25, 0.13, 0.18), hair, pony, 34)
sphere("Ponytail tie", (0.69, 0.25, 2.98), (0.22, 0.20, 0.22), hair, pony, 36)
curve("Ponytail volume", [(0.72, 0.28, 2.96), (1.04, 0.29, 2.67), (0.91, 0.30, 2.18)], 0.25, hair, pony)
sphere("Ponytail tapered end", (0.89, 0.29, 2.12), (0.25, 0.23, 0.35), hair, pony, 40)

# Field outfit: textured canvas, woven shirt, tailored lapels and small enamel badge.
polygon_prism("Tapered field jacket torso", [(-1.20, 0.42), (1.20, 0.42), (0.87, 1.74), (-0.87, 1.74)], -0.18, 0.62, jacket, outfit, 0.16)
sphere("Left jacket shoulder", (-0.93, 0.03, 1.22), (0.54, 0.42, 0.68), jacket, outfit)
sphere("Right jacket shoulder", (0.93, 0.03, 1.22), (0.54, 0.42, 0.68), jacket, outfit)
polygon_prism("Ivory shirt front", [(-0.37, 0.40), (0.37, 0.40), (0.27, 1.74), (-0.27, 1.74)], -0.49, 0.12, shirt, outfit, 0.05)
polygon_prism("Left ivory lapel", [(-0.83, 1.72), (-0.27, 1.72), (-0.37, 1.22)], -0.52, 0.10, shirt, outfit, 0.035)
polygon_prism("Right ivory lapel", [(0.83, 1.72), (0.27, 1.72), (0.37, 1.22)], -0.52, 0.10, shirt, outfit, 0.035)
rounded_cube("Fine jacket zipper", (0, -0.58, 0.84), (0.035, 0.025, 0.80), zipper, outfit, 0.008)
curve("Left shoulder topstitch", [(-1.15, -0.31, 1.18), (-0.95, -0.43, 1.56), (-0.68, -0.41, 1.73)], 0.012, thread, outfit)
curve("Right shoulder topstitch", [(1.15, -0.31, 1.18), (0.95, -0.43, 1.56), (0.68, -0.41, 1.73)], 0.012, thread, outfit)
cylinder("Badge blackened bezel", (0.66, -0.615, 1.32), 0.175, 0.06, dark_metal, outfit, rotation=(math.pi / 2, 0, 0), bevel=0.018)
cylinder("Badge enamel face", (0.66, -0.658, 1.32), 0.125, 0.035, badge_white, outfit, rotation=(math.pi / 2, 0, 0), bevel=0.012)
rounded_cube("Badge center seam", (0.66, -0.684, 1.32), (0.25, 0.022, 0.032), dark_metal, outfit, 0.007)

# Headwear is rendered separately so it can follow the chosen jacket color.
sphere("Structured cap crown", (0, -0.005, 3.50), (0.88, 0.67, 0.45), cap_fabric, cap)
sphere("Cap brim", (0.20, -0.55, 3.27), (0.72, 0.32, 0.10), cap_under, cap, 48)
polygon_prism("Cap ivory front panel", [(-0.20, 3.85), (0.30, 3.85), (0.42, 3.39), (-0.25, 3.39)], -0.635, 0.06, shirt, cap, 0.025)
curve("Cap crown center stitch", [(0, -0.648, 3.88), (0.02, -0.686, 3.62), (0.03, -0.675, 3.39)], 0.011, thread, cap)
curve("Cap brim stitching", [(-0.43, -0.68, 3.27), (0.15, -0.74, 3.20), (0.78, -0.60, 3.27)], 0.011, thread, cap)

curve("Padded trainer headband", [(-0.77, -0.61, 3.18), (0, -0.69, 3.30), (0.77, -0.61, 3.18)], 0.095, cap_fabric, headband)
sphere("Headband knot", (0.78, -0.58, 3.16), (0.14, 0.10, 0.14), cap_fabric, headband, 36)
polygon_prism("Headband short ribbon", [(0.78, 3.12), (1.03, 3.00), (0.91, 2.72), (0.72, 3.00)], -0.58, 0.08, cap_fabric, headband, 0.02)


def show(*collections_to_show):
    selected = set(collections_to_show)
    for item in content_collections:
        item.hide_render = item not in selected


def render_webp(filename):
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.resolution_x = 384
    scene.render.resolution_y = 384
    scene.render.filepath = str(OUT / filename)
    bpy.ops.render.render(write_still=True)


for skin_name, skin_color in SKIN_TONES.items():
    set_material_color(skin, skin_color)
    # Details stay related to each complexion instead of becoming a fixed decal.
    detail_color = tuple(min(1.0, channel * 0.72 + 0.055) for channel in skin_color)
    set_material_color(skin_detail, detail_color)
    set_material_color(freckle, tuple(max(0.012, channel * 0.35) for channel in skin_color))
    for style in HAIR_STYLES:
        for hair_name, hair_color in HAIR_COLORS.items():
            set_material_color(hair, hair_color)
            show(face, hair_collections[style])
            render_webp(f"trainer-face-{skin_name}-{style}-{hair_name}.webp")

for outfit_name, outfit_color in OUTFIT_COLORS.items():
    set_material_color(jacket, outfit_color)
    show(outfit)
    render_webp(f"trainer-outfit-{outfit_name}.webp")

    set_material_color(cap_fabric, outfit_color)
    show(cap)
    render_webp(f"trainer-headwear-cap-{outfit_name}.webp")
    show(headband)
    render_webp(f"trainer-headwear-headband-{outfit_name}.webp")

# Leave the editable source in the default trainer state and provide a full
# composite proof render outside the repository for visual QA.
set_material_color(skin, SKIN_TONES["porcelain"])
set_material_color(skin_detail, tuple(min(1.0, channel * 0.72 + 0.055) for channel in SKIN_TONES["porcelain"]))
set_material_color(freckle, tuple(max(0.012, channel * 0.35) for channel in SKIN_TONES["porcelain"]))
set_material_color(hair, HAIR_COLORS["ink"])
set_material_color(jacket, OUTFIT_COLORS["red"])
set_material_color(cap_fabric, OUTFIT_COLORS["red"])
show(face, hair_collections["short"], outfit, cap)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "trainer-avatar.blend"))
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.resolution_x = 768
scene.render.resolution_y = 768
scene.render.filepath = str(PREVIEW)
bpy.ops.render.render(write_still=True)
print(f"Rendered {100 + 5 + 10} modular trainer assets to {OUT}")
print(f"Saved editable source to {SOURCE / 'trainer-avatar.blend'}")
print(f"Saved QA composite to {PREVIEW}")
