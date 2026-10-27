import React from "react";
import { Composition } from "remotion";
import { Main } from "./Main";
import { FPS, TOTAL } from "./schedule";

export const Root: React.FC = () => (
  <Composition id="Main" component={Main} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
);
