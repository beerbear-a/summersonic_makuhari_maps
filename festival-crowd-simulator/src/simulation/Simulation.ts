/**
 * シミュレーション本体。
 * - シミュレーション時計（分）の進行
 * - 全エージェントの更新
 * - 混雑グリッドの再計算
 * - 混雑度 / 安全度 / 満足度メトリクスの算出
 * - イベントログの生成（観客集中・終演混雑・トイレ待機列など）
 */

import { Agent } from './Agent';
import type { AgentContext } from './Agent';
import { CrowdGrid } from './CrowdGrid';
import { Timetable, formatTime } from './Timetable';
import { facilityById, getFacility, WORLD_WIDTH, WORLD_HEIGHT } from '../data/venues';
import { acts, DAY_START, DAY_END } from '../data/timetable';
import type { Act } from '../data/timetable';

/** 1x 再生時に実時間1秒で進むシミュレーション分 */
const BASE_MINUTES_PER_SECOND = 2;

export interface LogEntry {
  time: number;
  message: string;
}

export interface Metrics {
  congestion: number; // 0-100（高いほど混雑）
  safety: number; // 0-100（高いほど安全）
  satisfaction: number; // 0-100
}

export class Simulation {
  readonly grid = new CrowdGrid(WORLD_WIDTH, WORLD_HEIGHT, 40);
  readonly timetable = new Timetable(acts);
  readonly agents: Agent[] = [];

  /** 現在時刻（分） */
  time = DAY_START;
  running = true;
  speedMultiplier = 1;

  metrics: Metrics = { congestion: 0, safety: 100, satisfaction: 60 };
  readonly logs: LogEntry[] = [];
  /** UI がまだ表示していないログの開始インデックス */
  private logCursor = 0;

  private prevTime = DAY_START;
  private eventCheckAccumulator = 0;
  /** イベントキー -> 最後に発火した時刻（連発防止） */
  private eventCooldowns = new Map<string, number>();
  private closedLogged = false;

  constructor(agentCount = 700) {
    for (let i = 0; i < agentCount; i++) {
      // 開場から30分かけてパラパラと入場してくる
      const spawnTime = DAY_START + Math.random() * 30;
      this.agents.push(new Agent(i, spawnTime, acts));
    }
    this.pushLog(`開場しました（観客 ${agentCount} 人が来場予定）`);
  }

  /** 会場内にいる観客数 */
  get insideCount(): number {
    let n = 0;
    for (const a of this.agents) if (a.active && !a.left) n++;
    return n;
  }

  get leftCount(): number {
    let n = 0;
    for (const a of this.agents) if (a.left) n++;
    return n;
  }

  get currentActs(): Act[] {
    return this.timetable.actsAt(this.time);
  }

  /** メインループから毎フレーム呼ぶ。dtRealSeconds は実時間の経過秒 */
  update(dtRealSeconds: number): void {
    if (!this.running) return;

    // タブ復帰時などの巨大 dt で吹き飛ばないように上限を設ける
    const dtMin = Math.min(
      dtRealSeconds * BASE_MINUTES_PER_SECOND * this.speedMultiplier,
      3,
    );
    this.prevTime = this.time;
    this.time += dtMin;

    // 混雑グリッドを再計算
    this.grid.clear();
    for (const a of this.agents) {
      if (a.active && !a.left) this.grid.add(a.x, a.y);
    }

    const ctx: AgentContext = {
      time: this.time,
      grid: this.grid,
      facilities: facilityById,
      timetable: this.timetable,
    };
    for (const a of this.agents) a.update(dtMin, ctx);

    this.updateMetrics();

    this.eventCheckAccumulator += dtMin;
    if (this.eventCheckAccumulator >= 1.5) {
      this.eventCheckAccumulator = 0;
      this.checkEvents();
    }
    this.checkActTransitions();

    // 全員退場したら終了
    if (
      this.time >= DAY_END &&
      this.insideCount === 0 &&
      !this.closedLogged
    ) {
      this.closedLogged = true;
      this.pushLog('全ての観客が退場しました。本日の営業は終了です 🎉');
      this.running = false;
    }
  }

  // ------------------------------------------------------------------
  // メトリクス
  // ------------------------------------------------------------------

