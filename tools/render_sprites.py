"""
tools/render_sprites.py — Phase 22.5 · The 3D-to-2D Asset Pipeline
=====================================================================
Batch-converts a folder of .glb / .gltf / .obj models into clean, flat-design,
transparent PNG sprites for the 2D Blueprint Grid catalog.

RUNS INSIDE BLENDER. Two ways to use it:

  1) Headless (recommended for a big NASA model batch):
       blender --background --python tools/render_sprites.py -- \
           --in "C:/models/nasa_raw" --out "assets/ui_parts"

  2) Inside Blender's own Scripting tab:
       Edit INPUT_DIR / OUTPUT_DIR in the CONFIG block below, then click
       "Run Script". Useful for eyeballing one model before batching 200.

Requires only Blender itself (tested against the 4.x Python/bpy API — see
the version-fallback notes below for older Blenders). No pip installs.

--------------------------------------------------------------------
THE ONE THING TO GET RIGHT: A SHARED SCALE, NOT A SHARED CANVAS
--------------------------------------------------------------------
"Scale every model to fill a 256px canvas" sounds right but is actually the
wrong move for a modular stacking UI: independently normalizing every part to
the same pixel width would make a 0.5 m attitude thruster and a 2 m fuel tank
both render exactly 256 px wide — the very thing that's supposed to tell the
player they DON'T stack.

Instead this script fixes ONE constant, PIXELS_PER_METER, and renders every
part through an identical orthographic camera at that scale. A 1.0 m real
diameter is 256 px in every sprite, always — so two parts that are the same
diameter in js/data/parts.js line up pixel-for-pixel in the 2D grid, and a
bigger tank correctly renders bigger than a small one. The "256 px canvas"
part of the ask still happens — it's just a per-sprite AUTO-CROP after the
shared-scale render, not the thing that sets the scale.

If you want a specific part to be exactly N px wide, don't scale that part —
scale its real-world size in Blender, or the whole batch, and keep every part
consistent with js/data/parts.js's `size:{w,h}` grid-cell footprint (1 cell =
0.5 m — see js/core/Vehicle.js METERS_PER_CELL). The DIAMETER_REPORT.csv this
script writes at the end exists specifically so you can check that against
the game's own numbers before you wire sprites into the catalog.
"""

import bpy
import os
import sys
import glob
import math
import mathutils

# =====================================================================
#  CONFIG — the only block you should need to touch
# =====================================================================

INPUT_DIR = "raw_models"          # folder of source .glb / .gltf / .obj files
OUTPUT_DIR = "assets/ui_parts"    # where the cropped PNG sprites land

# Which way the camera looks, and which model axis is "up" (the rocket's
# nose direction). Most NASA/space glTF exports are Y-up; Blender itself is
# Z-up. If your sprites come out sideways, swap these two.
VIEW_AXIS = "X"      # camera looks along -X ("Right" orthographic view)
UP_AXIS = "Z"        # the axis that should point up in the sprite

# THE shared scale (see the module docstring above). 256 px = 1.0 m of real
# part diameter, for every single sprite in the batch — do not change this
# per-model; change it once for the whole catalog if you need bigger sprites.
PIXELS_PER_METER = 256

# A render canvas big enough to comfortably fit your LARGEST expected part
# without clipping. Every model renders at this size, then gets auto-cropped
# to its own tight bounding box — this is the "256px-canvas" feel from the
# ask, just applied as a crop instead of a per-model rescale.
RENDER_CANVAS_PX = 1024

# Fallback tint for a mesh with no material at all (kept flat and desaturated
# so it reads as "structural" rather than drawing attention to itself).
FLAT_COLOR_FALLBACK = (0.72, 0.76, 0.82, 1.0)

# A thin dark outline is what actually reads as "Flat Design UI icon" rather
# than "3D render with the lights off" — cheap and worth keeping on.
OUTLINE = True
OUTLINE_THICKNESS_PX = 3.0
OUTLINE_COLOR = (0.05, 0.07, 0.11)

PADDING_PX = 4   # breathing room kept around each sprite's auto-crop box


# =====================================================================
#  Scene plumbing
# =====================================================================

