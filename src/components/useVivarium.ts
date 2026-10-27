import { useCallback, useEffect, useRef, useState } from "react";
import { createWorld, stepWorld } from "../simulation/core";
import { FixedStepRunner } from "../runtime/fixedStep";
import { renderWorld } from "../rendering/renderer";
import type { Command, Point, World } from "../simulation/types";

export function useVivarium() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World>(createWorld());
  const previousRef = useRef<World>(worldRef.current);
  const runnerRef = useRef(new FixedStepRunner());
  const commands = useRef<Command[]>([]);
  const pointer = useRef<Point | null>(null);
  const pauseRef = useRef(false);
  const [world, setWorld] = useState(worldRef.current);
  const [metrics, setMetrics] = useState(runnerRef.current.metrics);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const [speed, setSpeedState] = useState<1 | 2 | 4>(1);
  const [notice, setNotice] = useState("微光已就绪。点按水域，邀请它靠近。");
  const [canvasError, setCanvasError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      setCanvasError(true);
      return;
    }
    let frame = 0;
    let lastUi = -Infinity;
    let width = 1;
    let height = 1;
    let dpr = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onVisibility = () => {
      setHidden(document.hidden);
      previousRef.current = worldRef.current;
      commands.current = [];
      runnerRef.current.setPaused(document.hidden || pauseRef.current);
      runnerRef.current.resetClock();
    };
    document.addEventListener("visibilitychange", onVisibility);
    runnerRef.current.resetClock();
    runnerRef.current.setPaused(document.hidden || pauseRef.current);
    const draw = (now: number) => {
      const runner = runnerRef.current;
      runner.advance(now, () => {
        previousRef.current = worldRef.current;
        const batch = commands.current.splice(0);
        worldRef.current = stepWorld(worldRef.current, batch);
      });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderWorld(ctx, worldRef.current, width, height, {
        previous: previousRef.current,
        alpha: runner.alpha,
        pointer: pointer.current,
        reducedMotion: reduced.matches,
      });
      if (now - lastUi >= 200) {
        setWorld(worldRef.current);
        setMetrics({ ...runner.metrics });
        lastUi = now;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      runnerRef.current.resetClock();
    };
  }, []);

  const send = useCallback((command: Command) => {
    if (pauseRef.current || document.hidden) {
      setNotice("模拟已暂停，继续观察后即可照护。");
      return;
    }
    // A bounded queue prevents bursts while waiting for the next fixed step.
    if (commands.current.length < 16) commands.current.push(command);
  }, []);
  const togglePause = useCallback(() => {
    pauseRef.current = !pauseRef.current;
    previousRef.current = worldRef.current;
    commands.current = [];
    runnerRef.current.setPaused(pauseRef.current || document.hidden);
    runnerRef.current.resetClock();
    setPaused(pauseRef.current);
    setNotice(
      pauseRef.current ? "时间已暂停。生命状态保持在这一刻。" : "观察已继续。",
    );
  }, []);
  const setSpeed = useCallback((value: 1 | 2 | 4) => {
    previousRef.current = worldRef.current;
    runnerRef.current.setSpeed(value);
    setSpeedState(value);
  }, []);
  return {
    canvasRef,
    world,
    metrics,
    paused,
    hidden,
    speed,
    notice,
    setNotice,
    canvasError,
    pointer,
    send,
    togglePause,
    setSpeed,
  };
}
