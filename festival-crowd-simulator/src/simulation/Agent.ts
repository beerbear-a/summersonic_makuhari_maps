/**
 * 観客エージェント。
 * 各観客は欲求（hunger / toilet / fatigue）と気分（satisfaction / stress）を持ち、
 * タイムテーブルと自分の好みに従って目的地を決めて移動する。
 *
 * 行動ルール:
 *  1. 好みに合うアーティストが始まる（15分前〜）とそのステージへ向かう
 *  2. ライブ中はステージ周辺に滞在する（watching）
 *  3. 終演後は次のステージ / トイレ / 飲食 / 物販 / 出口を選ぶ
 *  4. hunger が高いと FOOD AREA へ
 *  5. toilet が高いと TOILET AREA へ
 *  6. fatigue が高いと空いている場所で休憩
 *  7. stress が高いと危険水準セルを迂回しようとする
 *  8. 混雑セルでは移動速度が低下する（CrowdGrid.speedFactorAt）
 */

import type { Facility } from '../data/venues';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../data/venues';
import { DAY_END } from '../data/timetable';
import type { Act } from '../data/timetable';
import type { CrowdGrid } from './CrowdGrid';
import type { Timetable } from './Timetable';

export type AgentState =
  | 'watching'
  | 'moving'
  | 'eating'
  | 'toilet'
  | 'shopping'
  | 'leaving';

/** Agent.update に渡すシミュレーション文脈 */
export interface AgentContext {
  time: number;
  grid: CrowdGrid;
  facilities: ReadonlyMap<string, Facility>;
  timetable: Timetable;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

export class Agent {
  // --- 位置と移動 ---
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  /** 基本移動速度（px / シミュレーション分） */
  speed: number;

  // --- 好みと欲求（0-100） ---
  /** actId -> 興味スコア（人気度×個人補正、およそ 0-150） */
  preference: Map<string, number>;
  hunger: number;
  toilet: number;
  fatigue: number;
  satisfaction: number;
  stress: number;

  state: AgentState = 'moving';

  /** 入場時刻（この時刻まで非アクティブ） */
  spawnTime: number;
  active = false;
  /** EXIT から退場済みか */
  left = false;

  /** いま向かっている施設（null なら休憩スポットなど自由地点） */
  targetFacilityId: string | null = null;
  /** watching 中のアクト */
  currentActId: string | null = null;
  /** eating / toilet / shopping が終わる時刻（分） */
  private activityUntil = -1;
  /** 次に行動を考え直す時刻（分） */
  private nextDecision = 0;
  private hasShopped = false;
  /** 欲求の進行速度の個人差 */
  private hungerRate: number;
  private toiletRate: number;

  constructor(readonly id: number, spawnTime: number, acts: readonly Act[]) {
    this.spawnTime = spawnTime;
    // EXIT（=入場ゲート）付近からスポーンする
    this.x = 620 + (Math.random() - 0.5) * 200;
    this.y = 780;
    this.targetX = this.x;
    this.targetY = this.y;
    this.speed = 16 + Math.random() * 10; // px/分（1x再生で約 32-52px/秒）

    this.hunger = Math.random() * 35;
    this.toilet = Math.random() * 30;
    this.fatigue = Math.random() * 15;
    this.satisfaction = 55 + Math.random() * 15;
    this.stress = Math.random() * 10;
    this.hungerRate = 0.25 + Math.random() * 0.2;
    this.toiletRate = 0.25 + Math.random() * 0.25;

    // 各アクトへの興味 = 人気度 × 個人補正(0.4-1.6)
    this.preference = new Map(
      acts.map((a) => [a.id, a.popularity * (0.4 + Math.random() * 1.2)]),
    );
  }

