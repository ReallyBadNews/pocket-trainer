"""Render earned trainer accessories using the existing portrait's exact camera.

From the repository root:
    blender --background --factory-startup --python scripts/blender-trainer-accessories.py

The three RGBA layers sit above the existing outfit and face/hair renders.
All geometry and materials remain editable in trainer-accessories.blend. The
script runs in a background Blender process and never touches a foreground scene.
Use --output-dir, --source-out and --preview-dir for an isolated render review.
"""

import argparse
import math
from pathlib import Path
import sys

import bpy


args_after_separator = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
parser.add_argument('--output-dir', type=Path)
parser.add_argument('--source-out', type=Path)
parser.add_argument('--preview-dir', type=Path)
args = parser.parse_args(args_after_separator)
root = args.root.resolve()
out = args.output_dir or root / 'assets' / 'crafted' / 'trainers'
source_out = args.source_out or root / 'assets' / 'blender' / 'trainer-accessories.blend'
preview_dir = args.preview_dir
out.mkdir(parents=True, exist_ok=True)
source_out.parent.mkdir(parents=True, exist_ok=True)
if preview_dir:
    preview_dir.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=str(root / 'assets' / 'blender' / 'trainer-avatar.blend'))
scene = bpy.context.scene
# Keeping the saved camera, studio lights, world and AgX look makes these
# layers align with all 115 existing portrait layers without a visible seam.
scene.render.resolution_x = scene.render.resolution_y = 384
scene.render.resolution_percentage = 100
scene.render.film_transparent = True


def material(name, color, roughness=.45, metallic=0.0, coat=0.0, micro=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, 1.0)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    for name, value in [('Base Color', (*color, 1.0)), ('Roughness', roughness),
                        ('Metallic', metallic), ('Coat Weight', coat), ('Coat Roughness', .2)]:
        if name in bsdf.inputs:
            bsdf.inputs[name].default_value = value
    if micro:
        noise = nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = 150
        noise.inputs['Detail'].default_value = 3
        bump = nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = micro
        bump.inputs['Distance'].default_value = .009
        links.new(noise.outputs['Fac'], bump.inputs['Height'])
        links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def collection(name):
    item = bpy.data.collections.new(name)
    scene.collection.children.link(item)
    return item


def finish(obj, name, mat, target, bevel=0.0):
    obj.name = name
    obj.data.materials.append(mat)
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    target.objects.link(obj)
    if bevel:
        mod = obj.modifiers.new('Soft crafted edge', 'BEVEL')
        mod.width, mod.segments = bevel, 4
    if obj.type == 'MESH':
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def cylinder(name, location, radius, depth, mat, target, bevel=.015):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=radius, depth=depth,
                                      location=location, rotation=(math.pi / 2, 0, 0))
    return finish(bpy.context.object, name, mat, target, bevel)


def sphere(name, location, scale, mat, target):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=20, location=location)
    obj = finish(bpy.context.object, name, mat, target)
    obj.scale = scale
    return obj


def cube(name, location, dimensions, mat, target, bevel=.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, target, bevel)


def prism(name, coordinates, front_y, depth, mat, target, bevel=.015):
    count = len(coordinates)
    vertices = [(x, front_y, z) for x, z in coordinates] + [(x, front_y + depth, z) for x, z in coordinates]
    faces = [tuple(range(count)), tuple(range(count, count * 2))]
    faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
    mesh = bpy.data.meshes.new(f'{name} mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    target.objects.link(obj)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Soft tailored edge', 'BEVEL')
        mod.width, mod.segments = bevel, 4
    return obj


def curve(name, points, radius, mat, target):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.resolution_u, data.bevel_depth, data.bevel_resolution = 16, radius, 4
    spline = data.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for point, co in zip(spline.bezier_points, points):
        point.co = co
        point.handle_left_type = point.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, data)
    target.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


gold = material('Brushed compass brass', (.62, .32, .065), .25, .85, .22)
ivory = material('Warm ivory compass enamel', (.86, .88, .74), .18, .05, .62)
teal_enamel = material('Deep teal compass enamel', (.018, .18, .17), .16, .06, .6)
teal_cloth = material('Explorer scarf woven teal', (.018, .13, .145), .62, micro=.19)
teal_fold = material('Explorer scarf fold highlight', (.027, .20, .21), .6, micro=.17)
scarf_trim = material('Scarf ivory selvedge', (.70, .76, .63), .7, micro=.12)
canvas = material('Expedition satchel waxed canvas', (.27, .17, .065), .59, coat=.05, micro=.22)
canvas_flap = material('Expedition satchel flap canvas', (.39, .27, .12), .56, coat=.06, micro=.21)
leather = material('Saddle leather straps', (.105, .050, .018), .4, coat=.15, micro=.10)
thread = material('Satchel contrast stitching', (.66, .52, .30), .71)

pin = collection('ACCESSORY - Field pin')
scarf = collection('ACCESSORY - Explorer scarf')
satchel = collection('ACCESSORY - Expedition satchel')
accessories = {'field-pin': pin, 'explorer-scarf': scarf, 'expedition-satchel': satchel}

# The spare lapel is opposite the jacket's existing Poké Ball badge.
cx, cz = -.68, 1.37
cylinder('Field pin brass bezel', (cx, -.65, cz), .265, .07, gold, pin, .02)
cylinder('Field pin ivory enamel', (cx, -.705, cz), .217, .04, ivory, pin, .013)
star = [(cx, cz+.176), (cx+.043, cz+.043), (cx+.176, cz), (cx+.043, cz-.043),
        (cx, cz-.176), (cx-.043, cz-.043), (cx-.176, cz), (cx-.043, cz+.043)]
