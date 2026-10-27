import {
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type Creature,
  type Point,
  type World,
} from "../simulation/types";

export type RenderOptions = {
  previous?: World;
  alpha?: number;
  pointer?: Point | null;
  reducedMotion?: boolean;
};

const TAU = Math.PI * 2;
const clamp = (v: number, low: number, high: number) =>
  Math.max(low, Math.min(high, v));
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
}

function aura(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  inner: string,
) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, inner);
  g.addColorStop(1, "rgba(40,130,120,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function terrain(ctx: CanvasRenderingContext2D, time: number) {
  // The backdrop's procedural seed is fixed and completely separate from simulation RNG.
  for (let layer = 0; layer < 3; layer++) {
    const base = 555 + layer * 32;
    ctx.beginPath();
    ctx.moveTo(0, 650);
    for (let x = 0; x <= 1020; x += 20) {
      const y =
        base +
        Math.sin(x * 0.008 + layer * 2) * 19 +
        Math.sin(x * 0.021 + layer) * 7;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(1000, 650);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, base - 30, 0, 650);
    gradient.addColorStop(0, ["#102b2b", "#0b2224", "#07191b"][layer]);
    gradient.addColorStop(1, "#050f15");
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = [
      "rgba(83,152,126,.09)",
      "rgba(76,136,121,.11)",
      "rgba(76,136,121,.12)",
    ][layer];
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  for (let i = 0; i < 26; i++) {
    const x = hash(i + 40) * 1020 - 10;
    const y = 590 + hash(i + 90) * 50;
    const w = 7 + hash(i + 100) * 34;
    ctx.fillStyle = "#0b2022";
    ctx.beginPath();
    ctx.moveTo(x - w, y + 15);
    ctx.bezierCurveTo(x - w * 0.7, y - 18, x + w * 0.5, y - 15, x + w, y + 12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(70,125,114,.09)";
    ctx.stroke();
  }

  // Sessile filaments, rooted in the foreground, sway with a slow water current.
  for (let colony = 0; colony < 11; colony++) {
    const x = 30 + hash(colony + 400) * 940;
    const y = 610 + hash(colony + 420) * 38;
    const height = 19 + hash(colony + 430) * 48;
    for (let branch = 0; branch < 7; branch++) {
      const spread = (branch - 3) * 5;
      const h = height * (0.5 + hash(colony * 7 + branch + 450) * 0.5);
      const sway = Math.sin(time * 0.6 + colony + branch * 0.17) * h * 0.12;
      ctx.beginPath();
      ctx.moveTo(x + spread * 0.3, y);
      ctx.bezierCurveTo(
        x + spread * 0.3,
        y - h * 0.45,
        x + spread + sway,
        y - h * 0.75,
        x + spread + sway,
        y - h,
      );
      const g = ctx.createLinearGradient(0, y, 0, y - h);
      g.addColorStop(0, "rgba(14,55,50,.7)");
      g.addColorStop(1, "rgba(70,138,105,.38)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.7;
      ctx.stroke();
      ellipse(ctx, x + spread + sway, y - h, 1.3, 2.6, "rgba(119,199,147,.35)");
    }
  }
}

function background(ctx: CanvasRenderingContext2D, time: number) {
  const base = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  base.addColorStop(0, "#07191e");
  base.addColorStop(0.43, "#0a2226");
  base.addColorStop(1, "#061318");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  aura(ctx, 470, 180, 520, "rgba(30,83,73,.28)");
  aura(ctx, 850, 390, 260, "rgba(15,57,79,.20)");
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 7; i++) {
    const x = 110 + i * 112;
    const drift = Math.sin(time * 0.085 + i * 1.4) * 16;
    const gradient = ctx.createLinearGradient(x, 0, x + 180, 570);
    gradient.addColorStop(0, `rgba(81,155,134,${0.045 + hash(i) * 0.035})`);
    gradient.addColorStop(0.6, "rgba(49,111,102,.018)");
    gradient.addColorStop(1, "rgba(20,60,60,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(x + drift, -20);
    ctx.lineTo(x + 25 + drift, -20);
    ctx.lineTo(x + 270 + drift, 580);
    ctx.lineTo(x + 130 + drift, 580);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Very faint observation-grid marks sit behind all life, like an optical overlay.
  ctx.strokeStyle = "rgba(114,180,160,.055)";
  ctx.lineWidth = 1;
  for (let x = 100; x < 1000; x += 100) {
    for (let y = 100; y < 600; y += 100) {
      ctx.beginPath();
      ctx.moveTo(x - 3, y);
      ctx.lineTo(x + 3, y);
      ctx.moveTo(x, y - 3);
      ctx.lineTo(x, y + 3);
      ctx.stroke();
    }
  }

  for (let i = 0; i < 135; i++) {
    const depth = 0.3 + hash(i + 200) * 0.7;
    const x =
      ((hash(i + 1) * 1060 +
        time * (1.3 + depth * 2) +
        Math.sin(time * 0.12 + i) * 10) %
        1060) -
      30;
    const y =
      ((((hash(i + 100) * 710 - time * (0.7 + depth)) % 710) + 710) % 710) - 30;
    const brightness = 0.09 + depth * 0.23;
    ctx.fillStyle = `rgba(143,196,176,${brightness})`;
    ctx.beginPath();
    ctx.arc(x, y, 0.35 + depth * 0.7, 0, TAU);
    ctx.fill();
    if (i % 19 === 0) aura(ctx, x, y, 8, "rgba(112,204,157,.08)");
  }

  terrain(ctx, time);
  const vignette = ctx.createRadialGradient(500, 300, 190, 500, 300, 650);
  vignette.addColorStop(0, "rgba(2,8,13,0)");
  vignette.addColorStop(1, "rgba(2,8,13,.78)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
}

function tentacles(
  ctx: CanvasRenderingContext2D,
  creature: Creature,
  time: number,
  amplitude: number,
) {
  const eating = creature.state === "eating";
  const asleep = creature.state === "resting" || creature.state === "dormant";
  const frequency = asleep ? 0.75 : eating ? 3.4 : 1.9 + creature.speed * 0.008;
  // Six separate articulated limbs; 24 segments each. The distal segments lag the root.
  for (let limb = 0; limb < 6; limb++) {
    const side = limb < 3 ? -1 : 1;
    const rank = limb < 3 ? 2 - limb : limb - 3;
    const length = 112 + rank * 18;
    const base = (limb - 2.5) * 10;
    const points: Point[] = [];
    for (let segment = 0; segment <= 24; segment++) {
      const u = segment / 24;
      const wave = Math.sin(time * frequency - u * 5.7 + limb * 0.85);
      const spread = side * (16 + rank * 10) * Math.sin(u * Math.PI * 0.65);
      const curl = asleep ? Math.sin(u * 3.8) * 23 * side : 0;
      points.push({
        x: eating
          ? -51 - Math.sin(u * Math.PI) * length * 0.38 + u * u * 86
          : -51 - length * u + (asleep ? u * u * 23 : 0),
        y: eating
          ? base * (1 - u * 0.55) +
            side * Math.sin(u * Math.PI) * 35 +
            wave * u * 4
          : base + spread + wave * (3 + u * 15) * amplitude + curl,
      });
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    points.forEach((p, j) => (j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.strokeStyle = "rgba(48,170,150,.07)";
    ctx.lineWidth = 13;
    ctx.stroke();
    for (let segment = 1; segment < points.length; segment++) {
      const previous = points[segment - 1];
      const p = points[segment];
      const u = segment / 24;
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(p.x, p.y);
      ctx.lineWidth = 6 * (1 - u) + 0.6;
      ctx.strokeStyle = `rgba(${42 + Math.round(u * 52)},${109 + Math.round(u * 60)},${106 + Math.round(u * 40)},${0.8 - u * 0.19})`;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y - 0.9);
      ctx.lineTo(p.x, p.y - 0.9);
      ctx.lineWidth = 0.65;
      ctx.strokeStyle = "rgba(168,233,192,.38)";
      ctx.stroke();
      if (segment % 3 === 0) {
        const dx = p.x - previous.x;
        const dy = p.y - previous.y;
        const d = Math.hypot(dx, dy) || 1;
        const radius = 2.6 * (1 - u) + 0.5;
        ctx.strokeStyle = "rgba(15,56,58,.8)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(p.x - (dy / d) * radius, p.y + (dx / d) * radius);
        ctx.lineTo(p.x + (dy / d) * radius, p.y - (dx / d) * radius);
        ctx.stroke();
        ellipse(ctx, p.x, p.y - 1, 0.8, 0.8, "rgba(162,229,191,.55)");
      }
    }
    const tip = points[24];
    aura(ctx, tip.x, tip.y, 8, "rgba(119,241,183,.22)");
    ellipse(ctx, tip.x, tip.y, 1.5, 1.1, "rgba(163,243,191,.85)");
  }
}

function wingPath(ctx: CanvasRenderingContext2D, span: number, flap: number) {
  ctx.beginPath();
  ctx.moveTo(53, 2);
  ctx.bezierCurveTo(29, 32, 0 + flap * 8, span * 0.7, -40 + flap * 8, span);
  ctx.bezierCurveTo(-58, span + 6, -69, span * 0.83, -85, span * 0.78);
  ctx.bezierCurveTo(-83, span * 0.65, -93, span * 0.61, -104, span * 0.58);
  ctx.bezierCurveTo(-92, span * 0.42, -74, span * 0.39, -72, span * 0.25);
  ctx.bezierCurveTo(-60, span * 0.17, -56, 10, -52, 1);
  ctx.bezierCurveTo(-16, -13, 17, -12, 53, 2);
  ctx.closePath();
}

function wing(
  ctx: CanvasRenderingContext2D,
  side: number,
  span: number,
  flap: number,
  time: number,
) {
  ctx.save();
  ctx.scale(1, side);
  const g = ctx.createLinearGradient(20, 5, -48, span);
  g.addColorStop(0, "rgba(96,182,155,.78)");
  g.addColorStop(0.22, "rgba(44,129,118,.69)");
  g.addColorStop(0.56, "rgba(35,111,108,.38)");
  g.addColorStop(1, "rgba(104,203,165,.30)");
  wingPath(ctx, span, flap);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(131,230,189,.37)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.save();
  ctx.clip();

  // Rib curves radiate from the muscular root into the translucent membrane.
  for (let rib = 0; rib < 12; rib++) {
    const f = rib / 11;
    const endX = 36 - f * 146 + Math.sin(f * Math.PI) * 16;
    const endY = Math.sin(f * Math.PI * 0.85) * span;
    ctx.beginPath();
    ctx.moveTo(33 - f * 48, 3);
    ctx.bezierCurveTo(
      15 - f * 58,
      endY * 0.28,
      endX + 27,
      endY * 0.77,
      endX,
      endY,
    );
    ctx.strokeStyle = `rgba(147,224,180,${0.12 + Math.sin(f * Math.PI) * 0.12})`;
    ctx.lineWidth = rib % 3 === 0 ? 1.1 : 0.55;
    ctx.stroke();
    for (let branch = 1; branch <= 3; branch++) {
      const u = branch / 4;
      const bx = (33 - f * 48) * (1 - u) + endX * u;
      const by = endY * u;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx - 11, by + 4, bx - 18, by + 12);
      ctx.strokeStyle = "rgba(123,216,169,.10)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }
  for (let contour = 1; contour < 7; contour++) {
    const p = contour / 7;
    ctx.beginPath();
    ctx.moveTo(45 - p * 45, p * span * 0.15);
    ctx.bezierCurveTo(
      10 - p * 16,
      p * span * 0.8,
      -65,
      p * span * 0.92,
      -81,
      p * span * 0.6,
    );
    ctx.strokeStyle = "rgba(142,218,176,.09)";
    ctx.lineWidth = 0.55;
    ctx.stroke();
  }
  for (let dot = 0; dot < 30; dot++) {
    const x = -92 + hash(dot + 700) * 134;
    const y = hash(dot + 730) * span;
    const light = 0.14 + Math.sin(time * 0.7 + dot * 1.3) * 0.08;
    ellipse(
      ctx,
      x,
      y,
      0.7 + hash(dot + 760) * 0.8,
      0.65,
      `rgba(167,244,186,${light})`,
    );
  }
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(51, 2);
  ctx.bezierCurveTo(29, 32, flap * 8, span * 0.7, -40 + flap * 8, span);
  ctx.strokeStyle = "rgba(189,244,202,.5)";
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.restore();
}

function creatureBody(
  ctx: CanvasRenderingContext2D,
  c: Creature,
  time: number,
  reduced: boolean,
) {
  const dormant = c.state === "dormant";
  const resting = c.state === "resting";
  const eating = c.state === "eating";
  const recovering = c.state === "recovering";
  const frequency = dormant
    ? 0.65
    : resting
      ? 1.15
      : eating
        ? 3.6
        : 2 + c.speed * 0.013;
  const motion = reduced ? 0.25 : 1;
  const flap = Math.sin(time * frequency) * motion;
  const fold = dormant ? 0.48 : resting ? 0.66 : eating ? 0.79 : 1;
  const span = (117 + flap * 13) * fold;
  const luminescence = dormant ? 0.24 : resting ? 0.52 : 0.8;
  ctx.save();
  ctx.globalAlpha = dormant ? 0.6 : 1;
  aura(ctx, -2, 0, 135, `rgba(78,189,145,${luminescence * 0.12})`);
  tentacles(ctx, c, time, dormant ? 0.16 : resting ? 0.43 : motion);
  wing(
    ctx,
    -1,
    span * (1 + Math.sin(time * frequency - 0.4) * 0.035),
    flap,
    time,
  );
  wing(ctx, 1, span, flap, time);

  // Muscular mantle: overlapping curves, not a flat sprite or a human face.
  const bodyGradient = ctx.createLinearGradient(0, -27, 0, 29);
  bodyGradient.addColorStop(0, "#61978c");
  bodyGradient.addColorStop(0.24, "#346e66");
  bodyGradient.addColorStop(0.5, "#1f534e");
  bodyGradient.addColorStop(0.77, "#2b665b");
  bodyGradient.addColorStop(1, "#173c3d");
  ctx.beginPath();
  ctx.moveTo(66, 0);
  ctx.bezierCurveTo(49, -23, 16, -30, -17, -25);
  ctx.bezierCurveTo(-41, -22, -56, -12, -63, 0);
  ctx.bezierCurveTo(-55, 13, -42, 23, -16, 26);
  ctx.bezierCurveTo(18, 31, 48, 22, 66, 0);
  ctx.fillStyle = bodyGradient;
  ctx.fill();
  ctx.strokeStyle = "rgba(164,225,187,.45)";
  ctx.lineWidth = 1;
  ctx.stroke();

  for (let ridge = 0; ridge < 9; ridge++) {
    const x = -49 + ridge * 11;
    const w = 12 + Math.sin(((ridge + 1) / 11) * Math.PI) * 11;
    ctx.beginPath();
    ctx.moveTo(x - 4, -w);
    ctx.quadraticCurveTo(x + 7, 0, x - 4, w);
    ctx.strokeStyle = `rgba(145,207,167,${0.12 + (ridge % 2) * 0.08})`;
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-59, 0);
  ctx.bezierCurveTo(-29, -6, 36, -6, 63, 0);
  ctx.strokeStyle = "rgba(180,237,187,.34)";
  ctx.lineWidth = 1.1;
  ctx.stroke();

  const heartbeat = Math.pow(
    Math.max(0, Math.sin(time * (recovering ? 5 : eating ? 7 : 2.8))),
    5,
  );
  const pulse = 1 + heartbeat * 0.13 + clamp(c.pulse, 0, 1) * 0.12;
  const glow = dormant ? 0.3 : eating || recovering ? 1 : 0.75;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  aura(ctx, 4, 0, 55 * pulse, `rgba(161,240,130,${0.29 * glow})`);
  aura(ctx, 4, 0, 29 * pulse, `rgba(195,248,146,${0.4 * glow})`);
  const core = ctx.createRadialGradient(7, -3, 1, 4, 0, 20 * pulse);
  core.addColorStop(0, `rgba(245,255,206,${glow})`);
  core.addColorStop(0.24, `rgba(216,252,155,${glow})`);
  core.addColorStop(0.58, `rgba(137,215,111,${glow * 0.8})`);
  core.addColorStop(1, "rgba(64,145,97,0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.ellipse(4, 0, 23 * pulse, 16 * pulse, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Irregular septa and an inner organ give the luminous core volume.
  for (let lobe = 0; lobe < 7; lobe++) {
    const a = (lobe / 7) * TAU;
    ctx.beginPath();
    ctx.moveTo(4 + Math.cos(a) * 4, Math.sin(a) * 3);
    ctx.quadraticCurveTo(
      4 + Math.cos(a + 0.3) * 10 * pulse,
      Math.sin(a + 0.3) * 8 * pulse,
      4 + Math.cos(a) * 18 * pulse,
      Math.sin(a) * 12 * pulse,
    );
    ctx.strokeStyle = "rgba(37,92,65,.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ellipse(ctx, 8, -2, 7 * pulse, 5 * pulse, `rgba(234,255,182,${glow * 0.75})`);

  // Paired sensory pores are small lateral organs, with no facial features.
  for (const side of [-1, 1]) {
    for (let pore = 0; pore < 4; pore++) {
      ellipse(
        ctx,
        37 - pore * 7,
        side * (13 + Math.sin(pore) * 2),
        1.4,
        0.9,
        `rgba(177,238,183,${0.6 * glow})`,
      );
    }
    ctx.beginPath();
    ctx.moveTo(56, side * 8);
    ctx.quadraticCurveTo(
      68,
      side * 12,
      73,
      side * 20 + Math.sin(time * frequency - 1) * 3,
    );
    ctx.strokeStyle = "rgba(116,192,158,.6)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function foodAndEffects(
  ctx: CanvasRenderingContext2D,
  world: World,
  time: number,
) {
  for (const food of world.food) {
    const active = food.source === "active";
    const color = active ? "236,188,112" : "116,195,160";
    const pulse = 0.7 + Math.sin(time * 2.4 + food.id) * 0.2;
    aura(ctx, food.x, food.y, 24, `rgba(${color},.16)`);
    ctx.strokeStyle = `rgba(${color},${pulse * 0.25})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(food.x, food.y, 13 + pulse * 2, 0, TAU);
    ctx.stroke();
    ctx.save();
    ctx.translate(food.x, food.y);
    ctx.rotate(time * 0.12 + food.id);
    ctx.fillStyle = `rgba(${color},.85)`;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const r = 3.5 + hash(i + food.id) * 1.8;
      if (!i) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ellipse(ctx, -1, -1.2, 1.3, 0.9, "rgba(255,244,200,.85)");
    ctx.restore();
    for (let i = 0; i < 3; i++) {
      const angle = time * 0.3 + (i * TAU) / 3 + food.id;
      ellipse(
        ctx,
        food.x + Math.cos(angle) * 8,
        food.y + Math.sin(angle) * 7,
        0.7,
        0.7,
        `rgba(${color},.5)`,
      );
    }
  }
  for (const effect of world.effects) {
    const duration = effect.kind === "rescue" ? 4 : 2.2;
    const progress = clamp(effect.age / duration, 0, 1);
    if (progress >= 1) continue;
    const color =
      effect.kind === "food" || effect.kind === "eat"
        ? "236,195,126"
        : effect.kind === "rescue"
          ? "179,209,255"
          : "128,227,188";
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.strokeStyle = `rgba(${color},.55)`;
    ctx.lineWidth = 0.7;
    for (let ring = 0; ring < 2; ring++) {
      ctx.beginPath();
      ctx.arc(
        effect.x,
        effect.y,
        7 + progress * (effect.kind === "rescue" ? 120 : 60) + ring * 7,
        0,
        TAU,
      );
      ctx.stroke();
    }
    if (
      effect.kind === "eat" ||
      effect.kind === "care" ||
      effect.kind === "rescue"
    ) {
      for (let spark = 0; spark < 12; spark++) {
        const angle = (spark / 12) * TAU + hash(spark) * 0.4;
        const radius = 10 + progress * (22 + hash(spark + 8) * 35);
        ellipse(
          ctx,
          effect.x + Math.cos(angle) * radius,
          effect.y + Math.sin(angle) * radius,
          1.3 * (1 - progress) + 0.3,
          1.3 * (1 - progress) + 0.3,
          `rgba(${color},.8)`,
        );
      }
    }
    ctx.restore();
  }
}

/** Render-only function. No simulation state, seed or clock is ever modified here. */
export function renderWorld(
  ctx: CanvasRenderingContext2D,
  world: World,
  width: number,
  height: number,
  options: RenderOptions = {},
) {
  if (width <= 0 || height <= 0) return;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#061015";
  ctx.fillRect(0, 0, width, height);
  const scale = Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT);
  ctx.translate(
    (width - WORLD_WIDTH * scale) / 2,
    (height - WORLD_HEIGHT * scale) / 2,
  );
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  ctx.clip();
  const visualTime = world.time;
  background(ctx, options.reducedMotion ? visualTime * 0.18 : visualTime);
  foodAndEffects(ctx, world, visualTime);

  const c = world.creature;
  const prev = options.previous?.creature ?? c;
  const alpha = clamp(options.alpha ?? 1, 0, 1);
  const x = prev.x + (c.x - prev.x) * alpha;
  const y = prev.y + (c.y - prev.y) * alpha;
  const angleDelta = Math.atan2(
    Math.sin(c.angle - prev.angle),
    Math.cos(c.angle - prev.angle),
  );
  const angle = prev.angle + angleDelta * alpha;

  ctx.save();
  ctx.translate(x + 15, 595);
  ctx.scale(1, 0.12);
  aura(ctx, 0, 0, 120, "rgba(1,7,9,.38)");
  ctx.restore();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  creatureBody(ctx, c, visualTime, options.reducedMotion ?? false);
  ctx.restore();

  // A proximity halo makes the pointer's relationship to the creature legible.
  const pointer = options.pointer;
  if (pointer && Math.hypot(pointer.x - c.x, pointer.y - c.y) < 160) {
    const opacity =
      (1 - Math.hypot(pointer.x - c.x, pointer.y - c.y) / 160) * 0.28;
    ctx.strokeStyle = `rgba(166,231,200,${opacity})`;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.arc(x, y, 58, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}