  /** シミュレーション1ステップ。dtMin はシミュレーション内の経過分 */
  update(dtMin: number, ctx: AgentContext): void {
    if (this.left) return;
    if (!this.active) {
      if (ctx.time >= this.spawnTime) {
        this.active = true;
        this.decide(ctx);
      }
      return;
    }

    this.updateNeeds(dtMin, ctx);

    // 固定時間の行動（食事・トイレ・買い物）中
    if (
      this.state === 'eating' ||
      this.state === 'toilet' ||
      this.state === 'shopping'
    ) {
      if (ctx.time >= this.activityUntil) {
        this.finishActivity(ctx);
      }
      return;
    }

    // ライブ鑑賞中
    if (this.state === 'watching') {
      const act = this.currentActId
        ? ctx.timetable.byId(this.currentActId)
        : undefined;
      if (!act || ctx.time >= act.end || ctx.time >= DAY_END) {
        // 終演。次の行動を決める
        this.currentActId = null;
        this.decide(ctx);
      } else {
        // ステージ前で小さく揺れる（モッシュ的な微移動）
        this.driftNearTarget(dtMin, ctx);
      }
      return;
    }

    // moving / leaving: 目的地へ移動
    const arrived = this.moveToward(dtMin, ctx);
    if (arrived) {
      this.onArrive(ctx);
    } else if (ctx.time >= this.nextDecision && this.state === 'moving') {
      // 移動が長引いても定期的に欲求を見直す（トイレ我慢の限界など）
      this.decide(ctx);
    }
  }

  // ------------------------------------------------------------------
  // 欲求・気分の更新
  // ------------------------------------------------------------------

  private updateNeeds(dtMin: number, ctx: AgentContext): void {
    const resting =
      this.state === 'eating' ||
      (this.state === 'moving' && this.targetFacilityId === null && this.isNearTarget());

    this.hunger = clamp(
      this.hunger + (this.state === 'eating' ? -8 : this.hungerRate) * dtMin,
      0,
      100,
    );
    this.toilet = clamp(
      this.toilet + (this.state === 'toilet' ? -25 : this.toiletRate) * dtMin,
      0,
      100,
    );
    this.fatigue = clamp(
      this.fatigue + (resting ? -1.2 : 0.22) * dtMin,
      0,
      100,
    );

    // ストレス: 混雑セルにいると上昇、空いていると減衰
    const cellCount = ctx.grid.countAt(this.x, this.y);
    let stressDelta = -1.2;
    if (cellCount >= 30) stressDelta = 2.2;
    else if (cellCount >= 15) stressDelta = 1.0;
    else if (cellCount >= 5) stressDelta = 0.15;
    this.stress = clamp(this.stress + stressDelta * dtMin, 0, 100);

    // 満足度
    let satDelta = -0.05; // 何もしないと少しずつ下がる
    if (this.state === 'watching' && this.currentActId) {
      const interest = this.preference.get(this.currentActId) ?? 50;
      satDelta += (interest / 100) * 1.1;
    }
    if (this.state === 'eating') satDelta += 0.6;
    if (this.state === 'shopping') satDelta += 0.4;
    if (this.stress > 70) satDelta -= 0.35;
    if (this.hunger > 85) satDelta -= 0.4;
    if (this.toilet > 85) satDelta -= 0.5;
    if (this.fatigue > 90) satDelta -= 0.3;
    this.satisfaction = clamp(this.satisfaction + satDelta * dtMin, 0, 100);
  }

  // ------------------------------------------------------------------
  // 意思決定
  // ------------------------------------------------------------------

