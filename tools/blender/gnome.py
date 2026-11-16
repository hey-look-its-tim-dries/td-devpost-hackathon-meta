# tools/blender/gnome.py: an original gnome, smooth and round, made of rigid parts with their origins at the joints,
# so the game can pose it in code (src/gnomes/pose.js) and colour every part per gnome. One unit is the gnome's
# height to the hat's base; Blender's -Y is its front, Z is up. Parts and the joint each turns about:
#   body, belt, buckle (the hips) · legL, legR · armL + handL, armR + handR (the shoulders)
#   head, nose, cheeks, eyes, brows, beard, hat, bell (the neck). No materials: the game colours the parts.
#   /opt/homebrew/bin/blender --background --python tools/blender/gnome.py -- assets/gnome.glb
import bpy, bmesh, sys, math
from mathutils import Matrix, Vector

out = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)

def part(name, origin, build):
    me, bm = bpy.data.meshes.new(name), bmesh.new()
    build(bm)
    bmesh.ops.translate(bm, verts=bm.verts, vec=-Vector(origin))  # geometry about its joint
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    o = bpy.data.objects.new(name, me)
    o.location = origin
    bpy.context.scene.collection.objects.link(o)

def cone(bm, c, z0, z1, r0, r1, seg=24):
    v = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=seg, radius1=r0, radius2=r1, depth=z1 - z0)['verts']
    bmesh.ops.translate(bm, vec=(c[0], c[1], (z0 + z1) / 2), verts=v)
    return v
def ball(bm, c, r, scale=(1, 1, 1), u=16, v=10, rot=None):
    vs = bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r)['verts']
    bmesh.ops.scale(bm, vec=scale, verts=vs)
    if rot: bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=rot, verts=vs)
    bmesh.ops.translate(bm, vec=c, verts=vs)
    return vs

HIP, NECK = (0, 0, 0.22), (0, 0, 0.57)
def body(bm):
    cone(bm, (0, 0), 0.19, 0.56, 0.225, 0.15)             # a coat, wider at the hem
    ball(bm, (0, 0, 0.555), 0.152, (1, 0.95, 0.5))        # round shoulders
    ball(bm, (0, -0.05, 0.36), 0.2, (0.95, 0.8, 0.85))    # a belly: he eats well
    cone(bm, (0, 0), 0.175, 0.2, 0.235, 0.228)            # the hem, turned out
part('body', HIP, body)
part('belt', HIP, lambda bm: (cone(bm, (0, -0.012), 0.295, 0.345, 0.222, 0.212), None))
def buckle(bm):
    v = bmesh.ops.create_cube(bm, size=1.0)['verts']
    bmesh.ops.scale(bm, vec=(0.085, 0.03, 0.07), verts=v); bmesh.ops.translate(bm, vec=(0, -0.228, 0.32), verts=v)
part('buckle', HIP, buckle)
for side, x in (('L', -1), ('R', 1)):
    def leg(bm, x=x):
        cone(bm, (0.09 * x, 0), 0.07, 0.25, 0.058, 0.07, 14)                       # a trouser leg
        ball(bm, (0.09 * x, -0.045, 0.05), 0.07, (1.0, 1.75, 0.75), 14, 8)         # a round boot, toe out front
        cone(bm, (0.09 * x, 0), 0.085, 0.115, 0.075, 0.072, 14)                    # its cuff
    part('leg' + side, (0.09 * x, 0, 0.24), leg)
    SH = (0.2 * x, 0, 0.52)
    def arm(bm, x=x):
        cone(bm, (0.235 * x, 0), 0.3, 0.535, 0.066, 0.05, 14)                      # a sleeve, wide at the cuff
        ball(bm, (0.228 * x, 0, 0.525), 0.062, (1, 1, 0.8), 12, 8)                 # the shoulder
        cone(bm, (0.235 * x, 0), 0.292, 0.31, 0.072, 0.07, 14)
    part('arm' + side, SH, arm)
    def hand(bm, x=x):
        ball(bm, (0.235 * x, 0, 0.262), 0.058, (1, 1, 1.1), 12, 8)                 # a mitten
        ball(bm, (0.235 * x - 0.03 * x, -0.045, 0.275), 0.026, (1, 1, 1.3), 8, 6)  # and its thumb
    part('hand' + side, SH, hand)
def head(bm):
    ball(bm, (0, 0, 0.68), 0.158, (1, 0.97, 1.0), 20, 12)
    for x in (-1, 1): ball(bm, (0.152 * x, 0.01, 0.675), 0.05, (0.45, 0.8, 1.15), 10, 8)   # ears
part('head', NECK, head)
part('nose', NECK, lambda bm: (ball(bm, (0, -0.172, 0.655), 0.062, (1, 1.1, 0.95), 14, 10), None))
part('cheeks', NECK, lambda bm: [ball(bm, (0.088 * x, -0.118, 0.638), 0.05, (1, 0.7, 0.85), 10, 8) for x in (-1, 1)])
part('eyes', NECK, lambda bm: [ball(bm, (0.062 * x, -0.142, 0.722), 0.022, (1, 0.6, 1.25), 8, 6) for x in (-1, 1)])
part('brows', NECK, lambda bm: [ball(bm, (0.066 * x, -0.146, 0.762), 0.05, (1, 0.45, 0.33), 10, 6, Matrix.Rotation(0.4 * x, 3, 'Y')) for x in (-1, 1)])
def beard(bm):
    v = cone(bm, (0, -0.1), 0.34, 0.66, 0.012, 0.172, 16)  # a wedge of beard, point down
    bmesh.ops.scale(bm, vec=(1, 0.62, 1), verts=v, space=Matrix.Translation((0, 0.1, 0)))
    for x in (-1, 1):
        ball(bm, (0.068 * x, -0.168, 0.612), 0.07, (1, 0.5, 0.42), 10, 6, Matrix.Rotation(-0.35 * x, 3, 'Y'))  # a moustache
        ball(bm, (0.12 * x, -0.1, 0.56), 0.075, (0.8, 0.7, 1.2), 10, 8)                                          # tufts at the jaw
part('beard', NECK, beard)
FLOP = Matrix.Rotation(0.6, 3, 'X')
TIP = Vector((0, 0, 1.02)) + FLOP @ Vector((0, 0, 0.27))
def hat(bm):
    cone(bm, (0, 0), 0.745, 0.79, 0.215, 0.2)             # the brim, rolled
    cone(bm, (0, 0), 0.78, 1.02, 0.2, 0.1)
    ball(bm, (0, 0, 1.02), 0.1, (1, 1, 0.9), 16, 8)       # the bend, round
    tip = cone(bm, (0, 0), 1.02, 1.29, 0.1, 0.012)
    bmesh.ops.rotate(bm, cent=(0, 0, 1.02), matrix=FLOP, verts=tip)  # the point flops over
part('hat', NECK, hat)
part('bell', NECK, lambda bm: (ball(bm, tuple(TIP), 0.04, (1, 1, 1), 10, 8), None))

bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_materials='NONE', export_animations=False, export_normals=True)
print('gnome parts:', sorted(o.name for o in bpy.data.objects), '->', out)