  private updateMetrics(): void {
    let crowdedCells = 0;
    let dangerCells = 0;
    for (const c of this.grid.counts) {
      if (c >= 30) dangerCells++;
      else if (c >= 15) crowdedCells++;
    }
    const congestion = Math.min(100, crowdedCells * 3 + dangerCells * 10);
    const safety = Math.max(0, 100 - (crowdedCells * 2 + dangerCells * 8));

    let satTotal = 0;
    let satCount = 0;
    for (const a of this.agents) {
      if (a.active && !a.left) {
        satTotal += a.satisfaction;
        satCount++;
      }
    }
    const satisfaction = satCount > 0 ? satTotal / satCount : this.metrics.satisfaction;

    this.metrics = { congestion, safety, satisfaction };
  }

  // ------------------------------------------------------------------
  // イベントログ
  // ------------------------------------------------------------------

  private pushLog(message: string): void {
    this.logs.push({ time: this.time, message });
  }

  /** 前回呼び出し以降に追加されたログを返す（UI 用） */
  consumeNewLogs(): LogEntry[] {
    const fresh = this.logs.slice(this.logCursor);
    this.logCursor = this.logs.length;
    return fresh;
  }

  /** cooldownMin 分以内に同じキーで発火していなければログを出す */
  private fireEvent(key: string, cooldownMin: number, message: string): void {
    const last = this.eventCooldowns.get(key);
    if (last !== undefined && this.time - last < cooldownMin) return;
    this.eventCooldowns.set(key, this.time);
    this.pushLog(message);
  }

  /** 開演・終演の瞬間を検知してログを出す */
  private checkActTransitions(): void {
    for (const act of this.timetable.acts) {
      const stage = getFacility(act.stageId);
      if (this.prevTime < act.start && this.time >= act.start) {
        this.pushLog(`🎵 ${act.artist} が ${stage.name} で開演しました`);
      }
      if (this.prevTime < act.end && this.time >= act.end) {
        if (act.popularity >= 80) {
          this.pushLog(`${stage.name} 終演により通路が混雑しています`);
        } else {
          this.pushLog(`${act.artist} が終演しました`);
        }
      }
    }
    if (this.prevTime < DAY_END && this.time >= DAY_END) {
      this.pushLog('閉場時刻です。観客が EXIT へ向かっています');
    }
  }

  /** 状態ベースのイベント（集中・待機列・満足度低下・危険水準）を検知 */
  private checkEvents(): void {
    // ステージへの観客集中
    for (const act of this.currentActs) {
      const stage = getFacility(act.stageId);
      const around = this.grid.countAround(stage.x, stage.y + 60, 2);
      if (around >= 120) {
        this.fireEvent(
          `concentrate_${stage.id}`,
          12,
          `${stage.name} に観客が集中しています`,
        );
      }
    }

    // トイレの待機列
    const toilet = getFacility('toilet_area');
    let toiletUsers = 0;
    for (const a of this.agents) {
      if (!a.active || a.left) continue;
      if (
        a.state === 'toilet' ||
        (a.targetFacilityId === 'toilet_area' &&
          Math.hypot(a.x - toilet.x, a.y - toilet.y) < 120)
      ) {
        toiletUsers++;
      }
    }
    if (toiletUsers > toilet.capacity * 0.7) {
      this.fireEvent(
        'toilet_queue',
        12,
        'TOILET AREA に待機列が発生しています',
      );
    }

    // 飲食エリアの混雑と満足度低下
    const food = getFacility('food_area');
    const foodCrowd = this.grid.countAround(food.x, food.y, 2);
    if (foodCrowd > food.capacity) {
      this.fireEvent(
        'food_crowd',
        12,
        'FOOD AREA が混雑し満足度が低下しています',
      );
    }

    // 危険水準セルの発生
    let dangerCells = 0;
    for (const c of this.grid.counts) if (c >= 30) dangerCells++;
    if (dangerCells > 0) {
      this.fireEvent(
        'danger',
        8,
        `⚠️ 危険水準の混雑が ${dangerCells} 箇所で発生しています！`,
      );
    }

    // 全体満足度の低下
    if (this.metrics.satisfaction < 40) {
      this.fireEvent('low_satisfaction', 15, '会場全体の満足度が低下しています');
    }
  }
}

export { formatTime };
