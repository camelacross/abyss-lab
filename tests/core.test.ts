import { describe, expect, it } from "vitest";
import { createWorld, RULES, stepWorld } from "../src/simulation/core";
import { FIXED_DT, WORLD_HEIGHT, WORLD_WIDTH } from "../src/simulation/types";
import type { Command, World } from "../src/simulation/types";

function advance(world: World, seconds: number): World {
  for (let tick = 0; tick < Math.ceil(seconds / FIXED_DT); tick++)
    world = stepWorld(world);
  return world;
}

function isolated(): World {
  const world = createWorld(42);
  world.food = [];
  world.effects = [];
  world.environment.passiveFood = false;
  return world;
}

describe("deterministic simulation", () => {
  it("replays a seed and command timeline exactly, independent of other worlds", () => {
    let first = createWorld(123);
    let replay = createWorld(123);
    for (let tick = 0; tick < 1800; tick++) {
      const commands: Command[] =
        tick % 180 === 0
          ? [{ type: "feed", point: { x: 350 + (tick % 300), y: 350 } }]
          : tick % 97 === 0
            ? [{ type: "lure", point: { x: 700, y: 300 } }]
            : [];
      first = stepWorld(first, commands);
      stepWorld(createWorld(tick)); // An unrelated stream must not affect this replay.
      replay = stepWorld(replay, commands);
    }
    expect(replay).toEqual(first);
    expect(advance(createWorld(124), 30).rng).not.toEqual(first.rng);
    expect(first.time).toBe(1800 * FIXED_DT);
  });

  it("does not mutate input snapshots, including command-touched nested objects", () => {
    const before = createWorld(5);
    const snapshot = JSON.stringify(before);
    const next = stepWorld(before, [
      { type: "feed", point: { x: 500, y: 325 } },
      { type: "soothe", point: { x: 500, y: 325 } },
      { type: "passive", enabled: false },
    ]);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(next).not.toBe(before);
    expect(next.stats.careAccepted).toBe(1);
    expect(next.environment.passiveFood).toBe(false);
  });

  it("autonomously seeks, approaches and chews food before gaining nutrition", () => {
    let world = isolated();
    world.creature.angle = 0;
    world.creature.satiety = 35;
    const start = { x: world.creature.x, y: world.creature.y };
    world = stepWorld(world, [
      { type: "feed", point: { x: start.x + 120, y: start.y } },
    ]);
    expect(world.creature.state).toBe("seeking");
    expect(world.stats.eaten).toBe(0);
    let observedChewing = false;
    for (let tick = 0; tick < 1200 && world.stats.eaten === 0; tick++) {
      world = stepWorld(world);
      if (world.creature.state === "eating") {
        observedChewing = true;
        expect(world.stats.eaten).toBe(0);
      }
    }
    expect(world.creature.x).toBeGreaterThan(start.x + 50);
    expect(observedChewing).toBe(true);
    expect(world.stats.eaten).toBe(1);
    expect(world.stats.activeFed).toBe(1);
    expect(world.food).toHaveLength(0);
    expect(world.creature.satiety).toBeGreaterThan(50);
  });

  it("distinguishes passive nutrition from active care rewards only on consumption", () => {
    const base = isolated();
    base.creature.health = 60;
    base.creature.satiety = 30;
    const passive = structuredClone(base);
    passive.food = [
      { id: 900, x: 500, y: 325, age: 0, source: "passive", nutrition: 12 },
    ];
    const active = structuredClone(base);
    active.food = [
      { id: 900, x: 500, y: 325, age: 0, source: "active", nutrition: 22 },
    ];
    const passiveAfter = advance(passive, 2);
    const activeAfter = advance(active, 2);
    expect(passiveAfter.stats.eaten).toBe(1);
    expect(activeAfter.stats.eaten).toBe(1);
    expect(
      activeAfter.creature.satiety - passiveAfter.creature.satiety,
    ).toBeCloseTo(10);
    expect(
      activeAfter.creature.energy - passiveAfter.creature.energy,
    ).toBeCloseTo(5);
    expect(
      activeAfter.creature.health - passiveAfter.creature.health,
    ).toBeCloseTo(2);
    expect(
      activeAfter.creature.trust - passiveAfter.creature.trust,
    ).toBeCloseTo(4);
    expect(passiveAfter.stats.activeFed).toBe(0);
  });

  it("allows a nearby touch but rejects distant and repeated touches", () => {
    const initial = isolated();
    const distant = stepWorld(initial, [
      { type: "soothe", point: { x: 100, y: 110 } },
    ]);
    expect(distant.stats.careAccepted).toBe(0);
    expect(distant.events.at(-1)?.text).toContain("距离太远");
    let near = stepWorld(initial, [
      { type: "soothe", point: { x: 500, y: 325 } },
    ]);
    expect(near.stats.careAccepted).toBe(1);
    expect(near.creature.trust).toBeGreaterThan(initial.creature.trust + 6.9);
    expect(near.effects.some((fx) => fx.kind === "care")).toBe(true);
    near = stepWorld(near, [{ type: "soothe", point: { x: 500, y: 325 } }]);
    expect(near.stats.careAccepted).toBe(1);
    near = advance(near, RULES.careCooldown);
    near = stepWorld(near, [{ type: "soothe", point: near.creature }]);
    expect(near.stats.careAccepted).toBe(2);
  });

  it("responds to light by moving toward it, with trust affecting approach speed", () => {
    const low = isolated();
    low.creature.angle = 0;
    low.creature.speed = 0;
    low.creature.trust = 0;
    const high = structuredClone(low);
    high.creature.trust = 100;
    const cue: Command = { type: "lure", point: { x: 800, y: 325 } };
    const lowAfter = advance(stepWorld(low, [cue]), 2);
    const highAfter = advance(stepWorld(high, [cue]), 2);
    expect(lowAfter.creature.state).toBe("curious");
    expect(lowAfter.creature.x).toBeGreaterThan(low.creature.x + 30);
    expect(highAfter.creature.x).toBeGreaterThan(lowAfter.creature.x + 10);
    expect(highAfter.creature.target).toEqual({
      x: WORLD_WIDTH - RULES.creatureMargin,
      y: 325,
    });
  });

  it("rests autonomously when tired and resumes activity after replenishment", () => {
    const initial = isolated();
    initial.creature.energy = 10;
    let world = stepWorld(initial);
    expect(world.creature.state).toBe("resting");
    world = advance(world, 20);
    expect(world.creature.state).toBe("exploring");
    expect(world.creature.energy).toBeGreaterThan(75);
  });

  it("eventually rests and resumes exploration under ordinary passive care", () => {
    let world = createWorld(20261027);
    let rested = false;
    let resumed = false;
    const states = new Set<string>();
    for (let tick = 0; tick < 36000 && !resumed; tick++) {
      world = stepWorld(world);
      states.add(world.creature.state);
      if (world.creature.state === "resting") rested = true;
      if (rested && world.creature.state === "exploring") resumed = true;
    }
    expect(rested).toBe(true);
    expect(resumed).toBe(true);
    expect(states.has("seeking")).toBe(true);
    expect(states.has("eating")).toBe(true);
    expect(world.stats.rescued).toBe(0);
    expect(world.creature.health).toBeGreaterThan(50);
  });

  it("keeps boundary food reachable while reserving the full rotating silhouette", () => {
    let world = isolated();
    world.creature.satiety = 30;
    world = stepWorld(world, [{ type: "feed", point: { x: 0, y: 0 } }]);
    expect(world.food[0]).toMatchObject({
      x: RULES.creatureMargin,
      y: RULES.creatureMargin,
    });
    world = advance(world, 50);
    expect(world.stats.activeFed).toBe(1);
    expect(world.creature.x).toBeGreaterThanOrEqual(RULES.creatureMargin);
    expect(world.creature.y).toBeGreaterThanOrEqual(RULES.creatureMargin);
  });

  it("checks care distance at the actual pointer, not at the movement boundary", () => {
    const world = isolated();
    world.creature.x = RULES.creatureMargin;
    const after = stepWorld(world, [
      { type: "soothe", point: { x: 30, y: world.creature.y } },
    ]);
    expect(after.stats.careAccepted).toBe(0);
    expect(after.events.at(-1)?.text).toContain("距离太远");
  });

  it("limits food, rejects immediate feed spam and expires unconsumed particles", () => {
    let world = isolated();
    world.creature.satiety = 100;
    const feed: Command = { type: "feed", point: { x: 800, y: 500 } };
    world = stepWorld(
      world,
      Array.from({ length: 100 }, () => feed),
    );
    expect(world.food).toHaveLength(1);
    expect(world.stats.activeFed).toBe(0);
    for (let i = 0; i < 20; i++) {
      world = advance(world, RULES.feedCooldown + FIXED_DT);
      world = stepWorld(world, [feed]);
      expect(world.food.length).toBeLessThanOrEqual(RULES.foodLimit);
    }
    world.creature.health = 0;
    world.environment.rescueEnabled = false;
    world = advance(world, RULES.foodLifetime + 1);
    expect(world.food).toHaveLength(0);
  });

  it("generates baseline food on simulated time and honors the passive switch", () => {
    let world = isolated();
    world = stepWorld(world, [{ type: "passive", enabled: true }]);
    world = advance(world, RULES.passiveInterval + FIXED_DT);
    expect(world.food.some((food) => food.source === "passive")).toBe(true);
    world = stepWorld(world, [{ type: "passive", enabled: false }]);
    const rng = world.rng;
    world.creature.health = 0;
    world.environment.rescueEnabled = false;
    world = advance(world, RULES.passiveInterval * 2);
    expect(world.rng).toBe(rng);
  });
});

