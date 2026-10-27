import { FIXED_DT, WORLD_HEIGHT, WORLD_WIDTH } from "./types";
import type {
  Behavior,
  Command,
  Effect,
  Food,
  Point,
  SimEvent,
  World,
} from "./types";

export const RULES = {
  creatureMargin: 220,
  passiveInterval: 9,
  foodLimit: 12,
  foodLifetime: 80,
  feedCooldown: 1.2,
  careCooldown: 5,
  careRadius: 140,
  lureCooldown: 0.4,
  eatingDuration: 1.8,
  autoRescueDelay: 12,
  recoveryDuration: 6,
} as const;

const clamp = (n: number, low = 0, high = 100) =>
  Math.max(low, Math.min(high, n));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const validPoint = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);
const safePoint = (p: Point): Point => ({
  x: clamp(p.x, RULES.creatureMargin, WORLD_WIDTH - RULES.creatureMargin),
  y: clamp(p.y, RULES.creatureMargin, WORLD_HEIGHT - RULES.creatureMargin),
});

/** A local xorshift32 stream. Only simulation steps advance this stream. */
function random(world: World): number {
  let x = world.rng;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  world.rng = x >>> 0;
  return world.rng / 0x100000000;
}

function event(world: World, text: string, kind: SimEvent["kind"] = "info") {
  // Repeated invalid clicks should not overwrite the entire observation log.
  const latest = world.events[world.events.length - 1];
  if (latest?.text === text && world.time - latest.time < 2) return;
  world.events.push({ id: world.nextId++, time: world.time, text, kind });
  world.events = world.events.slice(-8);
}

function effect(world: World, point: Point, kind: Effect["kind"]) {
  world.effects.push({
    x: point.x,
    y: point.y,
    id: world.nextId++,
    age: 0,
    kind,
  });
  world.effects = world.effects.slice(-32);
}

function changeState(world: World, state: Behavior) {
  if (world.creature.state === state) return;
  world.creature.state = state;
  world.creature.stateTime = 0;
}

function exploreTarget(world: World) {
  world.creature.target = {
    x:
      RULES.creatureMargin +
      random(world) * (WORLD_WIDTH - RULES.creatureMargin * 2),
    y:
      RULES.creatureMargin +
      random(world) * (WORLD_HEIGHT - RULES.creatureMargin * 2),
  };
  world.creature.stateTime = 0;
}

function spawnFood(world: World, point: Point, source: Food["source"]) {
  if (world.food.length >= RULES.foodLimit) return;
  world.food.push({
    ...safePoint(point),
    id: world.nextId++,
    age: 0,
    nutrition: source === "active" ? 22 : 12,
    source,
  });
  effect(world, safePoint(point), "food");
}

function startRescue(world: World, automatic: boolean) {
  const c = world.creature;
  if (!world.environment.rescueEnabled) {
    event(world, "救援维生系统不可用，生命保持休眠。", "warning");
    return;
  }
  if (c.state !== "dormant") {
    event(
      world,
      c.state === "recovering"
        ? "救援已在进行，核心正在重新启动。"
        : "生命体征稳定，暂不需要休眠救援。",
    );
    return;
  }
  changeState(world, "recovering");
  c.targetFoodId = null;
  c.speed = 0;
  c.pulse = 1;
  world.stats.rescued += 1;
  effect(world, c, "rescue");
  event(
    world,
    automatic
      ? "自动维生介入，开始休眠救援。"
      : "休眠救援启动，正在补充维生能量。",
    "positive",
  );
}

