"""Render the scanner lens and status lights that sit in the home header.

    blender --background --factory-startup --python scripts/blender-header-lens.py

The camera looks straight at the front of the case, orthographic, and the frame maps 1 Blender unit to 10 points, so
the renders drop into the header's existing 93 × 44 point footprint with a 16 point margin for the shadow and glow.

Writes to assets/crafted/header-lens/:
  * `lens-off.webp`: the lens and lights at rest, with their soft shadow caught on the case.
  * `lens-lit.webp`: an update is waiting. The lens lights up blue from inside and the green status light comes on.
  * `lens-lit-glow.webp`: only the light the lit lens and green light give off, blurred. It goes under the lens so it
    spills onto the case.
  * `lens-sweep.webp`: a square layer centred on the lens holding just the scanner sweep, a white arc of light. The app spins it over `lens-lit`, so the sweep turns smoothly at any frame rate.
"""

import argparse
import math
import subprocess
import sys
import tempfile
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector


def arguments():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=root)
    parser.add_argument("--output", type=Path, default=root / "assets" / "crafted" / "header-lens")
    parser.add_argument("--scale", type=int, default=3, help="Pixels per point.")
    return parser.parse_args(args)


# Header footprint in points: the 44 pt lens, a 10 pt gap, then three 9 pt lights 6 pt apart, 5 pt from the top.
PAD = 16
WIDTH = 93 + PAD * 2
HEIGHT = 44 + PAD * 2
LENS = (PAD + 22, PAD + 22)
LIGHTS = [(PAD + 54 + 4.5 + i * 15, PAD + 5 + 4.5) for i in range(3)]


def at(x, y, depth=0.0):
    """Header points (top-left origin) to Blender space: x right, z up, -y toward the camera."""
    return Vector(((x - WIDTH / 2) / 10, -depth, (HEIGHT / 2 - y) / 10))


def _set(node, names, value):
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            socket.default_value = value
            return


