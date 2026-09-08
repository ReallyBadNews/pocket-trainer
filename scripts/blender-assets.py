"""Build the editable, production-quality Pokédex prop assets.

Run inside Blender:
    blender --background --python scripts/blender-assets.py

The scenes deliberately use procedural materials only, so the .blend sources are
self-contained and future renders do not depend on missing texture files.
"""

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "crafted"
SOURCE = ROOT / "assets" / "blender"
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)


def _set_input(node, names, value):
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            socket.default_value = value
            return


def material(
    name,
    rgb,
    *,
    metal=0.0,
    rough=0.3,
    coat=0.18,
    coat_rough=0.12,
    emission=None,
    emission_strength=0.0,
    transmission=0.0,
    alpha=1.0,
    micro=0.0,
):
    """Create a physically plausible procedural finish."""
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, alpha)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    _set_input(bsdf, ("Base Color",), (*rgb, 1))
    _set_input(bsdf, ("Metallic",), metal)
    _set_input(bsdf, ("Roughness",), rough)
    _set_input(bsdf, ("Coat Weight", "Clearcoat"), coat)
    _set_input(bsdf, ("Coat Roughness", "Clearcoat Roughness"), coat_rough)
    _set_input(bsdf, ("Transmission Weight", "Transmission"), transmission)
    _set_input(bsdf, ("Alpha",), alpha)
    if emission is not None:
        _set_input(bsdf, ("Emission Color", "Emission"), (*emission, 1))
        _set_input(bsdf, ("Emission Strength",), emission_strength)
    if alpha < 1:
        mat.surface_render_method = "DITHERED"
    if micro:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 95 if metal < 0.5 else 165
        noise.inputs["Detail"].default_value = 3.0
        noise.inputs["Roughness"].default_value = 0.7
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = micro
        bump.inputs["Distance"].default_value = 0.025
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def setup(scale=3.4):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    # Blender 5.2 exposes Eevee under the stable BLENDER_EEVEE identifier.
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 18
    scene.world = bpy.data.worlds.new("Neutral photo studio")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes["Background"]
    background.inputs[0].default_value = (0.15, 0.18, 0.23, 1)
    background.inputs[1].default_value = 0.22
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass

    bpy.ops.object.camera_add(location=(3.3, -7.4, 3.0))
    cam = bpy.context.object
    cam.name = "Product Camera"
    cam.rotation_euler = (Vector((0, 0, 0)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = scale
    cam.data.lens = 65
    scene.camera = cam

    lights = [
        ("Large softbox", (-3.5, -4.5, 6.2), 780, 4.8, (1.0, 0.82, 0.69)),
        ("Cool fill", (4.5, -2.0, 2.4), 430, 3.7, (0.60, 0.78, 1.0)),
        ("Rim strip", (0.5, 3.8, 4.8), 920, 2.8, (0.80, 0.90, 1.0)),
    ]
    for name, location, energy, size, color in lights:
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.color = color
        light.data.shape = "DISK"
        light.data.size = size
        light.rotation_euler = (-light.location).to_track_quat("-Z", "Y").to_euler()
    return scene


def _smooth(obj):
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def _weighted_normals(obj):
    try:
        obj.modifiers.new("Weighted surface normals", "WEIGHTED_NORMAL")
    except RuntimeError:
        pass


def sphere(name, location, scale, mat, segments=72):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=36, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(mat)
    return _smooth(obj)


def cube(name, location, scale, mat, bevel=0.1, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("Precision molded radius", "BEVEL")
        modifier.width = bevel
        modifier.segments = 6
    _weighted_normals(obj)
    return obj


def cylinder(name, location, radius, depth, mat, vertices=96, rotation=(math.pi / 2, 0, 0), bevel=0.035):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("Machined edge radius", "BEVEL")
        modifier.width = bevel
        modifier.segments = 5
    _weighted_normals(obj)
    return _smooth(obj)


def ring(name, location, major_radius, minor_radius, mat, rotation=(math.pi / 2, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=120,
        minor_segments=20,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return _smooth(obj)


def text_object(name, body, location, size, mat, align="CENTER", extrude=0.008, rotation=(math.pi / 2, 0, 0)):
    bpy.ops.object.text_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.body = body
    obj.data.align_x = align
    obj.data.align_y = "CENTER"
    obj.data.size = size
    obj.data.extrude = extrude
    obj.data.bevel_depth = 0.003
    obj.data.bevel_resolution = 3
    obj.data.materials.append(mat)
    return obj


def render(scene, name):
    scene.render.filepath = str(OUT / f"{name}.png")
    bpy.ops.render.render(write_still=True)


def hemisphere(name, top, mat):
    verts, faces = [], []
    rings = 36
    segments = 96
    for ring_index in range(rings + 1):
        angle = ring_index / rings * math.pi / 2
        for segment in range(segments):
            phi = segment / segments * math.tau
            z_sign = 1 if top else -1
            verts.append(
                (
                    math.sin(angle) * math.cos(phi) * 1.01,
                    math.sin(angle) * math.sin(phi) * 1.01,
                    math.cos(angle) * 1.01 * z_sign + (0.045 if top else -0.045),
                )
            )
    for ring_index in range(rings):
        for segment in range(segments):
            a = ring_index * segments + segment
            b = ring_index * segments + (segment + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    mesh = bpy.data.meshes.new(f"{name} high resolution mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    _smooth(obj)
    solid = obj.modifiers.new("Real shell wall", "SOLIDIFY")
    solid.thickness = 0.045
    solid.offset = -0.5
    bevel = obj.modifiers.new("Rolled shell lip", "BEVEL")
    bevel.width = 0.012
    bevel.segments = 3
    return obj


# Poké Ball: painted shells, rubber gasket, mechanical latch and hinge.
scene = setup(3.25)
ball_red = material("Automotive candy red", (0.54, 0.012, 0.025), metal=0.22, rough=0.18, coat=0.62, micro=0.045)
ball_white = material("Warm ceramic white", (0.90, 0.93, 0.88), metal=0.08, rough=0.22, coat=0.48, micro=0.025)
rubber = material("Vulcanized black gasket", (0.009, 0.014, 0.018), rough=0.46, coat=0.04, micro=0.12)
gunmetal = material("Latch gunmetal", (0.055, 0.070, 0.080), metal=0.86, rough=0.24, coat=0.20, micro=0.035)
button_white = material("Pearl latch button", (0.82, 0.89, 0.86), metal=0.16, rough=0.16, coat=0.70)
button_glass = material("Latch status glass", (0.49, 0.78, 0.82), rough=0.10, coat=0.80, emission=(0.24, 0.65, 0.74), emission_strength=0.16)

sphere("Dark inner capture core", (0, 0, 0), (0.972, 0.972, 0.972), rubber)
top = hemisphere("Upper red capture shell", True, ball_red)
hemisphere("Lower ivory capture shell", False, ball_white)
ring("Compression gasket", (0, 0, 0), 0.967, 0.052, rubber, rotation=(0, 0, 0))
cylinder("Latch outer housing", (0, -0.995, 0), 0.325, 0.18, gunmetal, bevel=0.028)
cylinder("Latch ceramic collar", (0, -1.108, 0), 0.235, 0.13, button_white, bevel=0.026)
cylinder("Latch glass face", (0, -1.188, 0), 0.158, 0.045, button_glass, bevel=0.016)
ring("Latch hairline groove", (0, -1.216, 0), 0.112, 0.006, gunmetal)
cylinder("Rear hinge barrel", (0, 0.94, 0), 0.105, 0.62, gunmetal, rotation=(0, math.pi / 2, 0), bevel=0.018)
for x in (-0.34, 0.34):
    cylinder("Hinge end cap", (x, 0.94, 0), 0.13, 0.09, ball_red if x < 0 else ball_white, rotation=(0, math.pi / 2, 0), bevel=0.02)

pivot = bpy.data.objects.new("Functional rear hinge pivot", None)
bpy.context.collection.objects.link(pivot)
pivot.location = (0, 0.94, 0)
top.parent = pivot
# The shell mesh is authored around the ball centre. Its local offset places that
# centre back at world origin while the parent supplies a true rear hinge pivot.
top.location = (0, -0.94, 0)
pivot.rotation_euler = (0, 0, 0)
pivot.keyframe_insert(data_path="rotation_euler", frame=1)
pivot.rotation_euler.x = -1.18
pivot.keyframe_insert(data_path="rotation_euler", frame=24)
pivot.rotation_euler = (0, 0, 0)
pivot.keyframe_insert(data_path="rotation_euler", frame=48)
scene.frame_end = 48
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "pokeball.blend"))
render(scene, "pokeball")
scene.frame_set(24)
scene.camera.data.ortho_scale = 4.15
render(scene, "pokeball-open")


# Discovery badge: layered enamel, machined edge and engraved identity mark.
scene = setup(3.05)
gold = material("Brushed warm gold", (0.64, 0.32, 0.045), metal=0.92, rough=0.23, coat=0.24, micro=0.085)
gold_hi = material("Polished gold highlight", (0.92, 0.64, 0.18), metal=0.88, rough=0.14, coat=0.38, micro=0.035)
edge = material("Oxidized badge edge", (0.16, 0.065, 0.012), metal=0.82, rough=0.34, coat=0.10, micro=0.12)
badge_red = material("Deep red vitreous enamel", (0.53, 0.012, 0.025), metal=0.06, rough=0.16, coat=0.78)
cream = material("Ivory vitreous enamel", (0.91, 0.84, 0.58), metal=0.04, rough=0.18, coat=0.72)
engrave = material("Dark engraved recess", (0.055, 0.022, 0.008), metal=0.48, rough=0.33)

cylinder("Knurled decagonal badge body", (0, 0.02, 0), 1.04, 0.25, edge, vertices=10, bevel=0.055)
cylinder("Machined gold face", (0, -0.145, 0), 0.955, 0.16, gold, vertices=10, bevel=0.045)
ring("Polished perimeter rail", (0, -0.245, 0), 0.785, 0.033, gold_hi)
cylinder("Recessed enamel field", (0, -0.255, 0.08), 0.64, 0.095, badge_red, bevel=0.035)
ring("Enamel retaining ring", (0, -0.315, 0.08), 0.585, 0.026, gold_hi)
for index in range(16):
    angle = index / 16 * math.tau
    spoke = cube("Radial guilloché ray", (0.76 * math.cos(angle), -0.252, 0.76 * math.sin(angle)), (0.24, 0.026, 0.026), gold_hi if index % 2 == 0 else edge, 0.008, rotation=(0, -angle, 0))
    spoke.scale.x = 0.72 if index % 2 else 1.0

cube("Emblem seam bar", (0, -0.326, 0.08), (1.03, 0.05, 0.13), engrave, 0.022)
cylinder("Emblem capture button", (0, -0.375, 0.08), 0.22, 0.10, cream, bevel=0.026)
ring("Button gold bezel", (0, -0.438, 0.08), 0.19, 0.024, gold_hi)
for angle in (math.pi / 4, 3 * math.pi / 4, 5 * math.pi / 4, 7 * math.pi / 4):
    sphere("Flush-set ivory rivet", (0.76 * math.cos(angle), -0.344, 0.76 * math.sin(angle)), (0.05, 0.028, 0.05), cream)
text_object("Badge engraving", "DEX", (0, -0.348, -0.61), 0.19, engrave, extrude=0.004)

# Fully modeled rear pin hardware remains invisible in the hero view but makes
# the source usable for turntables and close inspection.
cylinder("Badge rear mounting boss", (0, 0.170, 0.06), 0.39, 0.06, edge, bevel=0.025)
cylinder("Spring pin", (0, 0.225, 0.18), 0.026, 1.25, gold_hi, vertices=48, rotation=(0, math.pi / 2, 0), bevel=0.006)
cylinder("Pin hinge", (-0.65, 0.225, 0.18), 0.10, 0.16, edge, vertices=64, bevel=0.018)
cylinder("Safety clasp", (0.65, 0.225, 0.18), 0.13, 0.17, edge, vertices=64, bevel=0.024)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "discovery-badge.blend"))
render(scene, "badge")


# Pokédex device: molded shell, live glass UI and tactile controls.
scene = setup(6.15)
case_red = material("Pokédex textured red polymer", (0.48, 0.012, 0.032), metal=0.04, rough=0.25, coat=0.36, micro=0.11)
case_edge = material("Deep red rubberized edge", (0.17, 0.006, 0.018), rough=0.42, coat=0.10, micro=0.16)
case_shadow = material("Mold seam shadow", (0.075, 0.004, 0.010), rough=0.42, micro=0.10)
rubber_control = material("Charcoal tactile rubber", (0.018, 0.027, 0.034), metal=0.02, rough=0.48, coat=0.08, micro=0.18)
bezel = material("Satin magnesium bezel", (0.61, 0.68, 0.66), metal=0.62, rough=0.26, coat=0.20, micro=0.06)
fastener = material("Black oxide fastener", (0.025, 0.030, 0.033), metal=0.82, rough=0.30, micro=0.04)
lcd = material("Active laminated LCD", (0.20, 0.39, 0.25), rough=0.13, coat=0.75, emission=(0.18, 0.50, 0.31), emission_strength=0.28)
lcd_dark = material("LCD interface ink", (0.015, 0.080, 0.055), rough=0.30, emission=(0.01, 0.11, 0.07), emission_strength=0.12)
lcd_grid = material("LCD grid glow", (0.16, 0.57, 0.35), rough=0.22, emission=(0.12, 0.58, 0.32), emission_strength=0.34)
lens_blue = material("Scanner optical glass", (0.015, 0.27, 0.46), metal=0.12, rough=0.08, coat=0.86, emission=(0.02, 0.45, 0.82), emission_strength=0.20)
led_red = material("Red status LED", (0.68, 0.012, 0.018), rough=0.12, coat=0.75, emission=(1.0, 0.01, 0.01), emission_strength=1.6)
led_amber = material("Amber status LED", (0.90, 0.38, 0.015), rough=0.12, coat=0.75, emission=(1.0, 0.26, 0.01), emission_strength=1.3)
led_green = material("Green status LED", (0.05, 0.62, 0.20), rough=0.12, coat=0.75, emission=(0.02, 1.0, 0.18), emission_strength=1.0)

cube("Rear impact-resistant shell", (0, 0.17, 0), (3.34, 0.68, 4.74), case_edge, 0.27)
cube("Front injection-molded shell", (0, -0.105, 0.05), (3.20, 0.50, 4.65), case_red, 0.235)
for z in (-2.13, 2.23):
    cube("Horizontal case witness line", (0, -0.373, z), (2.70, 0.022, 0.035), case_shadow, 0.012)
for x in (-1.46, 1.46):
    cube("Vertical case witness line", (x, -0.373, 0.05), (0.032, 0.022, 3.90), case_shadow, 0.012)
for z in (-0.70, -0.38, -0.06, 0.26):
    cube("Side grip rib", (1.535, -0.388, z), (0.055, 0.055, 0.19), case_edge, 0.018)

cube("Display magnesium bezel", (0, -0.405, 0.19), (2.72, 0.21, 2.40), bezel, 0.17)
cube("Recessed display gasket", (0, -0.520, 0.25), (2.29, 0.08, 1.91), rubber_control, 0.085)
cube("Active LCD panel", (0, -0.575, 0.25), (2.10, 0.035, 1.72), lcd, 0.055)
for x in (-0.69, -0.35, 0.35, 0.69):
    cube("LCD vertical grid", (x, -0.601, 0.25), (0.010, 0.012, 1.55), lcd_grid, 0.002)
for z in (-0.28, 0.00, 0.50, 0.78):
    cube("LCD horizontal grid", (0, -0.601, z), (1.92, 0.012, 0.010), lcd_grid, 0.002)
ring("LCD scan reticle", (0.34, -0.613, 0.27), 0.31, 0.015, lcd_dark)
cube("Reticle horizontal tick", (0.34, -0.615, 0.27), (0.78, 0.014, 0.016), lcd_dark, 0.003)
cube("Reticle vertical tick", (0.34, -0.615, 0.27), (0.016, 0.014, 0.78), lcd_dark, 0.003)
text_object("LCD title", "POKÉDEX // SCAN", (-0.92, -0.620, 0.91), 0.115, lcd_dark, align="LEFT", extrude=0.002)
text_object("LCD entry number", "ENTRY 001", (-0.92, -0.620, -0.42), 0.11, lcd_dark, align="LEFT", extrude=0.002)

cylinder("Scanner machined outer rim", (-0.93, -0.43, 1.82), 0.45, 0.16, bezel, bevel=0.028)
cylinder("Scanner rubber seal", (-0.93, -0.535, 1.82), 0.365, 0.095, rubber_control, bevel=0.022)
cylinder("Scanner compound lens", (-0.93, -0.605, 1.82), 0.318, 0.075, lens_blue, bevel=0.025)
ring("Scanner polished retaining ring", (-0.93, -0.655, 1.82), 0.252, 0.016, bezel)
cylinder("Scanner optical core", (-0.93, -0.675, 1.82), 0.10, 0.026, lcd_grid, bevel=0.01)

for x, led_mat in ((-0.12, led_red), (0.23, led_amber), (0.58, led_green)):
    cylinder("Sealed status indicator", (x, -0.415, 1.95), 0.095, 0.125, fastener, bevel=0.018)
    cylinder("Status LED lens", (x, -0.497, 1.95), 0.066, 0.055, led_mat, bevel=0.018)

cube("D-pad horizontal", (0.83, -0.455, -1.49), (0.86, 0.22, 0.29), rubber_control, 0.055)
cube("D-pad vertical", (0.83, -0.465, -1.49), (0.29, 0.22, 0.86), rubber_control, 0.055)
cylinder("D-pad center pivot", (0.83, -0.590, -1.49), 0.135, 0.035, fastener, bevel=0.012)
for x, z, width, height in ((0.83, -1.17, 0.09, 0.06), (0.83, -1.81, 0.09, 0.06), (0.51, -1.49, 0.06, 0.09), (1.15, -1.49, 0.06, 0.09)):
    cube("D-pad direction marker", (x, -0.591, z), (width, 0.018, height), bezel, 0.012)

cylinder("Scan key metal surround", (-0.95, -0.455, -1.25), 0.305, 0.16, bezel, bevel=0.025)
cylinder("Scan key rubber face", (-0.95, -0.575, -1.25), 0.244, 0.10, rubber_control, bevel=0.026)
ring("Scan key tactile groove", (-0.95, -0.640, -1.25), 0.164, 0.012, fastener)
text_object("Scan key legend", "SCAN", (-0.95, -0.653, -1.25), 0.095, bezel, extrude=0.002)

cube("Trainer ID auxiliary display", (-0.48, -0.415, -1.84), (1.13, 0.10, 0.40), rubber_control, 0.045)
cube("Trainer ID glass", (-0.48, -0.478, -1.84), (0.98, 0.035, 0.28), lcd, 0.025)
text_object("Trainer ID readout", "ID  001", (-0.48, -0.507, -1.84), 0.105, lcd_dark, extrude=0.002)

for row in range(2):
    for col in range(5):
        cylinder("Speaker acoustic port", (0.47 + col * 0.18, -0.515, -0.89 - row * 0.22), 0.035, 0.045, fastener, vertices=48, bevel=0.009)

cylinder("Display power metal collar", (-0.91, -0.525, -0.80), 0.11, 0.06, fastener, bevel=0.015)
cylinder("Display power key", (-0.91, -0.575, -0.80), 0.078, 0.045, led_red, bevel=0.015)
for x in (-1.13, 1.13):
    for z in (-0.62, 0.98):
        cylinder("Display bezel fastener", (x, -0.535, z), 0.038, 0.035, fastener, vertices=48, bevel=0.008)
        cube("Fastener slot", (x, -0.558, z), (0.050, 0.010, 0.009), bezel, 0.003)

cube("Lower service port", (0.22, -0.400, -2.12), (0.66, 0.055, 0.12), fastener, 0.040)
cube("Service port cavity", (0.22, -0.438, -2.12), (0.47, 0.025, 0.055), rubber_control, 0.022)
text_object("Device model engraving", "DEX-01", (1.16, -0.405, 1.60), 0.085, case_shadow, extrude=0.002)

# Rear serviceability details: gasketed battery hatch, fasteners, serial plate
# and a sprung belt clip. These are intentionally modeled rather than textured.
cube("Rear battery hatch gasket", (0, 0.520, -0.12), (1.92, 0.055, 2.64), case_shadow, 0.14)
cube("Rear battery hatch", (0, 0.558, -0.12), (1.78, 0.055, 2.49), case_red, 0.12)
for x in (-0.70, 0.70):
    for z in (-1.05, 0.80):
        cylinder("Rear hatch fastener", (x, 0.605, z), 0.050, 0.040, fastener, vertices=48, rotation=(-math.pi / 2, 0, 0), bevel=0.008)
        cube("Rear fastener slot", (x, 0.630, z), (0.060, 0.012, 0.010), bezel, 0.003)
cube("Rear serial plate", (0, 0.620, -0.22), (1.10, 0.025, 0.36), bezel, 0.035)
text_object("Rear serial text", "DEX-01  //  KANTO LAB", (0, 0.642, -0.22), 0.095, fastener, extrude=0.002, rotation=(-math.pi / 2, 0, math.pi))
cube("Belt clip spine", (0, 0.620, 1.35), (0.70, 0.12, 1.04), case_edge, 0.10)
cube("Belt clip spring", (0, 0.705, 1.17), (0.50, 0.08, 0.62), fastener, 0.08)

bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "pokedex-device.blend"))
render(scene, "device")
print("Created refined Poké Ball, animated open ball, discovery badge, and Pokédex device assets.")
