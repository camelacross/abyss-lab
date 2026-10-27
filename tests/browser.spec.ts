import { expect, test, type Page } from "@playwright/test";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function tick(page: Page): Promise<number> {
  return Number(await page.getByTestId("vivarium").getAttribute("data-tick"));
}

async function position(page: Page): Promise<{ x: number; y: number }> {
  const canvas = page.getByTestId("vivarium");
  return {
    x: Number(await canvas.getAttribute("data-x")),
    y: Number(await canvas.getAttribute("data-y")),
  };
}

async function canvasPoint(page: Page, point: { x: number; y: number }) {
  const canvas = page.getByTestId("vivarium");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Canvas has no visible bounds");
  const scale = Math.min(bounds.width / 1000, bounds.height / 650);
  return {
    x: bounds.x + (bounds.width - 1000 * scale) / 2 + point.x * scale,
    y: bounds.y + (bounds.height - 650 * scale) / 2 + point.y * scale,
  };
}

async function expectRenderedCanvas(page: Page) {
  const canvas = page.getByTestId("vivarium");
  await expect(canvas).toBeVisible();
  await expect.poll(() => tick(page)).toBeGreaterThan(1);
  const pixels = await canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext("2d");
    if (!context) throw new Error("Canvas 2D context unavailable");
    const data = context.getImageData(0, 0, element.width, element.height).data;
    const colors = new Set<number>();
    let opaque = 0;
    let bright = 0;
    for (let i = 0; i < data.length; i += 64) {
      if (data[i + 3] > 250) opaque++;
      if (Math.max(data[i], data[i + 1], data[i + 2]) > 110) bright++;
      colors.add(
        (data[i] >> 3) * 1024 + (data[i + 1] >> 3) * 32 + (data[i + 2] >> 3),
      );
    }
    return { opaque, bright, distinctColors: colors.size };
  });
  // Check actual pixel content, not merely an attached canvas element.
  expect(pixels.opaque).toBeGreaterThan(1000);
  expect(pixels.bright).toBeGreaterThan(20);
  expect(pixels.distinctColors).toBeGreaterThan(40);
}

