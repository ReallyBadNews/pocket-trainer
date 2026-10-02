"""Build the seven inspectable achievement badges and their runtime meshes.

Run in a separate Blender process to preserve an open artist scene:
    blender --background --factory-startup --python scripts/blender-badges.py

Optional staging directory, PNG studio previews and 640px WebP thumbnails:
    blender --background --factory-startup --python scripts/blender-badges.py -- \
        --output-dir /private/tmp/badge-addition --previews

With --previews, the same front render is also saved at WebP quality 94 to
assets/crafted/badges/<emblem>-front.webp for the app's static fallback artwork.

Runtime coordinates are X right, Y up, +Z front. Indexed vertices contain
position XYZ, normal XYZ, and a material index (stride 7). No texture is needed.
The meshes share a machined gold base.json with individually raised enamel emblems.
Palette colors are sRGB; lighting should decode them to linear and encode the result.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


EMBLEMS = ("medal", "starters", "eevee", "birds", "fossil", "dex", "binder")
PALETTE = (
    ("Brushed warm gold", (0.83, 0.59, 0.27), 0.90, 0.27),
    ("Polished gold rail", (0.975, 0.82, 0.48), 0.93, 0.17),
    ("Oxidized bronze recess", (0.44, 0.30, 0.18), 0.80, 0.36),
    ("Ivory vitreous enamel", (0.98, 0.96, 0.88), 0.04, 0.22),
    ("Leaf green enamel", (0.294, 0.529, 0.337), 0.06, 0.19),
    ("Fire orange enamel", (0.80, 0.40, 0.259), 0.06, 0.19),
    ("Water blue enamel", (0.231, 0.514, 0.678), 0.06, 0.19),
    ("Eevee brown enamel", (0.647, 0.427, 0.251), 0.06, 0.20),
    ("Fossil bronze enamel", (0.573, 0.467, 0.267), 0.08, 0.23),
    ("Pokédex red enamel", (0.718, 0.275, 0.310), 0.06, 0.19),
    ("Binder blue enamel", (0.310, 0.424, 0.651), 0.06, 0.19),
)


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--previews", action="store_true")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def make_materials():
    result = []
    for name, rgb, metallic, roughness in PALETTE:
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        linear = tuple(value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4 for value in rgb)
        mat.diffuse_color = (*linear, 1)
        shader = mat.node_tree.nodes.get("Principled BSDF")
        shader.inputs["Base Color"].default_value = (*linear, 1)
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Roughness"].default_value = roughness
        shader.inputs["Coat Weight"].default_value = 0.45 if metallic < 0.1 else 0.18
        shader.inputs["Coat Roughness"].default_value = 0.15
        result.append(mat)
    return result


def mesh_object(name, vertices, faces, material, smooth=True):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(MATERIALS[material])
    for polygon in mesh.polygons:
        polygon.use_smooth = smooth
    return obj


def disk(name, radius, bottom, top, material, sides=48, bevel=0.018, lower_material=None):
    # Four explicit rings keep a precise rolled rim without heavy modifiers.
    rings = ((radius - bevel, bottom), (radius, bottom + bevel),
             (radius, top - bevel), (radius - bevel, top))
    vertices = [(r * math.cos(i * math.tau / sides), r * math.sin(i * math.tau / sides), z)
                for r, z in rings for i in range(sides)]
    if lower_material is None:
        faces = [tuple(reversed(range(sides))), tuple(range(3 * sides, 4 * sides))]
        cap_count = 2
    else:
        # Split the caps at their center so the two enamel hemispheres share
        # the same physical surface instead of stacking nearly coplanar faces.
        vertices.extend(((0, 0, bottom), (0, 0, top)))
        faces = [(4 * sides, (i + 1) % sides, i) for i in range(sides)]
        faces.extend((4 * sides + 1, 3 * sides + i, 3 * sides + (i + 1) % sides) for i in range(sides))
        cap_count = 2 * sides
    for ring in range(3):
        for index in range(sides):
            following = (index + 1) % sides
            faces.append((ring * sides + index, ring * sides + following,
                          (ring + 1) * sides + following, (ring + 1) * sides + index))
    obj = mesh_object(name, vertices, faces, material)
    if lower_material is not None:
        obj.data.materials.append(MATERIALS[lower_material])
    for polygon in obj.data.polygons:
        if polygon.index < cap_count:
            polygon.use_smooth = False
        if lower_material is not None and polygon.center.y < 0:
            polygon.material_index = 1
    return obj


def ring(name, radius, thickness, z, material, sides=48, cross=6):
    vertices = []
    for index in range(sides):
        angle = index * math.tau / sides
        for step in range(cross):
            section = step * math.tau / cross
            r = radius + thickness * math.cos(section)
            vertices.append((r * math.cos(angle), r * math.sin(angle), z + thickness * math.sin(section)))
    faces = []
    for index in range(sides):
        for step in range(cross):
            following, after = (index + 1) % sides, (step + 1) % cross
            faces.append((index * cross + step, following * cross + step,
                          following * cross + after, index * cross + after))
    return mesh_object(name, vertices, faces, material)


def bar(name, start, end, width, depth, material):
    # Beveled linework is editable, with only two bevel segments.
    middle = (Vector(start) + Vector(end)) / 2
    direction = Vector(end) - Vector(start)
    bpy.ops.mesh.primitive_cube_add(size=1, location=middle)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (width, depth, direction.length)
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(MATERIALS[material])
    bevel = obj.modifiers.new("Soft enamel edge", "BEVEL")
    bevel.width = min(width, depth) * 0.28
    bevel.segments = 1
    return obj


def stroke(name, points, radius, z, material, closed=False):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 1
    curve.bevel_depth = radius
    curve.bevel_resolution = 1
    curve.resolution_u = 1
    curve.use_fill_caps = True
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, (x, y) in zip(spline.points, points):
        point.co = (x, y, z, 1)
    spline.use_cyclic_u = closed
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(MATERIALS[material])
    return obj


def raised(name, points, z, thickness, material):
    count = len(points)
    vertices = [(x, y, plane) for plane in (z, z + thickness) for x, y in points]
    faces = [tuple(reversed(range(count))), tuple(range(count, 2 * count))]
    faces.extend((i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count))
    obj = mesh_object(name, vertices, faces, material, smooth=False)
    bevel = obj.modifiers.new("Raised enamel bevel", "BEVEL")
    bevel.width = min(0.008, thickness * 0.24)
    bevel.segments = 1
    return obj


def svg(points):
    """Map the existing achievement-emblem.tsx 76×84 drawing to this face."""
    return [((x - 38) * 0.026, (35 - y) * 0.026) for x, y in points]


def build_base():
    disk("Cast decagonal bronze body", 0.99, -0.115, 0.035, 2, sides=10, bevel=0.026)
    disk("Machined gold face", 0.945, 0.024, 0.085, 0, sides=10, bevel=0.018)
    disk("Recessed ivory enamel field", 0.655, 0.073, 0.119, 3, sides=40, bevel=0.012)
    ring("Polished perimeter rail", 0.869, 0.018, 0.083, 1, sides=40, cross=4)
    ring("Enamel retaining bezel", 0.659, 0.018, 0.120, 1, sides=40, cross=4)
    for index in range(20):
        angle = index * math.tau / 20
        a, b = 0.715, 0.832 if index % 2 == 0 else 0.784
        bar("Radial guilloché cut", (a * math.cos(angle), a * math.sin(angle), 0.094),
            (b * math.cos(angle), b * math.sin(angle), 0.094), 0.014, 0.018, 1)
    # A functional rear pin and symmetric maker's mark reward a full turn.
    disk("Rear mounting boss", 0.12, -0.168, -0.112, 2, sides=20, bevel=0.010)
    bar("Gold spring pin", (-0.58, 0.17, -0.208), (0.57, 0.17, -0.208), 0.027, 0.030, 1)
    for x in (-0.59, 0.59):
        ring("Rolled pin hinge" if x < 0 else "Safety clasp", 0.064, 0.020, -0.19, 0, sides=16, cross=4).location = (x, 0.17, 0)
    ring("Rear Poké Ball maker's mark", 0.205, 0.014, -0.129, 0, sides=24, cross=4).location.y = -0.42
    bar("Maker's mark equator", (-0.203, -0.42, -0.127), (0.203, -0.42, -0.127), 0.022, 0.021, 0)
    ring("Maker's mark capture button", 0.057, 0.013, -0.141, 1, sides=16, cross=4).location.y = -0.42


def build_symbol(emblem):
    z = 0.134
    if emblem == "medal":
        disk("Red and ivory discovery enamel", 0.555, 0.115, 0.139, 9, sides=40, bevel=0.006, lower_material=3)
        bar("Discovery Poké Ball seam", (-0.538, 0, 0.158), (0.538, 0, 0.158), 0.060, 0.023, 2)
        disk("Ivory capture button", 0.180, 0.148, 0.178, 3, sides=24, bevel=0.006)
        ring("Capture button gold bezel", 0.180, 0.013, 0.175, 1, sides=24, cross=4)
    elif emblem == "starters":
        raised("Grass starter leaf", svg([(37,18),(30,18),(24,19),(20,23),(20,27),(23,31),(28,32),(32,29),(35,24)]), z, 0.028, 4)
        stroke("Ivory leaf vein", svg([(23,30),(32,22)]), 0.012, z + 0.029, 3)
        raised("Fire starter flame", svg([(46,18),(49,23),(53,26),(54,30),(53,35),(48,38),(43,37),(41,34),(41,30),(44,26),(47,24)]), z, 0.028, 5)
        raised("Water starter drop", svg([(36,33),(33,39),(29,44),(29,48),(32,52),(36,54),(41,52),(44,48),(44,44),(40,39)]), z, 0.028, 6)
    elif emblem == "eevee":
        stroke("Eevee ears and mane", svg([(25,34),(22,17),(34,29),(42,29),(54,17),(51,35),(47,46),(38,51),(30,46),(25,34),(33,29),(43,29),(51,35)]), 0.027, z + 0.014, 7)
        for x in (32, 44):
            disk("Eevee eye", 0.044, z + 0.003, z + 0.024, 7, sides=12, bevel=0.006).location = ((x-38)*0.026, (35-37)*0.026, 0)
        stroke("Eevee smile", svg([(36,43),(38,45),(40,43)]), 0.022, z + 0.014, 7)
    elif emblem == "birds":
        stroke("Legendary bird wings", svg([(20,24),(27,40),(38,48),(49,40),(56,24),(43,31),(38,22),(33,31)]), 0.028, z + 0.014, 6, closed=True)
        for points in ([(27,40),(24,32)],[(49,40),(52,32)],[(38,34),(38,48)]):
            stroke("Feather detail", svg(points), 0.022, z + 0.013, 6)
    elif emblem == "fossil":
        # A continuous ammonite spiral, from its open shell into the center.
        points = []
        for index in range(49):
            t = index / 48
            angle = -0.88 + t * 3.72 * math.pi
            radius = 0.470 * (1 - t) + 0.016
            points.append((math.cos(angle) * radius, math.sin(angle) * radius))
        stroke("Ammonite fossil spiral", points, 0.032, z + 0.014, 8)
        for angle in (0.5, 1.2, 1.9, 2.6, 3.3, 4.0, 4.7):
            radius = 0.486 - 0.47 * (angle + 0.88) / (3.72 * math.pi)
            stroke("Shell growth rib", [(radius*math.cos(angle),radius*math.sin(angle)),((radius+0.09)*math.cos(angle),(radius+0.09)*math.sin(angle))], 0.018, z + 0.012, 8)
    elif emblem == "dex":
        ring("Pokédex Poké Ball outline", 0.442, 0.034, z + 0.014, 9, sides=40, cross=6)
        for a, b in ((-0.435, -0.163),(0.163, 0.435)):
            stroke("Pokédex Poké Ball equator", [(a,0),(b,0)], 0.030, z + 0.014, 9)
        ring("Pokédex capture button", 0.156, 0.028, z + 0.014, 9, sides=24, cross=6)
    elif emblem == "binder":
        for row in range(3):
            for col in range(3):
                x, y = (col - 1) * 0.235, (1 - row) * 0.247
                points = [(x-0.092,y-0.102),(x+0.092,y-0.102),(x+0.092,y+0.102),(x-0.092,y+0.102)]
                raised("Blue binder pocket", points, z, 0.023, 10)
                stroke("Pocket retaining seam", points, 0.009, z + 0.025, 1, closed=True)


def export_mesh(objects, emblem, destination):
    vertices, indices, lookup = [], [], {}
    minimum, maximum = [float("inf")]*3, [-float("inf")]*3
    depsgraph = bpy.context.evaluated_depsgraph_get()
    radius = 0.0
    for obj in objects:
        if obj.type not in ("MESH", "CURVE"):
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
        for triangle in mesh.loop_triangles:
            material = mesh.materials[mesh.polygons[triangle.polygon_index].material_index]
            material_id = next(index for index, original in enumerate(MATERIALS) if original.name == material.name)
            for loop_index in triangle.loops:
                position = obj.matrix_world @ mesh.vertices[mesh.loops[loop_index].vertex_index].co
                normal = (normal_matrix @ mesh.corner_normals[loop_index].vector).normalized()
                rounded = tuple(0.0 if abs(value) < 0.000005 else round(value, 5) for value in (*position,*normal)) + (material_id,)
                if rounded not in lookup:
                    lookup[rounded] = len(vertices) // 7
                    vertices.extend(rounded)
                    radius = max(radius, position.length)
                    for axis in range(3):
                        minimum[axis] = min(minimum[axis], position[axis])
                        maximum[axis] = max(maximum[axis], position[axis])
                indices.append(lookup[rounded])
        evaluated.to_mesh_clear()
    data = {
        "version": 1, "emblem": emblem, "stride": 7, "colorSpace": "srgb",
        "vertices": vertices, "indices": indices,
        "materials": [{"name":name,"color":list(rgb),"metalness":metal,"roughness":rough} for name,rgb,metal,rough in PALETTE],
        "bounds": {"min":[round(v,5) for v in minimum],"max":[round(v,5) for v in maximum],"radius":round(radius,5)},
        "triangleCount": len(indices)//3,
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(data,separators=(",",":"))+"\n")
    print(f"{emblem}: {len(vertices)//7} vertices, {len(indices)//3} triangles, {destination.stat().st_size} bytes")


def studio():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 40
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.world = bpy.data.worlds.new("Badge inspection studio")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.24,0.29,0.32,1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35
    scene.view_settings.view_transform = "AgX"
    bpy.ops.object.camera_add(location=(1.10,0.75,3.5))
    camera = bpy.context.object
    camera.name = "Front inspection camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.55
    camera.rotation_euler = look_rotation(camera.location)
    scene.camera = camera
    for name,location,energy,size,color in (
        ("Warm key",(-2.5,3.5,4.0),180,3.0,(1.0,0.85,0.68)),
        ("Cool reflection strip",(3.0,0.7,2.0),140,2.0,(0.65,0.83,1.0)),
        ("Rear edge softbox",(-1.0,-2.0,-1.7),120,2.0,(0.75,0.89,1.0)),
    ):
        bpy.ops.object.light_add(type="AREA",location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.data.color = color
        light.rotation_euler = (-light.location).to_track_quat("-Z","Y").to_euler()
    return scene


def look_rotation(location):
    direction = Vector(location).normalized()
    right = Vector((0,1,0)).cross(direction).normalized()
    up = direction.cross(right)
    return Matrix((right,up,direction)).transposed().to_euler()


args = arguments()
bpy.ops.wm.read_factory_settings(use_empty=True)
MATERIALS = make_materials()
collections = []
for emblem in EMBLEMS:
    collection = bpy.data.collections.new(f"Badge — {emblem}")
    bpy.context.scene.collection.children.link(collection)
    before = set(bpy.data.objects)
    build_base()
    base_objects = sorted(set(bpy.data.objects)-before,key=lambda obj:obj.name)
    if emblem == "medal":
        export_mesh(base_objects,"base",args.output_dir/"assets"/"crafted"/"badges"/"base.json")
    before_symbol = set(bpy.data.objects)
    build_symbol(emblem)
    symbol_objects = sorted(set(bpy.data.objects)-before_symbol,key=lambda obj:obj.name)
    objects = sorted(set(bpy.data.objects)-before,key=lambda obj:obj.name)
    for obj in objects:
        for owner in list(obj.users_collection):
            owner.objects.unlink(obj)
        collection.objects.link(obj)
    export_mesh(symbol_objects,emblem,args.output_dir/"assets"/"crafted"/"badges"/f"{emblem}.json")
    collections.append(collection)

scene = studio()
for collection in collections:
    collection.hide_render = True
if args.previews:
    destination = args.output_dir/"previews"
    destination.mkdir(parents=True,exist_ok=True)
    for collection,emblem in zip(collections,EMBLEMS):
        collection.hide_render = False
        scene.render.filepath = str(destination/f"{emblem}-front.png")
        bpy.ops.render.render(write_still=True)
        scene.render.image_settings.file_format = "WEBP"
        scene.render.image_settings.quality = 94
        bpy.data.images["Render Result"].save_render(
            str(args.output_dir/"assets"/"crafted"/"badges"/f"{emblem}-front.webp"),scene=scene)
        scene.render.image_settings.file_format = "PNG"
        collection.hide_render = True
    collections[0].hide_render = False
    scene.camera.location = (-0.60,0.35,-3.5)
    scene.camera.rotation_euler = look_rotation(scene.camera.location)
    scene.render.filepath = str(destination/"medal-back.png")
    bpy.ops.render.render(write_still=True)
    scene.camera.location = (1.10,0.75,3.5)
    scene.camera.rotation_euler = look_rotation(scene.camera.location)

for index,collection in enumerate(collections):
    collection.hide_render = index != 0
    collection.hide_viewport = index != 0
source = args.output_dir/"assets"/"blender"/"inspectable-badges.blend"
source.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(source))
print(f"Editable source saved to {source}")
