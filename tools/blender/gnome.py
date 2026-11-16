# tools/blender/gnome.py: an original low-poly gnome, made of rigid parts with their origins at the joints, so the
# game can pose it in code (src/gnomes/pose.js) and colour every part per gnome. One unit is the gnome's height to
# the hat's base; Blender's -Y is its front, Z is up. Parts: body, legL, legR, armL, armR, and four that turn with
# the head and share its pivot (the neck): head, nose, beard, hat. No materials: the game colours the parts.
#   /opt/homebrew/bin/blender --background --python tools/blender/gnome.py -- assets/gnome.glb
import bpy, bmesh, sys
from mathutils import Matrix, Vector

out = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)

def part(name, origin, build):
    me, bm = bpy.data.meshes.new(name), bmesh.new()
    build(bm)
    bmesh.ops.translate(bm, verts=bm.verts, vec=-Vector(origin))  # geometry about its joint
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    o.location = origin
    bpy.context.scene.collection.objects.link(o)

def box(bm, c, s):
    v = bmesh.ops.create_cube(bm, size=1.0)['verts']
    bmesh.ops.scale(bm, vec=s, verts=v); bmesh.ops.translate(bm, vec=c, verts=v)
    return v
def cone(bm, c, z0, z1, r0, r1, seg=6):
    v = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=seg, radius1=r0, radius2=r1, depth=z1 - z0)['verts']
    bmesh.ops.translate(bm, vec=(c[0], c[1], (z0 + z1) / 2), verts=v)
    return v
def ball(bm, c, r, sub=1):
    v = bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)['verts']
    bmesh.ops.translate(bm, vec=c, verts=v)
    return v

NECK = (0, 0, 0.57)
part('body', (0, 0, 0.22), lambda bm: cone(bm, (0, 0), 0.2, 0.58, 0.21, 0.15))  # a coat, wider at the hem
for side, x in (('L', -1), ('R', 1)):
    part('leg' + side, (0.09 * x, 0, 0.24), lambda bm, x=x: (box(bm, (0.09 * x, 0, 0.13), (0.11, 0.13, 0.22)), box(bm, (0.09 * x, -0.035, 0.035), (0.13, 0.2, 0.07))))  # a leg and its boot
    part('arm' + side, (0.215 * x, 0, 0.52), lambda bm, x=x: (box(bm, (0.24 * x, 0, 0.41), (0.085, 0.095, 0.24)), ball(bm, (0.24 * x, 0, 0.275), 0.06)))  # a sleeve and a mitten
part('head', NECK, lambda bm: ball(bm, (0, 0, 0.68), 0.155))
part('nose', NECK, lambda bm: ball(bm, (0, -0.16, 0.665), 0.055))
def beard(bm):
    v = cone(bm, (0, -0.1), 0.36, 0.66, 0.012, 0.17, 5)  # a wedge of beard, point down
    bmesh.ops.scale(bm, vec=(1, 0.62, 1), verts=v, space=Matrix.Translation((0, 0.1, 0)))
part('beard', NECK, beard)
def hat(bm):
    cone(bm, (0, 0), 0.75, 1.02, 0.2, 0.09)
    tip = cone(bm, (0, 0), 1.02, 1.26, 0.09, 0.0)
    bmesh.ops.rotate(bm, cent=(0, 0, 1.02), matrix=Matrix.Rotation(0.5, 3, 'X'), verts=tip)  # the point flops back
part('hat', NECK, hat)

bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_materials='NONE', export_animations=False)
print('gnome parts:', sorted(o.name for o in bpy.data.objects), '->', out)
