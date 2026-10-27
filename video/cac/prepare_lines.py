"""Turn the script into timed voice clips (and face clips) for the Remotion edit.

  python3 prepare_lines.py tts            placeholder voices from macOS `say` (for building the edit)
  python3 prepare_lines.py takes [dir]    the team's real recordings (default ../takes)

Takes: each person records all their lines, saying "Line two." before each one. Files are matched
to a speaker by name (alex*, david*, sri*/srihari*). The last take of each line wins.

Writes into remotion/public/:
  voice/<id>.wav     the line's audio, cleaned and loudness-matched
  face/<id>.mp4      square face crop for the corner bubble (takes mode only)
  timeline.json      one entry per line: speaker, duration, caption words with times
and prints a report flagging any line whose transcript doesn't match the script.
"""
import difflib
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PUB = HERE / "remotion" / "public"
LINES = json.loads((HERE / "lines.json").read_text())
BY_ID = {l["id"]: l for l in LINES}
TTS_VOICE = {"david": "Eddy (English (US))", "alex": "Reed (English (US))", "srihari": "Rocko (English (US))"}
NUMBERS = {w: i for i, w in enumerate(
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen "
    "sixteen seventeen eighteen nineteen twenty".split())}
PROMPT = ("Red Pen. Srihari Kumaresan. David Shi. Alex Du. Isolation Forest, ARIMA, naive Bayes, "
          "gradient-boosted trees. Iowa State Auditor. $127,000. 1,885 payments.")


def run(*cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         check=True, capture_output=True, text=True).stdout
    return float(out)


_model = None


def transcribe(wav):
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        _model = WhisperModel("medium", device="cpu", compute_type="int8")
    # Decode with ffmpeg ourselves: the installed PyAV is too new for faster-whisper's loader.
    import numpy as np
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(wav), "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
                         check=True, capture_output=True).stdout
    audio = np.frombuffer(pcm, dtype=np.float32)
    segs, _ = _model.transcribe(audio, language="en", word_timestamps=True, initial_prompt=PROMPT,
                                vad_filter=False, beam_size=5)
    return [{"w": w.word.strip(), "s": w.start, "e": w.end} for s in segs for w in s.words]


norm = lambda w: re.sub(r"[^a-z0-9]", "", w.lower())


def align(script_text, heard):
    """Caption words come from the script (exact spelling); times come from what was heard."""
    words = script_text.split()
    a = [norm(w) for w in words]
    b = [norm(h["w"]) for h in heard]
    times = [None] * len(words)
    for blk in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(blk.size):
            times[blk.a + k] = (heard[blk.b + k]["s"], heard[blk.b + k]["e"])
    # fill gaps by spreading the unmatched words across the time between their neighbours
    end = heard[-1]["e"] if heard else 1.0
    i = 0
    while i < len(words):
        if times[i] is None:
            j = i
            while j < len(words) and times[j] is None:
                j += 1
            t0 = times[i - 1][1] if i > 0 else (heard[0]["s"] if heard else 0)
            t1 = times[j][0] if j < len(words) else end
            step = max(0.05, (t1 - t0) / (j - i))
            for k in range(i, j):
                times[k] = (t0 + (k - i) * step, t0 + (k - i + 1) * step)
            i = j
        else:
            i += 1
    ratio = difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()
    return [{"w": w, "s": round(s, 3), "e": round(e, 3)} for w, (s, e) in zip(words, times)], ratio


def clean_audio(src, dst, start=None, end=None):
    cmd = ["ffmpeg", "-v", "error", "-y"]
    if start is not None:
        cmd += ["-ss", f"{start:.3f}", "-to", f"{end:.3f}"]
    cmd += ["-i", str(src), "-vn", "-ac", "1", "-ar", "48000",
            "-af", "highpass=f=80,afftdn=nr=10:nf=-45,loudnorm=I=-16:TP=-1.5:LRA=7,"
                   "afade=t=in:d=0.04,areverse,afade=t=in:d=0.08,areverse",
            str(dst)]
    run(*cmd)


def tts():
    (PUB / "voice").mkdir(parents=True, exist_ok=True)
    timeline = []
    tmp = HERE / ".tmp"
    tmp.mkdir(exist_ok=True)
    for l in LINES:
        aiff = tmp / f"{l['id']}.aiff"
        run("say", "-v", TTS_VOICE[l["speaker"]], "-r", "178", "-o", str(aiff), l["text"])
        wav = PUB / "voice" / f"{l['id']}.wav"
        clean_audio(aiff, wav)
        heard = transcribe(wav)
        words, ratio = align(l["text"], heard)
        timeline.append({"id": l["id"], "speaker": l["speaker"], "dur": round(duration(wav), 3),
                         "words": words, "face": False, "placeholder": True})
        print(f"line {l['id']:2} {l['speaker']:8} {timeline[-1]['dur']:5.2f}s  match {ratio:.2f}")
    write(timeline)


def speaker_of(path):
    n = path.name.lower()
    for key, who in (("alex", "alex"), ("david", "david"), ("sri", "srihari")):
        if n.startswith(key) or key in n:
            return who
    return None


