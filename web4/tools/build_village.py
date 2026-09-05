"""Build the two production scene variants used by the web4 cozy village viewer.

Run with Blender 4.2+:
  blender --background --python tools/build_village.py
"""

from pathlib import Path
import math
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "assets" / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

PALETTE = {
    "grass": "8eb66f", "grass_light": "a8cb78", "soil": "a96f52", "soil_dark": "80513f",
    "cream": "f4dec2", "plaster": "f7e8d0", "roof": "cb7668", "roof_light": "df8d75",
    "wood": "a96846", "wood_light": "c1855b", "wood_dark": "78503c", "stone": "b7aaa0",
    "stone_light": "d0c3b4", "water": "79b9bd", "path": "d9b98b", "leaf": "739b5e",
    "leaf_light": "9fbd6d", "pink": "dc8c9a", "lavender": "9c8fc1", "yellow": "e5bd64",
    "white": "fff8df", "glass": "8ab6bd"
}


def rgba(hex_value, alpha=1.0):
    value = hex_value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (alpha,)


def material(name, color, roughness=.78, metallic=0.0, alpha=1.0):
    key = f"{name}_{color}_{roughness}_{metallic}_{alpha}"
    found = bpy.data.materials.get(key)
    if found:
        return found
    mat = bpy.data.materials.new(key)
    mat.diffuse_color = rgba(color, alpha)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba(color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if alpha < 1:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.surface_render_method = 'DITHERED'
    return mat


MATS = {name: material(name, color) for name, color in PALETTE.items()}
MATS["water"] = material("water", PALETTE["water"], .14, .08, .78)
MATS["glass"] = material("glass", PALETTE["glass"], .2, .05)
MATS["brass"] = material("brass", "e8ba69", .32, .35)


def move_to_collection(obj, collection):
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def finish(obj, collection, mat, name, bevel=0.0, smooth=False):
    obj.name = name
    move_to_collection(obj, collection)
    if mat:
        obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("Soft handcrafted edges", 'BEVEL')
        modifier.width = bevel
        modifier.segments = 2
    if smooth and hasattr(obj.data, "polygons"):
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def cube(collection, name, location, scale, mat, rotation=(0, 0, 0), bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, collection, mat, name, bevel)


def cylinder(collection, name, location, radius, depth, mat, vertices=12, rotation=(0, 0, 0), scale=(1, 1, 1), bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, collection, mat, name, bevel, vertices > 12)


def sphere(collection, name, location, radius, mat, subdivisions=1, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=radius, location=location)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, collection, mat, name, radius * .035, subdivisions > 1)