def clear_scene():
    """Wipe every object and purge orphan data so a 200-model batch doesn't
    leak meshes/materials/images across iterations."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images,
                  bpy.data.cameras, bpy.data.node_groups):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def import_model(path):
    """Import one file, return only the MESH objects it just added (glTF
    imports usually add an Empty root too — we don't want that in the bbox)."""
    ext = os.path.splitext(path)[1].lower()
    before = set(bpy.data.objects)

    if ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".obj":
        # Blender 3.6+/4.x renamed the OBJ importer; fall back for older ones
        if hasattr(bpy.ops.wm, "obj_import"):
            bpy.ops.wm.obj_import(filepath=path)
        else:
            bpy.ops.import_scene.obj(filepath=path)
    else:
        raise ValueError("unsupported extension: " + ext)

    return [o for o in bpy.data.objects if o not in before and o.type == 'MESH']


def world_bbox(objs):
    """Combined world-space bounding box of every mesh object, as (min, max)."""
    mn = mathutils.Vector((math.inf, math.inf, math.inf))
    mx = mathutils.Vector((-math.inf, -math.inf, -math.inf))
    for o in objs:
        for corner in o.bound_box:
            wc = o.matrix_world @ mathutils.Vector(corner)
            mn.x, mn.y, mn.z = min(mn.x, wc.x), min(mn.y, wc.y), min(mn.z, wc.z)
            mx.x, mx.y, mx.z = max(mx.x, wc.x), max(mx.y, wc.y), max(mx.z, wc.z)
    return mn, mx


# =====================================================================
#  Flat-design material — preserves each part's own hue, kills all shading
# =====================================================================

def flatten_materials(objs):
    """Rebuild every material as a plain Emission shader using that
    material's own Base Color (so a silver tank and a dark engine still read
    as silver/dark, just with zero gradients, specular, or shadow). A mesh
    with no material at all gets FLAT_COLOR_FALLBACK."""
    cache = {}

    def flat_material_for(color):
        key = tuple(round(c, 3) for c in color)
        if key in cache:
            return cache[key]
        mat = bpy.data.materials.new(name="Flat_%.2f_%.2f_%.2f" % key[:3])
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        emit = nt.nodes.new("ShaderNodeEmission")
        emit.inputs["Color"].default_value = color
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        cache[key] = mat
        return mat

    for o in objs:
        base_colors = []
        for slot in o.material_slots:
            src = slot.material
            color = FLAT_COLOR_FALLBACK
            if src and src.use_nodes:
                bsdf = next((n for n in src.node_tree.nodes
                             if n.type == 'BSDF_PRINCIPLED'), None)
                if bsdf:
                    color = tuple(bsdf.inputs["Base Color"].default_value)
            base_colors.append(color)
        if not base_colors:
            base_colors = [FLAT_COLOR_FALLBACK]

        o.data.materials.clear()
        for color in base_colors:
            o.data.materials.append(flat_material_for(color))


# =====================================================================
#  Camera + render settings
# =====================================================================

_AXIS_VEC = {
    "X": mathutils.Vector((1, 0, 0)),
    "Y": mathutils.Vector((0, 1, 0)),
    "Z": mathutils.Vector((0, 0, 1)),
}


def setup_camera(target_center, bbox_size):
    cam_data = bpy.data.cameras.new("SpriteCam")
    cam_data.type = 'ORTHO'
    # meters framed by the sensor = canvas px / (px per meter) — THIS is the
    # one line that makes every sprite in the batch share the same scale.
    cam_data.ortho_scale = RENDER_CANVAS_PX / PIXELS_PER_METER

    cam = bpy.data.objects.new("SpriteCam", cam_data)
    bpy.context.scene.collection.objects.link(cam)

    axis_vec = _AXIS_VEC[VIEW_AXIS]
    distance = max(bbox_size) * 3 + 5   # ortho ignores distance for scale —
    cam.location = target_center + axis_vec * distance          # just needs
    direction = (target_center - cam.location).normalized()     # to clear the mesh
    up = 'Y' if UP_AXIS == 'Z' else 'Z'
    cam.rotation_euler = direction.to_track_quat('-Z', UP_AXIS if UP_AXIS != VIEW_AXIS else up).to_euler()

    bpy.context.scene.camera = cam
    return cam


def configure_render():
    scene = bpy.context.scene
    for engine in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES'):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue

    scene.render.film_transparent = True
    scene.render.resolution_x = RENDER_CANVAS_PX
    scene.render.resolution_y = RENDER_CANVAS_PX
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'

    scene.render.use_freestyle = OUTLINE
    if OUTLINE and scene.view_layers[0].freestyle_settings.linesets:
        ls = scene.view_layers[0].freestyle_settings.linesets[0]
        ls.linestyle.color = OUTLINE_COLOR
        ls.linestyle.thickness = OUTLINE_THICKNESS_PX


# =====================================================================
#  Auto-crop — the per-sprite "fits a standardized canvas" step
# =====================================================================

def autocrop_png(path):
    """Trim a render down to its own tight alpha bounding box (+ padding),
    WITHOUT rescaling — so PIXELS_PER_METER stays identical across every
    sprite in the batch. Returns the cropped pixel size, or None if the
    render came out fully transparent (model missed the camera)."""
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    try:
        import numpy as np  # bundled with Blender's Python since 2.8
    except ImportError:
        print("  ! numpy unavailable — leaving %s uncropped" % os.path.basename(path))
        bpy.data.images.remove(img)
        return (w, h)

    arr = np.array(img.pixels[:], dtype='float32').reshape(h, w, 4)
    alpha = arr[:, :, 3]
    ys, xs = np.where(alpha > 0.01)
    if len(xs) == 0:
        bpy.data.images.remove(img)
        return None
    x0 = max(0, int(xs.min()) - PADDING_PX)
    x1 = min(w - 1, int(xs.max()) + PADDING_PX)
    y0 = max(0, int(ys.min()) - PADDING_PX)
    y1 = min(h - 1, int(ys.max()) + PADDING_PX)

    try:
        img.crop(x0, y0, x1, y1)          # native Blender API, no PIL needed
        img.filepath_raw = path
        img.file_format = 'PNG'
        img.save()
        size = (x1 - x0 + 1, y1 - y0 + 1)
    except Exception as e:
        print("  ! auto-crop failed (%s) — leaving %s at full %dx%d canvas" %
              (e, os.path.basename(path), w, h))
        size = (w, h)
    finally:
        bpy.data.images.remove(img)
    return size


# =====================================================================
#  Per-model pipeline
# =====================================================================

def process_one(path, out_dir):
    name = os.path.splitext(os.path.basename(path))[0]
    print("-> %s" % name)

    clear_scene()
    objs = import_model(path)
    if not objs:
        print("  ! no mesh objects found, skipping")
        return None

    flatten_materials(objs)

    mn, mx = world_bbox(objs)
    center = (mn + mx) / 2
    size = mx - mn

    setup_camera(center, size)
    configure_render()

    out_path = os.path.join(out_dir, name + ".png")
    bpy.context.scene.render.filepath = out_path
    bpy.ops.render.render(write_still=True)

    px_size = autocrop_png(out_path)

    # diameter = extent across the two axes that are NOT "up" — this is the
    # number that must match another part's diameter for them to stack right
    axes = [a for a in "XYZ" if a != UP_AXIS]
    idx = {"X": 0, "Y": 1, "Z": 2}
    diameter_m = max(size[idx[axes[0]]], size[idx[axes[1]]])
    height_m = size[idx[UP_AXIS]]

    return {
        "name": name,
        "diameter_m": diameter_m,
        "height_m": height_m,
        "px": px_size,
    }


# =====================================================================
#  Entry point
# =====================================================================

def parse_cli_args():
    """`blender --background --python render_sprites.py -- --in X --out Y`
    — Blender swallows its own args before the `--`, so anything after it is
    ours. Running from inside Blender's UI (no argv separator) just uses the
    CONFIG constants above untouched."""
    global INPUT_DIR, OUTPUT_DIR
    argv = sys.argv
    if "--" not in argv:
        return
    args = argv[argv.index("--") + 1:]
    i = 0
    while i < len(args):
        if args[i] == "--in" and i + 1 < len(args):
            INPUT_DIR = args[i + 1]; i += 2
        elif args[i] == "--out" and i + 1 < len(args):
            OUTPUT_DIR = args[i + 1]; i += 2
        else:
            i += 1


def main():
    parse_cli_args()
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    files = []
    for pattern in ("*.glb", "*.gltf", "*.obj"):
        files.extend(glob.glob(os.path.join(INPUT_DIR, pattern)))
    files.sort()

    if not files:
        print("No .glb/.gltf/.obj files found in %r — nothing to do." % INPUT_DIR)
        return

    print("Rendering %d model(s) from %r -> %r" % (len(files), INPUT_DIR, OUTPUT_DIR))
    print("Shared scale: %d px/meter, %dpx render canvas, view axis %s, up axis %s\n" %
          (PIXELS_PER_METER, RENDER_CANVAS_PX, VIEW_AXIS, UP_AXIS))

    report = []
    for path in files:
        try:
            row = process_one(path, OUTPUT_DIR)
            if row:
                report.append(row)
        except Exception as e:
            print("  ! FAILED on %s: %s" % (os.path.basename(path), e))

    # DIAMETER_REPORT.csv — check this against js/data/parts.js `size.w`
    # (1 grid cell = 0.5 m, RS.Vehicle.METERS_PER_CELL) before wiring sprites
    # into the game, so two parts meant to share a diameter actually do.
    report_path = os.path.join(OUTPUT_DIR, "DIAMETER_REPORT.csv")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("name,diameter_m,diameter_grid_cells,height_m,sprite_px_w,sprite_px_h\n")
        for r in report:
            px = r["px"] or (0, 0)
            f.write("%s,%.3f,%.2f,%.3f,%d,%d\n" % (
                r["name"], r["diameter_m"], r["diameter_m"] / 0.5, r["height_m"],
                px[0], px[1]))

    print("\nDone. %d/%d sprite(s) written to %s" % (len(report), len(files), OUTPUT_DIR))
    print("Diameter check written to %s" % report_path)


if __name__ == "__main__":
    main()