def find_lines(heard):
    """Split a take at its spoken markers ("Line two." / "Line 12."). Returns {id: [words]}."""
    out = {}
    marks = []
    for i, h in enumerate(heard):
        if norm(h["w"]) in ("line", "lines") and i + 1 < len(heard):
            nxt = norm(heard[i + 1]["w"])
            num = int(nxt) if nxt.isdigit() else NUMBERS.get(nxt)
            if num is None and nxt in ("twenty",) and i + 2 < len(heard):
                num = 20 + NUMBERS.get(norm(heard[i + 2]["w"]), 0)
            if num and 1 <= num <= 20:
                marks.append((i, num))
    for k, (i, num) in enumerate(marks):
        stop = marks[k + 1][0] if k + 1 < len(marks) else len(heard)
        body = heard[i + 2:stop]
        if body:
            out[num] = body  # later takes overwrite earlier ones
    return out


def face_box(video, start, end):
    """Median face box over the segment, as a square crop (x, y, side) in pixels."""
    # OpenCV's bundled frontal-face cascade (the installed mediapipe no longer ships mp.solutions).
    import cv2
    import numpy as np
    cap = cv2.VideoCapture(str(video))
    W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    boxes = []
    det = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    t = start
    while t < end:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, frame = cap.read()
        if ok:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = det.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=6, minSize=(min(W, H) // 6,) * 2)
            if len(faces):
                boxes.append(tuple(max(faces, key=lambda b: b[2] * b[3])))
        t += 0.4
    cap.release()
    if not boxes:
        side = min(W, H)
        return (W - side) // 2, (H - side) // 2, side, W, H
    x, y, w, h = np.median(np.array(boxes), axis=0)
    # Head and shoulders, never tighter than half the frame (a stray small detection would
    # otherwise zoom into a nose).
    side = int(min(min(W, H), max(max(w, h) * 2.3, min(W, H) * 0.55)))
    cx, cy = x + w / 2, y + h / 2 + h * 0.12  # a little lower: head and shoulders
    x0 = int(min(max(0, cx - side / 2), W - side))
    y0 = int(min(max(0, cy - side / 2), H - side))
    return x0, y0, side, W, H


def heard_cached(f, tmp):
    cache = tmp / (f.stem + ".heard.json")
    if cache.exists() and cache.stat().st_mtime > f.stat().st_mtime:
        return json.loads(cache.read_text())
    wav = tmp / (f.stem + ".16k.wav")
    run("ffmpeg", "-v", "error", "-y", "-i", str(f), "-vn", "-ac", "1", "-ar", "16000", str(wav))
    heard = transcribe(wav)
    cache.write_text(json.dumps(heard))
    return heard


def locate(text, heard):
    """Best match for a script line in a whole take; ties go to the later (last) take."""
    a = [norm(w) for w in text.split()]
    b = [norm(h["w"]) for h in heard]
    n = len(a)
    best, span = (0.0, None), (-1, -1)
    for i in range(len(b)):
        if not b[i]:
            continue
        sm = difflib.SequenceMatcher(None, a, b[i:i + n + max(10, n // 2)], autojunk=False)
        blocks = [m for m in sm.get_matching_blocks() if m.size]
        if not blocks:
            continue
        score = sum(m.size for m in blocks) / n
        j0, j1 = i + blocks[0].b, i + blocks[-1].b + blocks[-1].size
        # A clearly better match wins; a near-equal one wins only if it is a separate, later
        # read (not the same read entered a word late, which would clip its first words).
        if score > best[0] + 0.04 or (score >= best[0] - 0.04 and j0 >= span[1]):
            best, span = (score, heard[j0:j1]), (j0, j1)
    if best[1] is None:
        return best
    # The matcher can stop a word early ("red." for "read.", a paraphrased last word); keep any
    # words spoken right after, up to the next "Line N" / "take N" marker.
    j0, j1 = span
    while j1 < len(heard) and norm(heard[j1]["w"]) not in ("line", "lines", "take") and heard[j1]["s"] - heard[j1 - 1]["e"] < 0.7:
        j1 += 1
    return best[0], heard[j0:j1]


def said_words(heard, script=""):
    """Whisper's words, tidied for captions ("1 ,885" -> "1,885", "real -world" -> "real-world"),
    with near-miss spellings snapped to the script's word ("red." -> "read.")."""
    out = []
    for h in heard:
        w = h["w"]
        if out and (w[:1] in ",.-" or out[-1]["w"].endswith("-")) and h["s"] - out[-1]["e"] < 0.25:
            out[-1] = {"w": out[-1]["w"] + w, "s": out[-1]["s"], "e": h["e"]}
        else:
            out.append(dict(h))
    vocab = {norm(w): w.strip(".,;:!?\"") for w in script.split()}
    for w in out:
        k = norm(w["w"])
        if k and k not in vocab:
            close = difflib.get_close_matches(k, list(vocab), n=1, cutoff=0.8)
            if close:
                w["w"] = re.sub(r"[A-Za-z0-9'$-]+", vocab[close[0]], w["w"], count=1)
    # The last word is the one the matcher can't check against what follows ("red." for "read.").
    last = script.split()[-1] if script else ""
    if out and last and norm(out[-1]["w"]) != norm(last) and difflib.SequenceMatcher(None, norm(out[-1]["w"]), norm(last)).ratio() >= 0.75:
        out[-1]["w"] = last
    return [{"w": w["w"], "s": round(w["s"], 3), "e": round(w["e"], 3)} for w in out]


def takes(folder):
    folder = Path(folder)
    (PUB / "voice").mkdir(parents=True, exist_ok=True)
    (PUB / "face").mkdir(parents=True, exist_ok=True)
    tmp = HERE / ".tmp"
    tmp.mkdir(exist_ok=True)
    found = {}  # id -> (file, words, score)
    files = sorted(p for p in folder.iterdir() if p.suffix.lower() in (".mov", ".mp4", ".m4v", ".m4a", ".wav", ".mp3"))
    for f in files:
        heard = heard_cached(f, tmp)
        # Find each line by its wording, not by the number spoken before it: people number their
        # own lines 1-7, say "take 2", or miss a marker. Whose take it is comes from the file name,
        # else from whose lines it matches best.
        who = speaker_of(f)
        cands = {sp: {l["id"]: locate(l["text"], heard) for l in LINES if l["speaker"] == sp} for sp in ("david", "srihari", "alex")}
        if not who:
            who = max(cands, key=lambda sp: sum(r for r, _ in cands[sp].values()) / len(cands[sp]))
        got = []
        for num, (score, body) in cands[who].items():
            if score < 0.45 or not body:
                continue
            if num in found and found[num][2] > score + 0.15:
                continue  # an earlier file had a much cleaner read
            found[num] = (f, body, score)
            got.append(num)
        print(f"{f.name}: {who}, lines {sorted(got)}")
    # Hand fixes where the transcriber merged a false start into the good read: keep only the
    # words from `start` on, with the retake's opening words timed by hand (whisper small, 2026-10-26).
    OVERRIDES = {14: {"file": "alex_cac.mov", "start": 54.85, "prepend": [
        ("And", 55.0, 55.22), ("before", 55.24, 55.46), ("the", 55.48, 55.6), ("council", 55.62, 55.9), ("signs", 55.92, 56.18)]}}
    for num, o in OVERRIDES.items():
        if num in found and found[num][0].name == o["file"]:
            f, body, sc = found[num]
            body = [{"w": w, "s": s, "e": e} for w, s, e in o["prepend"]] + [h for h in body if h["s"] >= 56.15]
            found[num] = (f, body, sc)
    # Lines nobody has recorded yet keep their previous entry (placeholder voice) so the edit
    # still renders end to end.
    base = tmp / "timeline-tts.json" if (tmp / "timeline-tts.json").exists() else PUB / "timeline.json"
    prev = {t["id"]: t for t in json.loads(base.read_text())} if base.exists() else {}
    timeline = []
    for l in LINES:
        if l["id"] not in found:
            print(f"MISSING line {l['id']} ({l['speaker']}): keeping the previous take or placeholder")
            if l["id"] in prev:
                timeline.append(prev[l["id"]])
            continue
        f, body, _ = found[l["id"]]
        start = max(0, body[0]["s"] - 0.12)
        end = body[-1]["e"] + 0.25
        wav = PUB / "voice" / f"{l['id']}.wav"
        clean_audio(f, wav, start, end)
        heard = [{"w": h["w"], "s": h["s"] - start, "e": h["e"] - start} for h in body]
        words, ratio = align(l["text"], heard)
        # Captions show what was actually said when someone paraphrased; `cue` keeps the script's
        # words (timed by alignment) so on-screen pop-ups still find their trigger words.
        cue = words
        if ratio < 0.86:
            words = said_words(heard, l["text"])
        has_video = f.suffix.lower() in (".mov", ".mp4", ".m4v")
        if has_video:
            x0, y0, side, W, H = face_box(f, start, end)
            run("ffmpeg", "-v", "error", "-y", "-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-i", str(f),
                "-an", "-vf", f"crop={side}:{side}:{x0}:{y0},scale=720:720,fps=30,tpad=stop_mode=clone:stop_duration=3",
                "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", str(PUB / "face" / f"{l['id']}.mp4"))
        timeline.append({"id": l["id"], "speaker": l["speaker"], "dur": round(end - start, 3), "words": words, "cue": cue,
                         "face": has_video, "placeholder": False, "source": f.name})
        flag = "" if ratio > 0.85 else "   <-- CHECK: transcript differs from the script"
        said = " ".join(h["w"] for h in body)
        print(f"line {l['id']:2} {l['speaker']:8} {end - start:5.2f}s  match {ratio:.2f}{flag}")
        if flag:
            print(f"        heard: {said}")
    write(timeline)


def write(timeline):
    (PUB / "timeline.json").write_text(json.dumps(timeline, indent=1))
    total = sum(t["dur"] for t in timeline)
    print(f"wrote timeline.json: {len(timeline)} lines, {total:.1f}s of speech")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "tts"
    if mode == "tts":
        tts()
    else:
        takes(sys.argv[2] if len(sys.argv) > 2 else HERE.parent / "takes")
