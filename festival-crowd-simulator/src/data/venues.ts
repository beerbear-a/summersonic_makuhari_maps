/**
 * 会場データ定義。
 * 幕張メッセ風の架空フェス会場（1200x800px の 2D 俯瞰マップ）。
 * 上段にステージ群（ホールをイメージ）、中段に飲食・トイレ・物販、
 * 下段中央に出入口（EXIT）を配置している。
 */

export type FacilityType = 'stage' | 'food' | 'toilet' | 'goods' | 'exit';

export interface Facility {
  id: string;
  name: string;
  type: FacilityType;
  x: number;
  y: number;
  capacity: number;
  /** 描画用のゾーンサイズ（中心 x,y 基準） */
  width: number;
  height: number;
}

export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 800;

export const facilities: Facility[] = [
  {
    id: 'mountain_stage',
    name: 'MOUNTAIN STAGE',
    type: 'stage',
    x: 230,
    y: 140,
    capacity: 350,
    width: 240,
    height: 110,
  },
  {
    id: 'sonic_stage',
    name: 'SONIC STAGE',
    type: 'stage',
    x: 620,
    y: 120,
    capacity: 280,
    width: 210,
    height: 100,
  },
  {
    id: 'pacific_stage',
    name: 'PACIFIC STAGE',
    type: 'stage',
    x: 990,
    y: 140,
    capacity: 250,
    width: 210,
    height: 100,
  },
  {
    id: 'toilet_area',
    name: 'TOILET AREA',
    type: 'toilet',
    x: 330,
    y: 450,
    capacity: 60,
    width: 120,
    height: 80,
  },
  {
    id: 'food_area',
    name: 'FOOD AREA',
    type: 'food',
    x: 620,
    y: 490,
    capacity: 140,
    width: 200,
    height: 100,
  },
  {
    id: 'goods_area',
    name: 'GOODS AREA',
    type: 'goods',
    x: 910,
    y: 450,
    capacity: 100,
    width: 150,
    height: 80,
  },
  {
    id: 'exit',
    name: 'EXIT',
    type: 'exit',
    x: 620,
    y: 750,
    capacity: 10000,
    width: 220,
    height: 60,
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