  /** 次の目的地を決める */
  decide(ctx: AgentContext): void {
    const { time, timetable } = ctx;
    this.nextDecision = time + 4 + Math.random() * 4;

    // 閉場後、またはもう見たいアクトがない → 退場
    if (time >= DAY_END || !timetable.hasRemainingActs(time)) {
      this.setFacilityTarget(ctx, 'exit', 'leaving');
      return;
    }

    // 生理的欲求を最優先
    if (this.toilet >= 70) {
      this.setFacilityTarget(ctx, 'toilet_area', 'moving');
      return;
    }
    if (this.hunger >= 70) {
      this.setFacilityTarget(ctx, 'food_area', 'moving');
      return;
    }

    // 演奏中 or 15分以内に始まるアクトから、一番興味のあるものを選ぶ
    const candidates = [
      ...timetable.actsAt(time),
      ...timetable.upcomingWithin(time, 15),
    ];
    let best: Act | null = null;
    let bestScore = 55; // 興味がこの値以下なら観に行かない
    for (const act of candidates) {
      const interest = this.preference.get(act.id) ?? 0;
      if (interest > bestScore) {
        best = act;
        bestScore = interest;
      }
    }
    if (best) {
      this.goWatchAct(ctx, best);
      return;
    }

    // 暇な時間帯: 物販 / 休憩 / ぶらつき
    if (!this.hasShopped && Math.random() < 0.3) {
      this.setFacilityTarget(ctx, 'goods_area', 'moving');
      return;
    }
    if (this.fatigue >= 65) {
      this.setRestTarget(ctx);
      return;
    }
    if (Math.random() < 0.25) {
      this.setFacilityTarget(ctx, 'food_area', 'moving');
      return;
    }
    // 中央広場あたりをぶらぶらする
    this.targetFacilityId = null;
    this.state = 'moving';
    this.targetX = 250 + Math.random() * 700;
    this.targetY = 300 + Math.random() * 320;
  }

  private goWatchAct(ctx: AgentContext, act: Act): void {
    const stage = ctx.facilities.get(act.stageId);
    if (!stage) return;
    this.currentActId = act.id;
    this.targetFacilityId = stage.id;
    this.state = 'moving';
    // 興味が高いほど前方（ステージ近く）に陣取る
    const interest = this.preference.get(act.id) ?? 50;
    const minR = 40;
    const maxR = 60 + (150 - Math.min(interest, 150)) * 1.1;
    const r = minR + Math.random() * (maxR - minR);
    const ang = Math.PI * (0.15 + Math.random() * 0.7); // ステージ下側の扇形
    this.targetX = clamp(stage.x + Math.cos(ang) * r * 1.8, 20, WORLD_WIDTH - 20);
    this.targetY = clamp(
      stage.y + stage.height / 2 + Math.sin(ang) * r,
      20,
      WORLD_HEIGHT - 20,
    );
  }

  private setFacilityTarget(
    ctx: AgentContext,
    facilityId: string,
    state: AgentState,
  ): void {
    const f = ctx.facilities.get(facilityId);
    if (!f) return;
    this.targetFacilityId = facilityId;
    this.currentActId = null;
    this.state = state;
    this.targetX = f.x + (Math.random() - 0.5) * f.width * 0.8;
    this.targetY = f.y + (Math.random() - 0.5) * f.height * 0.8;
  }

  /** 空いている場所を探して休憩に向かう（数カ所試して一番空いている所へ） */
  private setRestTarget(ctx: AgentContext): void {
    let bestX = this.x;
    let bestY = this.y;
    let bestCount = Infinity;
    for (let i = 0; i < 6; i++) {
      const rx = 100 + Math.random() * (WORLD_WIDTH - 200);
      const ry = 280 + Math.random() * 380;
      const c = ctx.grid.countAt(rx, ry);
      if (c < bestCount) {
        bestCount = c;
        bestX = rx;
        bestY = ry;
      }
    }
    this.targetFacilityId = null;
    this.currentActId = null;
    this.state = 'moving';
    this.targetX = bestX;
    this.targetY = bestY;
    this.nextDecision = ctx.time + 10 + Math.random() * 8; // しばらく休む
  }

  // ------------------------------------------------------------------
  // 移動
  // ------------------------------------------------------------------

  /** 目的地へ1ステップ移動。到着したら true */
  private moveToward(dtMin: number, ctx: AgentContext): boolean {
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) return true;

