import { describe, expect, it } from "vitest";
import { FixedStepRunner } from "../src/runtime/fixedStep";
import { FIXED_DT } from "../src/simulation/types";

function runFrames(fps: number, seconds: number, speed: 1 | 2 | 4 = 1) {
  const runner = new FixedStepRunner();
  runner.setSpeed(speed);
  let executed = 0;
  const step = () => {
    executed += 1;
  };
  for (let frame = 0; frame <= fps * seconds; frame += 1) {
    runner.advance((frame * 1000) / fps, step);
  }
  return { runner, executed };
}

describe("fixed step clock", () => {
  it.each([30, 60, 90, 120, 144])(
    "executes the same 600 steps at %i fps",
    (fps) => {
      const { runner, executed } = runFrames(fps, 10);
      expect(executed).toBe(600);
      expect(runner.metrics.steps).toBe(executed);
      expect(runner.metrics.actual).toBeCloseTo(1, 2);
      expect(runner.metrics.status).toBe("ok");
      expect(runner.metrics.fps).toBeCloseTo(fps, 6);
      expect(runner.alpha).toBeCloseTo(0, 6);
    },
  );

  it.each([1, 2, 4] as const)("measures %ix from executed steps", (speed) => {
    const { runner, executed } = runFrames(60, 4, speed);
    expect(executed).toBe(240 * speed);
    expect(runner.metrics.actual).toBeCloseTo(speed, 6);
    expect(runner.metrics.target).toBe(speed);
    expect(runner.metrics.droppedSeconds).toBe(0);
  });

  it("matches regular and irregular frame partitions without changing step length", () => {
    const irregular = new FixedStepRunner();
    let simulatedTime = 0;
    const step = () => {
      simulatedTime += FIXED_DT;
    };
    let time = 0;
    irregular.advance(time, step);
    for (let i = 0; i < 20; i += 1) {
      for (const delta of [7, 43, 11, 89, 25, 75]) {
        time += delta;
        irregular.advance(time, step);
      }
    }
    expect(time).toBe(5000);
    expect(irregular.metrics.steps).toBe(runFrames(60, 5).executed);
    expect(simulatedTime).toBeCloseTo(5, 9);
    expect(irregular.metrics.actual).toBeCloseTo(1, 2);
  });

  it("keeps interpolation alpha in [0, 1) between whole steps", () => {
    const runner = new FixedStepRunner();
    runner.advance(0, () => {});
    runner.advance(8, () => {});
    expect(runner.alpha).toBeCloseTo(0.48, 6);
    expect(runner.metrics.steps).toBe(0);
    runner.advance(17, () => {});
    expect(runner.metrics.steps).toBe(1);
    expect(runner.alpha).toBeGreaterThanOrEqual(0);
    expect(runner.alpha).toBeLessThan(1);
  });

  it("pauses without catch-up and excludes paused wall time", () => {
    const runner = runFrames(60, 2).runner;
    const before = runner.metrics.steps;
    runner.setPaused(true);
    runner.advance(2100, () => {
      throw new Error("paused");
    });
    runner.advance(999999, () => {
      throw new Error("paused");
    });
    expect(runner.metrics.status).toBe("paused");
    expect(runner.metrics.actual).toBeNull();
    runner.setPaused(false);
    runner.advance(1000000, () => {});
    expect(runner.metrics.steps).toBe(before);
    runner.advance(1000100, () => {});
    expect(runner.metrics.steps).toBe(before + 6);
    expect(runner.metrics.sampleSeconds).toBeCloseTo(0.1, 9);
    expect(runner.metrics.droppedSeconds).toBe(0);
  });

  it("reports a stalled frame honestly instead of presenting clamped time as real time", () => {
    const runner = new FixedStepRunner();
    runner.setSpeed(4);
    runner.advance(0, () => {});
    runner.advance(2000, () => {});
    expect(runner.metrics.steps).toBe(60);
    expect(runner.metrics.actual).toBeCloseTo(0.5, 9);
    expect(runner.metrics.droppedSeconds).toBeCloseTo(7, 9);
    expect(runner.metrics.sampleSeconds).toBe(2);
    expect(runner.metrics.status).toBe("slow");
    // The transient warning clears after healthy frames replace the bad sample.
    for (let frame = 1; frame <= 121; frame += 1) {
      runner.advance(2000 + (frame * 1000) / 60, () => {});
    }
    expect(runner.metrics.actual).toBeCloseTo(4, 9);
    expect(runner.metrics.status).toBe("ok");
    expect(runner.metrics.droppedSeconds).toBeCloseTo(7, 9);
  });

  it("resets visibility gaps without inventing offline progress or overload", () => {
    const runner = runFrames(60, 1).runner;
    runner.resetClock();
    runner.advance(100000, () => {});
    expect(runner.metrics.steps).toBe(60);
    expect(runner.metrics.status).toBe("warming");
    expect(runner.metrics.actual).toBeNull();
    runner.advance(100100, () => {});
    expect(runner.metrics.steps).toBe(66);
    expect(runner.metrics.droppedSeconds).toBe(0);
  });

  it("resets a measurement when speed changes rather than averaging different targets", () => {
    const runner = runFrames(60, 3).runner;
    runner.setSpeed(4);
    expect(runner.metrics.status).toBe("warming");
    expect(runner.metrics.actual).toBeNull();
    runner.advance(4000, () => {});
    for (let frame = 1; frame <= 120; frame += 1) {
      runner.advance(4000 + (frame * 1000) / 60, () => {});
    }
    expect(runner.metrics.actual).toBeCloseTo(4, 9);
    expect(runner.metrics.status).toBe("ok");
  });

  it("ignores invalid, repeated, and backwards timestamps without poisoning its clock", () => {
    const runner = new FixedStepRunner();
    for (const timestamp of [-1, NaN, Infinity, -Infinity])
      runner.advance(timestamp, () => {});
    runner.advance(100, () => {});
    runner.advance(100, () => {});
    runner.advance(50, () => {});
    runner.advance(NaN, () => {});
    runner.advance(200, () => {});
    expect(runner.metrics.steps).toBe(6);
    expect(runner.metrics.actual).toBeCloseTo(1, 9);
    expect(runner.metrics.droppedSeconds).toBe(0);
    expect(Number.isFinite(runner.alpha)).toBe(true);
  });
});