def gable(collection, detail, ox, oy):
    front = oy - 2.36
    back = oy - 2.54
    verts = [(ox - 3, front, 3.85), (ox + 3, front, 3.85), (ox, front, 6.0),
             (ox - 3, back, 3.85), (ox + 3, back, 3.85), (ox, back, 6.0)]
    faces = [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
    mesh_data = bpy.data.meshes.new("CottageGableMesh")
    mesh_data.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new("Cottage_Gable", mesh_data)
    collection.objects.link(obj)
    obj.data.materials.append(MATS["plaster"])
    if detail:
        modifier = obj.modifiers.new("Soft gable edge", 'BEVEL'); modifier.width = .035; modifier.segments = 2


def add_island(c, detail):
    sides = 48 if detail else 12
    cylinder(c, "Island_Soil", (0, 0, -.72), 10.45, 1.25, MATS["soil"], sides, scale=(1.06, 1, 1), bevel=.14 if detail else .04)
    cylinder(c, "Island_Grass", (0, 0, .05), 10.85, .46, MATS["grass"], sides, scale=(1.03, 1, 1), bevel=.13 if detail else .03)
    if detail:
        for i in range(30):
            a = i / 30 * math.tau
            sphere(c, f"Grass_Edge_{i:02}", (math.cos(a) * 10.75, math.sin(a) * 10.25, .34), .28, MATS["grass_light"], 1, (1.3, 1, .48))


def add_cottage(c, detail):
    ox, oy = -4.5, -3.2
    bevel = .08 if detail else .025
    cube(c, "Cottage_Walls", (ox, oy, 2.25), (6, 4.7, 3.8), MATS["plaster"], bevel=bevel)
    gable(c, detail, ox, oy)
    for side in (-1, 1):
        cube(c, f"Roof_Main_{side}", (ox + side * 1.47, oy, 4.93), (3.85, 5.35, .30), MATS["roof"], (0, side * .61, 0), .055 if detail else .02)
    if detail:
        tile_id = 0
        for side in (-1, 1):
            for row in range(5):
                for y in [oy - 2.25 + i * .72 for i in range(7)]:
                    x = ox + side * (.42 + row * .61)
                    z = 5.90 - row * .42
                    tile_mat = MATS["roof"] if (row + tile_id) % 2 else MATS["roof_light"]
                    cube(c, f"Roof_Tile_{tile_id:03}", (x, y, z), (.72, .78, .16), tile_mat, (0, side * .61, 0), .045)
                    tile_id += 1
    # Front face looks toward negative Y in Blender.
    cube(c, "Door", (ox, oy - 2.43, 1.55), (1.28, .18, 2.35), MATS["wood_dark"], bevel=.1 if detail else .02)
    cube(c, "Door_Header", (ox, oy - 2.51, 2.73), (1.5, .24, .14), MATS["wood"])
    for side in (-1, 1):
        cube(c, f"Door_Frame_{side}", (ox + side * .72, oy - 2.51, 1.55), (.13, .24, 2.48), MATS["wood"])
    sphere(c, "Door_Knob", (ox + .42, oy - 2.57, 1.54), .09, MATS["brass"], 2)
    for side in (-1, 1):
        wx = ox + side * 1.82
        cube(c, f"Window_Glass_{side}", (wx, oy - 2.43, 2.25), (1.05, .15, 1.15), MATS["glass"], bevel=.04)
        cube(c, f"Window_Mullion_V_{side}", (wx, oy - 2.52, 2.25), (.1, .2, 1.24), MATS["wood"])
        cube(c, f"Window_Mullion_H_{side}", (wx, oy - 2.52, 2.25), (1.15, .2, .1), MATS["wood"])
    cube(c, "Chimney", (ox - 1.68, oy + .65, 5.55), (.82, .85, 2.3), MATS["stone"], bevel=.05 if detail else 0)
    cube(c, "Chimney_Cap", (ox - 1.68, oy + .65, 6.72), (.98, 1.02, .25), MATS["roof"], bevel=.035)
    if detail:
        cube(c, "Front_Timber_Beam", (ox, oy - 2.49, 3.75), (6.15, .19, .18), MATS["wood"])
        for side in (-1, 1):
            cube(c, f"Front_Timber_Post_{side}", (ox + side * 2.72, oy - 2.49, 2.25), (.19, .19, 3.45), MATS["wood"])
        cube(c, "Flower_Box", (ox - 1.82, oy - 2.64, 1.55), (1.25, .36, .32), MATS["wood_light"], bevel=.035)
        for i in range(5):
            sphere(c, f"Window_Flower_{i}", (ox - 2.25 + i * .22, oy - 2.75, 1.87), .12, MATS["pink" if i % 2 else "yellow"], 2)
        for i in range(8):
            sphere(c, f"Ivy_{i}", (ox + 2.65 - (i % 3) * .17, oy - 2.62, 1.38 + i * .42), .13 + (i % 2) * .035, MATS["leaf"], 1, (1, .55, 1))


def add_bridge(c, detail):
    ox, oy = 2.2, -2.35
    steps = 15 if detail else 7
    width = 5.4
    for i in range(steps):
        t = i / (steps - 1)
        x = ox + (t - .5) * width
        z = .7 + math.sin(t * math.pi) * 1.03
        tilt = math.cos(t * math.pi) * .12
        cube(c, f"Bridge_Plank_{i:02}", (x, oy, z), (width / (steps - .3), 2.05, .24), MATS["wood_light" if not (detail and i % 2) else "wood"], (0, -tilt, 0), .035 if detail else .01)
    posts = 7 if detail else 4
    for side in (-1, 1):
        for i in range(posts):
            t = i / (posts - 1)
            x = ox + (t - .5) * width
            z = 1.36 + math.sin(t * math.pi) * 1.03
            cube(c, f"Bridge_Post_{side}_{i}", (x, oy + side * 1.05, z), (.2, .2, 1.45), MATS["wood_dark"], bevel=.025 if detail else 0)
            if i < posts - 1:
                t2 = (i + .5) / (posts - 1)
                x2 = ox + (t2 - .5) * width
                z2 = 1.88 + math.sin(t2 * math.pi) * 1.03
                dx = width / (posts - 1)
                dz = (math.sin((i + 1) / (posts - 1) * math.pi) - math.sin(i / (posts - 1) * math.pi)) * 1.03
                cube(c, f"Bridge_Rail_{side}_{i}", (x2, oy + side * 1.05, z2), (math.hypot(dx, dz), .16, .16), MATS["wood"], (0, -math.atan2(dz, dx), 0), .02)


def add_well(c, detail):
    ox, oy = 6, -.5
    stones, rows = (16, 3) if detail else (8, 2)
    for row in range(rows):
        for i in range(stones):
            a = i / stones * math.tau + (row % 2) * math.pi / stones
            cube(c, f"Well_Stone_{row}_{i:02}", (ox + math.cos(a) * 1.35, oy + math.sin(a) * 1.35, .62 + row * .39), (.62, .46, .42), MATS["stone_light" if (i + row) % 2 else "stone"], (0, 0, -a), .065 if detail else .01)
    cylinder(c, "Well_Water", (ox, oy, 1.27), 1.1, .15, MATS["water"], 32 if detail else 10)
    for side in (-1, 1):
        cube(c, f"Well_Post_{side}", (ox + side * 1.42, oy, 2.61), (.26, .26, 3.35), MATS["wood_dark"], bevel=.035)
    cube(c, "Well_Top_Beam", (ox, oy, 4.14), (3.25, .28, .24), MATS["wood_dark"], bevel=.035)
    for side in (-1, 1):
        cube(c, f"Well_Roof_{side}", (ox + side * .74, oy, 4.46), (2.12, 2.02, .18), MATS["roof"], (0, side * .48, 0), .035)
    cylinder(c, "Well_Axle", (ox, oy, 2.83), .13, 2.55, MATS["wood"], 12 if detail else 6, (math.pi / 2, 0, 0))
    if detail:
        cylinder(c, "Well_Rope", (ox, oy, 1.95), .035, 1.35, material("rope", "d7b77d"), 8)
        cylinder(c, "Well_Bucket", (ox, oy, 1.28), .34, .42, MATS["wood"], 16)


def add_fence(c, detail, index, start, length, rotation=0):
    x0, y0 = start
    posts = max(2, math.ceil(length / 1.45))
    for i in range(posts):
        lx = (i / (posts - 1) - .5) * length
        x = x0 + math.cos(rotation) * lx
        y = y0 + math.sin(rotation) * lx
        cube(c, f"Fence_{index}_Post_{i}", (x, y, .93), (.22, .22, 1.25), MATS["wood_light"], (0, 0, rotation), .025 if detail else 0)
        if detail:
            cylinder(c, f"Fence_{index}_Cap_{i}", (x, y, 1.60), .18, .18, MATS["wood_light"], 6)
    for z in (.93, 1.4):
        cube(c, f"Fence_{index}_Rail_{z}", (x0, y0, z), (length, .15, .16), MATS["wood_light"], (0, 0, rotation), .018)


def add_tree(c, detail, index, position, size=1):
    x, y = position
    cylinder(c, f"Tree_{index}_Trunk", (x, y, 1.95 * size), .55 * size, 3.2 * size, MATS["wood_dark"], 10 if detail else 6, scale=(1, .8, 1), bevel=.04 if detail else 0)
    if detail:
        clusters = [(0, 0, 4, 1.65), (-1, .15, 3.8, 1.15), (1, .1, 3.7, 1.2), (.25, 0, 4.8, 1.15)]
        for i, (dx, dy, z, r) in enumerate(clusters):
            sphere(c, f"Tree_{index}_Crown_{i}", (x + dx * size, y + dy * size, z * size + .35), r * size, MATS["leaf_light" if i % 2 else "leaf"], 2, (1, .88, 1))
    else:
        sphere(c, f"Tree_{index}_Crown", (x, y, 4.35 * size), 2 * size, MATS["leaf"], 1, (1, 1, 1.08))


def add_path(c, detail):
    points = [(-3.5,-5.25),(-2.6,-4.75),(-1.6,-4.15),(-.5,-3.5),(.6,-2.95),(1.55,-2.55),(3.2,-1.6),(4.55,-.7)]
    for i, (x, y) in enumerate(points):
        radius = (.55 + (i % 3) * .1) if detail else .75
        cylinder(c, f"Path_Stone_{i}", (x, y, .38), radius, .1, MATS["path"], 10 if detail else 6, rotation=(0, 0, (i % 3) * .3), scale=(1, .72, 1), bevel=.025 if detail else 0)


def add_water(c, detail):
    # The web viewer replaces this named placeholder with a live planar reflector.
    cylinder(c, "PuddleReflection", (-5.35, -6.25, .38), 3.15, .055, MATS["water"], 48 if detail else 12, scale=(1.28, .64, 1))
    # One continuous ribbon follows the stream beneath the bridge.
    centers = [(2.0,-9.4),(2.45,-6.4),(2.15,-3.2),(2.55,.2),(2.1,3.4),(2.55,6.6),(1.8,9.5)]
    width = 1.05
    verts = []
    for i, (x, y) in enumerate(centers):
        before = Vector(centers[max(0, i-1)])
        after = Vector(centers[min(len(centers)-1, i+1)])
        tangent = (after - before).normalized()
        normal = Vector((-tangent.y, tangent.x)) * width
        verts.extend([(x+normal.x,y+normal.y,.36),(x-normal.x,y-normal.y,.36)])
    faces = [(i*2,i*2+1,i*2+3,i*2+2) for i in range(len(centers)-1)]
    mesh_data=bpy.data.meshes.new("StreamRibbonMesh")
    mesh_data.from_pydata(verts,[],faces)
    stream=bpy.data.objects.new("Stream_Water",mesh_data)
    c.objects.link(stream); stream.data.materials.append(MATS["water"])
    if detail:
        bevel=stream.modifiers.new("Soft stream banks",'BEVEL'); bevel.width=.18; bevel.segments=3
    if detail:
        for i in range(15):
            a = i / 15 * math.tau
            sphere(c, f"Puddle_Rim_{i:02}", (-5.35 + math.cos(a) * 3.95, -6.25 + math.sin(a) * 2.05, .5), .18 + (i % 3) * .05, MATS["grass_light"], 1, (1.3, 1, .45))


def add_plants(c, detail):
    positions = [(-8,2.8),(-7,-1),(-2,5),(-1,-6),(4,-5),(8,2.5),(7,5.3),(1,6.7),(-7,6)]
    for i, (x, y) in enumerate(positions[:len(positions) if detail else 5]):
        blades = 7 if detail else 3
        for j in range(blades):
            a = j / blades * math.tau
            cube(c, f"Plant_{i}_Blade_{j}", (x + math.cos(a)*.18, y + math.sin(a)*.18, .64), (.08,.18,.55+(j%3)*.12), MATS["leaf" if j%2 else "leaf_light"], (math.cos(a)*.22,0,a), .01)
        if detail and i % 2 == 0:
            flower_mat = MATS[["white","pink","lavender"][i%3]]
            for j in range(4):
                sphere(c, f"Plant_{i}_Flower_{j}", (x + math.cos(j*math.pi/2)*.26, y + math.sin(j*math.pi/2)*.26, 1.02), .11, flower_mat, 2)
    if detail:
        for i in range(36):
            a=i*2.399; r=3.2+(i%7)*1.05; x=math.cos(a)*r; y=math.sin(a)*r
            if abs(x-2.2)<2.7 and abs(y-2.3)<1.5: continue
            cube(c, f"Meadow_Blade_{i:02}", (x,y,.62), (.04,.13,.35+(i%4)*.07), MATS["leaf" if i%3 else "grass_light"], (0,(i%2*2-1)*.18,a), .008)


def build_variant(name, detail):
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    add_island(collection, detail)
    add_water(collection, detail)
    add_cottage(collection, detail)
    add_bridge(collection, detail)
    add_well(collection, detail)
    add_tree(collection, detail, 0, (-8, -3.4), 1.05)
    add_tree(collection, detail, 1, (7.6, 4.2), .9)
    for i, args in enumerate([((-6.5,7.1),5.8,.05),((7,6.7),4.3,-.25),((-8.1,-6.9),3.8,.45),((8,-6.2),3.2,-.55)]):
        add_fence(collection, detail, i, *args)
    add_plants(collection, detail)
    add_path(collection, detail)
    return collection


def setup_blender_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name != "Collection":
            bpy.data.collections.remove(collection)
    default = bpy.data.collections.get("Collection")
    if default:
        bpy.data.collections.remove(default)

    world = bpy.context.scene.world
    world.color = rgba("e7d4e7")[:3]
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = rgba("e7d4e7")
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = .55

    bpy.context.scene.render.engine = 'BLENDER_EEVEE_NEXT'
    bpy.context.scene.render.resolution_x = 1600
    bpy.context.scene.render.resolution_y = 900
    bpy.context.scene.render.resolution_percentage = 100
    bpy.context.scene.view_settings.look = 'AgX - Medium High Contrast'

    bpy.ops.object.light_add(type='AREA', location=(-12, -10, 20))
    key = bpy.context.object; key.name = "Sun_Key"; key.data.energy = 1800; key.data.color = rgba("ffd7a2")[:3]; key.data.shape='DISK'; key.data.size=10
    bpy.ops.object.light_add(type='AREA', location=(10, 5, 12))
    fill = bpy.context.object; fill.name = "Lavender_Fill"; fill.data.energy = 800; fill.data.color = rgba("cfc4ff")[:3]; fill.data.size=8
    bpy.ops.object.camera_add(location=(22, -27, 19))
    camera = bpy.context.object; camera.name = "Diorama_Camera"; camera.data.type='ORTHO'; camera.data.ortho_scale=22
    direction = Vector((0,0,1.2)) - camera.location
    camera.rotation_euler = direction.to_track_quat('-Z','Y').to_euler()
    bpy.context.scene.camera = camera


def select_collection(collection):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in collection.all_objects:
        obj.hide_set(False)
        obj.select_set(True)


def export_variant(collection, filename):
    select_collection(collection)
    bpy.context.view_layer.objects.active = next(iter(collection.all_objects))
    bpy.ops.export_scene.gltf(
        filepath=str(MODEL_DIR / filename),
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
        export_yup=True,
    )


setup_blender_scene()
low = build_variant("LOWPOLY_VILLAGE", False)
detail = build_variant("DETAIL_VILLAGE", True)
low.hide_render = True

# Preserve both editable model collections, camera, lighting, and materials in one source file.
bpy.ops.wm.save_as_mainfile(filepath=str(MODEL_DIR / "cozy-village-source.blend"))
export_variant(low, "cozy-village-low.glb")
export_variant(detail, "cozy-village-detail.glb")

print(f"Built {len(low.all_objects)} low-poly objects and {len(detail.all_objects)} detailed objects")
print(f"Saved Blender source and GLB exports to {MODEL_DIR}")
