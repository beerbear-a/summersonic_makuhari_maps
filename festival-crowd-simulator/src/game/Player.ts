/**
 * プレイヤーキャラクター（歩くモード用）。
 * WASD / 矢印キーで会場内を自由に歩ける。
 * - 建物・水域など歩行不可タイルには入れない（壁ずり移動）
 * - 混雑セルでは観客と同じように移動速度が低下する
 *
 * 観客エージェントと同じように hunger / toilet / fatigue / hype（満足度相当）を持ち、
 * FOOD AREA・トイレ・GOODS で話しかけると実際に数値が変化する。
 * ステージの客席エリアに立っている間はライブを「体験」でき、
 * 一定時間観ると participatedActs に記録される。
 */

import type { CrowdGrid } from '../simulation/CrowdGrid';
import type { TileMap } from '../map/TileMap';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../data/venues';

export interface PlayerInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** Shift でダッシュ */
  run: boolean;
}

/** 施設での行動の結果（セリフの出し分けに使う） */
export type ActionResult = 'ok' | 'not_needed';

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/** ライブを「観た」と記録するまでの滞在秒数 */
const WATCH_ATTEND_THRESHOLD = 8;

export class Player {
  x: number;
  y: number;
  /** 実時間ベースの歩行速度（px/秒、詳細スケール） */
  speed = 130;
  /** 歩行アニメーション用: 移動中か */
  moving = false;
  /** 向き（スプライトの反転用）: 1 = 右, -1 = 左 */
  facing: 1 | -1 = 1;
  /** 4方向の向き（ポケモン風スプライト切替用） */
  dir: 'up' | 'down' | 'left' | 'right' = 'down';
  /** 歩行アニメーションの位相 */
  walkPhase = 0;

  // --- プレイヤー自身の欲求・気分（観客エージェントと同じ軸） ---
  hunger = 25 + Math.random() * 15;
  toilet = 15 + Math.random() * 15;
  fatigue = 8;
  /** 満足度相当（ライブを観たり買い食いすると上がる） */
  hype = 55;

  mealsEaten = 0;
  toiletVisits = 0;
  goodsBought = 0;
  /** 8秒以上観たライブの actId 集合 */
  readonly attendedActs = new Set<string>();
  /** actId -> 累計視聴秒数（8秒しきい値の判定用） */
  private watchProgress = new Map<string, number>();

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  /** 実時間 dtSeconds ぶん移動する（シミュレーション速度とは独立） */
  update(dtSeconds: number, input: PlayerInput, map: TileMap, grid: CrowdGrid): void {
    this.updateNeeds(dtSeconds, grid.levelAt(this.x, this.y));

    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    this.moving = dx !== 0 || dy !== 0;
    if (!this.moving) return;

    if (dx > 0) this.facing = 1;
    else if (dx < 0) this.facing = -1;
    // 斜め移動は横向きを優先（ポケモン風）
    if (dx > 0) this.dir = 'right';
    else if (dx < 0) this.dir = 'left';
    else if (dy < 0) this.dir = 'up';
    else if (dy > 0) this.dir = 'down';
    this.walkPhase += dtSeconds * (input.run ? 15 : 10);

    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;

    // 混雑した人混みの中は進みにくい（観客と同じルール）。Shift でダッシュ
    const factor = grid.speedFactorAt(this.x, this.y);
    const dash = input.run ? 1.8 : 1;
    const step = this.speed * dash * (0.4 + 0.6 * factor) * dtSeconds;

    const nx = clamp(this.x + dx * step, 4, WORLD_WIDTH - 4);
    const ny = clamp(this.y + dy * step, 4, WORLD_HEIGHT - 4);
    // 壁ずり: 斜め移動で片方の軸だけ通れる場合はそちらへ
    if (map.isWalkable(nx, ny)) {
      this.x = nx;
      this.y = ny;
    } else if (map.isWalkable(nx, this.y)) {
      this.x = nx;
    } else if (map.isWalkable(this.x, ny)) {
      this.y = ny;
    }
  }

  private updateNeeds(dtSeconds: number, crowdLevel: 0 | 1 | 2 | 3): void {
    this.hunger = clamp(this.hunger + 0.14 * dtSeconds, 0, 100);
    this.toilet = clamp(this.toilet + 0.11 * dtSeconds, 0, 100);
    this.fatigue = clamp(
      this.fatigue + (this.moving ? 0.1 : -0.08) * dtSeconds,
      0,
      100,
    );
    let hypeDelta = -0.04;
    if (crowdLevel === 3) hypeDelta -= 0.25;
    else if (crowdLevel === 2) hypeDelta -= 0.1;
    this.hype = clamp(this.hype + hypeDelta * dtSeconds, 0, 100);
  }

  /** FOOD AREA で話しかけたときの処理 */
  eat(): ActionResult {
    if (this.hunger < 15) return 'not_needed';
    this.hunger = clamp(this.hunger - 55, 0, 100);
    this.fatigue = clamp(this.fatigue - 8, 0, 100);
    this.hype = clamp(this.hype + 6, 0, 100);
    this.mealsEaten++;
    return 'ok';
  }

  /** トイレで話しかけたときの処理 */
  useToilet(): ActionResult {
    if (this.toilet < 20) return 'not_needed';
    this.toilet = clamp(this.toilet - 70, 0, 100);
    this.toiletVisits++;
    return 'ok';
  }

  /** GOODS 売り場で話しかけたときの処理 */
  buyGoods(): ActionResult {
    if (this.goodsBought >= 5) return 'not_needed';
    this.goodsBought++;
    this.hype = clamp(this.hype + 8, 0, 100);
    return 'ok';
  }

  /**
   * ステージの客席エリアに立っている間、毎フレーム呼ぶ。
   * 8秒以上観ると attendedActs に記録され、戻り値が true になる（1回だけ）。
   */
  watchTick(dtSeconds: number, actId: string, popularity: number): boolean {
    this.hype = clamp(this.hype + (popularity / 100) * 4 * dtSeconds, 0, 100);
    this.fatigue = clamp(this.fatigue + 0.02 * dtSeconds, 0, 100);
    const prev = this.watchProgress.get(actId) ?? 0;
    const next = prev + dtSeconds;
    this.watchProgress.set(actId, next);
    if (next >= WATCH_ATTEND_THRESHOLD && !this.attendedActs.has(actId)) {
      this.attendedActs.add(actId);
      return true;
    }
    return false;
  }
}
