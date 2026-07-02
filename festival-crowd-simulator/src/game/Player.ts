/**
 * プレイヤーキャラクター（歩くモード用）。
 * WASD / 矢印キーで会場内を自由に歩ける。
 * - 建物・水域など歩行不可タイルには入れない（壁ずり移動）
 * - 混雑セルでは観客と同じように移動速度が低下する
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

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

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

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  /** 実時間 dtSeconds ぶん移動する（シミュレーション速度とは独立） */
  update(dtSeconds: number, input: PlayerInput, map: TileMap, grid: CrowdGrid): void {
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
}
