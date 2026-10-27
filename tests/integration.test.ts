import { describe, expect, it } from "vitest";
import {
  FixedStepRunner,
  type SimulationSpeed,
} from "../src/runtime/fixedStep";
import { createWorld, stepWorld } from "../src/simulation/core";
import type { Command, World } from "../src/simulation/types";

// Commands are recorded against the simulation tick BEFORE their transition,
// never against render frames. A 30 Hz frame may execute multiple commands on
// distinct steps; a 120 Hz frame may execute no simulation step at all.
const timeline = new Map<number, readonly Command[]>([
  [
    0,
    [
      { type: "passive", enabled: false },
      { type: "feed", point: { x: 500, y: 325 } },
    ],
  ],
  [30, [{ type: "soothe", point: { x: 500, y: 325 } }]],
  [180, [{ type: "feed", point: { x: 620, y: 325 } }]],
  [300, [{ type: "lure", point: { x: 750, y: 280 } }]],
  [420, [{ type: "passive", enabled: true }]],
  [700, [{ type: "feed", point: { x: 680, y: 400 } }]],
  [1000, [{ type: "lure", point: { x: 280, y: 420 } }]],
  [1200, [{ type: "passive", enabled: false }]],
]);

function runScenario(fps: number, speed: SimulationSpeed = 1) {
  const runner = new FixedStepRunner();
  runner.setSpeed(speed);
  let world = createWorld(314159);
  const checkpoints: World[] = [];
  const appliedAt: number[] = [];
  const seconds = 24 / speed;
  for (let frame = 0; frame <= fps * seconds; frame += 1) {
    runner.advance((frame * 1000) / fps, () => {
      const commands = timeline.get(world.tick);
      if (commands) appliedAt.push(world.tick);
      world = stepWorld(world, commands);
      if (world.tick % 120 === 0) checkpoints.push(world);
    });
  }
  return { world, checkpoints, appliedAt, metrics: runner.metrics };
}

describe("clock and simulation integration", () => {
  it("replays the same command timeline identically at 30, 60 and 120 render fps", () => {
    const reference = runScenario(60);
    expect(reference.world.tick).toBe(1440);
    expect(reference.world.time).toBe(24);
    expect(reference.world.stats.activeFed).toBeGreaterThan(0);
    expect(reference.world.stats.careAccepted).toBe(1);
    expect(reference.world.environment.passiveFood).toBe(false);
    expect(reference.appliedAt).toEqual([...timeline.keys()]);
    for (const fps of [30, 120]) {
      const replay = runScenario(fps);
      expect(replay.world).toEqual(reference.world);
      expect(replay.checkpoints).toEqual(reference.checkpoints);
      expect(replay.appliedAt).toEqual(reference.appliedAt);
      expect(replay.metrics.steps).toBe(reference.world.tick);
      expect(replay.metrics.droppedSeconds).toBe(0);
    }
  });

  it("changes wall duration at 2× and 4× while preserving every simulated state", () => {
    const reference = runScenario(60);
    for (const speed of [2, 4] as const) {
      const accelerated = runScenario(30, speed);
      expect(accelerated.world).toEqual(reference.world);
      expect(accelerated.checkpoints).toEqual(reference.checkpoints);
      expect(accelerated.appliedAt).toEqual(reference.appliedAt);
      expect(accelerated.metrics.actual).toBeCloseTo(speed, 6);
      expect(accelerated.metrics.status).toBe("ok");
    }
  });
});
