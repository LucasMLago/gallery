#!/usr/bin/env bash
# Convert and rename every file in src/assets/media/ to a sequential index in
# src/assets/media_processed/. HEIC -> JPG, MOV/MP4 -> H.264 MP4 web-friendly.
# Skips dotfiles. Re-runnable: nukes media_processed/ before writing.
#
# Tools: sips (macOS built-in) for images, ffmpeg for video.
#   brew install ffmpeg
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SRC="$ROOT/src/assets/media"
OUT="$ROOT/src/assets/media_processed"

if [[ ! -d "$SRC" ]]; then
  echo "no src dir: $SRC" >&2
  exit 1
fi
command -v ffmpeg >/dev/null || { echo "ffmpeg not found (brew install ffmpeg)" >&2; exit 1; }
command -v sips >/dev/null || { echo "sips not found (macOS only)" >&2; exit 1; }

IMG_MAX_DIM=1600
IMG_QUALITY=80
VIDEO_MAX_W=640
VIDEO_FPS=24
VIDEO_CRF=30

rm -rf "$OUT"
mkdir -p "$OUT"

# Build dedup'd file list: prefer .mp4 over .mov when both share a basename;
# prefer .jpg over .heic when both share a basename.
tmp=$(mktemp)
ls -1 "$SRC" | grep -v "^\." | sort > "$tmp"

drop=()
while IFS= read -r f; do
  ext="${f##*.}"
  base="${f%.*}"
  ext_lc=$(echo "$ext" | tr '[:upper:]' '[:lower:]')
  if [[ "$ext_lc" == "mov" ]]; then
    if grep -qiE "^${base}\.mp4$" "$tmp"; then drop+=("$f"); fi
  elif [[ "$ext_lc" == "heic" || "$ext_lc" == "heif" ]]; then
    if grep -qiE "^${base}\.(jpg|jpeg)$" "$tmp"; then drop+=("$f"); fi
  fi
done < "$tmp"

plan=$(mktemp)
while IFS= read -r f; do
  skip=0
  for d in "${drop[@]:-}"; do [[ "$f" == "$d" ]] && skip=1 && break; done
  [[ $skip -eq 1 ]] && continue
  ext_lc=$(echo "${f##*.}" | tr '[:upper:]' '[:lower:]')
  case "$ext_lc" in
    jpg|jpeg|png|webp|heic|heif) echo "image|$f" >> "$plan" ;;
    mp4|mov|m4v|webm)            echo "video|$f" >> "$plan" ;;
  esac
done < "$tmp"

total=$(wc -l < "$plan" | tr -d ' ')
idx=0
while IFS='|' read -r kind name; do
  idx=$((idx+1))
  src="$SRC/$name"
  echo "[$idx/$total] $kind $name"
  if [[ "$kind" == "image" ]]; then
    sips -Z "$IMG_MAX_DIM" -s format jpeg -s formatOptions "$IMG_QUALITY" \
      "$src" --out "$OUT/$idx.jpg" >/dev/null
  else
    # Audio stripped (-an): every <video> in the app is muted, so audio is
    # pure bandwidth and decoder cost.
    ffmpeg -nostdin -y -i "$src" \
      -vf "scale='min($VIDEO_MAX_W,iw)':-2:flags=lanczos,fps=$VIDEO_FPS" \
      -c:v libx264 -preset medium -crf "$VIDEO_CRF" \
      -profile:v main -level 4.0 -pix_fmt yuv420p -movflags +faststart \
      -an \
      -loglevel error \
      "$OUT/$idx.mp4"
  fi
done < "$plan"

rm -f "$tmp" "$plan"
echo "done. $(ls "$OUT" | wc -l | tr -d ' ') files in $OUT"
du -sh "$OUT"
