export const WORLD_WIDTH = 1000;
export const WORLD_HEIGHT = 650;
export const FIXED_DT = 1 / 60;
export type Point = { x: number; y: number };
export type Behavior =
  | "exploring"
  | "seeking"
  | "eating"
  | "resting"
  | "curious"
  | "dormant"
  | "recovering";
export type Food = Point & {
  id: number;
  age: number;
  nutrition: number;
  source: "passive" | "active";
};
export type Effect = Point & {
  id: number;
  age: number;
  kind: "food" | "eat" | "care" | "lure" | "rescue";
};
export type SimEvent = {
  id: number;
  time: number;
  text: string;
  kind: "info" | "positive" | "warning";
};
export type Creature = Point & {
  angle: number;
  speed: number;
  state: Behavior;
  stateTime: number;
  health: number;
  energy: number;
  satiety: number;
  trust: number;
  target: Point;
  targetFoodId: number | null;
  pulse: number;
};
export type World = {
  tick: number;
  time: number;
  rng: number;
  nextId: number;
  creature: Creature;
  food: Food[];
  effects: Effect[];
  events: SimEvent[];
  environment: { passiveFood: boolean; rescueEnabled: boolean };
  stats: {
    eaten: number;
    activeFed: number;
    careAccepted: number;
    rescued: number;
  };
  timers: { passive: number; feed: number; care: number; lure: number };
};
export type Command =
  | { type: "feed"; point: Point }
  | { type: "soothe"; point: Point }
  | { type: "lure"; point: Point }
  | { type: "rescue" }
  | { type: "passive"; enabled: boolean };
