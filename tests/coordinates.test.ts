import { describe, expect, it } from "vitest";
import { toWorldPoint } from "../src/runtime/coordinates";

describe("Canvas pointer mapping", () => {
  it("maps CSS pixels to simulation coordinates at native and scaled sizes", () => {
    expect(toWorldPoint(500, 325, 1000, 650)).toEqual({ x: 500, y: 325 });
    expect(toWorldPoint(100, 80, 500, 325)).toEqual({ x: 200, y: 160 });
    expect(toWorldPoint(1600, 1040, 2000, 1300)).toEqual({ x: 800, y: 520 });
  });

  it("removes horizontal letterboxing and rejects clicks in side gutters", () => {
    // A 1000 × 325 canvas contains a 500 × 325 world, centered at x = 250.
    expect(toWorldPoint(250, 0, 1000, 325)).toEqual({ x: 0, y: 0 });
    expect(toWorldPoint(750, 325, 1000, 325)).toEqual({ x: 1000, y: 650 });
    expect(toWorldPoint(500, 162.5, 1000, 325)).toEqual({ x: 500, y: 325 });
    expect(toWorldPoint(249.9, 100, 1000, 325)).toBeNull();
    expect(toWorldPoint(750.1, 100, 1000, 325)).toBeNull();
  });

  it("removes vertical letterboxing for portrait touch layouts", () => {
    // A 500 × 650 canvas contains a 500 × 325 world, centered at y = 162.5.
    expect(toWorldPoint(0, 162.5, 500, 650)).toEqual({ x: 0, y: 0 });
    expect(toWorldPoint(500, 487.5, 500, 650)).toEqual({ x: 1000, y: 650 });
    expect(toWorldPoint(250, 325, 500, 650)).toEqual({ x: 500, y: 325 });
    expect(toWorldPoint(250, 162.4, 500, 650)).toBeNull();
    expect(toWorldPoint(250, 487.6, 500, 650)).toBeNull();
  });

  it("preserves target position at a fractional mobile layout size", () => {
    // Known points after fitting 1000 × 650 into a 390 × 600 CSS viewport.
    const point = toWorldPoint(312, 376.05, 390, 600);
    expect(point?.x).toBeCloseTo(800, 9);
    expect(point?.y).toBeCloseTo(520, 9);
    expect(toWorldPoint(195, 300, 390, 600)).toEqual({ x: 500, y: 325 });
    expect(toWorldPoint(195, 50, 390, 600)).toBeNull();
  });

  it("rejects collapsed canvases, non-finite inputs, and points beyond the world", () => {
    for (const [width, height] of [
      [0, 650],
      [1000, 0],
      [-1, 650],
      [1000, -1],
      [NaN, 650],
      [Infinity, 650],
    ]) {
      expect(toWorldPoint(0, 0, width, height)).toBeNull();
    }
    for (const [x, y] of [
      [NaN, 0],
      [0, Infinity],
      [-0.01, 100],
      [1000.01, 100],
      [100, 650.01],
    ]) {
      expect(toWorldPoint(x, y, 1000, 650)).toBeNull();
    }
  });
});