function applyCommand(world: World, command: Command) {
  const c = world.creature;
  if (command.type === "passive") {
    if (world.environment.passiveFood !== command.enabled) {
      world.environment.passiveFood = command.enabled;
      event(
        world,
        command.enabled ? "被动供食已开启。" : "被动供食已暂停，可手动投喂。",
      );
    }
    return;
  }
  if (command.type === "rescue") {
    startRescue(world, false);
    return;
  }
  if (!validPoint(command.point)) return;
  const point = safePoint(command.point);
  if (command.type === "feed") {
    if (world.timers.feed > 0) {
      event(world, "营养投放口正在补充，请稍等。");
      return;
    }
    if (world.food.length >= RULES.foodLimit) {
      event(world, "生态箱内食物充足，请等待摄食。");
      return;
    }
    spawnFood(world, point, "active");
    world.timers.feed = RULES.feedCooldown;
    event(
      world,
      c.state === "dormant" || c.state === "recovering"
        ? "已投放营养，待维生恢复后才能摄食。"
        : c.satiety >= 94
          ? "已投放营养，它暂时饱足，会在需要时摄食。"
          : "已投放浓缩营养，生命体会循迹靠近。",
    );
    return;
  }
  if (c.state === "dormant" || c.state === "recovering") {
    event(world, "生命处于维生阶段，等待核心恢复。");
    return;
  }
  if (command.type === "soothe") {
    if (world.timers.care > 0) {
      event(world, "让它感受这次接触，稍后再安抚。");
      return;
    }
    if (distance(c, command.point) > RULES.careRadius) {
      event(world, "距离太远，请靠近生命体轻触安抚。");
      return;
    }
    world.timers.care = RULES.careCooldown;
    c.trust += 7;
    c.energy += 4;
    c.health += 1;
    c.pulse = 1;
    world.stats.careAccepted += 1;
    effect(world, c, "care");
    event(world, "它回应了你的触碰：核心舒展，信任增加。", "positive");
    if (c.state !== "resting" && c.state !== "eating" && c.satiety > 25) {
      changeState(world, "curious");
      c.target = { ...point };
      c.targetFoodId = null;
    }
    return;
  }
  if (world.timers.lure > 0) return;
  world.timers.lure = RULES.lureCooldown;
  effect(world, point, "lure");
  if (c.energy < 20 || c.satiety < 25 || c.state === "eating") {
    event(world, "它正专注于补充体力，暂时没有回应光引。");
    return;
  }
  changeState(world, "curious");
  c.stateTime = 0;
  c.target = point;
  c.targetFoodId = null;
  c.pulse = Math.max(c.pulse, 0.4);
  event(world, "感知到光的涟漪，它正转向你的指引。");
}

function nearestFood(world: World): Food | undefined {
  const c = world.creature;
  let nearest: Food | undefined;
  let score = Infinity;
  for (const food of world.food) {
    if (c.satiety >= 78 && (food.source !== "active" || c.satiety >= 94))
      continue;
    const nextScore = distance(c, food) * (food.source === "active" ? 0.75 : 1);
    if (nextScore < score) {
      nearest = food;
      score = nextScore;
    }
  }
  return nearest;
}

function consume(world: World, food: Food) {
  const c = world.creature;
  world.food = world.food.filter((item) => item.id !== food.id);
  world.stats.eaten += 1;
  c.satiety += food.nutrition;
  c.energy += food.source === "active" ? 9 : 4;
  c.health += food.source === "active" ? 3 : 1;
  c.pulse = 1;
  if (food.source === "active") {
    c.trust += 4;
    world.stats.activeFed += 1;
  }
  effect(world, c, "eat");
  event(
    world,
    food.source === "active"
      ? "浓缩营养已吸收：饱食、能量与信任提升。"
      : "已摄入环境养分，基础营养得到补充。",
    "positive",
  );
  c.targetFoodId = null;
  changeState(world, c.energy < 26 ? "resting" : "exploring");
  if (c.state === "exploring") exploreTarget(world);
}

