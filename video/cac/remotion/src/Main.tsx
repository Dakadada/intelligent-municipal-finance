// The whole video: scenes in order (each overlapping the next by T), then the overlays that run
// across scenes (face bubble, captions), then sound.
import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile } from "remotion";
import { FPS, SCENE, START, TOTAL, f, line, lineEnd, lines, sceneFrames, wordAt } from "./schedule";
import { Captions, FaceBubble, SceneFade } from "./kit";
import { Browser, Close, Code, Demo, End, How, Intro, Proof, Team, Who } from "./scenes";

const SCENES: [string, React.FC<{ base: number }>][] = [
  ["team", Team], ["who", Who], ["demo", Demo], ["how", How], ["code", Code],
  ["browser", Browser], ["proof", Proof], ["close", Close], ["end", End],
];

/* ------------------------------------------------------------- soundtrack */
type Cue = { at: number; src: string; vol: number };
const sfx: Cue[] = [];
SCENES.forEach(([id]) => sfx.push({ at: SCENE[id].from - 0.12, src: "sfx/whoosh_soft.wav", vol: 0.3 }));
// The pen starts reading, and the card lands, in the cold open.
sfx.push({ at: START[5] - 0.5, src: "sfx/whoosh.wav", vol: 0.45 });
sfx.push({ at: SCENE.intro.to - 2.5, src: "sfx/chime.wav", vol: 0.4 });
// A soft pop on each statistic as it appears.
([[11, "1,885"], [12, "twice"], [13, "two"], [13, "july"], [13, "april"], [14, "automatic"], [17, "browser"], [18, "all"]] as [number, string][])
  .forEach(([id, w]) => sfx.push({ at: wordAt(id, w), src: "sfx/pop.wav", vol: 0.35 }));
// Clicks in the demo where the cursor clicks.
sfx.push({ at: START[12] - 0.15, src: "sfx/click.wav", vol: 0.5 });
sfx.push({ at: wordAt(12, "marks") + 0.35, src: "sfx/click.wav", vol: 0.5 });
sfx.push({ at: wordAt(18, "35") + 0.1, src: "sfx/click.wav", vol: 0.4 });
sfx.push({ at: lineEnd(20) - 0.2, src: "sfx/success.wav", vol: 0.4 });

const speech = lines.map((l) => [START[l.id], lineEnd(l.id)] as [number, number]);
const musicVol = (fr: number) => {
  const t = fr / FPS;
  let duck = 0;
  for (const [a, b] of speech) duck = Math.max(duck, interpolate(t, [a - 0.3, a, b, b + 0.5], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const fadeIn = interpolate(t, [0, 3], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(t, [TOTAL / FPS - 3, TOTAL / FPS - 0.2], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return 0.16 * (1 - 0.68 * duck) * fadeIn * fadeOut;
};

export const Main: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <Sequence durationInFrames={sceneFrames("intro").dur}>
      <SceneFade dur={sceneFrames("intro").dur} push={0}><Intro /></SceneFade>
    </Sequence>
    {SCENES.map(([id, El]) => {
      const { from, dur } = sceneFrames(id);
      return (
        <Sequence key={id} from={from} durationInFrames={dur}>
          <SceneFade dur={id === "end" ? dur + 99 : dur}><El base={from / FPS} /></SceneFade>
        </Sequence>
      );
    })}

    <FaceBubble fromLine={9} />
    <Captions />

    <Audio src={staticFile("audio/music.wav")} volume={musicVol} />
    {lines.map((l) => (
      <Sequence key={l.id} from={f(START[l.id])} durationInFrames={Math.ceil(line(l.id).dur * FPS) + 3}>
        <Audio src={staticFile(`voice/${l.id}.wav`)} />
      </Sequence>
    ))}
    {sfx.map((c, i) => (
      <Sequence key={i} from={Math.max(0, f(c.at))} durationInFrames={60}>
        <Audio src={staticFile(c.src)} volume={c.vol} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