prism('Four-point field compass', star, -.744, .025, teal_enamel, pin, .004)
cylinder('Compass center brass rivet', (cx, -.775, cz), .038, .016, gold, pin, .006)

# The scarf hugs the collar, with modeled folds and asymmetrical short tails.
curve('Scarf folded collar', [(-.43,-.17,1.84),(-.42,-.45,1.76),(0,-.65,1.67),
                               (.42,-.45,1.76),(.43,-.17,1.84)], .125, teal_cloth, scarf)
curve('Scarf upper fold', [(-.39,-.31,1.86),(-.31,-.59,1.77),(.08,-.69,1.74),
                           (.40,-.38,1.84)], .033, teal_fold, scarf)
prism('Scarf softly folded kerchief front', [(-.43,1.71),(.43,1.71),(.23,1.43),(0,1.27),(-.27,1.43)],
      -.72, .07, teal_cloth, scarf, .05)
prism('Explorer scarf long tail', [(-.39,1.64),(-.14,1.55),(-.20,.78),(-.38,.65),(-.47,.84)],
      -.73, .11, teal_cloth, scarf, .05)
prism('Explorer scarf short tail', [(-.43,1.57),(-.55,1.56),(-.74,1.03),(-.57,.89),(-.46,1.06)],
      -.755, .09, teal_fold, scarf, .04)
sphere('Scarf soft tied knot', (-.36,-.76,1.57), (.22,.13,.17), teal_cloth, scarf)
curve('Scarf knot fold', [(-.45,-.83,1.65),(-.37,-.90,1.57),(-.26,-.82,1.50)], .02, teal_fold, scarf)
curve('Long scarf selvedge', [(-.39,-.793,1.46),(-.40,-.791,1.17),(-.37,-.793,.85)], .014, scarf_trim, scarf)
curve('Scarf tail hem', [(-.36,-.791,.81),(-.29,-.792,.73),(-.23,-.790,.82)], .016, scarf_trim, scarf)

# A practical expedition bag: shoulder strap, rounded canvas body and brass
# buckle. The strap is visible even in compact circular avatar presentations.
prism('Satchel broad cross-body leather strap', [(.68,1.80),(.85,1.72),(-.63,.72),(-.79,.88)],
      -.75, .055, leather, satchel, .034)
curve('Strap upper stitched edge', [(.65,-.787,1.75),(.03,-.789,1.31),(-.67,-.787,.84)], .010, thread, satchel)
curve('Strap lower stitched edge', [(.75,-.787,1.67),(.12,-.789,1.23),(-.58,-.787,.77)], .010, thread, satchel)
cube('Rounded canvas satchel body', (-.75,-.75,.72), (.94,.28,.77), canvas, satchel, .12)
prism('Satchel rounded envelope flap', [(-1.22,1.08),(-.28,1.08),(-.29,.83),(-.75,.68),(-1.21,.84)],
      -.927, .055, canvas_flap, satchel, .06)
curve('Satchel stitched flap edge', [(-1.14,-.969,.97),(-1.13,-.980,.87),(-.76,-.985,.75),
                                   (-.37,-.980,.87),(-.36,-.969,.97)], .012, thread, satchel)
cube('Leather satchel clasp', (-.75,-.991,.69), (.16,.038,.37), leather, satchel, .025)
cube('Brass buckle outer frame', (-.75,-1.02,.79), (.235,.05,.19), gold, satchel, .035)
cube('Buckle leather inset', (-.75,-1.06,.79), (.13,.018,.075), leather, satchel, .012)
cube('Brass buckle pin', (-.75,-1.085,.79), (.022,.016,.13), gold, satchel, .008)
for x in (-1.12,-.37):
    cylinder('Satchel side brass rivet', (x,-.925,.69), .031, .019, gold, satchel, .008)

content = [c for c in scene.collection.children if any(o.type in {'MESH','CURVE'} for o in c.all_objects)]
default_avatar = [c for c in content if not c.hide_render and c not in accessories.values()]
face = next(c for c in content if c.name.startswith('FACE'))
holdout = bpy.data.materials.new('Face occlusion matte - transparent layer trim')
holdout.use_nodes = True
holdout.node_tree.nodes.clear()
hole = holdout.node_tree.nodes.new('ShaderNodeHoldout')
output = holdout.node_tree.nodes.new('ShaderNodeOutputMaterial')
holdout.node_tree.links.new(hole.outputs[0], output.inputs['Surface'])
face_materials = {o: list(o.data.materials) for o in face.all_objects if o.type in {'MESH', 'CURVE'}}


def mask_face(enabled):
    # Trim the collar portions physically behind the chin. This keeps the
    # accessory above the existing face/neck image without painting over it.
    for obj, saved in face_materials.items():
        obj.data.materials.clear()
        for mat in ([holdout] if enabled else saved):
            obj.data.materials.append(mat)


def show(*visible):
    for item in content:
        item.hide_render = item not in visible


def render(path, format='WEBP'):
    scene.render.image_settings.file_format = format
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.quality = 94
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


for name, item in accessories.items():
    show(item, face)
    mask_face(True)
    render(out / f'trainer-accessory-{name}.webp')
    if preview_dir:
        render(preview_dir / f'{name}-layer.png', 'PNG')
    mask_face(False)
    if preview_dir:
        show(*default_avatar, item)
        render(preview_dir / f'{name}-composite.png', 'PNG')

show(*default_avatar, pin)
scene.render.image_settings.file_format = 'WEBP'
bpy.ops.wm.save_as_mainfile(filepath=str(source_out))
print(f'Rendered 3 aligned accessory layers to {out}')
print(f'Saved editable accessories to {source_out}')
