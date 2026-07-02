/**
 * 会場データ定義。
 * SUMMER SONIC 2026 東京会場マップ（ZOZOマリンスタジアム + 幕張メッセ + ビーチ）を
 * モチーフにした縦長マップ。
 *
 * 座標系: 詳細スケール（実際に歩いて回れる縮尺）。
 * 論理レイアウトは 672x1120 で設計し、WORLD_SCALE(=4) 倍した
 * 2688x4480 が実際のワールド座標になる。
 *
 * 北（上）: 海・ビーチ（BEACH STAGE）・ZOZOマリンスタジアム（MARINE STAGE）
 * 中央    : 大通り（湾岸道路）
 * 南（下）: 幕張メッセ（PACIFIC / Spotify / SONIC / MOUNTAIN + FOOD + トイレ）
 *           ホール9（GOODS）・海浜幕張駅（EXIT）
 */

/** 論理レイアウト(672x1120) → ワールド座標への倍率 */
export const WORLD_SCALE = 4;
const S = WORLD_SCALE;

export type FacilityType = 'stage' | 'food' | 'toilet' | 'goods' | 'exit';

export interface Facility {
  id: string;
  name: string;
  type: FacilityType;
  /** ラベル表示位置（ステージならステージ台の位置） */
  x: number;
  y: number;
  capacity: number;
  /**
   * 観客が実際に集まる位置（経路探索の目標点）。
   * 省略時は x, y と同じ。ステージでは客席側を指す。
   */
  audienceX?: number;
  audienceY?: number;
}

export const WORLD_WIDTH = 672 * S;
export const WORLD_HEIGHT = 1120 * S;

export const facilities: Facility[] = [
  // ---- ステージ ----
  {
    id: 'marine_stage',
    name: 'MARINE STAGE',
    type: 'stage',
    x: 392 * S,
    y: 222 * S,
    capacity: 450,
    audienceX: 392 * S,
    audienceY: 268 * S,
  },
  {
    id: 'beach_stage',
    name: 'BEACH STAGE',
    type: 'stage',
    x: 120 * S,
    y: 106 * S,
    capacity: 120,
    audienceX: 120 * S,
    audienceY: 146 * S,
  },
  {
    id: 'pacific_stage',
    name: 'PACIFIC STAGE',
    type: 'stage',
    x: 100 * S,
    y: 540 * S,
    capacity: 200,
    audienceX: 100 * S,
    audienceY: 600 * S,
  },
  {
    id: 'spotify_stage',
    name: 'Spotify STAGE',
    type: 'stage',
    x: 172 * S,
    y: 540 * S,
    capacity: 180,
    audienceX: 172 * S,
    audienceY: 600 * S,
  },
  {
    id: 'sonic_stage',
    name: 'SONIC STAGE',
    type: 'stage',
    x: 372 * S,
    y: 540 * S,
    capacity: 250,
    audienceX: 372 * S,
    audienceY: 600 * S,
  },
  {
    id: 'mountain_stage',
    name: 'MOUNTAIN STAGE',
    type: 'stage',
    // Hall 1-3 を横に使い、ステージは左（西）端。観客は東側から西向きに観る
    x: 424 * S,
    y: 608 * S,
    capacity: 300,
    audienceX: 484 * S,
    audienceY: 608 * S,
  },
  // ---- 施設 ----
  {
    id: 'food_area',
    name: 'FOOD AREA',
    type: 'food',
    x: 276 * S,
    y: 632 * S,
    capacity: 140,
  },
  {
    id: 'toilet_messe',
    name: 'TOILET (MESSE)',
    type: 'toilet',
    x: 244 * S,
    y: 552 * S,
    capacity: 50,
  },
  {
    id: 'toilet_stadium',
    name: 'TOILET (STADIUM)',
    type: 'toilet',
    x: 488 * S,
    y: 412 * S,
    capacity: 40,
  },
  {
    id: 'goods_area',
    name: 'GOODS (HALL 9)',
    type: 'goods',
    x: 428 * S,
    y: 928 * S,
    capacity: 100,
  },
  // ---- 出口 ----
  {
    id: 'exit_station',
    name: 'KAIHIN-MAKUHARI STA.',
    type: 'exit',
    x: 268 * S,
    y: 1060 * S,
    capacity: 10000,
  },
];

export const facilityById: ReadonlyMap<string, Facility> = new Map(
  facilities.map((f) => [f.id, f]),
);

export function getFacility(id: string): Facility {
  const f = facilityById.get(id);
  if (!f) throw new Error(`unknown facility: ${id}`);
  return f;
}

/** ぶらつき・休憩用の経由地（広場など） */
export interface Waypoint {
  id: string;
  x: number;
  y: number;
}

export const waypoints: Waypoint[] = [
  { id: 'wp_stadium_plaza', x: 296 * S, y: 424 * S }, // スタジアム前広場
  { id: 'wp_messe_plaza', x: 300 * S, y: 744 * S }, // メッセ南広場
  { id: 'wp_beach', x: 160 * S, y: 150 * S }, // ビーチ
  { id: 'wp_east_plaza', x: 592 * S, y: 744 * S }, // メッセ東側通路
  { id: 'wp_boulevard', x: 268 * S, y: 872 * S }, // 駅前大通り
];

/** 入場スポーン地点（重み付き）: 大半は駅から、少数はサブエントランスから */
export const spawnPoints = [
  { x: 268 * S, y: 1048 * S, weight: 0.75 }, // 海浜幕張駅
  { x: 112 * S, y: 300 * S, weight: 0.25 }, // サブエントランス（バス側）
];
