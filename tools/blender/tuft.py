# tools/blender/tuft.py: Grandfather Tuft, the old gnome who talks you through the game, as a bust, animated talking.
# Renders 16 frames (frame 0 at rest, 1..15 one loop of talking: jaw, moustache, brows, a nod, a blink) to PNGs with a
# transparent background; tools/blender/tuft.sh tiles them into assets/tuft.png for the call-in window.
#   blender --background --python tools/blender/tuft.py -- <out dir>
import bpy, sys, math
from mathutils import Vector

out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/tmp/tuft'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def mat(name, rgb, rough=0.6, sss=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough
    if sss and 'Subsurface Weight' in b.inputs: b.inputs['Subsurface Weight'].default_value = sss
    return m
SKIN, BEARD, HAT, COAT, DARK, NOSE = mat('skin', (0.78, 0.47, 0.34), 0.6, 0.1), mat('beard', (0.8, 0.79, 0.74), 0.9), mat('hat', (0.55, 0.035, 0.03), 0.75), mat('coat', (0.06, 0.2, 0.11), 0.85), mat('dark', (0.03, 0.02, 0.02), 0.4), mat('nose', (0.74, 0.34, 0.26), 0.55, 0.1)
WHITE = mat('white', (1, 1, 1), 0.2)

def smooth(o, levels=2):
    m = o.modifiers.new('sub', 'SUBSURF'); m.levels = levels; m.render_levels = levels
    for p in o.data.polygons: p.use_smooth = True
    return o
def ball(name, loc, scale, material, levels=2):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, location=loc)
    o = bpy.context.object; o.name = name; o.scale = scale; o.data.materials.append(material)
    return smooth(o, 1 if levels else 0)
def cone(name, loc, r1, r2, depth, material, verts=28):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc)
    o = bpy.context.object; o.name = name; o.data.materials.append(material)
    for p in o.data.polygons: p.use_smooth = True
    return o

head = ball('head', (0, 0, 0), (1.0, 0.95, 1.05), SKIN)
ball('earL', (-1.0, 0.05, 0.05), (0.2, 0.12, 0.3), SKIN).parent = head
ball('earR', (1.0, 0.05, 0.05), (0.2, 0.12, 0.3), SKIN).parent = head
nose = ball('nose', (0, -0.98, -0.02), (0.36, 0.34, 0.32), NOSE); nose.parent = head
for sx in (-1, 1):
    ball('cheek', (0.5 * sx, -0.72, -0.12), (0.34, 0.26, 0.26), NOSE).parent = head
    eye = ball('eye', (0.36 * sx, -0.9, 0.24), (0.12, 0.08, 0.135), DARK); eye.parent = head
    ball('glint', (0.33 * sx, -0.975, 0.29), (0.035, 0.02, 0.035), WHITE, 0).parent = head
# the eyelids: they come down for the blink
lids = []
for sx in (-1, 1):
    lid = ball('lid', (0.36 * sx, -0.87, 0.43), (0.15, 0.09, 0.06), SKIN); lid.parent = head; lids.append(lid)
# brows: bushy, they lift when he talks
brows = []
for sx in (-1, 1):
    b = ball('brow', (0.38 * sx, -0.93, 0.47), (0.26, 0.11, 0.08), BEARD); b.rotation_euler = (0, 0.28 * sx, 0); b.parent = head; brows.append(b)
# the mouth: a dark hollow behind the moustache; the jaw (the beard) drops to show it
ball('mouth', (0, -0.86, -0.42), (0.26, 0.16, 0.2), DARK).parent = head
jaw = bpy.data.objects.new('jaw', None); scene.collection.objects.link(jaw); jaw.parent = head
beard = cone('beard', (0, -0.5, -1.5), 1.02, 0.1, 2.7, BEARD); beard.rotation_euler = (math.radians(194), 0, 0); beard.scale = (1.0, 0.6, 1.0); beard.parent = jaw
smooth(beard, 2)
for sx in (-1, 1):
    ball('beardSide', (0.62 * sx, -0.5, -0.55), (0.42, 0.34, 0.6), BEARD).parent = jaw
