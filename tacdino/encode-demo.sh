#!/usr/bin/env bash
# Usage: FFMPEG=/path/to/ffmpeg bash tacdino/encode-demo.sh source.mp4 captions.srt
# The archival 1080p source stays outside this repository.
set -euo pipefail
if [[ $# -ne 2 ]]; then
    printf 'Usage: %s source.mp4 captions.srt\n' "$0" >&2
    exit 2
fi
ffmpeg_bin="${FFMPEG:-ffmpeg}"
source_video="$1"
source_captions="$2"
media_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/media"
[[ -f "$source_video" && -f "$source_captions" ]]
mkdir -p "$media_dir"

"$ffmpeg_bin" -hide_banner -n -i "$source_video" \
    -map 0:v:0 -map 0:a:0 -map_metadata -1 \
    -vf 'scale=1280:720:flags=lanczos,setsar=1' \
    -c:v libx264 -preset slow -crf 29 -profile:v high -level:v 3.1 \
    -pix_fmt yuv420p -r 24 -fps_mode cfr -video_track_timescale 12288 \
    -c:a aac -b:a 64k -ac 1 -ar 48000 \
    -metadata:s:a:0 language=eng -movflags +faststart "$media_dir/demo.mp4"

"$ffmpeg_bin" -hide_banner -n -ss 3 -i "$media_dir/demo.mp4" \
    -frames:v 1 -q:v 3 -update 1 "$media_dir/demo-poster.jpg"
"$ffmpeg_bin" -hide_banner -n -i "$source_captions" -f webvtt "$media_dir/demo.en.vtt"
