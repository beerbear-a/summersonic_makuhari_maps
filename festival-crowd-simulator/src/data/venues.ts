/**
 * 会場データ定義。
 * SUMMER SONIC 2026 東京会場マップ（ZOZOマリンスタジアム + 幕張メッセ + ビーチ）を
 * モチーフにした縦長マップ（672 x 1120px、8pxタイル）。
 *
 * 北（上）: 海・ビーチ（BEACH STAGE）・ZOZOマリンスタジアム（MARINE STAGE）
 * 中央    : 大通り（湾岸道路）
 * 南（下）: 幕張メッセ（PACIFIC / Spotify / SONIC / MOUNTAIN + FOOD + トイレ）
 *           ホール9（GOODS）・海浜幕張駅（EXIT）
 */

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

export const WORLD_WIDTH = 672;
export const WORLD_HEIGHT = 1120;

export const facilities: Facility[] = [
  // ---- ステージ ----
  {
    id: 'marine_stage',
    name: 'MARINE STAGE',
    type: 'stage',
    x: 392,
    y: 222,
    capacity: 450,
    audienceX: 392,
    audienceY: 268,
  },
  {
    id: 'beach_stage',
    name: 'BEACH STAGE',
    type: 'stage',
    x: 120,
    y: 106,
    capacity: 120,
    audienceX: 120,
    audienceY: 146,
  },
  {
    id: 'pacific_stage',
    name: 'PACIFIC STAGE',
    type: 'stage',
    x: 100,
    y: 540,
    capacity: 200,
    audienceX: 100,
    audienceY: 600,
  },
  {
    id: 'spotify_stage',
    name: 'Spotify STAGE',
    type: 'stage',
    x: 172,
    y: 540,
    capacity: 180,
    audienceX: 172,
    audienceY: 600,
  },
  {
    id: 'sonic_stage',
    name: 'SONIC STAGE',
    type: 'stage',
    x: 372,
    y: 540,
    capacity: 250,
    audienceX: 372,
    audienceY: 600,
  },
  {
    id: 'mountain_stage',
    name: 'MOUNTAIN STAGE',
    type: 'stage',
    x: 516,
    y: 540,
    capacity: 300,
    audienceX: 516,
    audienceY: 600,
  },
  // ---- 施設 ----
  {
    id: 'food_area',
    name: 'FOOD AREA',
    type: 'food',
    x: 276,
    y: 632,
    capacity: 140,
  },
  {
    id: 'toilet_messe',
    name: 'TOILET (MESSE)',
    type: 'toilet',
    x: 440,
    y: 668,
    capacity: 50,
  },
  {
    id: 'toilet_stadium',
    name: 'TOILET (STADIUM)',
    type: 'toilet',
    x: 488,
    y: 412,
    capacity: 40,
  },
  {
    id: 'goods_area',
    name: 'GOODS (HALL 9)',
    type: 'goods',
    x: 428,
    y: 928,
    capacity: 100,
  },
  // ---- 出口 ----
  {
    id: 'exit_station',
    name: 'KAIHIN-MAKUHARI STA.',
    type: 'exit',
    x: 268,
    y: 1060,
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
  { id: 'wp_stadium_plaza', x: 296, y: 424 }, // スタジアム前広場
  { id: 'wp_messe_plaza', x: 300, y: 744 }, // メッセ南広場
  { id: 'wp_beach', x: 160, y: 150 }, // ビーチ
  { id: 'wp_east_plaza', x: 592, y: 744 }, // メッセ東側通路
  { id: 'wp_boulevard', x: 268, y: 872 }, // 駅前大通り
];

/** 入場スポーン地点（重み付き）: 大半は駅から、少数はサブエントランスから */
export const spawnPoints = [
  { x: 268, y: 1048, weight: 0.75 }, // 海浜幕張駅
  { x: 112, y: 300, weight: 0.25 }, // サブエントランス（バス側）
];
