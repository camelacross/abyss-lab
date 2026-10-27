import { WORLD_HEIGHT, WORLD_WIDTH, type Point } from "../simulation/types";

/** Canvas fit-contain inverse; letterbox clicks are intentionally ignored. */
export function toWorldPoint(
  x: number,
  y: number,
  width: number,
  height: number,
): Point | null {
  if (width <= 0 || height <= 0) return null;
  const scale = Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT);
  const point = {
    x: (x - (width - WORLD_WIDTH * scale) / 2) / scale,
    y: (y - (height - WORLD_HEIGHT * scale) / 2) / scale,
  };
  return point.x >= 0 &&
    point.x <= WORLD_WIDTH &&
    point.y >= 0 &&
    point.y <= WORLD_HEIGHT
    ? point
    : null;
}
