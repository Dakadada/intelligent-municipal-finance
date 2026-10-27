// Red Pen's own palette and type (app/css/app.css), so the edit reads as the same product.
import { loadFont as serif } from "@remotion/google-fonts/SourceSerif4";
import { loadFont as sans } from "@remotion/google-fonts/PublicSans";
import { loadFont as pen } from "@remotion/google-fonts/Caveat";
import { loadFont as mono } from "@remotion/google-fonts/JetBrainsMono";

const s = serif("normal", { weights: ["400", "600", "700"], subsets: ["latin"] });
const p = sans("normal", { weights: ["400", "600", "700"], subsets: ["latin"] });
const c = pen("normal", { weights: ["700"], subsets: ["latin"] });
const m = mono("normal", { weights: ["400", "700"], subsets: ["latin"] });

export const F = { display: s.fontFamily, ui: p.fontFamily, pen: c.fontFamily, mono: m.fontFamily };

export const C = {
  paper: "#eef3ee",
  sheet: "#f8fbf7",
  rule: "#d4e1d6",
  ruleStrong: "#a9c2ae",
  ink: "#15212a",
  ink2: "#47575e",
  ink3: "#74858a",
  pencil: "#c8312b",
  pencilBright: "#ff5a4a",
  model: "#2a5db0",
  ok: "#2f7d4a",
  watch: "#a86d12",
  night: "#070b09",
  rail: "#15212a",
};

export const SPEAKERS = {
  david: { name: "David Shi", initials: "DS", tint: "#2a5db0" },
  srihari: { name: "Srihari Kumaresan", initials: "SK", tint: "#2f7d4a" },
  alex: { name: "Alex Du", initials: "AD", tint: "#a86d12" },
} as const;
export type Speaker = keyof typeof SPEAKERS;