function move(world: World) {
  const c = world.creature;
  const dist = distance(c, c.target);
  const desiredAngle = Math.atan2(c.target.y - c.y, c.target.x - c.x);
  const turn = Math.atan2(
    Math.sin(desiredAngle - c.angle),
    Math.cos(desiredAngle - c.angle),
  );
  const turnRate = c.state === "seeking" ? 1.6 : 1.1;
  c.angle += clamp(turn, -turnRate * FIXED_DT, turnRate * FIXED_DT);
  c.angle = Math.atan2(Math.sin(c.angle), Math.cos(c.angle));
  // Familiarity has a visible behavioral consequence: a trusted light cue is
  // approached more readily (36–48 world units/s), without gating basic care.
  const baseSpeed =
    c.state === "seeking"
      ? 51
      : c.state === "curious"
        ? 36 + c.trust * 0.12
        : 31;
  const turnSlowdown = 0.4 + 0.6 * Math.max(0, Math.cos(turn));
  const desiredSpeed = baseSpeed * turnSlowdown * Math.min(1, dist / 65);
  c.speed += (desiredSpeed - c.speed) * 2.5 * FIXED_DT;
  const step = Math.min(c.speed * FIXED_DT, dist);
  c.x = clamp(
    c.x + Math.cos(c.angle) * step,
    RULES.creatureMargin,
    WORLD_WIDTH - RULES.creatureMargin,
  );
  c.y = clamp(
    c.y + Math.sin(c.angle) * step,
    RULES.creatureMargin,
    WORLD_HEIGHT - RULES.creatureMargin,
  );
}

export function createWorld(seed = 20261027): World {
  const world: World = {
    tick: 0,
    time: 0,
    rng: (Number.isFinite(seed) ? seed >>> 0 : 0) || 0x9e3779b9,
    nextId: 1,
    creature: {
      x: 500,
      y: 325,
      angle: -0.22,
      speed: 15,
      state: "exploring",
      stateTime: 0,
      health: 92,
      energy: 76,
      satiety: 58,
      trust: 18,
      target: { x: 730, y: 260 },
      targetFoodId: null,
      pulse: 0,
    },
    food: [],
    effects: [],
    events: [],
    environment: { passiveFood: true, rescueEnabled: true },
    stats: { eaten: 0, activeFed: 0, careAccepted: 0, rescued: 0 },
    timers: { passive: RULES.passiveInterval, feed: 0, care: 0, lure: 0 },
  };
  spawnFood(world, { x: 690, y: 285 }, "passive");
  spawnFood(world, { x: 310, y: 455 }, "passive");
  event(world, "生命体已适应生态箱，开始自主探索。");
  return world;
}

