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
PATCH, BELL, SCARF, PIPE, WART = mat('patch', (0.32, 0.05, 0.12), 0.9), mat('bell', (0.95, 0.72, 0.1), 0.3), mat('scarf', (0.75, 0.52, 0.08), 0.9), mat('pipe', (0.22, 0.11, 0.05), 0.5), mat('wart', (0.6, 0.27, 0.22), 0.6)

def smooth(o, levels=2):
    m = o.modifiers.new('sub', 'SUBSURF'); m.levels = levels; m.render_levels = levels
    for p in o.data.polygons: p.use_smooth = True
    return o
def ball(name, loc, scale, material, levels=2):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, location=loc)
    o = bpy.context.object; o.name = name; o.scale = scale; o.data.materials.append(material)
    return smooth(o, 1 if levels else 0)
_noise = None
def fluff(o, strength=0.12, size=0.22):  # hair, not porcelain: the surface pushed about by fine noise
    global _noise
    if _noise is None:
        _noise = bpy.data.textures.new('fluff', 'CLOUDS'); _noise.noise_scale = size
    m = o.modifiers.new('fluff', 'DISPLACE'); m.texture = _noise; m.strength = strength; m.texture_coords = 'GLOBAL'
    return o
def cone(name, loc, r1, r2, depth, material, verts=28):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc)
    o = bpy.context.object; o.name = name; o.data.materials.append(material)
    for p in o.data.polygons: p.use_smooth = True
    return o

head = ball('head', (0, 0, 0), (1.0, 0.95, 1.05), SKIN)
for sx in (-1, 1):  # big ears that stick out
    ear = ball('ear', (1.02 * sx, 0.1, 0.08), (0.2, 0.13, 0.42), SKIN); ear.rotation_euler = (0, 0.45 * sx, 0.5 * sx); ear.parent = head
nose = ball('nose', (0.03, -1.02, -0.04), (0.44, 0.42, 0.38), NOSE); nose.parent = head
ball('wart', (0.27, -1.3, 0.1), (0.07, 0.07, 0.07), WART).parent = head
for sx in (-1, 1):
    ball('cheek', (0.5 * sx, -0.72, -0.12), (0.34, 0.26, 0.26), NOSE).parent = head
    eye = ball('eye', (0.36 * sx, -0.9, 0.24), (0.12, 0.08, 0.135 if sx < 0 else 0.085), DARK); eye.parent = head  # the right one squints: he does not trust you
    ball('glint', (0.33 * sx, -0.975, 0.29), (0.035, 0.02, 0.035), WHITE, 0).parent = head
# the eyelids: they come down for the blink
lids = []
for sx in (-1, 1):
    lid = ball('lid', (0.36 * sx, -0.87, 0.43), (0.15, 0.09, 0.06), SKIN); lid.parent = head; lids.append(lid)
# brows: bushy, they lift when he talks
brows = []
for sx in (-1, 1):
    b = ball('brow', (0.38 * sx, -0.95, 0.47 if sx < 0 else 0.4), (0.3, 0.13, 0.1), BEARD); b.rotation_euler = (0, -0.42 * sx, 0); fluff(b, 0.1, 0.12); b.parent = head; brows.append(b)
# wrinkles on his forehead
for k, z in enumerate((0.62, 0.72)):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.5 - 0.06 * k, minor_radius=0.014, location=(0, -0.83 + 0.06 * k, z), rotation=(math.radians(74), 0, 0))
    w = bpy.context.object; w.scale = (1, 0.35, 1); w.data.materials.append(WART); w.parent = head
# the mouth: a dark hollow behind the moustache; the jaw (the beard) drops to show it
ball('mouth', (0, -0.86, -0.42), (0.26, 0.16, 0.2), DARK).parent = head
jaw = bpy.data.objects.new('jaw', None); scene.collection.objects.link(jaw); jaw.parent = head
beard = cone('beard', (0, -0.5, -1.5), 1.02, 0.1, 2.7, BEARD); beard.rotation_euler = (math.radians(194), 0, 0); beard.scale = (1.0, 0.6, 1.0); beard.parent = jaw
smooth(beard, 2); fluff(beard, 0.16, 0.3)
for k in range(7):  # tufts fanning out of it
    a = (k - 3) * 0.33
    tuft = cone('tuft', (math.sin(a) * 0.72, -0.5 + 0.1 * abs(k - 3), -1.35 - 0.25 * math.cos(a)), 0.3, 0.02, 1.25, BEARD, 12); tuft.rotation_euler = (math.radians(192), a * 0.9, 0); smooth(tuft, 1); fluff(tuft, 0.1, 0.2); tuft.parent = jaw
for sx in (-1, 1):
    side = ball('beardSide', (0.66 * sx, -0.46, -0.5), (0.46, 0.38, 0.7), BEARD); fluff(side, 0.14, 0.25); side.parent = jaw
