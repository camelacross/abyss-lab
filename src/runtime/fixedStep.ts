import { FIXED_DT } from "../simulation/types";

export type SimulationSpeed = 1 | 2 | 4;
export type RuntimeMetrics = {
  target: number;
  actual: number | null;
  status: "warming" | "ok" | "slow" | "paused";
  /** Cumulative simulated seconds discarded by overload protection. */
  droppedSeconds: number;
  /** Cumulative number of successful simulation steps. */
  steps: number;
  fps: number;
  /** Active wall seconds in the current measurement window. */
  sampleSeconds: number;
};

type Sample = { wall: number; simulated: number; dropped: number };
const MAX_FRAME_SECONDS = 0.25;
const MAX_STEPS_PER_FRAME = 60;
const WINDOW_SECONDS = 2;
const WARMUP_SECONDS = 1;
const EPSILON = 1e-9;

/**
 * Monotonic wall time is an input, never read internally. The callback always
 * advances exactly FIXED_DT simulation seconds. Rendering may interpolate using
 * alpha but must never advance the simulation itself.
 *
 * A stalled frame is capped to avoid an unbounded catch-up loop. Its full wall
 * duration remains in the actual-speed denominator, so the cap cannot masquerade
 * as successful real-time execution. Samples retain complete frame intervals;
 * an unusually long frame can temporarily make the window longer than 2 s.
 */
export class FixedStepRunner {
  private speed: SimulationSpeed = 1;
  private paused = false;
  private lastNow: number | null = null;
  private accumulator = 0;
  private totalSteps = 0;
  private dropped = 0;
  private samples: Sample[] = [];
  private sampleWall = 0;
  private sampleSimulated = 0;
  private sampleDropped = 0;

  get alpha(): number {
    return Math.max(0, Math.min(1, this.accumulator / FIXED_DT));
  }

  get metrics(): RuntimeMetrics {
    const actual =
      this.sampleWall > EPSILON ? this.sampleSimulated / this.sampleWall : null;
    const warmed = this.sampleWall >= WARMUP_SECONDS - EPSILON;
    const slow =
      actual !== null &&
      (Math.abs(actual - this.speed) / this.speed > 0.1 ||
        this.sampleDropped > EPSILON);
    return {
      target: this.speed,
      actual: this.paused ? null : actual,
      status: this.paused
        ? "paused"
        : !warmed
          ? "warming"
          : slow
            ? "slow"
            : "ok",
      droppedSeconds: this.dropped,
      steps: this.totalSteps,
      fps:
        this.sampleWall > EPSILON ? this.samples.length / this.sampleWall : 0,
      sampleSeconds: this.sampleWall,
    };
  }

  setSpeed(speed: SimulationSpeed): void {
    if (![1, 2, 4].includes(speed) || speed === this.speed) return;
    this.speed = speed;
    this.resetClock();
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.resetClock();
  }

  /** Call on visibility changes: background time is explicitly not simulated. */
  resetClock(): void {
    this.lastNow = null;
    this.accumulator = 0;
    this.samples = [];
    this.sampleWall = 0;
    this.sampleSimulated = 0;
    this.sampleDropped = 0;
  }

  advance(nowMs: number, step: () => void): void {
    if (!Number.isFinite(nowMs) || nowMs < 0) return;
    if (this.lastNow === null) {
      this.lastNow = nowMs;
      return;
    }
    // A non-monotonic timestamp must not move the reference point backwards.
    if (nowMs <= this.lastNow) return;
    const wall = (nowMs - this.lastNow) / 1000;
    this.lastNow = nowMs;
    if (this.paused) return;

    const accepted = Math.min(wall, MAX_FRAME_SECONDS);
    let frameDropped = (wall - accepted) * this.speed;
    this.accumulator += accepted * this.speed;
    let steps = 0;
    while (
      this.accumulator + EPSILON >= FIXED_DT &&
      steps < MAX_STEPS_PER_FRAME
    ) {
      step();
      this.accumulator = Math.max(0, this.accumulator - FIXED_DT);
      steps += 1;
      this.totalSteps += 1;
    }
    // Keep interpolation's fractional remainder even if a future configuration
    // allows the frame budget to exceed MAX_STEPS_PER_FRAME.
    if (this.accumulator + EPSILON >= FIXED_DT) {
      const wholeSteps = Math.floor((this.accumulator + EPSILON) / FIXED_DT);
      const overflow = wholeSteps * FIXED_DT;
      this.accumulator = Math.max(0, this.accumulator - overflow);
      frameDropped += overflow;
    }
    this.dropped += frameDropped;
    this.record({ wall, simulated: steps * FIXED_DT, dropped: frameDropped });
  }

  private record(sample: Sample): void {
    this.samples.push(sample);
    this.sampleWall += sample.wall;
    this.sampleSimulated += sample.simulated;
    this.sampleDropped += sample.dropped;
    while (
      this.samples.length > 1 &&
      this.sampleWall - this.samples[0].wall >= WINDOW_SECONDS - EPSILON
    ) {
      const oldest = this.samples.shift()!;
      this.sampleWall -= oldest.wall;
      this.sampleSimulated -= oldest.simulated;
      this.sampleDropped = Math.max(0, this.sampleDropped - oldest.dropped);
    }
  }
}
