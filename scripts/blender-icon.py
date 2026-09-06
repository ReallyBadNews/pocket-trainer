"""Render the app icon from the editable Poké Ball scene, with an opaque red background."""
import bpy
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'assets/blender/pokeball.blend'))
scene = bpy.context.scene
scene.frame_set(1)
camera = scene.camera
bpy.ops.mesh.primitive_plane_add(size=200, location=-camera.location.normalized()*4, rotation=camera.rotation_euler)
mat = bpy.data.materials.new('Icon red background')
mat.use_nodes = True
nodes = mat.node_tree.nodes
nodes.clear()
emission = nodes.new('ShaderNodeEmission')
emission.inputs['Color'].default_value = (.58,.038,.060,1)
output = nodes.new('ShaderNodeOutputMaterial')
mat.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
bpy.context.object.data.materials.append(mat)
scene.render.film_transparent = False
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
for name, size in [('app-icon',1024),('favicon',128)]:
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.filepath = str(ROOT / f'assets/crafted/{name}.png')
    bpy.ops.render.render(write_still=True)