def material(name, rgb, *, metal=0.0, rough=0.3, coat=0.0, transmission=0.0, ior=1.45, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    _set(bsdf, ("Base Color",), (*rgb, 1))
    _set(bsdf, ("Metallic",), metal)
    _set(bsdf, ("Roughness",), rough)
    _set(bsdf, ("Coat Weight",), coat)
    _set(bsdf, ("Coat Roughness",), 0.05)
    _set(bsdf, ("Transmission Weight",), transmission)
    _set(bsdf, ("IOR",), ior)
    _set(bsdf, ("Emission Color",), (*(emission or (0, 0, 0)), 1))
    _set(bsdf, ("Emission Strength",), strength)
    return mat


GREEN = (0.15, 1.0, 0.25)
BLUE_GLASS = (0.30, 0.75, 1.0)
BLUE_GLOW = (0.30, 0.72, 1.0)
# Iris colour from the centre out: a bright pupil, the lens body, then a deep rim, like looking into real optics.
BLUE_IRIS = [(0.55, 0.88, 1.0), (0.12, 0.58, 0.98), (0.02, 0.16, 0.42)]
BLUE_IRIS_LIT = [(0.70, 0.93, 1.0), (0.20, 0.66, 1.0), (0.04, 0.26, 0.70)]


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def iris_material():
    """A radial gradient, so the inside of the lens reads as curved optics instead of a flat disc."""
    mat = material("Lens iris", (0, 0, 0), metal=0.2, rough=0.3)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    coords = nodes.new("ShaderNodeTexCoord")
    flat = nodes.new("ShaderNodeVectorMath")
    flat.operation = "MULTIPLY"
    flat.inputs[1].default_value = (1 / 1.52, 1 / 1.52, 0)
    distance = nodes.new("ShaderNodeVectorMath")
    distance.operation = "LENGTH"
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.name = "Iris ramp"
    ramp.color_ramp.interpolation = "EASE"
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements.new(0.55)
    strength = nodes.new("ShaderNodeValue")
    strength.name = "Iris glow"
    links.new(coords.outputs["Object"], flat.inputs[0])
    links.new(flat.outputs[0], distance.inputs[0])
    links.new(distance.outputs["Value"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Emission Color"])
    links.new(strength.outputs[0], bsdf.inputs["Emission Strength"])
    return mat


def tint_iris(mat, colors, strength):
    """`colors` run from the centre of the iris to its rim."""
    elements = mat.node_tree.nodes["Iris ramp"].color_ramp.elements
    for element, rgb in zip(elements, colors):
        element.color = (*rgb, 1)
    mat.node_tree.nodes["Iris glow"].outputs[0].default_value = strength


def glow(mat, rgb, strength):
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    _set(bsdf, ("Emission Color",), (*rgb, 1))
    _set(bsdf, ("Emission Strength",), strength)


def smooth(obj, bevel=0.0, segments=6):
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    if bevel:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
    obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL").keep_sharp = True
    return obj


def place(obj, name, mat):
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def disc(name, center, radius, depth, mat, *, bevel=0.0, front=0.0):
    """A cylinder facing the camera whose front face sits `front` units in front of the case."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=radius, depth=depth, rotation=(math.pi / 2, 0, 0))
    obj = bpy.context.object
    obj.location = center + Vector((0, -(front - depth / 2), 0))
    return smooth(place(obj, name, mat), bevel)


def torus(name, center, major, minor, mat, *, front=0.0):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=128, minor_segments=32, major_radius=major, minor_radius=minor, rotation=(math.pi / 2, 0, 0)
    )
    obj = bpy.context.object
    obj.location = center + Vector((0, -(front - minor), 0))
    return smooth(place(obj, name, mat))


def dome(name, center, radius, height, mat, *, front=0.0):
    """A shallow spherical cap facing the camera, its base `front - height` in front of the case."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=1)
    obj = bpy.context.object
    obj.scale = (radius, height, radius)
    obj.location = center + Vector((0, -(front - height), 0))
    return smooth(place(obj, name, mat))


def scene_setup(scale):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 96
    scene.cycles.use_denoising = True
    scene.cycles.device = "GPU"
    scene.render.resolution_x = WIDTH * scale
    scene.render.resolution_y = HEIGHT * scale
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    try:
        scene.view_settings.look = "AgX - Punchy"
    except TypeError:
        pass

    world = bpy.data.worlds.new("Studio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.42, 0.44, 0.48, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.35
    scene.world = world

    bpy.ops.object.camera_add(location=(0, -30, 0), rotation=(math.pi / 2, 0, 0))
    cam = bpy.context.object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = WIDTH / 10
    scene.camera = cam

    # Top-left key matches the light direction of the rest of the header art.
    for name, location, energy, size, color in (
        ("Key softbox", (-6, -9, 8), 900, 6, (1.0, 0.95, 0.88)),
        ("Cool fill", (7, -8, -2), 160, 6, (0.75, 0.86, 1.0)),
        ("Top strip", (0, -3, 9), 260, 3, (1.0, 1.0, 1.0)),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.size = size
        light.data.color = color
        light.rotation_euler = (-light.location).to_track_quat("-Z", "Y").to_euler()

    # The red case itself is not rendered: it only catches shadows, so the asset sits on any header colour.
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0.0, 0), rotation=(math.pi / 2, 0, 0))
    bpy.context.object.name = "Case shadow catcher"
    bpy.context.object.is_shadow_catcher = True
    return scene


def build():
    m = {
        "bezel": material("Pearl bezel", (0.80, 0.82, 0.74), rough=0.32, coat=0.5),
        "bezel_edge": material("Bezel inner chamfer", (0.42, 0.47, 0.45), metal=0.6, rough=0.25),
        "gasket": material("Black gasket", (0.015, 0.02, 0.025), rough=0.55),
        "iris": iris_material(),
        "inner": material("Inner lens element", (0.85, 0.95, 1.0), rough=0.02, coat=1.0, transmission=1.0, ior=1.45),
        "glass": material("Scanner glass", BLUE_GLASS, rough=0.04, coat=1.0, transmission=0.85, ior=1.1),
        "socket": material("LED socket", (0.10, 0.02, 0.03), rough=0.45),
        "red": material("Red LED", (0.80, 0.08, 0.10), rough=0.08, coat=1, transmission=0.5, emission=(1, 0.08, 0.08), strength=1.2),
        "amber": material("Amber LED", (0.95, 0.62, 0.10), rough=0.08, coat=1, transmission=0.5, emission=(1, 0.55, 0.05), strength=1.0),
        "green": material("Green LED", (0.14, 0.42, 0.18), rough=0.08, coat=1, transmission=0.5),
        "arc": material("Scanner sweep", (0, 0, 0), emission=(0.75, 0.95, 1.0), strength=0),
        "ring": material("Retaining ring", (0.55, 0.6, 0.58), metal=0.8, rough=0.2),
    }
    lens = at(*LENS)
    disc("Bezel", lens, 2.2, 0.55, m["bezel"], bevel=0.16, front=0.55)
    disc("Bezel chamfer", lens, 1.80, 0.62, m["bezel_edge"], bevel=0.05, front=0.60)
    disc("Gasket", lens, 1.68, 0.64, m["gasket"], bevel=0.04, front=0.62)
    disc("Iris", lens, 1.52, 0.60, m["iris"], front=0.66)
    torus("Retaining ring", lens, 1.40, 0.05, m["ring"], front=0.74)
    torus("Iris spacer", lens, 0.86, 0.025, m["bezel_edge"], front=0.70)
    dome("Inner lens element", lens, 0.82, 0.2, m["inner"], front=0.88)
    dome("Scanner glass", lens, 1.62, 0.40, m["glass"], front=1.10)

    # The scanner sweep: a 100° slice of a ring of light inside the glass, brightest at its leading end.
    bpy.ops.mesh.primitive_torus_add(
        major_segments=128, minor_segments=16, major_radius=1.25, minor_radius=0.09, rotation=(math.pi / 2, 0, 0)
    )
    arc = bpy.context.object
    arc.name = "Sweep arc"
    arc.data.materials.append(m["arc"])
    arc.location = lens + Vector((0, -0.78, 0))
    # Keep only a 100° slice of the ring.
    bpy.context.view_layer.objects.active = arc
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for v in arc.data.vertices:
        angle = math.degrees(math.atan2(v.co.y, v.co.x)) % 360
        v.select = angle > 100
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")
    smooth(arc)
    nodes = m["arc"].node_tree.nodes
    links = m["arc"].node_tree.links
    coords = nodes.new("ShaderNodeTexCoord")
    gradient = nodes.new("ShaderNodeTexGradient")
    gradient.gradient_type = "RADIAL"
    tail = nodes.new("ShaderNodeMapRange")
    tail.inputs["From Min"].default_value = 0.5
    tail.inputs["From Max"].default_value = 0.5 + 100 / 360
    fade = nodes.new("ShaderNodeMath")
    fade.operation = "POWER"
    fade.inputs[1].default_value = 1.3
    strength = nodes.new("ShaderNodeMath")
    strength.name = "Sweep strength"
    strength.operation = "MULTIPLY"
    strength.inputs[1].default_value = 0
    links.new(coords.outputs["Object"], gradient.inputs["Vector"])
    links.new(gradient.outputs["Fac"], tail.inputs["Value"])
    links.new(tail.outputs["Result"], fade.inputs[0])
    links.new(fade.outputs[0], strength.inputs[0])
    links.new(strength.outputs[0], nodes["Principled BSDF"].inputs["Emission Strength"])
    # The tail fades out instead of showing a dark unlit arc.
    links.new(fade.outputs[0], nodes["Principled BSDF"].inputs["Alpha"])

    lights = []
    for (x, y), key in zip(LIGHTS, ("red", "amber", "green")):
        c = at(x, y)
        disc("LED socket", c, 0.62, 0.22, m["socket"], bevel=0.06, front=0.22)
        lights.append(dome(f"{key} LED", c, 0.45, 0.22, m[key], front=0.42))

    # Light inside the lens, so the bezel and glass pick up the glow the way a real lamp would light them.
    bpy.ops.object.light_add(type="POINT", location=lens + Vector((0, -0.75, 0)))
    lamp = bpy.context.object
    lamp.location = lens + Vector((0, -0.95, 0))
    lamp.name = "Lens lamp"
    lamp.data.shadow_soft_size = 0.6
    lamp.data.energy = 0
    lamp.data.color = (0.3, 0.7, 1.0)
    bpy.ops.object.light_add(type="POINT", location=at(*LIGHTS[2]) + Vector((0, -0.6, 0)))
    led_lamp = bpy.context.object
    led_lamp.name = "Green LED lamp"
    led_lamp.data.shadow_soft_size = 0.3
    led_lamp.data.energy = 0
    led_lamp.data.color = (0.35, 1.0, 0.45)
    return m, arc, lamp, led_lamp




def apply_state(m, arc, lamp, led_lamp, *, lit, sweep=False):
    """At rest, or lit for a waiting update; `sweep` shows the scanner arc in its starting position."""
    glass = m["glass"].node_tree.nodes["Principled BSDF"]
    level = 1.0 if lit else 0.0
    # The glass keeps its Pokédex blue and lights up from inside.
    _set(glass, ("Base Color",), (*mix(BLUE_GLASS, BLUE_GLOW, level), 1))
    glow(m["glass"], BLUE_GLOW, 0.1 * level)
    tint_iris(m["iris"], [mix(b, g, level) for b, g in zip(BLUE_IRIS, BLUE_IRIS_LIT)], 0.6 + 0.4 * level)
    lamp.data.energy = 5 * level
    # The green status light says the glow means "update", not just "on".
    glow(m["green"], GREEN, 1.4 * level)
    led_lamp.data.energy = 2 * level
    arc.hide_render = not sweep
    m["arc"].node_tree.nodes["Sweep strength"].inputs[1].default_value = 12 if sweep else 0


def render(scene, path):
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def render_glow(scene, path, scale):
    """Only the emitted light: every surface turns black and the background opaque, then ImageMagick blurs it."""
    saved = {}
    hidden = []
    black = bpy.data.materials.get("Glow matte") or material("Glow matte", (0, 0, 0), rough=1)
    for obj in scene.objects:
        if obj.type != "MESH" or obj.is_shadow_catcher:
            continue
        mat = obj.data.materials[0]
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        strength = bsdf.inputs["Emission Strength"].default_value
        # The always-on red and amber lights and the resting iris glow too, but only the update light should bloom.
        if mat.name == "Lens iris":
            strength = mat.node_tree.nodes["Iris glow"].outputs[0].default_value - 0.6
        if mat.name == "Scanner sweep" or (strength > 0.05 and mat.name not in ("Red LED", "Amber LED")):
            continue
        if bsdf.inputs["Transmission Weight"].default_value > 0.5 or obj.hide_render:
            # Unlit glass lets the light behind it through.
            hidden.append((obj, obj.hide_render))
            obj.hide_render = True
        else:
            saved[obj.name] = mat
            obj.data.materials[0] = black
    scene.render.film_transparent = False
    world = scene.world.node_tree.nodes["Background"]
    world_strength = world.inputs[1].default_value
    world.inputs[1].default_value = 0
    scene.view_settings.view_transform = "Standard"
    render(scene, path)
    scene.view_settings.view_transform = "Standard"
    world.inputs[1].default_value = world_strength
    scene.render.film_transparent = True
    for obj, was in hidden:
        obj.hide_render = was
    for name, mat in saved.items():
        scene.objects[name].data.materials[0] = mat
    # A tight halo plus a wide bloom, like light scattering in the air and in the eye.
    subprocess.run(
        [
            "magick", str(path),
            "(", "+clone", "-blur", f"0x{3 * scale}", ")",
            "(", "-clone", "0", "-blur", f"0x{8 * scale}", "-evaluate", "multiply", "1.2", ")",
            "-delete", "0", "-compose", "screen", "-composite",
            "-alpha", "off", str(path),
        ],
        check=True,
    )


def pixels(path):
    """An 8-bit PNG as straight RGBA floats, rows bottom to top."""
    image = bpy.data.images.load(str(path))
    width, height = image.size
    out = np.empty(width * height * 4, np.float32)
    image.pixels.foreach_get(out)
    bpy.data.images.remove(image)
    return out.reshape(height, width, 4)


def save_webp(px, path):
    height, width, _ = px.shape
    image = bpy.data.images.new(path.stem, width, height, alpha=True)
    image.pixels.foreach_set(np.clip(px, 0, 1).ravel())
    png = path.with_suffix(".png")
    image.filepath_raw = str(png)
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(image)
    subprocess.run(["magick", str(png), "-define", "webp:lossless=true", str(path)], check=True)
    png.unlink()


def feathered(px, scale):
    """Fades the frame's edges, so the shadow on the case never ends in a hard line where the render stops."""
    height, width, _ = px.shape
    band = 9 * scale
    x = np.minimum(np.arange(width), np.arange(width)[::-1]) / band
    y = np.minimum(np.arange(height), np.arange(height)[::-1]) / band
    ramp = np.clip(np.minimum(y[:, None], x[None, :]), 0, 1)
    out = px.copy()
    out[..., 3] *= ramp * ramp * (3 - 2 * ramp)
    return out


def light_layer(px):
    """Light on black as a transparent layer: its brightest channel becomes alpha and the colour is un-darkened, so
    laying it over the case adds light without the app needing a blend mode."""
    alpha = px[..., :3].max(axis=2, keepdims=True)
    out = np.empty_like(px)
    out[..., :3] = np.where(alpha > 1e-3, px[..., :3] / np.maximum(alpha, 1e-3), 0)
    out[..., 3:] = alpha
    return out


def render_alone(scene, keep, path):
    """Renders `keep` with everything else hidden, on a transparent background."""
    hidden = [(obj, obj.hide_render) for obj in scene.objects if obj is not keep]
    for obj, _ in hidden:
        obj.hide_render = True
    render(scene, path)
    for obj, was in hidden:
        obj.hide_render = was


def main():
    args = arguments()
    args.output.mkdir(parents=True, exist_ok=True)
    scene = scene_setup(args.scale)
    m, arc, lamp, led_lamp = build()
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for name, lit in (("off", False), ("lit", True)):
            apply_state(m, arc, lamp, led_lamp, lit=lit)
            render(scene, tmp / f"{name}.png")
        render_glow(scene, tmp / "lit-glow.png", args.scale)
        # The arc alone, so the app can spin it over the lit lens without dragging the fixed reflections round too.
        apply_state(m, arc, lamp, led_lamp, lit=True, sweep=True)
        render_alone(scene, arc, tmp / "sweep.png")
        # Seen bare, the arc is a hard line; inside the glass it glows. A soft halo under it stands in for the glass.
        subprocess.run(
            [
                "magick", str(tmp / "sweep.png"),
                "(", "+clone", "-blur", f"0x{1.5 * args.scale}", "-channel", "A", "-evaluate", "multiply", "0.9", "+channel", ")",
                "+swap", "-compose", "over", "-composite", str(tmp / "sweep.png"),
            ],
            check=True,
        )

        save_webp(feathered(pixels(tmp / "off.png"), args.scale), args.output / "lens-off.webp")
        save_webp(feathered(pixels(tmp / "lit.png"), args.scale), args.output / "lens-lit.webp")
        save_webp(light_layer(pixels(tmp / "lit-glow.png")), args.output / "lens-lit-glow.webp")
        # A square centred on the lens, so it turns about its own centre.
        save_webp(pixels(tmp / "sweep.png")[:, : (PAD * 2 + 44) * args.scale], args.output / "lens-sweep.webp")

    apply_state(m, arc, lamp, led_lamp, lit=False)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.root / "assets" / "blender" / "header-lens.blend"))


main()