tash = []
for sx in (-1, 1):
    m = ball('tash', (0.33 * sx, -1.0, -0.3), (0.46, 0.19, 0.17), BEARD); m.rotation_euler = (0, -0.42 * sx, 0); fluff(m, 0.1, 0.15); m.parent = head; tash.append(m)
# the hat: a tall red cone that flops at the tip, with a rolled brim
hat = cone('hat', (0, 0.12, 1.25), 1.06, 0.62, 1.3, HAT, 36); hat.rotation_euler = (math.radians(-9), 0, 0); hat.parent = head
mid = cone('hatMid', (0.16, 0.2, 2.35), 0.62, 0.3, 1.1, HAT, 28); mid.rotation_euler = (math.radians(-12), math.radians(16), 0); mid.parent = head
tip = cone('hatTip', (0.62, 0.3, 3.05), 0.3, 0.03, 0.95, HAT, 20); tip.rotation_euler = (math.radians(-12), math.radians(58), 0); tip.parent = head
ball('bell', (1.06, 0.36, 3.24), (0.13, 0.13, 0.13), BELL).parent = head
bpy.ops.mesh.primitive_cube_add(size=0.34, location=(-0.52, -0.72, 1.25), rotation=(math.radians(-9), math.radians(-34), math.radians(12)))
patch = bpy.context.object; patch.scale = (1, 0.08, 1); patch.data.materials.append(PATCH); patch.parent = head
bpy.ops.mesh.primitive_torus_add(major_radius=1.02, minor_radius=0.13, location=(0, 0.1, 0.66), rotation=(math.radians(-9), 0, 0))
brim = bpy.context.object; brim.data.materials.append(HAT); brim.parent = head
for p in brim.data.polygons: p.use_smooth = True
# a scarf, and a pipe in the corner of his mouth (it wags when he talks)
bpy.ops.mesh.primitive_torus_add(major_radius=0.92, minor_radius=0.2, location=(0, 0.1, -1.32))
scarf = bpy.context.object; scarf.data.materials.append(SCARF)
for p in scarf.data.polygons: p.use_smooth = True
pipe = bpy.data.objects.new('pipe', None); scene.collection.objects.link(pipe); pipe.parent = jaw; pipe.location = (0.34, -0.95, -0.42)
bpy.ops.mesh.primitive_cylinder_add(radius=0.035, depth=0.75, location=(0.2, -0.3, -0.06), rotation=(math.radians(72), 0, math.radians(-32)))
stem = bpy.context.object; stem.data.materials.append(PIPE); stem.parent = pipe
bpy.ops.mesh.primitive_cylinder_add(radius=0.11, depth=0.22, location=(0.4, -0.62, -0.08))
bowl = bpy.context.object; bowl.data.materials.append(PIPE); bowl.parent = pipe
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
cam.data.lens = 70; cam.location = (1.1, -9.6, 0.7); cam.rotation_euler = (Vector((0.15, 0, 0.75)) - Vector(cam.location)).to_track_quat('-Z', 'Y').to_euler()
scene.camera = cam
world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.18

# the talking loop: per frame (jaw drop, brow lift, nod, tilt, blink)
TALK = [(0, 0, 0, 0, 0)] + [(abs(math.sin(i * 1.35)) * (0.75 if i % 4 else 1.0), 0.5 + 0.5 * math.sin(i * 0.9), math.sin(i * 0.42) * 0.07, math.sin(i * 0.3 + 1) * 0.06, 1 if i == 9 else 0) for i in range(1, 16)]
for engine in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
    try: scene.render.engine = engine; break
    except Exception: pass
scene.render.resolution_x = scene.render.resolution_y = 384
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
try: scene.view_settings.view_transform = 'Standard'
except Exception: pass
for i, (open_, lift, nod, tilt, blink) in enumerate(TALK):
    jaw.location = (0, 0.02 * open_, -0.2 * open_); jaw.rotation_euler = (math.radians(7) * open_, 0, 0)
    pipe.rotation_euler = (0, 0, math.radians(14) * open_)
    for sx, m in zip((-1, 1), tash): m.location = (0.3 * sx, -0.98, -0.3 + 0.05 * open_); m.rotation_euler = (0, (-0.42 - 0.12 * open_) * sx, 0)
    for sx, b in zip((-1, 1), brows): b.location.z = (0.47 if sx < 0 else 0.4) + 0.07 * lift
    for l in lids: l.location.z = 0.43 - 0.19 * blink; l.scale.z = 0.06 + 0.09 * blink
    head.rotation_euler = (nod, tilt * 0.5, tilt)
    scene.render.filepath = f'{out}/f{i:02d}.png'
    bpy.ops.render.render(write_still=True)
print('rendered', len(TALK), 'frames to', out)
