"""Render the existing Pokédex as a live discovery frame.

The camera faces the display directly so native Pokémon artwork can be drawn
inside the measured screen rectangle without a perspective approximation.
Run with Blender's background process to preserve the open artist scene:

  blender --background --factory-startup --python scripts/blender-discovery-device.py -- --output /tmp/discovery

The editable source keeps the physical modeling and procedural lighting from
the original device, removes the baked LCD interface, and expands its display.
"""

import argparse
import json
import math
from pathlib import Path
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector


def arguments():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args(args)


def resize(obj, size):
    obj.dimensions = size
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.select_set(False)


def main():
    args = arguments()
    args.output.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(args.root / "assets/blender/pokedex-device.blend"))
    scene = bpy.context.scene
    bpy.ops.object.select_all(action="DESELECT")

    # The display becomes a clean aperture for the app's one-time reveal.
    # Typography, species names and controls stay native and accessible.
    remove_prefixes = (
        "LCD vertical grid", "LCD horizontal grid", "LCD scan reticle",
        "Reticle horizontal tick", "Reticle vertical tick", "LCD title",
        "LCD entry number", "Display power metal collar", "Display power key",
        "Trainer ID readout", "Device model engraving",
    )
    for obj in list(bpy.data.objects):
        if obj.name.startswith(remove_prefixes):
            bpy.data.objects.remove(obj, do_unlink=True)

    bezel = bpy.data.objects["Display magnesium bezel"]
    gasket = bpy.data.objects["Recessed display gasket"]
    screen = bpy.data.objects["Active LCD panel"]
    resize(bezel, (2.85, 0.21, 2.56))
    resize(gasket, (2.59, 0.08, 2.24))
    resize(screen, (2.42, 0.035, 2.08))
    bezel.location.z = 0.25
    gasket.location.z = 0.31
    screen.location.z = 0.31

    # Move the tiny bezel fasteners out of the usable content area.
    for obj in bpy.data.objects:
        if obj.name.startswith(("Display bezel fastener", "Fastener slot")):
            obj.location.x = math.copysign(1.305, obj.location.x)
            obj.location.z = -0.60 if obj.location.z < 0 else 1.20
        if obj.name.startswith("Speaker acoustic port"):
            obj.location.z -= 0.1

    panel_mat = screen.data.materials[0].copy()
    panel_mat.name = "Unlit discovery screen"
    shader = panel_mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (0.009, 0.021, 0.015, 1)
    shader.inputs["Roughness"].default_value = 0.30
    for key in ("Emission Strength", "Coat Weight"):
        if shader.inputs.get(key):
            shader.inputs[key].default_value = 0
    screen.data.materials.clear()
    screen.data.materials.append(panel_mat)
    auxiliary = bpy.data.objects["Trainer ID glass"]
    auxiliary.data.materials.clear()
    auxiliary.data.materials.append(panel_mat)

    cam = scene.camera
    cam.location = (0, -10, 0.05)
    cam.rotation_euler = (Vector((0, 0, 0.05)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 5.30
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 600
    scene.render.resolution_y = 680
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 80
    scene.render.filepath = str(args.output / "discovery-device.png")
    # Prevent a second generation from adding a .blend1 file to the output.
    bpy.context.preferences.filepaths.save_version = 0
    bpy.context.view_layer.update()

    # Exclude the panel's bevel so a native rectangular View remains entirely
    # within the modeled screen. Screen top-left coordinates use UI axes.
    inset = 0.04
    half_x = 2.42 / 2 - inset
    half_z = 2.08 / 2 - inset
    a = world_to_camera_view(scene, cam, Vector((-half_x, -0.595, 0.31 + half_z)))
    b = world_to_camera_view(scene, cam, Vector((half_x, -0.595, 0.31 - half_z)))
    metadata = {
        "width": 600,
        "height": 680,
        "logicalSize": {"width": 300, "height": 340},
        "screen": {
            "x": round(a.x, 8), "y": round(1 - a.y, 8),
            "width": round(b.x - a.x, 8), "height": round(a.y - b.y, 8),
            "cornerRadius": 0.014,
        },
        "screenPixels": {
            "x": round(a.x * 600, 3), "y": round((1 - a.y) * 680, 3),
            "width": round((b.x - a.x) * 600, 3), "height": round((a.y - b.y) * 680, 3),
        },
        "source": "assets/blender/pokedex-device.blend",
        "camera": "Orthographic, straight on; no image skew required",
    }
    (args.output / "discovery-device.json").write_text(json.dumps(metadata, indent=2) + "\n")
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output / "discovery-device.blend"))
    bpy.ops.render.render(write_still=True)
    print(json.dumps(metadata))


main()