/** Pure fixed-step transition: no wall-clock, browser, rendering or React dependencies. */
export function stepWorld(
  previous: World,
  commands: readonly Command[] = [],
): World {
  const world: World = {
    ...previous,
    creature: { ...previous.creature, target: { ...previous.creature.target } },
    food: previous.food.map((food) => ({ ...food })),
    effects: previous.effects.map((fx) => ({ ...fx })),
    events: [...previous.events],
    environment: { ...previous.environment },
    stats: { ...previous.stats },
    timers: { ...previous.timers },
  };
  world.tick += 1;
  world.time = world.tick * FIXED_DT;
  const c = world.creature;
  c.stateTime += FIXED_DT;
  c.pulse = Math.max(0, c.pulse - FIXED_DT * 0.55);
  world.timers.feed = Math.max(0, world.timers.feed - FIXED_DT);
  world.timers.care = Math.max(0, world.timers.care - FIXED_DT);
  world.timers.lure = Math.max(0, world.timers.lure - FIXED_DT);
  world.effects = world.effects
    .map((fx) => ({ ...fx, age: fx.age + FIXED_DT }))
    .filter((fx) => fx.age < 3);
  world.food = world.food
    .map((food) => ({ ...food, age: food.age + FIXED_DT }))
    .filter((food) => food.age < RULES.foodLifetime);

  // Detect exhaustion before commands, so a rescue on this exact step can succeed.
  if (
    (c.health <= 0 || c.energy <= 0) &&
    c.state !== "recovering" &&
    c.state !== "dormant"
  ) {
    changeState(world, "dormant");
    c.speed = 0;
    c.targetFoodId = null;
    event(world, "生命进入保护性休眠，维生救援可立即介入。", "warning");
  }
  for (const command of commands) applyCommand(world, command);

  if (world.environment.passiveFood) {
    world.timers.passive -= FIXED_DT;
    if (world.timers.passive <= 0) {
      world.timers.passive += RULES.passiveInterval;
      spawnFood(
        world,
        { x: 150 + random(world) * 700, y: 145 + random(world) * 360 },
        "passive",
      );
    }
  }

  if (c.state === "dormant") {
    c.speed = 0;
    if (world.environment.rescueEnabled && c.stateTime >= RULES.autoRescueDelay)
      startRescue(world, true);
  } else if (c.state === "recovering") {
    // Rescue is external life support. It requires no food, energy, health or locomotion.
    c.speed = 0;
    c.health = Math.max(c.health, Math.min(35, c.stateTime * 6));
    c.energy = Math.max(c.energy, Math.min(48, c.stateTime * 8));
    c.satiety = Math.max(c.satiety, Math.min(30, c.stateTime * 5));
    if (c.stateTime >= RULES.recoveryDuration) {
      c.health = Math.max(35, c.health);
      c.energy = Math.max(48, c.energy);
      c.satiety = Math.max(30, c.satiety);
      changeState(world, "resting");
      c.pulse = 1;
      event(world, "核心已恢复稳定，生命正在休息。", "positive");
    }
  } else {
    c.satiety -= FIXED_DT * 0.38;
    c.trust -= FIXED_DT * 0.012;
    if (c.satiety <= 0) c.health -= FIXED_DT * 0.8;
    else if (c.satiety > 30) c.health += FIXED_DT * 0.08;

    if (c.state === "resting") {
      c.speed = Math.max(0, c.speed - FIXED_DT * 45);
      c.energy += FIXED_DT * 5;
      if (c.satiety > 20) c.health += FIXED_DT * 0.16;
      if (
        (c.energy >= 84 && c.stateTime >= 8) ||
        (c.satiety < 20 && c.energy > 35)
      ) {
        changeState(world, "exploring");
        exploreTarget(world);
      }
    } else {
      c.energy -= FIXED_DT * (c.state === "eating" ? 0.08 : 0.43);
      if (c.energy < 18 && c.state !== "eating") {
        changeState(world, "resting");
        c.targetFoodId = null;
        event(world, "膜翼渐渐收拢，它需要一段安静的休息。");
      } else if (c.state === "eating") {
        c.speed = Math.max(0, c.speed - FIXED_DT * 80);
        const food = world.food.find((item) => item.id === c.targetFoodId);
        if (!food) {
          changeState(world, "exploring");
          c.targetFoodId = null;
          exploreTarget(world);
        } else if (c.stateTime >= RULES.eatingDuration) consume(world, food);
      } else {
        let beganEating = false;
        if (
          c.state === "curious" &&
          (c.stateTime > 6 || (distance(c, c.target) < 22 && c.stateTime > 2))
        ) {
          changeState(world, "exploring");
          exploreTarget(world);
        }
        if (c.state !== "curious") {
          const food = nearestFood(world);
          if (food) {
            changeState(world, "seeking");
            c.targetFoodId = food.id;
            c.target = { x: food.x, y: food.y };
            if (distance(c, food) < 32) {
              changeState(world, "eating");
              beganEating = true;
              c.pulse = 0.5;
              event(world, "触须环抱住养分，开始摄食。");
            }
          } else {
            if (c.state === "seeking") {
              changeState(world, "exploring");
              c.targetFoodId = null;
              exploreTarget(world);
            }
            if (distance(c, c.target) < 40 || c.stateTime > 14)
              exploreTarget(world);
          }
        }
        if (!beganEating) move(world);
      }
    }
  }
  c.health = clamp(c.health);
  c.energy = clamp(c.energy);
  c.satiety = clamp(c.satiety);
  c.trust = clamp(c.trust);
  return world;
}
