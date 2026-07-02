/**
 * エントリーポイント。
 * PixiJS アプリの初期化（ドット絵設定）、シミュレーションと
 * レンダラーの接続、UI の更新を行う。
 */

import { Application, TextureSource } from 'pixi.js';
import { Simulation, formatTime } from './simulation/Simulation';
import { Renderer } from './rendering/Renderer';
import { HeatmapRenderer } from './rendering/HeatmapRenderer';
import { Player } from './game/Player';
import { agentDialogue, facilityDialogue } from './game/Dialogue';
import { ACHIEVEMENTS, computeScore } from './game/Achievements';
import { SoundFx } from './game/Sound';
import { facilities, WORLD_WIDTH, WORLD_HEIGHT } from './data/venues';
import type { Facility } from './data/venues';
import type { Agent } from './simulation/Agent';
import type { Act } from './data/timetable';
import './style.css';

type TalkTarget =
  | { kind: 'agent'; agent: Agent }
  | { kind: 'facility'; facility: Facility };

const AGENT_COUNT = 800;
const MAX_LOG_ITEMS = 60;
/** 画面に表示するビューポートのサイズ（ワールドはこの4倍の広さ） */
const VIEW_WIDTH = 672;
const VIEW_HEIGHT = 1120;
/** 全体マップ（俯瞰モード）のズーム: ワールド全体がちょうど収まる */
const OVERVIEW_ZOOM = VIEW_WIDTH / WORLD_WIDTH; // 0.25
/** 歩くモード（詳細マップ）のズーム倍率（整数だとドットが崩れない） */
const WALK_ZOOM_DEFAULT = 2;
const WALK_ZOOM_MIN = 1;
const WALK_ZOOM_MAX = 4;

