"""Validate Rain Court exports without modifying source assets.

Blender (full import and UV checks):
  blender --background --factory-startup --python scripts/validate_exports.py -- --input all
Ordinary Python (GLB/glTF container and external-resource checks):
  python scripts/validate_exports.py --structural-only
The default project root is this script's parent directory's parent.
"""

from __future__ import annotations

import argparse
import base64
import json
import math
from pathlib import Path
import shutil
import struct
import sys
import tempfile
import time
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
EPS = 1e-7
UV_AREA_EPS = 1e-10
COMPONENTS = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2),
              5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
COUNTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4,
          "MAT2": 4, "MAT3": 9, "MAT4": 16}


def resource_bytes(uri, directory):
    if uri.startswith("data:"):
        header, encoded = uri.split(",", 1)
        return base64.b64decode(encoded) if ";base64" in header else unquote(encoded).encode()
    if "://" in uri:
        raise ValueError(f"Remote dependency is not portable: {uri}")
    path = directory / unquote(uri)
    if not path.is_file():
        raise ValueError(f"Missing external dependency: {uri}")
    return path.read_bytes()


def validate_gltf_container(path):
    result = {"file": str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path),
              "bytes": path.stat().st_size if path.is_file() else 0, "errors": [], "warnings": []}
    try:
        blob = path.read_bytes()
        binary_chunks = []
        if path.suffix.lower() == ".glb":
            if len(blob) < 20:
                raise ValueError("GLB is shorter than its header and JSON chunk")
            magic, version, length = struct.unpack_from("<4sII", blob)
            if magic != b"glTF" or version != 2 or length != len(blob):
                raise ValueError("Invalid GLB magic, version, or declared length")
            offset, document = 12, None
            while offset < len(blob):
                chunk_length, chunk_type = struct.unpack_from("<II", blob, offset)
                offset += 8
                if chunk_length % 4 or offset + chunk_length > len(blob):
                    raise ValueError("Invalid GLB chunk alignment or extent")
                chunk = blob[offset:offset + chunk_length]
                if chunk_type == 0x4E4F534A:
                    if document is not None:
                        raise ValueError("Duplicate GLB JSON chunk")
                    document = json.loads(chunk.decode("utf-8").rstrip("\0 \r\n\t"))
                elif chunk_type == 0x004E4942:
                    binary_chunks.append(chunk)
                offset += chunk_length
            if document is None:
                raise ValueError("GLB lacks JSON")
        else:
            document = json.loads(blob.decode("utf-8"))
        if document.get("asset", {}).get("version") != "2.0":
            raise ValueError("Asset does not declare glTF 2.0")
        buffers = []
        external = []
        for index, buffer in enumerate(document.get("buffers", [])):
            uri = buffer.get("uri")
            data = resource_bytes(uri, path.parent) if uri else binary_chunks[0]
            if uri and not uri.startswith("data:"):
                external.append(uri)
            if len(data) < buffer["byteLength"]:
                raise ValueError(f"Buffer {index} is shorter than declared")
            buffers.append(data)
        views = document.get("bufferViews", [])
        for index, view in enumerate(views):
            data = buffers[view["buffer"]]
            start = view.get("byteOffset", 0)
            if start < 0 or view["byteLength"] < 0 or start + view["byteLength"] > len(data):
                raise ValueError(f"Buffer view {index} exceeds its buffer")
        decoded = {}
        for index, accessor in enumerate(document.get("accessors", [])):
            code, size = COMPONENTS[accessor["componentType"]]
            count = COUNTS[accessor["type"]]
            if accessor.get("count", 0) <= 0:
                raise ValueError(f"Accessor {index} is empty")
            if "bufferView" not in accessor:
                if "sparse" in accessor:
                    result["warnings"].append(f"Accessor {index}: sparse storage deferred to importer")
                    continue
                raise ValueError(f"Accessor {index} has no data")
            view = views[accessor["bufferView"]]
            element_size = size * count
            # Integer MAT2/MAT3 columns use four-byte alignment in glTF.
            if accessor["type"].startswith("MAT") and size < 4:
                dimension = int(accessor["type"][-1])
                element_size = ((dimension * size + 3) // 4 * 4) * dimension
            stride = view.get("byteStride", element_size)
            relative = accessor.get("byteOffset", 0)
            required = relative + (accessor["count"] - 1) * stride + element_size
            if relative < 0 or stride < element_size or required > view["byteLength"]:
                raise ValueError(f"Accessor {index} exceeds its buffer view")
            data = buffers[view["buffer"]]
            start = view.get("byteOffset", 0) + relative
            if not accessor["type"].startswith("MAT"):
                unpack = struct.Struct("<" + code * count).unpack_from
                values = [unpack(data, start + item * stride) for item in range(accessor["count"])]
                if code == "f" and any(not math.isfinite(v) for item in values for v in item):
                    raise ValueError(f"Accessor {index} contains nonfinite floats")
                decoded[index] = values
            for bound in ("min", "max"):
                if any(not math.isfinite(v) for v in accessor.get(bound, [])):
                    raise ValueError(f"Accessor {index} has nonfinite {bound}")
        primitives = 0
        for index, mesh in enumerate(document.get("meshes", [])):
            if not mesh.get("primitives"):
                raise ValueError(f"glTF mesh {index} is empty")
            for primitive in mesh["primitives"]:
                primitives += 1
                attributes = primitive.get("attributes", {})
                if "POSITION" not in attributes or "TEXCOORD_0" not in attributes:
                    raise ValueError(f"glTF mesh {index} primitive lacks POSITION or TEXCOORD_0")
                vertex_count = document["accessors"][attributes["POSITION"]]["count"]
                for semantic, accessor_id in attributes.items():
                    if document["accessors"][accessor_id]["count"] != vertex_count:
                        raise ValueError(f"glTF mesh {index}: {semantic} attribute count mismatch")
                if "indices" in primitive and primitive["indices"] in decoded:
                    if any(item[0] < 0 or item[0] >= vertex_count for item in decoded[primitive["indices"]]):
                        raise ValueError(f"glTF mesh {index} contains an out-of-range index")
        if not primitives:
            raise ValueError("glTF contains no mesh primitives")
        for index, image in enumerate(document.get("images", [])):
            if image.get("uri"):
                data = resource_bytes(image["uri"], path.parent)
                if not data:
                    raise ValueError(f"Image {index} is empty")
                if not image["uri"].startswith("data:"):
                    external.append(image["uri"])
            elif "bufferView" not in image:
                raise ValueError(f"Image {index} has no data")
        result.update(meshes=len(document.get("meshes", [])), primitives=primitives,
                      accessors=len(document.get("accessors", [])), images=len(document.get("images", [])),
                      materials=len(document.get("materials", [])), external_dependencies=sorted(set(external)))
    except Exception as exc:
        result["errors"].append(f"{type(exc).__name__}: {exc}")
    result["passed"] = not result["errors"]
    return result


def cross(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def signed_area(points):
    return sum(points[i][0] * points[(i + 1) % len(points)][1] -
               points[(i + 1) % len(points)][0] * points[i][1] for i in range(len(points))) * 0.5


def intersection_area(first, second):
    """Convex polygon clipping; touching UV edges have zero overlap area."""
    subject = list(first)
    clip = list(second) if signed_area(second) > 0 else list(reversed(second))
    for index in range(3):
        a, b = clip[index], clip[(index + 1) % 3]
        incoming, subject = subject, []
        if not incoming:
            return 0.0
        previous = incoming[-1]
        prev_side = cross(a, b, previous)
        for current in incoming:
            side = cross(a, b, current)
            if (side >= 0) != (prev_side >= 0):
                factor = prev_side / (prev_side - side)
                subject.append((previous[0] + factor * (current[0] - previous[0]),
                                previous[1] + factor * (current[1] - previous[1])))
            if side >= 0:
                subject.append(current)
            previous, prev_side = current, side
    return abs(signed_area(subject)) if len(subject) >= 3 else 0.0


def uv_metrics(mesh):
    mesh.calc_loop_triangles()
    uv = mesh.uv_layers.active
    if uv is None:
        return {"mesh": mesh.name, "errors": ["Missing active UV layer"]}
    coords = [tuple(item.uv) for item in uv.data]
    if len(coords) != len(mesh.loops) or not coords:
        return {"mesh": mesh.name, "errors": ["Missing or incomplete UV coordinates"]}
    if any(not math.isfinite(c) for point in coords for c in point):
        return {"mesh": mesh.name, "errors": ["Nonfinite UV coordinates"]}
    low = [min(p[i] for p in coords) for i in range(2)]
    high = [max(p[i] for p in coords) for i in range(2)]
    errors = []
    if min(low) < -EPS or max(high) > 1 + EPS:
        errors.append("UVs extend beyond 0–1; no tiled-UV exception declared")
    triangles, triangle_source_indices, degenerate_examples = [], [], []
    degenerate = 0
    for triangle in mesh.loop_triangles:
        points = tuple(coords[loop] for loop in triangle.loops)
        triangle_uv_area = abs(signed_area(points))
        if triangle_uv_area <= UV_AREA_EPS:
            degenerate += 1
            if len(degenerate_examples) < 16:
                degenerate_examples.append({"triangle": triangle.index, "polygon": triangle.polygon_index,
                                            "uv_area": triangle_uv_area, "geometry_area": triangle.area})
        else:
            triangles.append(points)
            triangle_source_indices.append(triangle.index)
    # UV adjacency is established on the original topology and matching endpoint UVs.
    parents = list(range(len(mesh.polygons)))

    def root(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    edges = {}
    for polygon in mesh.polygons:
        loops = list(polygon.loop_indices)
        for index, loop in enumerate(loops):
            other = loops[(index + 1) % len(loops)]
            endpoints = [(mesh.loops[v].vertex_index, round(coords[v][0], 6), round(coords[v][1], 6))
                         for v in (loop, other)]
            key = tuple(sorted(endpoints))
            if key in edges:
                parents[root(polygon.index)] = root(edges[key])
            else:
                edges[key] = polygon.index
    # Spatial bins bound candidate comparisons; the final overlap test uses exact clipping.
    cells, bounds, overlaps, tested = {}, [], [], set()
    scale = 24.0 / max(1.0, high[0] - low[0], high[1] - low[1])
    for index, points in enumerate(triangles):
        box = (min(p[0] for p in points), min(p[1] for p in points),
               max(p[0] for p in points), max(p[1] for p in points))
        bounds.append(box)
        xr = range(math.floor((box[0] - low[0]) * scale), math.floor((box[2] - low[0]) * scale) + 1)
        yr = range(math.floor((box[1] - low[1]) * scale), math.floor((box[3] - low[1]) * scale) + 1)
        for x in xr:
            for y in yr:
                cell = cells.setdefault((x, y), [])
                for other in cell:
                    pair = (other, index)
                    if pair in tested:
                        continue
                    tested.add(pair)
                    ob = bounds[other]
                    if min(box[2], ob[2]) <= max(box[0], ob[0]) or min(box[3], ob[3]) <= max(box[1], ob[1]):
                        continue
                    area = intersection_area(points, triangles[other])
                    if area > UV_AREA_EPS:
                        overlaps.append((triangle_source_indices[other], triangle_source_indices[index], round(area, 12)))
                cell.append(index)
    if overlaps:
        errors.append(f"{len(overlaps)} positive-area triangle overlaps within this unique mesh")
    if degenerate:
        errors.append(f"{degenerate} degenerate UV triangles")
    return {"mesh": mesh.name, "polygons": len(mesh.polygons), "triangles": len(mesh.loop_triangles),
            "uv_layer": uv.name, "uv_bounds": [low, high],
            "minimum_tile_border_margin": min(low[0], low[1], 1 - high[0], 1 - high[1]),
            "islands": len({root(p.index) for p in mesh.polygons}),
            "overlap_pair_count": len(overlaps), "overlap_examples": overlaps[:8],
            "degenerate_uv_triangles": degenerate, "near_zero_uv_area_threshold": UV_AREA_EPS,
            "degenerate_examples": degenerate_examples, "errors": errors}


def validate_blender_import(path):
    import bpy
    from mathutils import Vector

    result = {"file": str(path), "errors": [], "warnings": []}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scratch = None
    try:
        if path.suffix.lower() in (".glb", ".gltf"):
            bpy.ops.import_scene.gltf(filepath=str(path))
        elif path.suffix.lower() == ".fbx":
            # Import only the FBX and its documented texture directory in a fresh
            # location. This proves relative-path portability and also supports
            # embedded FBX files without extracting beside source assets.
            scratch = tempfile.TemporaryDirectory(prefix="rain-court-fbx-import-")
            isolated = Path(scratch.name) / path.name
            shutil.copy2(path, isolated)
            if (path.parent / "textures").is_dir():
                shutil.copytree(path.parent / "textures", Path(scratch.name) / "textures")
            bpy.ops.import_scene.fbx(filepath=str(isolated), use_anim=False, use_image_search=False)
            result["isolated_import"] = "FBX and textures/ copied into a fresh temporary directory; image search disabled"
        else:
            raise ValueError("Unsupported import suffix")
        objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
        if not objects:
            raise ValueError("Import contains no mesh objects")
        unique = {obj.data.as_pointer(): obj.data for obj in objects}
        empty = [obj.name for obj in objects if not obj.data.vertices or not obj.data.polygons]
        if empty:
            result["errors"].append({"empty_mesh_objects": empty})
        invalid_vertices = [mesh.name for mesh in unique.values()
                            if any(not math.isfinite(value) for vertex in mesh.vertices for value in vertex.co)]
        if invalid_vertices:
            result["errors"].append({"nonfinite_vertex_meshes": invalid_vertices})
        corners = [tuple(obj.matrix_world @ Vector(corner)) for obj in objects for corner in obj.bound_box]
        if any(not math.isfinite(v) for corner in corners for v in corner):
            raise ValueError("Imported bounds contain nonfinite coordinates")
        bounds = [[min(c[i] for c in corners) for i in range(3)],
                  [max(c[i] for c in corners) for i in range(3)]]
        if max(bounds[1][i] - bounds[0][i] for i in range(3)) <= 1e-6:
            raise ValueError("Imported scene has no spatial extent")
        uv_report = [uv_metrics(mesh) for mesh in unique.values()]
        failed_uv = [item["mesh"] for item in uv_report if item["errors"]]
        if failed_uv:
            result["errors"].append({"invalid_uv_meshes": failed_uv})
        used_materials = {slot.material.name: slot.material for obj in objects for slot in obj.material_slots if slot.material}
        non_pbr, image_report = [], []
        images = {}
        for name, material in used_materials.items():
            nodes = material.node_tree.nodes if material.use_nodes and material.node_tree else []
            if not any(node.type == "BSDF_PRINCIPLED" for node in nodes):
                non_pbr.append(name)
            for node in nodes:
                if node.type == "TEX_IMAGE" and node.image:
                    images[node.image.name] = node.image
        if non_pbr:
            result["errors"].append({"materials_without_principled_bsdf": non_pbr})
        for name, image in images.items():
            external = Path(bpy.path.abspath(image.filepath)) if image.filepath else None
            packed = bool(image.packed_file) or bool(getattr(image, "packed_files", []))
            missing = not packed and image.source == "FILE" and (external is None or not external.is_file())
            entry = {"name": name, "size": list(image.size), "packed": packed,
                     "filepath": image.filepath, "missing_external_file": missing}
            image_report.append(entry)
            if missing or min(image.size) <= 0:
                result["errors"].append({"missing_or_empty_image": name})
        if not images:
            result["errors"].append("No image textures survived import")
        result.update(mesh_objects=len(objects), unique_meshes=len(unique),
                      vertices_unique=sum(len(mesh.vertices) for mesh in unique.values()),
                      polygons_instanced=sum(len(obj.data.polygons) for obj in objects),
                      world_bounds=bounds, pbr_materials=len(used_materials) - len(non_pbr),
                      image_textures=image_report, uv=uv_report)
    except Exception as exc:
        result["errors"].append(f"{type(exc).__name__}: {exc}")
    finally:
        if scratch:
            # Release image file handles before removing the disposable import directory.
            bpy.ops.wm.read_factory_settings(use_empty=True)
            scratch.cleanup()
    result["passed"] = not result["errors"]
    return result


def main():
    global ROOT
    args_list = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--input", choices=("all", "glb", "fbx", "gltf"), default="all")
    parser.add_argument("--structural-only", action="store_true")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args(args_list)
    ROOT = args.root.resolve()
    report_path = args.report or ROOT / "docs" / "export-validation.json"
    paths = {"glb": ROOT / "assets" / "rain-court.glb", "fbx": ROOT / "assets" / "rain-court.fbx",
             "gltf": ROOT / "assets" / "gltf" / "rain-court.gltf"}
    selected = ["glb", "fbx", "gltf"] if args.input == "all" else [args.input]
    report = {"schema": "rain-court-export-validation/v1", "checked_at_unix": int(time.time()),
              "mode": "structural-only" if args.structural_only else "Blender independent re-imports",
              "uv_policy": "Compare triangles within each unique mesh; shared modular-instance UVs are intentional. Positive overlap threshold 1e-10 UV². Island packing distance is documented by source UV layouts; this check records tile-border margin.",
              "containers": {}, "imports": {}}
    for kind in selected:
        if kind in ("glb", "gltf"):
            report["containers"][kind] = validate_gltf_container(paths[kind])
        if not args.structural_only:
            report["imports"][kind] = validate_blender_import(paths[kind])
    uv_files = sorted((ROOT / "assets" / "uv").glob("*.svg"))
    checker_files = [str(path.relative_to(ROOT)) for path in (ROOT / "assets").rglob("*")
                     if path.is_file() and "checker" in path.name.lower() and path.suffix.lower() in (".png", ".jpg", ".webp")]
    report["supporting_assets"] = {"uv_layout_svg_count": len(uv_files), "checker_images": checker_files}
    sections = list(report["containers"].values()) + list(report["imports"].values())
    report["passed"] = bool(sections) and all(item["passed"] for item in sections)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"passed": report["passed"], "report": str(report_path),
                      "containers": {key: item["passed"] for key, item in report["containers"].items()},
                      "imports": {key: item["passed"] for key, item in report["imports"].items()}}, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
