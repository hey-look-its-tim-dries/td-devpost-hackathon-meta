# tools/blender/source.py: the Source, the landmark at the centre of the world, built in Blender and
# exported as glTF for the game. A slender gilt spire (420 m) on an ink plinth, four flying buttresses
# that point at the compass, and a pale orb at the top where the rivers begin. Low poly, flat colours.
#   blender -b -P tools/blender/source.py -- assets/source.glb
import sys, math
import bpy

out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'assets/source.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)

def mat(name, rgb, rough=0.6, metal=0.0, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*rgb, 1)
        b.inputs['Emission Strength'].default_value = emit
    return m

GILT = mat('gilt', (0.79, 0.64, 0.35), 0.35, 0.8)
INK = mat('ink', (0.086, 0.063, 0.055), 0.8)
PARCH = mat('parchment', (0.95, 0.89, 0.82), 0.7)
ORB = mat('orb', (0.98, 0.95, 0.86), 0.3, 0.0, 2.5)

def put(obj, m):
    obj.data.materials.append(m)
    bpy.ops.object.shade_flat()
    return obj

# the plinth: a low octagon, ink, with a parchment step
bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=95, depth=24, location=(0, 0, 12)); put(bpy.context.object, INK)
bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=75, depth=10, location=(0, 0, 29)); put(bpy.context.object, PARCH)
# the spire: a four-sided needle, gilt
bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=34, radius2=4, depth=380, location=(0, 0, 34 + 190), rotation=(0, 0, math.pi / 4)); put(bpy.context.object, GILT)
# four buttresses, one per compass point: thin slanted gilt blades
for k in range(4):
    a = k * math.pi / 2
    bpy.ops.mesh.primitive_cube_add(size=1, location=(math.cos(a) * 70, math.sin(a) * 70, 70))
    o = bpy.context.object
    o.scale = (110, 6, 4)
    o.rotation_euler = (0, -0.62, a)
    put(o, GILT)
# a ring at a third of the height
bpy.ops.mesh.primitive_torus_add(major_radius=46, minor_radius=4, major_segments=24, minor_segments=6, location=(0, 0, 150)); put(bpy.context.object, INK)
# the orb where the rivers begin
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=18, location=(0, 0, 430)); put(bpy.context.object, ORB)

# glTF is y-up; Blender is z-up: the exporter converts. Metres throughout.
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True)
print('wrote', out)