async function boot(): Promise<void> {
  // ドット絵: 拡大縮小してもにじまないように nearest 補間にする
  TextureSource.defaultOptions.scaleMode = 'nearest';

  const app = new Application();
  await app.init({
    width: VIEW_WIDTH,
    height: VIEW_HEIGHT,
    background: 0x0d1b2e,
    antialias: false,
    roundPixels: true,
    resolution: 1,
  });
  document.getElementById('stage-wrap')!.appendChild(app.canvas);

  const sim = new Simulation(AGENT_COUNT);
  const heatmap = new HeatmapRenderer(sim.grid);
  const renderer = new Renderer(app, sim, heatmap);
  // プレイヤーは海浜幕張駅前からスタート
  const player = new Player(1072, 4176); // 海浜幕張駅前
  const sfx = new SoundFx();
  const unlockedAchievements = new Set<string>();

  // ---------------- 歩くモード（ポケモン風）とキー入力 ----------------
  let walkMode = false;
  let walkZoom = WALK_ZOOM_DEFAULT;
  let talkTarget: TalkTarget | null = null;
  const pressed = new Set<string>();
  const MOVE_KEYS = new Set([
    'w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
  ]);
  const TALK_KEYS = new Set([' ', 'z', 'enter']);
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (MOVE_KEYS.has(key)) {
      pressed.add(key);
      e.preventDefault(); // 矢印キーでページがスクロールしないように
    }
    if (key === 'shift') pressed.add('shift');
    if (walkMode && TALK_KEYS.has(key)) {
      e.preventDefault();
      handleTalkKey();
    }
    // Q / E で歩くモードのズーム調整
    if (walkMode && key === 'q') {
      walkZoom = Math.max(WALK_ZOOM_MIN, walkZoom - 1);
    }
    if (walkMode && key === 'e') {
      walkZoom = Math.min(WALK_ZOOM_MAX, walkZoom + 1);
    }
  });
  window.addEventListener('keyup', (e) => {
    pressed.delete(e.key.toLowerCase());
  });
  window.addEventListener('blur', () => pressed.clear());

  /** プレイヤーの近くにいる話しかけ可能な相手を探す */
  function findTalkTarget(): TalkTarget | null {
    if (!walkMode) return null;
    // まず観客（半径104px ≒ 2〜3歩分）
    let bestAgent: Agent | null = null;
    let bestDist = 104 * 104;
    for (const a of sim.agents) {
      if (!a.active || a.left) continue;
      const d = (a.x - player.x) ** 2 + (a.y - player.y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestAgent = a;
      }
    }
    if (bestAgent) return { kind: 'agent', agent: bestAgent };
    // 次に施設の看板（半径176px）
    let bestFacility: Facility | null = null;
    let bestFDist = 176 * 176;
    for (const f of facilities) {
      const d = (f.x - player.x) ** 2 + (f.y - player.y) ** 2;
      if (d < bestFDist) {
        bestFDist = d;
        bestFacility = f;
      }
    }
    return bestFacility ? { kind: 'facility', facility: bestFacility } : null;
  }

  /** ライブ鑑賞判定: 客席エリア付近にいて、かつ演奏中のステージを返す */
  const WATCH_RADIUS = 260;
  function findWatchingAct(): { stage: Facility; act: Act } | null {
    if (!walkMode) return null;
    for (const f of facilities) {
      if (f.type !== 'stage') continue;
      const ax = f.audienceX ?? f.x;
      const ay = f.audienceY ?? f.y;
      if (Math.hypot(player.x - ax, player.y - ay) > WATCH_RADIUS) continue;
      const act = sim.timetable.currentActOnStage(f.id, sim.time);
      if (act) return { stage: f, act };
    }
    return null;
  }

  // ---------------- 会話ウィンドウ（ポケモン風） ----------------
  const dialogueEl = document.getElementById('dialogue')!;
  const dialogueName = document.getElementById('dialogue-name')!;
  const dialogueText = document.getElementById('dialogue-text')!;
  let dialogueOpen = false;
  let typing = false;
  let fullText = '';
  let typeTimer: number | undefined;
  /** 実時間の経過秒（話しかけ連打防止のクールダウン用） */
  let clock = 0;
  let talkLockUntil = 0;
  const myFesList = document.getElementById('my-fes-list')!;
  const attendedLog: string[] = [];
  myFesList.innerHTML = '<li class="empty">まだライブに参加していません</li>';

  function showDialogue(name: string, text: string): void {
    dialogueOpen = true;
    typing = true;
    fullText = text;
    dialogueName.textContent = name;
    dialogueText.textContent = '';
    dialogueEl.style.display = 'block';
    let i = 0;
    window.clearInterval(typeTimer);
    typeTimer = window.setInterval(() => {
      i++;
      dialogueText.textContent = fullText.slice(0, i);
      if (i >= fullText.length) {
        window.clearInterval(typeTimer);
        typing = false;
      }
    }, 24);
  }

  function closeDialogue(): void {
    dialogueOpen = false;
    typing = false;
    window.clearInterval(typeTimer);
    dialogueEl.style.display = 'none';
  }

  /** 決定キー: セリフ送り（表示中→全文表示→閉じる／相手がいれば話しかける） */
  function handleTalkKey(): void {
    if (dialogueOpen) {
      sfx.blip();
      if (typing) {
        window.clearInterval(typeTimer);
        dialogueText.textContent = fullText;
        typing = false;
      } else {
        closeDialogue();
      }
      return;
    }
    if (!talkTarget || clock < talkLockUntil) return;
    talkLockUntil = clock + 0.6; // キーリピートでの連続行動を防ぐ
    if (talkTarget.kind === 'agent') {
      sfx.blip();
      const line = agentDialogue(talkTarget.agent, sim);
      showDialogue(line.name, line.text);
    } else {
      const before =
        player.mealsEaten + player.toiletVisits + player.goodsBought;
      const line = facilityDialogue(talkTarget.facility, sim, player);
      const after =
        player.mealsEaten + player.toiletVisits + player.goodsBought;
      sfx[after > before ? 'action' : 'blip']();
      showDialogue(line.name, line.text);
    }
  }

  // ---------------- 実績トースト ----------------
  const toastArea = document.getElementById('achievement-toasts')!;
  function showAchievementToast(icon: string, title: string, desc: string): void {
    const el = document.createElement('div');
    el.className = 'achievement-toast';
    el.innerHTML = `<span class="ac-icon">${icon}</span><span><span class="ac-title">実績解除</span>${escapeHtml(title)} — ${escapeHtml(desc)}</span>`;
    toastArea.appendChild(el);
    window.setTimeout(() => el.remove(), 3600);
  }

  function checkAchievements(): void {
    for (const a of ACHIEVEMENTS) {
      if (unlockedAchievements.has(a.id)) continue;
      if (a.condition(player)) {
        unlockedAchievements.add(a.id);
        showAchievementToast(a.icon, a.title, a.desc);
        sfx.achievement();
      }
    }
  }

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
  const btnMode = $('btn-mode') as HTMLButtonElement;
  const modeHint = $('mode-hint');
  const stageWrap = $('stage-wrap');
  const playerHud = $('player-hud');
  const myFesSection = $('my-fes');
  const phudHunger = $('phud-hunger');
  const phudToilet = $('phud-toilet');
  const phudFatigue = $('phud-fatigue');
  const phudHype = $('phud-hype');
  const myMeals = $('my-meals');
  const myToilet = $('my-toilet');
  const myGoods = $('my-goods');
  const myWatched = $('my-watched');
  const myAchievements = $('my-achievements');
  const phudScore = $('phud-score');
  const btnMute = $('btn-mute') as HTMLButtonElement;
  const resultScreen = $('result-screen');
  const btnReplay = $('btn-replay') as HTMLButtonElement;
  let resultShown = false;

  btnMode.addEventListener('click', () => {
    walkMode = !walkMode;
    sfx.toggleMode();
    btnMode.textContent = walkMode ? '🗺 俯瞰モード' : '🎮 歩くモード';
    btnMode.classList.toggle('active', walkMode);
    modeHint.style.display = walkMode ? 'block' : 'none';
    playerHud.style.display = walkMode ? 'flex' : 'none';
    myFesSection.style.display = walkMode ? 'block' : 'none';
    if (!walkMode) {
      closeDialogue();
      stageWrap.classList.remove('live-watching');
    }
    btnMode.blur(); // ボタンにフォーカスが残ってスペース等が誤爆しないように
  });

  btnMute.addEventListener('click', () => {
    sfx.muted = !sfx.muted;
    btnMute.textContent = sfx.muted ? '🔇' : '🔊';
    btnMute.classList.toggle('active', sfx.muted);
    if (!sfx.muted) sfx.blip();
    btnMute.blur();
  });

  btnReplay.addEventListener('click', () => {
    window.location.reload();
  });

  /** 会場満足度とプレイヤーの体験を合わせてランクを算出する */
  function computeRank(): { rank: string; combined: number; score: number } {
    const score = computeScore(player);
    const played =
      player.mealsEaten + player.toiletVisits + player.goodsBought + player.attendedActs.size > 0;
    const playerScore = clampNum(
      player.hype * 0.5 + player.attendedActs.size * 8 + player.mealsEaten * 3 + player.goodsBought * 4,
      0,
      100,
    );
    const combined = played
      ? sim.metrics.satisfaction * 0.4 + playerScore * 0.6
      : sim.metrics.satisfaction;
    let rank = 'D';
    if (combined >= 88) rank = 'S';
    else if (combined >= 75) rank = 'A';
    else if (combined >= 60) rank = 'B';
    else if (combined >= 40) rank = 'C';
    return { rank, combined, score };
  }

  function showResultScreen(): void {
    const { rank, score } = computeRank();
    ($('result-rank') as HTMLElement).textContent = rank;
    ($('result-satisfaction') as HTMLElement).textContent = `${Math.round(sim.metrics.satisfaction)}`;
    ($('result-score') as HTMLElement).textContent = `${score}`;
    ($('result-watched') as HTMLElement).textContent = `${player.attendedActs.size}`;
    ($('result-meals') as HTMLElement).textContent = `${player.mealsEaten}`;
    ($('result-goods') as HTMLElement).textContent = `${player.goodsBought}`;
    ($('result-achievements') as HTMLElement).textContent = `${unlockedAchievements.size} / ${ACHIEVEMENTS.length}`;
    resultScreen.style.display = 'flex';
    sfx.achievement();
  }

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

    // プレイヤー自身の状態（歩くモード中のみ意味を持つが、常に最新化しておく）
    (phudHunger as HTMLElement).style.width = `${player.hunger}%`;
    (phudToilet as HTMLElement).style.width = `${player.toilet}%`;
    (phudFatigue as HTMLElement).style.width = `${player.fatigue}%`;
    (phudHype as HTMLElement).style.width = `${player.hype}%`;
    myMeals.textContent = `${player.mealsEaten}`;
    myToilet.textContent = `${player.toiletVisits}`;
    myGoods.textContent = `${player.goodsBought}`;
    myWatched.textContent = `${player.attendedActs.size}`;
    myAchievements.textContent = `${unlockedAchievements.size}`;
    phudScore.textContent = `SCORE ${computeScore(player)}`;
  }

  // ---------------- カメラ ----------------
  function updateCamera(dtSeconds: number): void {
    const world = renderer.world;
    const targetScale = walkMode ? walkZoom : OVERVIEW_ZOOM;
    // ズームとスクロールをなめらかに補間
    const k = Math.min(1, dtSeconds * 8);
    const scale = world.scale.x + (targetScale - world.scale.x) * k;
    world.scale.set(Math.abs(scale - targetScale) < 0.005 ? targetScale : scale);

    let tx = 0;
    let ty = 0;
    if (walkMode) {
      const s = world.scale.x;
      tx = clampNum(VIEW_WIDTH / 2 - player.x * s, VIEW_WIDTH - WORLD_WIDTH * s, 0);
      ty = clampNum(VIEW_HEIGHT / 2 - player.y * s, VIEW_HEIGHT - WORLD_HEIGHT * s, 0);
    }
    world.position.set(
      world.position.x + (tx - world.position.x) * k,
      world.position.y + (ty - world.position.y) * k,
    );
  }

  // ---------------- メインループ ----------------
  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000;
    clock += dt;
    sim.update(dt);
    if (walkMode && !dialogueOpen) {
      player.update(
        dt,
        {
          up: pressed.has('w') || pressed.has('arrowup'),
          down: pressed.has('s') || pressed.has('arrowdown'),
          left: pressed.has('a') || pressed.has('arrowleft'),
          right: pressed.has('d') || pressed.has('arrowright'),
          run: pressed.has('shift'),
        },
        sim.map,
        sim.grid,
      );
    } else {
      player.moving = false;
    }
    // 話しかけ可能な相手（吹き出し表示 & 決定キーの対象）
    talkTarget = dialogueOpen ? talkTarget : findTalkTarget();
    const bubblePos = !dialogueOpen && talkTarget
      ? talkTarget.kind === 'agent'
        ? { x: talkTarget.agent.x, y: talkTarget.agent.y - 36 }
        : { x: talkTarget.facility.x, y: talkTarget.facility.y - 16 }
      : null;

    // ライブ鑑賞判定: 客席にいる間 hype が上がり、8秒観ると「参加」記録される
    const watching = findWatchingAct();
    stageWrap.classList.toggle('live-watching', watching !== null);
    if (watching) {
      const justAttended = player.watchTick(dt, watching.act.id, watching.act.popularity);
      if (justAttended) {
        attendedLog.unshift(
          `${formatTime(sim.time)} ${watching.act.artist}（${watching.stage.name}）を最前で体験！`,
        );
        attendedLog.length = Math.min(attendedLog.length, 20);
        myFesList.innerHTML = attendedLog
          .map((line) => `<li>${escapeHtml(line)}</li>`)
          .join('');
      }
    }

    updateCamera(dt);
    // 人気アクトを間近で観ている間は、画面が軽くシェイクして臨場感を出す
    if (watching) {
      const shake = (watching.act.popularity / 100) * 2.5;
      renderer.world.position.x += (Math.random() - 0.5) * shake;
      renderer.world.position.y += (Math.random() - 0.5) * shake;
    }
    heatmap.update(dt);
    renderer.update(dt, player, bubblePos);
    updatePanel(dt);
    checkAchievements();

    if (sim.dayEnded && !resultShown) {
      resultShown = true;
      showResultScreen();
    }
  });
}

function stageShortName(stageId: string): string {
  return stageId.replace('_stage', '').toUpperCase();
}

function clampNum(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

boot();
