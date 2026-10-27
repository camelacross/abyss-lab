import { useState, type PointerEvent, type ReactNode } from "react";
import { useVivarium } from "./components/useVivarium";
import { toWorldPoint } from "./runtime/coordinates";
import type { Behavior } from "./simulation/types";

const behavior: Record<Behavior, { label: string; detail: string }> = {
  exploring: {
    label: "自在探索",
    detail: "膜翼舒展，正在感知水流与周围环境。",
  },
  seeking: { label: "循味觅食", detail: "捕捉到营养微粒，正调整方向靠近。" },
  eating: { label: "正在进食", detail: "触须收拢，核心正在吸收营养。" },
  resting: { label: "缓缓休息", detail: "收起膜翼，以轻柔呼吸恢复能量。" },
  curious: { label: "好奇靠近", detail: "察觉到你的微光，正试探着靠近。" },
  dormant: {
    label: "保护性休眠",
    detail: "活动已降低。启动救援，或等待生态舱自动介入。",
  },
  recovering: {
    label: "休眠救援中",
    detail: "生态舱正在补充生命支持，核心逐渐复亮。",
  },
};
type Tool = "lure" | "feed" | "soothe";
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    feed: (
      <>
        <path d="m12 3 7 9-7 9-7-9Z" />
        <path d="M12 7v10M8 12h8" />
      </>
    ),
    lure: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" />
      </>
    ),
    soothe: (
      <>
        <path d="M3 13c3-8 5 8 9 0s6 8 9 0M3 7c3-8 5 8 9 0s6 8 9 0M3 19c3-8 5 8 9 0s6 8 9 0" />
      </>
    ),
    pause: (
      <>
        <path d="M8 5v14M16 5v14" />
      </>
    ),
    play: <path d="m8 4 12 8-12 8Z" />,
    heart: (
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.lure}
    </svg>
  );
}
function Meter({
  name,
  value,
  color,
  suffix,
}: {
  name: string;
  value: number;
  color: string;
  suffix: string;
}) {
  return (
    <div className="meter">
      <div className="meter-label">
        <span>{name}</span>
        <span className="meter-value">
          {Math.round(value)}
          <small> / 100</small>
        </span>
      </div>
      <div
        className="meter-track"
        role="meter"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
      >
        <div style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="meter-note">{suffix}</span>
    </div>
  );
}
const time = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;

