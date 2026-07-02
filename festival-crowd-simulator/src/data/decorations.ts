/**
 * マップ装飾の配置データ（拡張ポイント）。
 *
 * 「ここにコレを置く」を後から追加しやすいように、装飾は
 * 種類 + ワールド座標のデータとして分離してある。
 * 新しい種類を増やす場合は DecorationKind に追加して
 * TileMap.paintDecoration() に描画処理を1つ書くだけでよい。
 *
 * 座標は論理レイアウト(672x1120)基準 × WORLD_SCALE。
 */

import { WORLD_SCALE } from './venues';

const S = WORLD_SCALE;

export type DecorationKind =
  | 'flag' // フェスののぼり旗
  | 'palm' // ヤシの木
  | 'bench' // ベンチ
  | 'tent' // 運営テント
  | 'speaker'; // 野外スピーカー

export interface Decoration {
  kind: DecorationKind;
  x: number;
  y: number;
}

export const decorations: Decoration[] = [
  // ビーチのヤシの木
  { kind: 'palm', x: 40 * S, y: 128 * S },
  { kind: 'palm', x: 230 * S, y: 120 * S },
  { kind: 'palm', x: 270 * S, y: 150 * S },
  // エントランス前ののぼり旗
  { kind: 'flag', x: 356 * S, y: 440 * S },
  { kind: 'flag', x: 432 * S, y: 440 * S },
  { kind: 'flag', x: 264 * S, y: 726 * S },
  { kind: 'flag', x: 312 * S, y: 726 * S },
  // 駅前大通りの旗
  { kind: 'flag', x: 252 * S, y: 900 * S },
  { kind: 'flag', x: 284 * S, y: 940 * S },
  // 広場のベンチ
  { kind: 'bench', x: 200 * S, y: 470 * S },
  { kind: 'bench', x: 540 * S, y: 470 * S },
  { kind: 'bench', x: 130 * S, y: 760 * S },
  { kind: 'bench', x: 500 * S, y: 760 * S },
  // 運営テント
  { kind: 'tent', x: 560 * S, y: 372 * S },
  { kind: 'tent', x: 96 * S, y: 340 * S },
  // ビーチステージ横の野外スピーカー
  { kind: 'speaker', x: 52 * S, y: 118 * S },
  { kind: 'speaker', x: 188 * S, y: 118 * S },
];
