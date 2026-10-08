"""Rebuild lightweight web assets from the local supplementary-video source tree.

Usage: python build-web-assets.py /path/to/supplementary_video_20260923 /path/to/ffmpeg
The paper snapshot and archival video are inputs only; neither is copied to Git.
"""
import concurrent.futures
import json
from pathlib import Path
import subprocess
import sys

root, ffmpeg = Path(sys.argv[1]), sys.argv[2]
out = Path(__file__).resolve().parent / "media"
out.mkdir(exist_ok=True)
paper = root / "paper_snapshot_20260926/source"
video = root / "experiment_results_20260926/output/TacDINO_Supplementary_1080p.mp4"

def run(args):
    subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-n", *args], check=True)

def figure(name):
    target = out / f"{name}.webp"
    if not target.exists():
        run(["-i", str(paper / f"{name}.png"), "-vf", "scale='min(2000,iw)':-2",
             "-frames:v", "1", "-c:v", "libwebp", "-quality", "86", str(target)])
    return target

# All clips preserve the source's display speed and contents. The UniVTAC
# sequences are dataset demonstrations, not evaluated policy rollouts.
clips = [
    ("contact-overview", 43, 15),
    ("matched-modalities", 79, 12),
    ("tactile-geometry", 94, 9),
    ("lift-can", 206.5, 7),
    ("lift-bottle", 214.5, 7),
    ("grasp-classify", 222.5, 7),
    ("insert-tube", 230.5, 7),
]

def clip(spec):
    name, start, duration = spec
    target = out / f"{name}.mp4"
    if not target.exists():
        run(["-ss", str(start), "-i", str(video), "-t", str(duration), "-an",
             "-vf", "scale=960:540:flags=lanczos,setsar=1", "-r", "16", "-fps_mode", "cfr",
             "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-pix_fmt", "yuv420p",
             "-movflags", "+faststart", "-map_metadata", "-1", str(target)])
    poster = out / f"{name}.jpg"
    if not poster.exists():
        run(["-ss", "1", "-i", str(target), "-frames:v", "1", "-q:v", "4", "-update", "1", str(poster)])
    return target

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(figure, ["teaser", "methods", "data_distribution", "data_process", "attention", "touch3d_bar_comparison"]))
    list(pool.map(clip, clips))

results = json.loads((root / "paper_results_update/paper_results.json").read_text())
results.update(json.loads((root / "experiment_results_20260926/paper_results.json").read_text()))
results["source"] = "Paper snapshot used for the supplementary video, 2026-09-26. Reported values, not a fresh evaluation."
(out / "results.json").write_text(json.dumps(results, indent=2) + "\n")
print(json.dumps({p.name: p.stat().st_size for p in sorted(out.iterdir()) if p.is_file()}, indent=2))