describe("non-blocking dormancy rescue", () => {
  function exhausted(): World {
    const world = isolated();
    world.creature.health = 0;
    world.creature.energy = 0;
    world.creature.satiety = 0;
    return world;
  }

  it("rescues zero health AND zero energy without food, movement or passive feeding", () => {
    const initial = exhausted();
    let world = stepWorld(initial, [{ type: "rescue" }]);
    expect(world.creature.state).toBe("recovering");
    expect(world.stats.rescued).toBe(1);
    expect(world.creature.x).toBe(initial.creature.x);
    world = advance(world, RULES.recoveryDuration + FIXED_DT);
    expect(world.creature.state).toBe("resting");
    expect(world.creature.health).toBeGreaterThanOrEqual(35);
    expect(world.creature.energy).toBeGreaterThanOrEqual(48);
    expect(world.creature.satiety).toBeGreaterThan(29);
    world = advance(world, 12);
    expect(["exploring", "seeking"]).toContain(world.creature.state);
  });

  it("automatically starts rescue after the finite dormancy delay", () => {
    let world = advance(exhausted(), RULES.autoRescueDelay + 0.1);
    expect(world.creature.state).toBe("recovering");
    expect(world.stats.rescued).toBe(1);
    world = advance(world, RULES.recoveryDuration + 0.1);
    expect(world.creature.state).toBe("resting");
    expect(world.creature.health).toBeGreaterThan(0);
    expect(world.creature.energy).toBeGreaterThan(0);
  });

  it("does not claim recovery when life support is unavailable; enabling it unblocks rescue", () => {
    const initial = exhausted();
    initial.environment.rescueEnabled = false;
    let world = stepWorld(initial, [{ type: "rescue" }]);
    expect(world.events.at(-1)?.text).toContain("不可用");
    world = advance(world, 60);
    expect(world.creature.state).toBe("dormant");
    expect(world.creature.health).toBe(0);
    expect(world.creature.energy).toBe(0);
    expect(world.stats.rescued).toBe(0);
    world = {
      ...world,
      environment: { ...world.environment, rescueEnabled: true },
    };
    world = stepWorld(world);
    expect(world.creature.state).toBe("recovering");
  });

  it("does not restart recovery or grant duplicate rescues from repeated clicks", () => {
    let world = stepWorld(exhausted(), [{ type: "rescue" }]);
    for (let tick = 0; tick < 600; tick++)
      world = stepWorld(world, [{ type: "rescue" }]);
    expect(world.stats.rescued).toBe(1);
    expect(world.creature.state).toBe("resting");
    expect(world.events.length).toBeLessThanOrEqual(8);
  });
});