export default function App() {
  const sim = useVivarium();
  const [tool, setTool] = useState<Tool>("lure");
  const c = sim.world.creature;
  const current = behavior[c.state];
  const actions: { id: Tool; label: string; detail: string }[] = [
    { id: "lure", label: "微光引导", detail: "点按水域，邀请它靠近" },
    { id: "feed", label: "投放营养", detail: "点按投喂，等待它主动摄食" },
    { id: "soothe", label: "轻柔安抚", detail: "在它附近点按，建立信任" },
  ];
  const selected = actions.find((x) => x.id === tool)!;
  const handlePointer = (
    event: PointerEvent<HTMLCanvasElement>,
    act: boolean,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = toWorldPoint(
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height,
    );
    sim.pointer.current = point;
    if (!act || !point || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    // Simulation events report the accepted outcome. Do not replace a rejected
    // (for example paused) action with an optimistic success message.
    sim.send({ type: tool, point });
  };
  const metricText =
    sim.metrics.status === "paused"
      ? "已暂停"
      : sim.metrics.status === "warming"
        ? "测量中"
        : sim.metrics.status === "slow"
          ? "推进延迟"
          : "运行正常";

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#" aria-label="Abyss Lab 深渊实验室">
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <path d="M20 5 37 26 24 21 20 35 16 21 3 26Z" />
            <path d="m8 24 12-8 12 8M20 16v11" />
          </svg>
          <span>
            ABYSS<span className="brand-light"> LAB</span>
            <small>深 渊 实 验 室</small>
          </span>
        </a>
        <div className="header-mid">
          <span className="header-marker">01</span> 活体观察舱{" "}
          <span className="header-slash">/</span> 异星生命研究
        </div>
        <div className="connection">
          <i />
          生态舱在线<span className="mono">SYS. 01</span>
        </div>
      </header>
      <main>
        <div className="page-intro">
          <div>
            <div className="eyebrow">
              <span /> XENOBIOLOGY · OBSERVATION 001
            </div>
            <h1>
              与未知生命，共处此刻<span>。</span>
            </h1>
            <p>在寂静的深渊，观察每一次呼吸，建立微小而真实的连接。</p>
          </div>
          <div className="session-label">
            <span>当前观察时长</span>
            <strong className="mono" data-testid="sim-time">
              {time(sim.world.time)}
            </strong>
            <small>SIMULATION TIME</small>
          </div>
        </div>
        <div className="lab-grid">
          <section className="observation-column" aria-label="生态箱与交互">
            <div className={`tank-frame tool-${tool}`}>
              <div className="tank-top">
                <span>
                  <i className="live-dot" />
                  {sim.paused || sim.hidden ? "观察已暂停" : "实时观测"}
                  <b>LIVE FEED</b>
                </span>
                <span className="tank-location mono">SECTOR 07 / ABYSS</span>
              </div>
              <canvas
                ref={sim.canvasRef}
                className="tank-canvas"
                aria-label={`异星生物弥光，${current.label}。${selected.detail}。也可使用下方按钮操作。`}
                onPointerDown={(e) => handlePointer(e, true)}
                onPointerMove={(e) => handlePointer(e, false)}
                onPointerLeave={() => {
                  sim.pointer.current = null;
                }}
                data-testid="vivarium"
                data-behavior={c.state}
                data-x={c.x.toFixed(2)}
                data-y={c.y.toFixed(2)}
                data-tick={sim.world.tick}
              />
              {sim.canvasError && (
                <div className="canvas-error" role="alert">
                  此浏览器无法启用 Canvas 2D，请使用支持 Canvas 的浏览器。
                </div>
              )}
              {(sim.paused || sim.hidden) && (
                <div className="pause-overlay">
                  <Icon name="pause" /> 生命的一个瞬间
                </div>
              )}
              <div className="tank-side mono">
                <span>0</span>
                <i />
                <span>50</span>
                <i />
                <span>100</span>
              </div>
              <div className="tank-bottom">
                <div className="specimen-tag">
                  <span className="tracking-corner" />
                  <div>
                    <strong>MIRA–01</strong>
                    <span>膜翼型 · 单体观测</span>
                  </div>
                </div>
                <div className="tank-scale">
                  <span />
                  <small className="mono">10 CM / REFERENCE</small>
                </div>
                <span className="tank-coordinates mono">
                  X {Math.round(c.x).toString().padStart(3, "0")}
                  <br />Y {Math.round(c.y).toString().padStart(3, "0")}
                </span>
              </div>
            </div>
            <div className="interaction-panel">
              <div className="tools">
                {actions.map((action) => (
                  <button
                    key={action.id}
                    className={`tool-button ${tool === action.id ? "selected" : ""}`}
                    aria-pressed={tool === action.id}
                    onClick={() => {
                      setTool(action.id);
                      sim.setNotice(action.detail);
                    }}
                  >
                    <Icon name={action.id} />
                    <span>
                      {action.label}
                      <small>
                        {action.id === "lure"
                          ? "GUIDE"
                          : action.id === "feed"
                            ? "NOURISH"
                            : "CONNECT"}
                      </small>
                    </span>
                    <span className="tool-key">
                      {action.id === "lure"
                        ? "01"
                        : action.id === "feed"
                          ? "02"
                          : "03"}
                    </span>
                  </button>
                ))}
              </div>
              <div className="interaction-hint">
                <span>
                  <i />
                  {selected.detail}
                </span>
                <button
                  className="text-button"
                  onClick={() =>
                    sim.send({
                      type: tool,
                      point:
                        tool === "lure"
                          ? { x: c.x < 500 ? 650 : 350, y: 300 }
                          : { x: c.x, y: c.y },
                    })
                  }
                >
                  在它身边
                  {tool === "feed"
                    ? "投喂"
                    : tool === "soothe"
                      ? "安抚"
                      : "引导"}
                  <Icon name="arrow" size={15} />
                </button>
              </div>
            </div>
            <div className="timeline-controls">
              <div className="playback">
                <button
                  className="pause-button"
                  aria-label={sim.paused ? "继续模拟" : "暂停模拟"}
                  onClick={sim.togglePause}
                >
                  <Icon name={sim.paused ? "play" : "pause"} size={15} />
                </button>
                <span>时间流速</span>
                <div className="speed-buttons">
                  {([1, 2, 4] as const).map((speed) => (
                    <button
                      key={speed}
                      aria-pressed={sim.speed === speed}
                      className={sim.speed === speed ? "active" : ""}
                      onClick={() => sim.setSpeed(speed)}
                    >
                      {speed}×
                    </button>
                  ))}
                </div>
              </div>
              <label className="passive-toggle">
                <input
                  type="checkbox"
                  checked={sim.world.environment.passiveFood}
                  onChange={(e) =>
                    sim.send({ type: "passive", enabled: e.target.checked })
                  }
                />
                <span className="switch" />
                基础供食<span className="auto-label">AUTO</span>
              </label>
            </div>
            <p className="feedback" role="status" aria-live="polite">
              {sim.paused
                ? sim.notice
                : sim.world.events.at(-1)?.text || sim.notice}
            </p>
            <details className="diagnostics">
              <summary>
                <span>
                  <span
                    className={`status-dot ${sim.metrics.status === "slow" ? "warn" : ""}`}
                  />
                  {metricText}{" "}
                  <span className="diagnostic-reading">
                    实测{" "}
                    {sim.metrics.actual === null
                      ? "—"
                      : sim.metrics.actual.toFixed(2)}
                    × / 目标 {sim.speed.toFixed(0)}×
                  </span>
                </span>
                <span>运行诊断 +</span>
              </summary>
              <div className="diagnostic-body">
                <span>
                  固定步长<strong>1 / 60 s</strong>
                </span>
                <span>
                  已执行步数<strong>{sim.metrics.steps}</strong>
                </span>
                <span>
                  渲染帧率<strong>{sim.metrics.fps.toFixed(0)} FPS</strong>
                </span>
                <span>
                  丢弃模拟时间
                  <strong>{sim.metrics.droppedSeconds.toFixed(2)} s</strong>
                </span>
                <p>
                  实测倍率 = 窗口内实际执行的模拟秒数 ÷
                  完整前台墙钟秒数。切换倍率后重新测量；后台自动暂停，不进行离线补算。
                  {sim.metrics.status === "slow" &&
                    " 当前推进低于目标，可能由掉帧或长时间阻塞引起。"}
                </p>
              </div>
            </details>
          </section>
          <aside className="specimen-panel" aria-label="生命状态">
            <section className="profile-section">
              <div className="section-label">
                生命档案<span className="mono">SPECIMEN 001</span>
              </div>
              <div className="specimen-name">
                <h2>
                  弥光<span>Mira</span>
                </h2>
                <span className="specimen-symbol">✧</span>
              </div>
              <p className="species">
                深渊膜翼体 <span>·</span> 未分类异星生命
              </p>
              <div
                className={`behavior-badge ${c.state === "dormant" ? "warning" : ""}`}
              >
                <i />
                {current.label}
                <span className="behavior-wave">∿∿∿</span>
              </div>
              <p className="behavior-description">{current.detail}</p>
            </section>
            <section className="vitals-section">
              <div className="section-label">
                生命体征
                <Icon name="heart" size={14} />
              </div>
              <Meter
                name="健康"
                value={c.health}
                color="#86d6ba"
                suffix={c.health > 60 ? "生命信号稳定" : "需要生命支持"}
              />
              <Meter
                name="能量"
                value={c.energy}
                color="#aebfe7"
                suffix={c.energy > 30 ? "维持自主活动" : "休息能够恢复"}
              />
              <Meter
                name="饱食"
                value={c.satiety}
                color="#d9b77d"
                suffix={c.satiety > 65 ? "营养储备充足" : "适合补充营养"}
              />
              <div className="trust-row">
                <span>与你的信任</span>
                <div
                  className="trust-dots"
                  aria-label={`信任 ${Math.round(c.trust)}`}
                >
                  {Array.from({ length: 5 }, (_, i) => (
                    <i
                      key={i}
                      className={c.trust >= (i + 1) * 20 ? "lit" : ""}
                    />
                  ))}
                </div>
                <span className="mono">{Math.round(c.trust)}%</span>
              </div>
            </section>
            <section className="events-section">
              <div className="section-label">
                观察记录
                <span className="record-count">
                  {String(sim.world.stats.eaten).padStart(2, "0")} 次摄食
                </span>
              </div>
              <ol className="event-list">
                {[...sim.world.events]
                  .reverse()
                  .slice(0, 4)
                  .map((event) => (
                    <li key={event.id} className={event.kind}>
                      <span className="event-time mono">
                        {time(event.time)}
                      </span>
                      <p>{event.text}</p>
                    </li>
                  ))}
              </ol>
            </section>
            <section className="care-note">
              <span className="note-mark">✳</span>
              <p>
                基础供食维持营养。
                <br />
                你的投喂与安抚，让它逐渐信任你。
              </p>
            </section>
            <button
              className="rescue-button"
              disabled={c.state !== "dormant" || sim.paused}
              onClick={() => sim.send({ type: "rescue" })}
            >
              {c.state === "recovering" ? "生命支持正在恢复" : "启动休眠救援"}
              <span>↗</span>
            </button>
            <p className="rescue-note">
              休眠时可手动救援，生态舱也会自动介入。
            </p>
          </aside>
        </div>
      </main>
      <footer>
        <span className="footer-brand">
          ABYSS LAB <span>/</span> 深渊实验室
        </span>
        <span>每一种生命，都值得被好奇地注视。</span>
        <span className="mono">P0 + P1 · v0.1.0</span>
      </footer>
    </div>
  );
}
