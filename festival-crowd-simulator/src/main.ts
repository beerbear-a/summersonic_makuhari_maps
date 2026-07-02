/**
 * エントリーポイント。
 * PixiJS アプリの初期化（ドット絵設定）、シミュレーションと
 * レンダラーの接続、UI の更新を行う。
 */

import { Application, TextureSource } from 'pixi.js';
import { Simulation, formatTime } from './simulation/Simulation';
import { Renderer } from './rendering/Renderer';
import { HeatmapRenderer } from './rendering/HeatmapRenderer';
import { WORLD_WIDTH, WORLD_HEIGHT } from './data/venues';
import './style.css';

const AGENT_COUNT = 800;
const MAX_LOG_ITEMS = 60;

async function boot(): Promise<void> {
  // ドット絵: 拡大縮小してもにじまないように nearest 補間にする
  TextureSource.defaultOptions.scaleMode = 'nearest';

  const app = new Application();
  await app.init({
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    background: 0x0d1b2e,
    antialias: false,
    roundPixels: true,
    resolution: 1,
  });
  document.getElementById('stage-wrap')!.appendChild(app.canvas);

  const sim = new Simulation(AGENT_COUNT);
  const heatmap = new HeatmapRenderer(sim.grid);
  const renderer = new Renderer(app, sim, heatmap);

  // ---------------- UI 要素 ----------------
  const $ = (id: string) => document.getElementById(id)!;
  const clockEl = $('clock');
  const btnPlay = $('btn-play') as HTMLButtonElement;
  const speedButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.btn-speed'),
  );
  const statTotal = $('stat-total');
  const statInside = $('stat-inside');
  const statCongestion = $('stat-congestion');
  const statSafety = $('stat-safety');
  const statSatisfaction = $('stat-satisfaction');
  const barCongestion = $('bar-congestion');
  const barSafety = $('bar-safety');
  const barSatisfaction = $('bar-satisfaction');
  const nowPlayingList = $('now-playing-list');
  const logList = $('log-list');

  btnPlay.addEventListener('click', () => {
    sim.running = !sim.running;
    btnPlay.textContent = sim.running ? '⏸ 一時停止' : '▶ 再生';
    btnPlay.classList.toggle('paused', !sim.running);
  });

  for (const btn of speedButtons) {
    btn.addEventListener('click', () => {
      sim.speedMultiplier = Number(btn.dataset.speed);
      speedButtons.forEach((b) => b.classList.toggle('active', b === btn));
    });
  }

  statTotal.textContent = `${AGENT_COUNT} 人`;

  // ---------------- UI 更新 ----------------
  let uiAccumulator = 0;

  function updatePanel(dtSeconds: number): void {
    // ログは即時反映（取りこぼし防止）
    for (const entry of sim.consumeNewLogs()) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="log-time">${formatTime(entry.time)}</span> ${escapeHtml(entry.message)}`;
      logList.prepend(li);
    }
    while (logList.children.length > MAX_LOG_ITEMS) {
      logList.removeChild(logList.lastChild!);
    }

    // 数値表示は 0.2 秒間隔で十分
    uiAccumulator += dtSeconds;
    if (uiAccumulator < 0.2) return;
    uiAccumulator = 0;

    clockEl.textContent = formatTime(sim.time);
    statInside.textContent = `${sim.insideCount} 人（退場 ${sim.leftCount} 人）`;

    const { congestion, safety, satisfaction } = sim.metrics;
    statCongestion.textContent = `${Math.round(congestion)}`;
    statSafety.textContent = `${Math.round(safety)}`;
    statSatisfaction.textContent = `${Math.round(satisfaction)}`;
    (barCongestion as HTMLElement).style.width = `${congestion}%`;
    (barSafety as HTMLElement).style.width = `${safety}%`;
    (barSatisfaction as HTMLElement).style.width = `${satisfaction}%`;

    // NOW PLAYING
    const current = sim.currentActs;
    if (current.length === 0) {
      nowPlayingList.innerHTML = '<li class="idle">（転換中）</li>';
    } else {
      nowPlayingList.innerHTML = current
        .map(
          (act) =>
            `<li><span class="live-dot"></span>${escapeHtml(act.artist)}<span class="np-stage">${stageShortName(act.stageId)} 〜${formatTime(act.end)}</span></li>`,
        )
        .join('');
    }
  }

  // ---------------- メインループ ----------------
  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000;
    sim.update(dt);
    heatmap.update(dt);
    renderer.update(dt);
    updatePanel(dt);
  });
}

function stageShortName(stageId: string): string {
  return stageId.replace('_stage', '').toUpperCase();
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

boot();
