#!/bin/zsh
# Builds the final CAC video from the team's takes in video/takes/.
#
#   zsh video/cac/finish.sh            takes -> voices/faces/timeline, re-render intro, render video
#   zsh video/cac/finish.sh --tts      same, with placeholder voices (no takes needed)
#
# Output: video/cac/remotion/out/red-pen-cac.mp4. Needs ffmpeg, Google Chrome, and the Python
# packages faster-whisper and opencv (already installed on Alex's Mac).
set -e
cd "${0:A:h}/../.."   # repo root
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [[ "$1" == "--tts" ]]; then python3 video/cac/prepare_lines.py tts; else python3 video/cac/prepare_lines.py takes; fi

# The cold open is timed to lines 1-5, so it is re-rendered whenever the voices change.
lsof -i :8766 >/dev/null 2>&1 || (python3 -m http.server 8766 >/dev/null 2>&1 &)
sleep 1
node video/cac/render_intro.mjs

cd video/cac/remotion
npx tsx -e 'import("./src/schedule.ts").then(m => console.log(`video length: ${m.TOTAL_S.toFixed(1)} s (limit 180)`))'
npx remotion render src/index.ts Main out/red-pen-cac.mp4 --browser-executable="$CHROME" --crf=18
echo "done: video/cac/remotion/out/red-pen-cac.mp4"
