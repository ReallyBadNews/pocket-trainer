"""Create editable original device, ball and badge scenes and transparent app renders.
Run: blender --background --python scripts/blender-assets.py
"""
import bpy
import math
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'crafted'
SOURCE = ROOT / 'assets' / 'blender'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)

def material(name, rgb, metal=0, rough=.3):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    return mat

def setup(scale=3.4):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.world = bpy.data.worlds.new('Studio')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.72, .78, .85, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .45
    bpy.ops.object.camera_add(location=(3.3, -7, 3.0))
    cam = bpy.context.object
    cam.rotation_euler = (Vector((0, 0, 0)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = scale
    scene.camera = cam
    for location, energy, size in [((-3, -4, 6), 600, 5), ((4, -1, 2), 280, 4), ((0, 3, 4), 750, 3)]:
        bpy.ops.object.light_add(type='AREA', location=location)
        light = bpy.context.object
        light.data.energy = energy
        light.data.shape = 'DISK'
        light.data.size = size
        light.rotation_euler = (-light.location).to_track_quat('-Z', 'Y').to_euler()
    return scene

def sphere(name, location, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj

def cube(name, location, scale, mat, bevel=.1):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    mod = obj.modifiers.new('Molded edges', 'BEVEL')
    mod.width = bevel
    mod.segments = 5
    obj.modifiers.new('Surface normals', 'WEIGHTED_NORMAL')
    return obj

def cylinder(name, location, radius, depth, mat, vertices=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=(math.pi/2, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    mod = obj.modifiers.new('Soft rim', 'BEVEL')
    mod.width = .035
    mod.segments = 3
    obj.modifiers.new('Surface normals', 'WEIGHTED_NORMAL')
    return obj

def render(scene, name):
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.filepath = str(OUT / f'{name}.png')
    bpy.ops.render.render(write_still=True)

def hemisphere(name, top, mat):
    verts, faces = [], []
    for ring in range(33):
        angle = ring / 32 * math.pi/2
        for segment in range(64):
            phi = segment / 64 * math.tau
            verts.append((math.sin(angle)*math.cos(phi)*1.01, math.sin(angle)*math.sin(phi)*1.01, math.cos(angle)*1.01*(1 if top else -1) + (.045 if top else -.045)))
    for ring in range(32):
        for segment in range(64):
            a = ring*64 + segment
            b = ring*64 + (segment+1)%64
            faces.append((a,b,b+64,a+64))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for poly in mesh.polygons:
        poly.use_smooth = True
    solid = obj.modifiers.new('Shell thickness', 'SOLIDIFY')
    solid.thickness = .05
    return obj

scene = setup(3.3)
red = material('Enamel red', (.65, .022, .046), .08, .22)
white = material('Warm porcelain', (.92, .95, .9), .05, .26)
dark = material('Graphite seam', (.018, .029, .035), .2, .28)
sphere('Inner core', (0,0,0), (.985,.985,.985), dark)
top = hemisphere('Opening red shell', True, red)
hemisphere('Lower ivory shell', False, white)
cylinder('Button surround', (0,-1,0), .31, .16, dark)
cylinder('Button bevel', (0,-1.1,0), .225, .13, white)
cylinder('Button face', (0,-1.18,0), .155, .045, white)
top.location.z = 0
top.keyframe_insert(data_path='location', frame=1)
top.location.z = .75
top.keyframe_insert(data_path='location', frame=24)
top.location.z = 0
top.keyframe_insert(data_path='location', frame=48)
scene.frame_end = 48
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'pokeball.blend'))
render(scene, 'pokeball')
scene.frame_set(24)
render(scene, 'pokeball-open')

scene = setup(3.1)
gold = material('Brushed gold', (.87,.54,.095), .7, .3)
rim = material('Badge edge', (.39,.2,.02), .7, .28)
red = material('Badge enamel', (.7,.04,.055), .05, .24)
cream = material('Badge center', (.97,.93,.74), .15, .28)
cylinder('Medallion edge', (0,0,0), 1.02, .23, rim, 10)
cylinder('Gold medallion', (0,-.14,0), .94, .15, gold, 10)
cylinder('Inset red emblem', (0,-.24,0), .60, .10, red)
cube('Emblem stripe', (0,-.315,0), (1.08,.06,.13), gold, .025)
cylinder('Emblem center', (0,-.37,0), .22, .10, cream)
for angle in [math.pi/4, 3*math.pi/4, 5*math.pi/4, 7*math.pi/4]:
    sphere('Rivet', (.75*math.cos(angle),-.27,.75*math.sin(angle)), (.045,.025,.045), cream)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'discovery-badge.blend'))
render(scene, 'badge')

scene = setup(6.4)
red = material('Pokédex red casing', (.64,.03,.065), .1, .28)
edge = material('Deep red edge', (.32,.012,.033), .1, .3)
dark = material('Charcoal controls', (.035,.05,.065), .05, .4)
white = material('Display bezel', (.8,.85,.82), .15, .3)
green = material('LCD glass', (.58,.72,.47), .05, .25)
blue = material('Scanner blue lens', (.02,.55,.8), .4, .15)
gold = material('Indicator gold', (.95,.62,.08), .1, .25)
cube('Rear molded case', (0,.16,0), (3.3,.65,4.7), edge, .26)
cube('Front molded case', (0,-.1,.05), (3.2,.5,4.65), red, .24)
cube('Screen bezel', (0,-.40,.18), (2.72,.2,2.4), white, .18)
cube('Recessed display', (0,-.515,.25), (2.23,.08,1.85), dark, .09)
cube('LCD', (0,-.56,.25), (2.08,.045,1.7), green, .06)
cylinder('Scanner lens rim', (-.93,-.42,1.82), .43, .15, white)
cylinder('Scanner lens', (-.93,-.53,1.82), .34, .16, blue)
for x, mat in [(-.12,red),(.23,gold),(.58,green)]:
    cylinder('Status light', (x,-.39,1.95), .09, .12, mat)
cube('D-pad horizontal', (.83,-.43,-1.49), (.83,.2,.28), dark, .04)
cube('D-pad vertical', (.83,-.44,-1.49), (.28,.2,.83), dark, .04)
cylinder('Scan key', (-.95,-.44,-1.25), .28, .2, dark)
cube('Trainer readout', (-.48,-.4,-1.84), (1.1,.09,.38), green, .04)
for i in range(3):
    cube('Speaker grille', (.6+i*.18,-.48,-.98), (.06,.03,.18), dark, .02)
cylinder('Display power', (-.91,-.56,-.8), .09, .055, red)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'pokedex-device.blend'))
render(scene, 'device')
print('Created device, Poké Ball animation and discovery badge assets.')
