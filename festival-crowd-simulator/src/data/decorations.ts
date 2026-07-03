/**
 * マップ装飾の配置データ（拡張ポイント）。
 *
 * 「ここにコレを置く」を後から追加しやすいように、装飾は
 * 種類 + ワールド座標のデータとして分離してある。
 * 新しい種類を増やす場合は DecorationKind に追加して
 * TileMap.paintDecoration() に描画処理を1つ書くだけでよい。
 *
 * 座標は論理レイアウト(672x1120)基準 × WORLD_SCALE。
 * タイル位置から置きたい場合は `t(col)` ヘルパー（= col*8）で変換できる。
 */

import { WORLD_SCALE } from './venues';

const S = WORLD_SCALE;
/** タイル座標(col/row, 32pxタイル基準)を論理レイアウト単位に変換 */
const t = (tileIndex: number) => tileIndex * 8;

export type DecorationKind =
  | 'flag' // フェスののぼり旗
  | 'bunting' // 三角旗のガーランド
  | 'balloon' // 風船クラスター
  | 'barrier' // 客席前の柵（クラウドコントロールフェンス）
  | 'trash' // ゴミ箱
  | 'planter' // 花壇/プランター
  | 'umbrella' // ビーチパラソル
  | 'palm' // ヤシの木
  | 'bench' // ベンチ
  | 'tent' // 運営テント
  | 'speaker'; // 野外スピーカー

export interface Decoration {
  kind: DecorationKind;
  x: number;
  y: number;
  /** barrier のみ: 'h'=横向き（既定） / 'v'=縦向き */
  orientation?: 'h' | 'v';
}

/** cols のリストに沿って一定間隔で同じ装飾を並べる */
function line(
  kind: DecorationKind,
  row: number,
  cols: number[],
): Decoration[] {
  return cols.map((col) => ({ kind, x: t(col) * S, y: t(row) * S }));
}

/** 客席前に横一列の柵を並べる（客席側の1辺を覆う） */
function barrierRow(row: number, colStart: number, colEnd: number, step = 3): Decoration[] {
  const out: Decoration[] = [];
  for (let c = colStart; c <= colEnd; c += step) {
    out.push({ kind: 'barrier', x: t(c) * S, y: t(row) * S, orientation: 'h' });
  }
  return out;
}

function barrierCol(col: number, rowStart: number, rowEnd: number, step = 3): Decoration[] {
  const out: Decoration[] = [];
  for (let r = rowStart; r <= rowEnd; r += step) {
    out.push({ kind: 'barrier', x: t(col) * S, y: t(r) * S, orientation: 'v' });
  }
  return out;
}

export const decorations: Decoration[] = [
  // ==== ビーチ: ヤシの木 + パラソル + BEACH STAGE前の柵 ====
  { kind: 'palm', x: 40 * S, y: 128 * S },
  { kind: 'palm', x: 230 * S, y: 120 * S },
  { kind: 'palm', x: 270 * S, y: 150 * S },
  { kind: 'palm', x: 300 * S, y: 118 * S },
  { kind: 'umbrella', x: 60 * S, y: 175 * S },
  { kind: 'umbrella', x: 110 * S, y: 180 * S },
  { kind: 'umbrella', x: 190 * S, y: 175 * S },
  { kind: 'umbrella', x: 240 * S, y: 182 * S },
  ...barrierRow(15, 8, 22, 3), // BEACH STAGE 前

  // ==== ZOZOマリンスタジアム: MARINE STAGE前の柵 + 入場ゲート周りの旗 ====
  ...barrierRow(29, 44, 54, 3),
  { kind: 'flag', x: t(38) * S, y: t(48) * S },
  { kind: 'flag', x: t(60) * S, y: t(48) * S },

  // ==== エントランス広場: ガーランド + プランター ====
  ...line('bunting', 51, [12, 18, 24, 30, 36, 42, 48, 54, 60]),
  ...line('planter', 55, [10, 20, 30, 44, 54, 64]),
  { kind: 'flag', x: 356 * S, y: 440 * S },
  { kind: 'flag', x: 432 * S, y: 440 * S },
  { kind: 'tent', x: 560 * S, y: 372 * S },
  { kind: 'tent', x: 96 * S, y: 340 * S },
  { kind: 'speaker', x: 52 * S, y: 118 * S },
  { kind: 'speaker', x: 188 * S, y: 118 * S },

  // ==== メッセ東西の外周通路: プランターで並木道風に ====
  ...[68, 76, 84, 92].flatMap((row) => [
    { kind: 'planter' as const, x: t(5) * S, y: t(row) * S },
    { kind: 'planter' as const, x: t(73) * S, y: t(row) * S },
  ]),

  // ==== メッセ南広場: ガーランドと旗の並木道（中央/東ゲート順路の両脇） ====
  ...line('bunting', 91, [21, 26, 45, 50]),
  { kind: 'flag', x: 264 * S, y: 726 * S },
  { kind: 'flag', x: 312 * S, y: 726 * S },
  ...line('flag', 93, [30, 41, 56, 67]),
  ...line('bench', 96, [15, 24, 48, 57]),

  // ==== 各ホールのステージ前の柵 ====
  ...barrierRow(69, 10, 16, 3), // PACIFIC
  ...barrierRow(69, 19, 25, 3), // Spotify
  ...barrierRow(69, 44, 50, 3), // SONIC
  ...barrierCol(54, 68, 85, 3), // MOUNTAIN（縦・東向き）

  // ==== FOOD AREA: バルーンとゴミ箱 ====
  { kind: 'balloon', x: t(30) * S, y: t(73) * S },
  { kind: 'balloon', x: t(38) * S, y: t(73) * S },
  ...line('trash', 85, [30, 36, 42]),

  // ==== GOODS AREA: バルーンで賑やかに ====
  { kind: 'balloon', x: t(45) * S, y: t(112) * S },
  { kind: 'balloon', x: t(62) * S, y: t(112) * S },
  ...line('bunting', 111, [44, 50, 56, 62]),

  // ==== 駅前大通り: 旗の並木道 + ベンチ ====
  { kind: 'flag', x: 252 * S, y: 900 * S },
  { kind: 'flag', x: 284 * S, y: 940 * S },
  ...line('flag', 106, [30, 38]),
  ...line('flag', 118, [30, 38]),
  ...line('bench', 122, [31, 37]),
  ...line('planter', 128, [24, 40]),

  // ==== 駅前広場: 到着を歓迎するガーランド + ゴミ箱 ====
  ...line('bunting', 131, [24, 30, 36, 42, 48]),
  ...line('trash', 133, [24, 47]),

  // ==== 広場のベンチ（既存） ====
  { kind: 'bench', x: 200 * S, y: 470 * S },
  { kind: 'bench', x: 540 * S, y: 470 * S },
  { kind: 'bench', x: 130 * S, y: 760 * S },
  { kind: 'bench', x: 500 * S, y: 760 * S },
];
