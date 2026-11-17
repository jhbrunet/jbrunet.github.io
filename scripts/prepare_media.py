#!/usr/bin/env python3
"""Repeatable media inspection and optimization pipeline for jbrunet.com.

Inspects raw photos/videos, rejects UI reference screenshots, auto-orients and
strips EXIF metadata, smart-crops to locked architectural slot ratios, encodes
WebP + AVIF via ImageMagick (with ffmpeg libaom-av1 fallback), optimizes MP4
motion loops + WebP poster frames, and updates public/media/manifest.json.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MEDIA_ROOT = REPO_ROOT / "public" / "media"
DEFAULT_MANIFEST_PATH = DEFAULT_MEDIA_ROOT / "manifest.json"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".tif", ".tiff", ".webp", ".avif", ".bmp"}
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".webm"}

SCREENSHOT_NAME_RE = re.compile(
    r"(cleanshot|screen[\s._-]*shot|capture[\s._-]*(?:d['’]?\s*)?(?:e|é)cran|bildschirmfoto)",
    re.IGNORECASE,
)

SLOT_MATCHERS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"^(hero|portrait|start[-_]?gate)", re.IGNORECASE), "heroPortrait"),
    (re.compile(r"^(gate[-_]?0?3|super[-_]?series)", re.IGNORECASE), "gate03SuperSeries"),
    (re.compile(r"^(gate[-_]?0?5|equipe[-_]?quebec)", re.IGNORECASE), "gate05EquipeQuebec"),
    (re.compile(r"^(gate[-_]?0?8|mont[-_]?garceau)", re.IGNORECASE), "gate08MontGarceau"),
]

DEFAULT_SLOTS: dict[str, dict[str, Any]] = {
    "heroPortrait": {
        "id": "heroPortrait",
        "category": "hero",
        "gate": "00",
        "available": False,
        "mediaType": "image",
        "src": None,
        "avifSrc": None,
        "webpSrc": None,
        "posterSrc": None,
        "width": 1200,
        "height": 1500,
        "aspectRatio": "4:5",
        "focalGravity": "North",
        "objectPosition": "top",
        "targetDir": "public/media/hero",
        "expectedBasename": "hero-portrait",
    },
    "gate03SuperSeries": {
        "id": "gate03SuperSeries",
        "category": "gates",
        "gate": "03",
        "available": False,
        "mediaType": "image",
        "src": None,
        "avifSrc": None,
        "webpSrc": None,
        "posterSrc": None,
        "width": 1500,
        "height": 1000,
        "aspectRatio": "3:2",
        "focalGravity": "Center",
        "objectPosition": "center",
        "targetDir": "public/media/gates",
        "expectedBasename": "gate-03-super-series",
    },
    "gate05EquipeQuebec": {
        "id": "gate05EquipeQuebec",
        "category": "gates",
        "gate": "05",
        "available": False,
        "mediaType": "image",
        "src": None,
        "avifSrc": None,
        "webpSrc": None,
        "posterSrc": None,
        "width": 1920,
        "height": 1080,
        "aspectRatio": "16:9",
        "focalGravity": "Center",
        "objectPosition": "center",
        "targetDir": "public/media/gates",
        "expectedBasename": "gate-05-equipe-quebec",
    },
    "gate08MontGarceau": {
        "id": "gate08MontGarceau",
        "category": "gates",
        "gate": "08",
        "available": False,
        "mediaType": "image",
        "src": None,
        "avifSrc": None,
        "webpSrc": None,
        "posterSrc": None,
        "width": 1200,
        "height": 1200,
        "aspectRatio": "1:1",
        "focalGravity": "Center",
        "objectPosition": "center",
        "targetDir": "public/media/gates",
        "expectedBasename": "gate-08-mont-garceau",
    },
}


class MediaPipelineError(RuntimeError):
    """Raised when input media violates policy or conversion tools fail."""


def find_imagemagick() -> list[str]:
    magick = shutil.which("magick")
    if magick:
        return [magick]
    convert = shutil.which("convert")
    if convert:
        return [convert]
    raise MediaPipelineError("ImageMagick ('magick' or 'convert') is not installed on PATH.")


def find_identify() -> list[str]:
    magick = shutil.which("magick")
    if magick:
        return [magick, "identify"]
    identify = shutil.which("identify")
    if identify:
        return [identify]
    raise MediaPipelineError("ImageMagick 'identify' is not installed on PATH.")


def find_ffmpeg() -> tuple[str, str]:
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise MediaPipelineError("Both 'ffmpeg' and 'ffprobe' are required on PATH.")
    return ffmpeg, ffprobe


def run_cmd(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(cmd, text=True, capture_output=True)
    if check and proc.returncode != 0:
        raise MediaPipelineError(
            f"Command failed ({proc.returncode}): {' '.join(cmd)}\n{proc.stderr.strip()}"
        )
    return proc


def assert_not_reference_screenshot(path: Path) -> None:
    if SCREENSHOT_NAME_RE.search(path.name):
        raise MediaPipelineError(
            f"Rejected reference screenshot '{path.name}': UI inspiration screenshots cannot be admitted as site media."
        )
    try:
        resolved = path.resolve()
        if resolved.parent == Path("/home/antigravity/upload") and resolved.name.startswith("CleanShot"):
            raise MediaPipelineError(
                f"Rejected upload reference screenshot '{resolved}'."
            )
    except OSError:
        pass


def inspect_media(path: Path) -> dict[str, Any]:
    if not path.exists() or not path.is_file():
        raise MediaPipelineError(f"Media file does not exist: {path}")
    assert_not_reference_screenshot(path)

    ext = path.suffix.lower()
    size_bytes = path.stat().st_size

    if ext in VIDEO_EXTS:
        _, ffprobe = find_ffmpeg()
        proc = run_cmd(
            [
                ffprobe,
                "-v",
                "error",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                str(path),
            ]
        )
        probe = json.loads(proc.stdout or "{}")
        video_stream = next(
            (s for s in probe.get("streams", []) if s.get("codec_type") == "video"),
            None,
        )
        if not video_stream:
            raise MediaPipelineError(f"No video stream found in {path}")
        width = int(video_stream.get("width", 0))
        height = int(video_stream.get("height", 0))
        duration = float(probe.get("format", {}).get("duration", 0.0) or 0.0)
        return {
            "path": str(path),
            "mediaType": "video",
            "format": ext.lstrip("."),
            "codec": video_stream.get("codec_name"),
            "width": width,
            "height": height,
            "aspectRatio": round(width / height, 4) if height else None,
            "durationSeconds": round(duration, 3),
            "sizeBytes": size_bytes,
            "hasAudio": any(s.get("codec_type") == "audio" for s in probe.get("streams", [])),
        }

    if ext in IMAGE_EXTS:
        identify = find_identify()
        proc = run_cmd(
            [
                *identify,
                "-format",
                "%m\t%w\t%h\t%[orientation]\t%[EXIF:*]",
                str(path),
            ]
        )
        parts = (proc.stdout or "").split("\t", 4)
        fmt = parts[0] if len(parts) > 0 else ext.lstrip(".").upper()
        width = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
        height = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0
        orientation = parts[3] if len(parts) > 3 else ""
        exif_raw = parts[4].strip() if len(parts) > 4 else ""
        return {
            "path": str(path),
            "mediaType": "image",
            "format": fmt,
            "width": width,
            "height": height,
            "aspectRatio": round(width / height, 4) if height else None,
            "orientation": orientation or "Undefined",
            "hasExifMetadata": bool(exif_raw),
            "sizeBytes": size_bytes,
        }

    raise MediaPipelineError(f"Unsupported media file extension '{ext}' for {path}")


def load_manifest(manifest_path: Path) -> dict[str, Any]:
    if manifest_path.exists():
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    else:
        data = {"version": 1, "slots": {}, "motion": []}

    slots = data.setdefault("slots", {})
    for slot_id, defaults in DEFAULT_SLOTS.items():
        merged = {**defaults, **slots.get(slot_id, {})}
        slots[slot_id] = merged
    data.setdefault("motion", [])
    return data


def save_manifest(manifest_path: Path, data: dict[str, Any]) -> None:
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def encode_image_slot(
    src_path: Path,
    out_dir: Path,
    basename: str,
    width: int,
    height: int,
    gravity: str,
) -> tuple[Path, Path]:
    im_cmd = find_imagemagick()
    ffmpeg_bin, _ = find_ffmpeg()
    out_dir.mkdir(parents=True, exist_ok=True)

    webp_path = out_dir / f"{basename}.webp"
    avif_path = out_dir / f"{basename}.avif"

    base_ops = [
        str(src_path),
        "-auto-orient",
        "-strip",
        "-colorspace",
        "sRGB",
        "-gravity",
        gravity,
        "-resize",
        f"{width}x{height}^",
        "-extent",
        f"{width}x{height}",
    ]

    # Encode WebP primary/fallback
    run_cmd([*im_cmd, *base_ops, "-quality", "82", "-define", "webp:method=6", str(webp_path)])

    # Encode AVIF via ImageMagick libheif, falling back to ffmpeg libaom-av1 if needed
    avif_proc = run_cmd(
        [*im_cmd, *base_ops, "-quality", "62", "-define", "heif:speed=6", str(avif_path)],
        check=False,
    )
    if avif_proc.returncode != 0 or not avif_path.exists() or avif_path.stat().st_size == 0:
        run_cmd(
            [
                ffmpeg_bin,
                "-y",
                "-i",
                str(webp_path),
                "-vf",
                f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}",
                "-c:v",
                "libaom-av1",
                "-still-picture",
                "1",
                "-crf",
                "30",
                "-b:v",
                "0",
                "-pix_fmt",
                "yuv420p",
                str(avif_path),
            ]
        )

    return webp_path, avif_path


def encode_video_asset(
    src_path: Path,
    out_dir: Path,
    basename: str,
    target_width: int,
    target_height: int,
    gravity: str,
) -> tuple[Path, Path]:
    ffmpeg_bin, _ = find_ffmpeg()
    im_cmd = find_imagemagick()
    out_dir.mkdir(parents=True, exist_ok=True)

    mp4_path = out_dir / f"{basename}.mp4"
    poster_webp_path = out_dir / f"{basename}-poster.webp"

    with tempfile.TemporaryDirectory(prefix="prepare_media_") as tmpdir:
        tmp_mp4 = Path(tmpdir) / f"{basename}.mp4"
        tmp_frame = Path(tmpdir) / f"{basename}-frame.png"

        run_cmd(
            [
                ffmpeg_bin,
                "-y",
                "-i",
                str(src_path),
                "-vf",
                f"scale='min({target_width},iw)':-2:force_original_aspect_ratio=decrease",
                "-c:v",
                "libx264",
                "-profile:v",
                "high",
                "-level",
                "4.1",
                "-pix_fmt",
                "yuv420p",
                "-crf",
                "23",
                "-movflags",
                "+faststart",
                "-an",
                str(tmp_mp4),
            ]
        )

        run_cmd(
            [
                ffmpeg_bin,
                "-y",
                "-i",
                str(tmp_mp4),
                "-vframes",
                "1",
                str(tmp_frame),
            ]
        )

        run_cmd(
            [
                *im_cmd,
                str(tmp_frame),
                "-auto-orient",
                "-strip",
                "-colorspace",
                "sRGB",
                "-gravity",
                gravity,
                "-resize",
                f"{target_width}x{target_height}^",
                "-extent",
                f"{target_width}x{target_height}",
                "-quality",
                "82",
                "-define",
                "webp:method=6",
                str(poster_webp_path),
            ]
        )

        shutil.move(str(tmp_mp4), str(mp4_path))

    return mp4_path, poster_webp_path


def public_url_for(file_path: Path, media_root: Path) -> str:
    rel = file_path.resolve().relative_to(media_root.resolve())
    return f"/media/{rel.as_posix()}"


def process_slot(
    slot_id: str,
    input_path: Path,
    manifest: dict[str, Any],
    media_root: Path,
    gravity_override: str | None = None,
) -> dict[str, Any]:
    assert_not_reference_screenshot(input_path)
    if slot_id not in manifest["slots"]:
        raise MediaPipelineError(f"Unknown media slot '{slot_id}'.")

    slot = manifest["slots"][slot_id]
    width = int(slot["width"])
    height = int(slot["height"])
    gravity = gravity_override or slot.get("focalGravity") or ("North" if height > width else "Center")
    category_dir = media_root / slot["category"]
    basename = slot["expectedBasename"]

    ext = input_path.suffix.lower()
    if ext in VIDEO_EXTS:
        mp4_path, poster_path = encode_video_asset(
            input_path, category_dir, basename, width, height, gravity
        )
        slot["available"] = True
        slot["mediaType"] = "video"
        slot["src"] = public_url_for(mp4_path, media_root)
        slot["posterSrc"] = public_url_for(poster_path, media_root)
        slot["avifSrc"] = None
        slot["webpSrc"] = None
        return slot

    if ext in IMAGE_EXTS:
        webp_path, avif_path = encode_image_slot(
            input_path, category_dir, basename, width, height, gravity
        )
        slot["available"] = True
        slot["mediaType"] = "image"
        slot["src"] = public_url_for(webp_path, media_root)
        slot["webpSrc"] = public_url_for(webp_path, media_root)
        slot["avifSrc"] = public_url_for(avif_path, media_root)
        slot["posterSrc"] = None
        return slot

    raise MediaPipelineError(f"Unsupported input extension '{ext}' for {input_path}")


def infer_slot_from_filename(file_path: Path) -> str | None:
    stem = file_path.stem
    for pattern, slot_id in SLOT_MATCHERS:
        if pattern.search(stem):
            return slot_id
    return None


def sync_media_directory(manifest: dict[str, Any], media_root: Path) -> dict[str, Any]:
    for sub in ("hero", "gates", "motion"):
        (media_root / sub).mkdir(parents=True, exist_ok=True)

    # First scan hero and gates for raw or prepared slot assets
    processed_slots: set[str] = set()
    for category in ("hero", "gates"):
        folder = media_root / category
        for entry in sorted(folder.iterdir()):
            if not entry.is_file() or entry.name.startswith("."):
                continue
            assert_not_reference_screenshot(entry)
            ext = entry.suffix.lower()
            if ext not in IMAGE_EXTS and ext not in VIDEO_EXTS:
                continue

            slot_id = infer_slot_from_filename(entry)
            if not slot_id and category == "hero":
                slot_id = "heroPortrait"
            if not slot_id:
                continue

            slot = manifest["slots"][slot_id]
            basename = slot["expectedBasename"]
            # Skip re-encoding already-generated AVIF/WebP outputs unless raw source exists
            if entry.stem == basename and ext in {".avif", ".webp"}:
                webp_candidate = folder / f"{basename}.webp"
                avif_candidate = folder / f"{basename}.avif"
                if webp_candidate.exists():
                    slot["available"] = True
                    slot["mediaType"] = "image"
                    slot["src"] = public_url_for(webp_candidate, media_root)
                    slot["webpSrc"] = public_url_for(webp_candidate, media_root)
                    slot["avifSrc"] = (
                        public_url_for(avif_candidate, media_root)
                        if avif_candidate.exists()
                        else None
                    )
                    slot["posterSrc"] = None
                    processed_slots.add(slot_id)
                continue

            if entry.stem == basename and ext == ".mp4":
                poster_candidate = folder / f"{basename}-poster.webp"
                if not poster_candidate.exists():
                    process_slot(slot_id, entry, manifest, media_root)
                else:
                    slot["available"] = True
                    slot["mediaType"] = "video"
                    slot["src"] = public_url_for(entry, media_root)
                    slot["posterSrc"] = public_url_for(poster_candidate, media_root)
                    slot["avifSrc"] = None
                    slot["webpSrc"] = None
                processed_slots.add(slot_id)
                continue

            # Raw uploaded photo/video matching slot prefix -> transcode to canonical basename
            if slot_id not in processed_slots:
                process_slot(slot_id, entry, manifest, media_root)
                processed_slots.add(slot_id)

    # Verify availability flags against disk so missing files never break the manifest
    for slot_id, slot in manifest["slots"].items():
        if slot_id in processed_slots:
            continue
        src_url = slot.get("src")
        if src_url and src_url.startswith("/media/"):
            rel = src_url.removeprefix("/media/")
            disk_file = media_root / rel
            if disk_file.exists():
                slot["available"] = True
                continue
        slot["available"] = False
        slot["src"] = None
        slot["avifSrc"] = None
        slot["webpSrc"] = None
        slot["posterSrc"] = None

    # Scan public/media/motion for motion clips
    motion_dir = media_root / "motion"
    motion_items: list[dict[str, Any]] = []
    for entry in sorted(motion_dir.iterdir()):
        if not entry.is_file() or entry.name.startswith("."):
            continue
        assert_not_reference_screenshot(entry)
        ext = entry.suffix.lower()
        if ext not in VIDEO_EXTS:
            continue
        slug = re.sub(r"[^a-z0-9-]+", "-", entry.stem.lower()).strip("-") or "clip"
        mp4_target = motion_dir / f"{slug}.mp4"
        poster_target = motion_dir / f"{slug}-poster.webp"
        if ext != ".mp4" or not poster_target.exists() or entry.resolve() != mp4_target.resolve():
            mp4_target, poster_target = encode_video_asset(
                entry, motion_dir, slug, 1920, 1080, "Center"
            )
        info = inspect_media(mp4_target)
        motion_items.append(
            {
                "id": slug,
                "src": public_url_for(mp4_target, media_root),
                "posterSrc": public_url_for(poster_target, media_root),
                "width": info["width"],
                "height": info["height"],
                "durationSeconds": info["durationSeconds"],
            }
        )
    manifest["motion"] = motion_items
    return manifest


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inspect, crop, strip EXIF, encode WebP/AVIF/MP4, and update media manifest.json."
    )
    parser.add_argument("--inspect", type=Path, help="Inspect a media file without modifying files.")
    parser.add_argument(
        "--slot",
        choices=sorted(DEFAULT_SLOTS.keys()),
        help="Target slot ID in manifest.json.",
    )
    parser.add_argument("--input", type=Path, help="Source image or video path for --slot.")
    parser.add_argument(
        "--gravity",
        choices=["North", "Center", "South", "East", "West"],
        help="Optional crop gravity override (defaults to North for 4:5 portrait, Center otherwise).",
    )
    parser.add_argument(
        "--sync",
        action="store_true",
        help="Scan public/media/{hero,gates,motion}/, optimize any valid assets, and sync manifest.json.",
    )
    parser.add_argument(
        "--media-root",
        type=Path,
        default=DEFAULT_MEDIA_ROOT,
        help="Media root directory (default: public/media).",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=None,
        help="Manifest JSON output path (default: <media-root>/manifest.json).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    media_root = args.media_root
    manifest_path = args.manifest or (media_root / "manifest.json")

    try:
        if args.inspect:
            report = inspect_media(args.inspect)
            print(json.dumps(report, indent=2))
            return 0

        manifest = load_manifest(manifest_path)

        if args.slot or args.input:
            if not (args.slot and args.input):
                raise MediaPipelineError("--slot and --input must be provided together.")
            updated = process_slot(args.slot, args.input, manifest, media_root, args.gravity)
            save_manifest(manifest_path, manifest)
            print(json.dumps(updated, indent=2))
            return 0

        if args.sync:
            sync_media_directory(manifest, media_root)
            save_manifest(manifest_path, manifest)
            print(json.dumps(manifest, indent=2))
            return 0

        print("No action requested. Pass --inspect <path>, --slot <id> --input <path>, or --sync.", file=sys.stderr)
        return 2
    except MediaPipelineError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