describe("simulation invariants", () => {
  it("preserves finite bounded vitals and positions over 15 simulated minutes", () => {
    let world = createWorld(8675309);
    for (let tick = 0; tick < 60 * 60 * 15; tick++) {
      const commands: Command[] =
        tick % 977 === 0 ? [{ type: "feed", point: { x: -100, y: 900 } }] : [];
      if (tick === 10000) commands.push({ type: "passive", enabled: false });
      if (tick === 25000) commands.push({ type: "passive", enabled: true });
      world = stepWorld(world, commands);
      if (tick % 120 === 0) {
        const c = world.creature;
        for (const value of [c.health, c.energy, c.satiety, c.trust]) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(100);
        }
        expect(c.x).toBeGreaterThanOrEqual(RULES.creatureMargin);
        expect(c.x).toBeLessThanOrEqual(WORLD_WIDTH - RULES.creatureMargin);
        expect(c.y).toBeGreaterThanOrEqual(RULES.creatureMargin);
        expect(c.y).toBeLessThanOrEqual(WORLD_HEIGHT - RULES.creatureMargin);
        expect(Number.isFinite(c.angle)).toBe(true);
        expect(world.food.length).toBeLessThanOrEqual(RULES.foodLimit);
        expect(world.effects.length).toBeLessThanOrEqual(32);
        expect(world.events.length).toBeLessThanOrEqual(8);
      }
    }
    expect(world.stats.eaten).toBeGreaterThan(10);
  });

  it("ignores non-finite pointer coordinates and normalizes invalid or zero seeds", () => {
    const world = stepWorld(createWorld(0), [
      { type: "feed", point: { x: NaN, y: Infinity } },
    ]);
    expect(world.food).toHaveLength(2);
    expect(Number.isFinite(world.creature.x)).toBe(true);
    expect(createWorld(NaN).rng).not.toBe(0);
  });
});
