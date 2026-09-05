"""Create Rain Court handoff archives and a Pages-compatible size manifest.

  python scripts/package_delivery.py

Archives preserve the project-relative paths. If an archive exceeds the file cap,
independently valid ZIP volumes are also produced. These are not binary split
parts: extract every numbered volume into the same destination. The oversized
combined archive is omitted by default so every published file stays below cap.
No source asset is removed or changed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
import zipfile
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
MIB = 1024 * 1024


def included(path):
    return path.is_file() and not any(part in {"__pycache__", ".git", "node_modules"} for part in path.parts) and path.suffix.lower() not in {".blend1", ".pyc", ".log"}


def zip_files(target, files, root):
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for source in sorted(files):
            archive.write(source, source.relative_to(root).as_posix())


def digest(path):
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(MIB), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def gltf_dependencies(files, root):
    """Keep relative external resources even when an export references ../textures."""
    found = set(files)
    for source in files:
        if source.suffix.lower() != ".gltf":
            continue
        document = json.loads(source.read_text(encoding="utf-8"))
        for entry in document.get("buffers", []) + document.get("images", []):
            uri = entry.get("uri", "")
            if not uri or uri.startswith("data:"):
                continue
            if "://" in uri:
                raise ValueError(f"glTF uses a remote dependency: {uri}")
            dependency = (source.parent / unquote(uri)).resolve()
            if not dependency.is_relative_to(root) or not dependency.is_file():
                raise ValueError(f"glTF dependency is missing or outside the project: {uri}")
            found.add(dependency)
    return sorted(found)


def build_archive(name, files, root, cap, keep_oversized):
    folder = root / "downloads"
    target = folder / name
    if not files:
        return {"name": name, "error": "No input files", "outputs": []}
    zip_files(target, files, root)
    full_size = target.stat().st_size
    outputs = [target]
    errors = []
    if full_size > cap:
        outputs = [target] if keep_oversized else []
        # ZIP entries are compressed independently. Read actual entry sizes once
        # instead of recompressing a 25 MiB trial archive for every small UV file.
        entry_bytes = {}
        with zipfile.ZipFile(target) as archive:
            infos = archive.infolist()
            for index, info in enumerate(infos):
                next_offset = infos[index + 1].header_offset if index + 1 < len(infos) else archive.start_dir
                encoding = "utf-8" if info.flag_bits & 0x800 else "cp437"
                central = 46 + len(info.filename.encode(encoding)) + len(info.extra) + len(info.comment)
                entry_bytes[info.filename] = next_offset - info.header_offset + central
        current, groups, current_bytes = [], [], 22  # End-of-central-directory record.
        for source in sorted(files, key=lambda path: entry_bytes[path.relative_to(root).as_posix()], reverse=True):
            needed = entry_bytes[source.relative_to(root).as_posix()]
            if needed + 22 > cap:
                errors.append(f"Single file cannot fit a ZIP volume: {source.relative_to(root)}")
                continue
            if current_bytes + needed > cap:
                groups.append(current)
                current, current_bytes = [], 22
            current.append(source)
            current_bytes += needed
        if current:
            groups.append(current)
        for index, group in enumerate(groups, 1):
            volume = folder / f"{Path(name).stem}-part-{index:02d}.zip"
            zip_files(volume, group, root)
            if volume.stat().st_size > cap:
                errors.append(f"Final ZIP volume exceeds file limit: {volume.name}")
            outputs.append(volume)
        if not keep_oversized:
            # Only remove the single oversized artifact just created by this run.
            target.unlink()
        instruction = folder / f"{Path(name).stem}-READ-ME.txt"
        instruction.write_text(
            "The full package exceeds the configured static-host file limit.\n"
            "Download every numbered ZIP with this name and extract all volumes\n"
            "into the same folder. Each volume is an independent ordinary ZIP.\n"
            "Project-relative directories reconstruct the complete handoff.\n" +
            "\n".join(path.name for path in outputs) + "\n", encoding="utf-8")
        outputs.append(instruction)
    entries = []
    for output in outputs:
        if output.suffix == ".zip":
            with zipfile.ZipFile(output) as archive:
                failed = archive.testzip()
                if failed:
                    errors.append(f"CRC validation failed for {output.name}: {failed}")
        entries.append({"path": output.relative_to(root).as_posix(), "bytes": output.stat().st_size,
                        "mib": round(output.stat().st_size / MIB, 3), "sha256": digest(output),
                        "within_host_limit": output.stat().st_size <= cap})
    return {"name": name, "input_files": len(files), "combined_zip_bytes": full_size,
            "split_into_independent_volumes": full_size > cap, "outputs": entries, "errors": errors}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--max-file-mib", type=float, default=25)
    parser.add_argument("--keep-oversized", action="store_true", help="Retain the full archive even if unsuitable for Pages")
    args = parser.parse_args()
    root = args.root.resolve()
    cap = int(args.max_file_mib * MIB)
    textures = [path for path in (root / "assets" / "textures").rglob("*") if included(path)]
    textures.extend(path for path in (root / "assets" / "uv").rglob("*") if included(path))
    gltf = gltf_dependencies([path for path in (root / "assets" / "gltf").rglob("*") if included(path)], root)
    production = []
    for folder in ("assets", "scripts", "docs", "vendor"):
        production.extend(path for path in (root / folder).rglob("*") if included(path))
    # Include the deployable static viewer and top-level project instructions.
    production.extend(path for path in root.iterdir() if included(path) and not path.name.startswith("."))
    required = [root / "assets" / name for name in ("rain-court.blend", "rain-court.glb", "rain-court.fbx")]
    missing = [str(path.relative_to(root)) for path in required if not path.is_file()]
    reports = [build_archive(name, files, root, cap, args.keep_oversized) for name, files in (
        ("rain-court-gltf.zip", gltf), ("rain-court-textures.zip", textures),
        ("rain-court-production.zip", production))]
    oversized = [{"path": path.relative_to(root).as_posix(), "bytes": path.stat().st_size}
                 for path in root.rglob("*") if path.is_file() and ".git" not in path.parts and path.stat().st_size > cap]
    report = {"schema": "rain-court-package-manifest/v1", "host_file_limit_bytes": cap,
              "missing_required_assets": missing, "archives": reports,
              "oversized_project_files": oversized,
              "passed": not missing and not oversized and all(not item.get("errors") and "error" not in item for item in reports)}
    output = root / "downloads" / "manifest.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