tash = []
for sx in (-1, 1):
    m = ball('tash', (0.3 * sx, -0.98, -0.3), (0.4, 0.17, 0.15), BEARD); m.rotation_euler = (0, -0.42 * sx, 0); m.parent = head; tash.append(m)
# the hat: a tall red cone that flops at the tip, with a rolled brim
hat = cone('hat', (0, 0.12, 1.95), 1.06, 0.04, 2.7, HAT, 36); hat.rotation_euler = (math.radians(-9), 0, math.radians(4)); hat.parent = head
bend = hat.modifiers.new('bend', 'SIMPLE_DEFORM'); bend.deform_method = 'BEND'; bend.deform_axis = 'X'; bend.angle = math.radians(38)
bpy.ops.mesh.primitive_torus_add(major_radius=1.02, minor_radius=0.13, location=(0, 0.1, 0.66), rotation=(math.radians(-9), 0, 0))
brim = bpy.context.object; brim.data.materials.append(HAT); brim.parent = head
for p in brim.data.polygons: p.use_smooth = True
# shoulders in a green coat
ball('coat', (0, 0.15, -2.2), (1.55, 1.05, 1.0), COAT)

# light and camera: a warm key, a cool fill, a rim from behind; the gnome fills the frame
def light(kind, loc, energy, colour, size=2.0):
    d = bpy.data.lights.new(kind, 'AREA'); d.energy = energy; d.color = colour; d.size = size
    o = bpy.data.objects.new(kind, d); scene.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 0.2)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
light('key', (3.2, -4.5, 3.2), 330, (1.0, 0.93, 0.82))
light('fill', (-4.0, -3.0, 0.5), 90, (0.75, 0.85, 1.0), 4)
light('rim', (0.5, 4.0, 3.5), 380, (1.0, 0.8, 0.6))
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam)
cam.data.lens = 70; cam.location = (1.0, -8.6, 0.5); cam.rotation_euler = (Vector((0, 0, 0.45)) - Vector(cam.location)).to_track_quat('-Z', 'Y').to_euler()
scene.camera = cam
world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.18

# the talking loop: per frame (jaw drop, brow lift, nod, tilt, blink)
TALK = [(0, 0, 0, 0, 0)] + [(abs(math.sin(i * 1.35)) * (0.75 if i % 4 else 1.0), 0.5 + 0.5 * math.sin(i * 0.9), math.sin(i * 0.42) * 0.07, math.sin(i * 0.3 + 1) * 0.06, 1 if i == 9 else 0) for i in range(1, 16)]
for engine in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
    try: scene.render.engine = engine; break
    except Exception: pass
scene.render.resolution_x = scene.render.resolution_y = 320
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
try: scene.view_settings.view_transform = 'Standard'
except Exception: pass
for i, (open_, lift, nod, tilt, blink) in enumerate(TALK):
    jaw.location = (0, 0.02 * open_, -0.2 * open_); jaw.rotation_euler = (math.radians(7) * open_, 0, 0)
    for sx, m in zip((-1, 1), tash): m.location = (0.3 * sx, -0.98, -0.3 + 0.05 * open_); m.rotation_euler = (0, (-0.42 - 0.12 * open_) * sx, 0)
    for b in brows: b.location.z = 0.47 + 0.06 * lift
    for l in lids: l.location.z = 0.43 - 0.19 * blink; l.scale.z = 0.06 + 0.09 * blink
    head.rotation_euler = (nod, tilt * 0.5, tilt)
    scene.render.filepath = f'{out}/f{i:02d}.png'
    bpy.ops.render.render(write_still=True)
print('rendered', len(TALK), 'frames to', out)
