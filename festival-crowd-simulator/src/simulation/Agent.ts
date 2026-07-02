/**
 * 観客エージェント。
 * 各観客は欲求（hunger / toilet / fatigue）と気分（satisfaction / stress）を持ち、
 * タイムテーブルと自分の好みに従って目的地を決め、
 * フローフィールドに沿って建物や水域を迂回しながら移動する。
 *
 * 行動ルール:
 *  1. 好みに合うアーティストが始まる（15分前〜）とそのステージへ向かう
 *  2. ライブ中はステージ周辺に滞在する（watching）
 *  3. 終演後は次のステージ / トイレ / 飲食 / 物販 / 出口を選ぶ
 *  4. hunger が高いと FOOD AREA へ
 *  5. toilet が高いと近い方の TOILET AREA へ
 *  6. fatigue が高いと空いている広場で休憩
 *  7. stress が高いと危険水準セルを迂回しようとする
 *  8. 混雑セルでは移動速度が低下する（CrowdGrid.speedFactorAt）
 */

import type { Facility, FacilityType, Waypoint } from '../data/venues';
import { DAY_END } from '../data/timetable';
import type { Act } from '../data/timetable';
import type { CrowdGrid } from './CrowdGrid';
import type { FlowField } from './FlowField';
import type { Timetable } from './Timetable';
import type { TileMap } from '../map/TileMap';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../data/venues';

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
  map: TileMap;
  /** POI id（施設 id / 経由地 id）→ フローフィールド */
  fields: ReadonlyMap<string, FlowField>;
  facilities: ReadonlyMap<string, Facility>;
  waypoints: readonly Waypoint[];
  timetable: Timetable;
  /** 歩行距離が最短の指定タイプ施設を返す */
  nearestOfType(type: FacilityType, x: number, y: number): Facility | undefined;
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
  /** actId -> 興味スコア（人気度×個人補正、およそ 0-160） */
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

  /** いま向かっている POI（施設 id または経由地 id） */
  targetPoiId: string | null = null;
  /** targetPoiId が施設の場合の施設 id（経由地なら null） */
  targetFacilityId: string | null = null;
  /** watching 中のアクト */
  currentActId: string | null = null;
  /** この距離（px, 歩行距離）まで近づいたら到着扱い */
  private arriveDist = 64;
  /** eating / toilet / shopping が終わる時刻（分） */
  private activityUntil = -1;
  /** 次に行動を考え直す時刻（分） */
  private nextDecision = 0;
  private hasShopped = false;
  /** 欲求の進行速度の個人差 */
  private hungerRate: number;
  private toiletRate: number;

  constructor(
    readonly id: number,
    spawnTime: number,
    spawnX: number,
    spawnY: number,
    acts: readonly Act[],
  ) {
    this.spawnTime = spawnTime;
    this.x = spawnX;
    this.y = spawnY;
    this.targetX = this.x;
    this.targetY = this.y;
    this.speed = 88 + Math.random() * 56; // px/分（詳細スケール）

    this.hunger = Math.random() * 35;
    this.toilet = Math.random() * 30;
    this.fatigue = Math.random() * 15;
    this.satisfaction = 55 + Math.random() * 15;
    this.stress = Math.random() * 10;
    this.hungerRate = 0.22 + Math.random() * 0.18;
    this.toiletRate = 0.2 + Math.random() * 0.22;

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
      } else {
        this.driftInPlace(dtMin, ctx);
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
        this.driftInPlace(dtMin, ctx);
      }
      return;
    }

    // moving / leaving: フローフィールドに沿って目的地へ
    const arrived = this.moveAlongField(dtMin, ctx);
    if (arrived) {
      this.onArrive(ctx);
    } else if (ctx.time >= this.nextDecision) {
      // 移動が長引いても定期的に欲求を見直す（トイレ我慢の限界など）
      if (this.state === 'moving') this.decide(ctx);
      else this.nextDecision = ctx.time + 6; // leaving は出口へ向かい続ける
    }
  }

  // ------------------------------------------------------------------
  // 欲求・気分の更新
  // ------------------------------------------------------------------

  private updateNeeds(dtMin: number, ctx: AgentContext): void {
    const resting =
      this.state === 'eating' ||
      (this.state === 'moving' && this.targetFacilityId === null && this.isArrivedAtTarget(ctx));

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
      this.fatigue + (resting ? -1.2 : 0.2) * dtMin,
      0,
      100,
    );

    // ストレス: 混雑セルにいると上昇、空いていると減衰
    const level = ctx.grid.levelAt(this.x, this.y);
    let stressDelta = -1.2;
    if (level === 3) stressDelta = 1.6;
    else if (level === 2) stressDelta = 0.7;
    else if (level === 1) stressDelta = 0.1;
    this.stress = clamp(this.stress + stressDelta * dtMin, 0, 100);

    // 満足度
    let satDelta = -0.05; // 何もしないと少しずつ下がる
    if (this.state === 'watching' && this.currentActId) {
      const interest = this.preference.get(this.currentActId) ?? 50;
      satDelta += (interest / 100) * 1.3;
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

    // 閉場後、フェスが終わった後、または「もう見たいアクトがない」人は駅へ退場。
    // 興味のあるアクトが残っていない人も 60% は帰り、40% は雰囲気を楽しんで残る。
    // これにより閉場前から少しずつ帰る人が出て、現実の分散退場に近くなる
    const wantsMore = timetable.acts.some(
      (a) => a.end > time && (this.preference.get(a.id) ?? 0) > 55,
    );
    if (
      time >= DAY_END ||
      !timetable.hasRemainingActs(time) ||
      (!wantsMore && Math.random() < 0.6) ||
      (this.satisfaction < 20 && this.stress > 80 && Math.random() < 0.3)
    ) {
      this.setFacilityTarget(ctx.nearestOfType('exit', this.x, this.y), 'leaving', 96);
      return;
    }

    // 生理的欲求を最優先（近い方の施設へ）
    if (this.toilet >= 70) {
      this.setFacilityTarget(ctx.nearestOfType('toilet', this.x, this.y), 'moving', 96);
      return;
    }
    if (this.hunger >= 70) {
      this.setFacilityTarget(ctx.nearestOfType('food', this.x, this.y), 'moving', 112);
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
      this.setFacilityTarget(ctx.nearestOfType('goods', this.x, this.y), 'moving', 104);
      return;
    }
    if (this.fatigue >= 65) {
      this.setRestTarget(ctx);
      return;
    }
    // 適当な広場・ビーチへぶらぶら
    const wp = ctx.waypoints[Math.floor(Math.random() * ctx.waypoints.length)];
    this.setWaypointTarget(wp);
  }

  private goWatchAct(ctx: AgentContext, act: Act): void {
    const stage = ctx.facilities.get(act.stageId);
    if (!stage) return;
    this.currentActId = act.id;
    this.targetPoiId = stage.id;
    this.targetFacilityId = stage.id;
    this.state = 'moving';
    this.targetX = stage.audienceX ?? stage.x;
    this.targetY = stage.audienceY ?? stage.y;
    // 興味が高いほど前方（ステージ近く）まで詰める。
    // 興味が低いほど手前で止まる → 自然に扇状の観客だまりができる
    const interest = this.preference.get(act.id) ?? 50;
    this.arriveDist = clamp(72 + (140 - interest) * 2.2, 56, 352);
  }

  private setFacilityTarget(
    facility: Facility | undefined,
    state: AgentState,
    arriveDist: number,
  ): void {
    if (!facility) return;
    this.targetPoiId = facility.id;
    this.targetFacilityId = facility.id;
    this.currentActId = null;
    this.state = state;
    this.targetX = facility.audienceX ?? facility.x;
    this.targetY = facility.audienceY ?? facility.y;
    this.arriveDist = arriveDist;
  }

  private setWaypointTarget(wp: Waypoint): void {
    this.targetPoiId = wp.id;
    this.targetFacilityId = null;
    this.currentActId = null;
    this.state = 'moving';
    this.targetX = wp.x;
    this.targetY = wp.y;
    this.arriveDist = 80 + Math.random() * 96;
  }

  /** 空いている経由地を探して休憩に向かう */
  private setRestTarget(ctx: AgentContext): void {
    let bestWp = ctx.waypoints[0];
    let bestCount = Infinity;
    for (let i = 0; i < 3; i++) {
      const wp = ctx.waypoints[Math.floor(Math.random() * ctx.waypoints.length)];
      const c = ctx.grid.countAround(wp.x, wp.y, 1);
      if (c < bestCount) {
        bestCount = c;
        bestWp = wp;
      }
    }
    this.setWaypointTarget(bestWp);
    this.nextDecision = ctx.time + 10 + Math.random() * 8; // しばらく休む
  }

  // ------------------------------------------------------------------
  // 移動
  // ------------------------------------------------------------------

  /** フローフィールドに沿って1ステップ移動。到着したら true */
  private moveAlongField(dtMin: number, ctx: AgentContext): boolean {
    const field = this.targetPoiId ? ctx.fields.get(this.targetPoiId) : undefined;
    if (!field) return true;

    const walkDist = field.distanceAt(this.x, this.y);
    if (walkDist <= this.arriveDist) return true;
    if (!Number.isFinite(walkDist)) {
      // 到達不能な場所に迷い込んだ場合は近くの歩行可能タイルへ戻す
      const p = ctx.map.findNearestWalkable(this.x, this.y);
      this.x = p.x;
      this.y = p.y;
      return false;
    }

    let [dx, dy] = field.directionAt(this.x, this.y);
    if (dx === 0 && dy === 0) return true;

    // 混雑による速度低下（ルール8）
    const factor = ctx.grid.speedFactorAt(this.x, this.y);
    const step = this.speed * factor * dtMin;

    let ang = Math.atan2(dy, dx);
    // ストレスが高いと危険水準の混雑を避けて斜めに迂回する（ルール7）
    const aheadX = this.x + dx * 72;
    const aheadY = this.y + dy * 72;
    if (this.stress > 60 && ctx.grid.levelAt(aheadX, aheadY) === 3) {
      ang += (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 3);
    } else {
      // わずかな揺らぎで群衆っぽく
      ang += (Math.random() - 0.5) * 0.45;
    }

    const nx = clamp(this.x + Math.cos(ang) * step, 2, WORLD_WIDTH - 2);
    const ny = clamp(this.y + Math.sin(ang) * step, 2, WORLD_HEIGHT - 2);
    // 歩行不可タイルへは踏み込まない（壁ずり移動）
    if (ctx.map.isWalkable(nx, ny)) {
      this.x = nx;
      this.y = ny;
    } else if (ctx.map.isWalkable(nx, this.y)) {
      this.x = nx;
    } else if (ctx.map.isWalkable(this.x, ny)) {
      this.y = ny;
    }
    return false;
  }

  /** watching・食事中などの、その場での微移動 */
  private driftInPlace(dtMin: number, ctx: AgentContext): void {
    const nx = this.x + (Math.random() - 0.5) * 8.8 * dtMin;
    const ny = this.y + (Math.random() - 0.5) * 8.8 * dtMin;
    if (!ctx.map.isWalkable(nx, ny)) return;
    // 目的地から離れすぎないようにする
    const field = this.targetPoiId ? ctx.fields.get(this.targetPoiId) : undefined;
    if (field && field.distanceAt(nx, ny) > this.arriveDist + 40) return;
    this.x = clamp(nx, 2, WORLD_WIDTH - 2);
    this.y = clamp(ny, 2, WORLD_HEIGHT - 2);
  }

  private isArrivedAtTarget(ctx: AgentContext): boolean {
    const field = this.targetPoiId ? ctx.fields.get(this.targetPoiId) : undefined;
    if (!field) return true;
    return field.distanceAt(this.x, this.y) <= this.arriveDist;
  }

  // ------------------------------------------------------------------
  // 到着・行動完了
  // ------------------------------------------------------------------

  private onArrive(ctx: AgentContext): void {
    const { time } = ctx;
    const facility = this.targetFacilityId
      ? ctx.facilities.get(this.targetFacilityId)
      : undefined;

    if (this.state === 'leaving') {
      if (facility?.type === 'exit') this.left = true;
      return;
    }

    switch (facility?.type) {
      case 'food': {
        this.state = 'eating';
        // 混んでいると提供が遅い（待ち時間で満足度も下がる）
        const crowded = ctx.grid.levelAt(this.x, this.y) >= 2;
        this.activityUntil = time + (crowded ? 14 : 8) + Math.random() * 4;
        if (crowded) this.satisfaction = clamp(this.satisfaction - 6, 0, 100);
        return;
      }
      case 'toilet': {
        this.state = 'toilet';
        const crowded = ctx.grid.levelAt(this.x, this.y) >= 2;
        this.activityUntil = time + (crowded ? 8 : 3) + Math.random() * 2;
        if (crowded) this.satisfaction = clamp(this.satisfaction - 4, 0, 100);
        return;
      }
      case 'goods': {
        this.state = 'shopping';
        this.activityUntil = time + 5 + Math.random() * 5;
        this.hasShopped = true;
        return;
      }
      case 'stage': {
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
        // 経由地（広場・ビーチ）に到着。nextDecision が来たら次の行動へ
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