    // 混雑による速度低下（ルール8）
    const factor = ctx.grid.speedFactorAt(this.x, this.y);
    const step = Math.min(this.speed * factor * dtMin, dist);

    let ang = Math.atan2(dy, dx);
    // ストレスが高いと危険水準の混雑を避けて斜めに迂回する（ルール7）
    const aheadX = this.x + Math.cos(ang) * this.speed * 0.8;
    const aheadY = this.y + Math.sin(ang) * this.speed * 0.8;
    if (this.stress > 60 && ctx.grid.countAt(aheadX, aheadY) >= 30) {
      ang += (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 3);
    } else {
      // わずかな揺らぎで群衆っぽく
      ang += (Math.random() - 0.5) * 0.5;
    }

    this.x = clamp(this.x + Math.cos(ang) * step, 4, WORLD_WIDTH - 4);
    this.y = clamp(this.y + Math.sin(ang) * step, 4, WORLD_HEIGHT - 4);
    return false;
  }

  /** watching 中の微移動 */
  private driftNearTarget(dtMin: number, ctx: AgentContext): void {
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    if (Math.hypot(dx, dy) > 10) {
      this.moveToward(dtMin, ctx);
      return;
    }
    this.x = clamp(this.x + (Math.random() - 0.5) * 2.4 * dtMin, 4, WORLD_WIDTH - 4);
    this.y = clamp(this.y + (Math.random() - 0.5) * 2.4 * dtMin, 4, WORLD_HEIGHT - 4);
  }

  private isNearTarget(): boolean {
    return Math.hypot(this.targetX - this.x, this.targetY - this.y) < 12;
  }

  // ------------------------------------------------------------------
  // 到着・行動完了
  // ------------------------------------------------------------------

  private onArrive(ctx: AgentContext): void {
    const { time } = ctx;
    if (this.state === 'leaving' && this.targetFacilityId === 'exit') {
      this.left = true;
      return;
    }

    switch (this.targetFacilityId) {
      case 'food_area': {
        this.state = 'eating';
        // 混んでいると提供が遅い（待ち時間で満足度も下がる）
        const crowded = ctx.grid.countAt(this.x, this.y) >= 15;
        this.activityUntil = time + (crowded ? 14 : 8) + Math.random() * 4;
        if (crowded) this.satisfaction = clamp(this.satisfaction - 6, 0, 100);
        return;
      }
      case 'toilet_area': {
        this.state = 'toilet';
        const crowded = ctx.grid.countAt(this.x, this.y) >= 15;
        this.activityUntil = time + (crowded ? 8 : 3) + Math.random() * 2;
        if (crowded) this.satisfaction = clamp(this.satisfaction - 4, 0, 100);
        return;
      }
      case 'goods_area': {
        this.state = 'shopping';
        this.activityUntil = time + 5 + Math.random() * 5;
        this.hasShopped = true;
        return;
      }
      case 'mountain_stage':
      case 'sonic_stage':
      case 'pacific_stage': {
        // ステージ到着。アクトがまだ有効なら watching へ
        const act = this.currentActId
          ? ctx.timetable.byId(this.currentActId)
          : undefined;
        if (act && time < act.end) {
          this.state = 'watching';
        } else {
          this.currentActId = null;
          this.decide(ctx);
        }
        return;
      }
      default:
        // 休憩スポット・ぶらつき先に到着。nextDecision が来たら次の行動を考える
        if (time >= this.nextDecision) this.decide(ctx);
        return;
    }
  }

  private finishActivity(ctx: AgentContext): void {
    if (this.state === 'eating') this.satisfaction = clamp(this.satisfaction + 6, 0, 100);
    if (this.state === 'shopping') this.satisfaction = clamp(this.satisfaction + 5, 0, 100);
    this.targetFacilityId = null;
    this.state = 'moving';
    this.decide(ctx);
  }
}