test.describe("desktop browser integration", () => {
  test.use({ viewport: { width: 1440, height: 1100 } });

  test("renders, responds to care, advances at measured speed and pauses cleanly", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    await expect(page).toHaveTitle("Abyss Lab · 深渊实验室");
    await expectRenderedCanvas(page);
    await page.screenshot({
      path: "work/evidence/desktop.png",
      fullPage: true,
    });

    const canvas = page.getByTestId("vivarium");
    const satietyBefore = Number(
      await page
        .getByRole("meter", { name: "饱食" })
        .getAttribute("aria-valuenow"),
    );
    await page.getByRole("button", { name: /投放营养/ }).click();
    // The adjacent action also provides a keyboard-accessible alternative to pointing.
    await page.getByRole("button", { name: "在它身边投喂" }).focus();
    await page.keyboard.press("Enter");
    await expect(canvas).toHaveAttribute("data-behavior", "eating");
    await expect(page.locator(".event-list")).toContainText("浓缩营养已吸收");
    await expect
      .poll(async () =>
        Number(
          await page
            .getByRole("meter", { name: "饱食" })
            .getAttribute("aria-valuenow"),
        ),
      )
      .toBeGreaterThan(satietyBefore + 12);

    const trustBefore = Number(
      (await page.locator(".trust-dots").getAttribute("aria-label"))?.match(
        /\d+/,
      )?.[0],
    );
    await page.getByRole("button", { name: /轻柔安抚/ }).click();
    await page.getByRole("button", { name: "在它身边安抚" }).click();
    await expect(page.locator(".event-list")).toContainText("它回应了你的触碰");
    await expect
      .poll(async () =>
        Number(
          (await page.locator(".trust-dots").getAttribute("aria-label"))?.match(
            /\d+/,
          )?.[0],
        ),
      )
      .toBeGreaterThan(trustBefore + 5);
    await page.getByRole("button", { name: "在它身边安抚" }).click();
    await expect(page.locator(".event-list")).toContainText("让它感受这次接触");

    await page.getByRole("button", { name: /微光引导/ }).click();
    const before = await position(page);
    const cue = await canvasPoint(page, {
      x: before.x < 500 ? 750 : 250,
      y: 270,
    });
    const latestBeforeRightClick = await page
      .locator(".event-list li")
      .first()
      .innerText();
    await page.mouse.click(cue.x, cue.y, { button: "right" });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    expect(await page.locator(".event-list li").first().innerText()).toBe(
      latestBeforeRightClick,
    );
    await page.mouse.click(cue.x, cue.y);
    await expect(canvas).toHaveAttribute("data-behavior", "curious");
    await expect(page.locator(".event-list")).toContainText("它正转向你的指引");
    await expect
      .poll(async () => {
        const now = await position(page);
        return Math.hypot(now.x - before.x, now.y - before.y);
      })
      .toBeGreaterThan(10);

    await page.getByRole("button", { name: "暂停模拟" }).click();
    await expect(page.getByRole("button", { name: "继续模拟" })).toBeVisible();
    // Allow one throttled UI snapshot, then compare two genuinely elapsed moments.
    await page.waitForTimeout(300);
    const pausedTick = await tick(page);
    const pausedCue = await canvasPoint(page, { x: 500, y: 325 });
    await page.mouse.click(pausedCue.x, pausedCue.y);
    await expect(page.getByRole("status")).toContainText("暂停");
    await expect(page.getByRole("status")).not.toContainText("已发出");
    await page.waitForTimeout(550);
    expect(await tick(page)).toBe(pausedTick);
    await page.getByRole("button", { name: "继续模拟" }).click();
    await expect.poll(() => tick(page)).toBeGreaterThan(pausedTick + 10);

    await page.getByRole("button", { name: "4×", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "4×", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".diagnostics summary")).toContainText("目标 4×");
    const speedChangeTick = await tick(page);
    await expect.poll(() => tick(page)).toBeGreaterThan(speedChangeTick + 2);
    // Sample inside the browser so driver polling does not dominate timing.
    // Real cloud throughput may be below the target; the clock must report it.
    const samples = await page.evaluate(async () => {
      const result: {
        wall: number;
        tick: number;
        actual: number;
        status: string;
        dropped: number;
      }[] = [];
      for (let index = 0; index < 40; index++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const reading =
          document.querySelector(".diagnostic-reading")?.textContent || "";
        const drop = [
          ...document.querySelectorAll(".diagnostic-body > span"),
        ].find((element) => element.textContent?.includes("丢弃模拟时间"));
        result.push({
          wall: performance.now(),
          tick: Number(
            document.querySelector("canvas")?.getAttribute("data-tick"),
          ),
          actual: Number(reading.match(/实测\s+([\d.]+)×/)?.[1]),
          status:
            document.querySelector(".diagnostics summary")?.textContent || "",
          dropped: Number.parseFloat(
            drop?.querySelector("strong")?.textContent || "0",
          ),
        });
      }
      return result;
    });
    const last = samples[samples.length - 1];
    const windowStart =
      [...samples]
        .reverse()
        .find((sample) => sample.wall <= last.wall - 2000) || samples[0];
    const observed =
      (last.tick - windowStart.tick) /
      60 /
      ((last.wall - windowStart.wall) / 1000);
    expect(last.actual).toBeGreaterThan(0);
    expect(last.actual).toBeLessThanOrEqual(4.2);
    expect(observed).toBeGreaterThan(0);
    expect(observed).toBeLessThanOrEqual(4.5);
    // Both DOM fields update at 5 Hz. Allow boundary quantization at each end
    // of the independently sampled ~2-second wall-clock interval.
    expect(Math.abs(last.actual - observed)).toBeLessThan(0.75);
    for (const sample of samples.filter(
      (sample) => !sample.status.includes("测量中"),
    )) {
      expect(Number.isFinite(sample.actual)).toBe(true);
      if (sample.actual < 3.6) expect(sample.status).toContain("推进延迟");
    }
    test.info().annotations.push({
      type: "measurement",
      description: `Target 4×; displayed ${last.actual.toFixed(2)}×; independent tick/wall ${observed.toFixed(2)}×; dropped ${last.dropped.toFixed(2)} simulated s; ${last.status}`,
    });
    await test
      .info()
      .attach("actual-speed-samples", {
        body: JSON.stringify(samples, null, 2),
        contentType: "application/json",
      });

    // A real 400 ms main-thread stall must expose dropped time and a warning.
    // This uses neither a fake clock nor injected product simulation state.
    const overload = await page.evaluate(async () => {
      const read = () => {
        const drop = [
          ...document.querySelectorAll(".diagnostic-body > span"),
        ].find((element) => element.textContent?.includes("丢弃模拟时间"));
        return {
          dropped: Number.parseFloat(
            drop?.querySelector("strong")?.textContent || "0",
          ),
          status:
            document.querySelector(".diagnostics summary")?.textContent || "",
        };
      };
      const before = read().dropped;
      const until = performance.now() + 400;
      while (performance.now() < until) {
        /* Deliberate overload for this regression. */
      }
      for (let index = 0; index < 10; index++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const after = read();
        if (after.dropped > before && after.status.includes("推进延迟"))
          return { before, ...after };
      }
      return { before, ...read() };
    });
    expect(overload.dropped).toBeGreaterThan(overload.before);
    expect(overload.status).toContain("推进延迟");
    test
      .info()
      .annotations.push({
        type: "overload",
        description: JSON.stringify(overload),
      });

    const passive = page.getByRole("checkbox", { name: /基础供食/ });
    // The visible custom switch is a wrapping label; exercise the user-facing hit target.
    await page.locator(".passive-toggle").click();
    await expect(passive).not.toBeChecked();
    await expect(page.locator(".event-list")).toContainText("被动供食已暂停");
    await page.locator(".passive-toggle").click();
    await expect(passive).toBeChecked();
    expect(errors).toEqual([]);
  });
});

test.describe("mobile viewport and touch emulation", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });

  test("fits a narrow viewport and maps real touch pointer input into the world", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    await expectRenderedCanvas(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    const canvas = page.getByTestId("vivarium");
    await canvas.evaluate((element) => {
      element.addEventListener(
        "pointerdown",
        (event) => {
          element.setAttribute(
            "data-observed-pointer",
            (event as PointerEvent).pointerType,
          );
        },
        { once: true },
      );
    });
    await page.getByRole("button", { name: /投放营养/ }).tap();
    const creature = await position(page);
    const point = await canvasPoint(page, creature);
    await page.touchscreen.tap(point.x, point.y);
    await expect(canvas).toHaveAttribute("data-observed-pointer", "touch");
    await expect(canvas).toHaveAttribute("data-behavior", "eating");
    await expect(page.locator(".event-list")).toContainText("浓缩营养已吸收");
    await page.screenshot({
      path: "work/evidence/mobile-emulation.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
});
