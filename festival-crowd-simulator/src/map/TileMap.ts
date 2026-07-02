/**
 * ドット絵タイルマップ。
 * SUMMER SONIC 東京会場マップを 8px タイル（84 x 140）で再現する。
 * - 各タイルは TileType を持ち、歩行可否と2色のディザ配色が決まる
 * - paint() で PixiJS Graphics にタイルを描き込む（起動時に1回だけ）
 * - 歩行可否はフローフィールド（経路探索）と移動判定の両方で使う
 */

import { Graphics } from 'pixi.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../data/venues';
import { decorations } from '../data/decorations';
import type { Decoration } from '../data/decorations';

/**
 * タイルサイズ 32px（詳細スケール）。
 * レイアウトの論理グリッドは 84x140 のままなので、
 * 歩行可否・経路探索・レイアウト定義は以前と同一。
 */
export const TILE = 32;
export const COLS = WORLD_WIDTH / TILE; // 84
export const ROWS = WORLD_HEIGHT / TILE; // 140

export const enum T {
  DEEP_WATER,
  WATER,
  SAND,
  GRASS,
  TREE,
  PLAZA,
  ROUTE, // ピンクの順路（公式マップの導線）
  ROAD,
  CROSSWALK,
  CITY, // 場外の街区（進入不可）
  BUILDING,
  STATION,
  MESSE_WALL,
  MESSE_FLOOR,
  FOOD_FLOOR,
  TOILET_FLOOR,
  GOODS_FLOOR,
  STAND, // スタジアム外周スタンド
  SEAT, // スタジアム客席
  FIELD, // スタジアムフィールド
  DECK, // ステージ台
  STAGE_BEACH,
  FLOOR_PACIFIC,
  FLOOR_SPOTIFY,
  FLOOR_SONIC,
  FLOOR_MOUNTAIN,
}

/** タイルごとの2色（(x+y)が偶数/奇数でディザ） */
const PALETTE: Record<T, [number, number]> = {
  [T.DEEP_WATER]: [0x1b3f6e, 0x183963],
  [T.WATER]: [0x2b5d97, 0x27548a],
  [T.SAND]: [0xd9c489, 0xcfba7f],
  [T.GRASS]: [0x3f7a45, 0x3a7040],
  [T.TREE]: [0x27512e, 0x224829],
  [T.PLAZA]: [0x757c86, 0x6e747e],
  [T.ROUTE]: [0xa85977, 0x9e526f],
  [T.ROAD]: [0x4a4f57, 0x44494f],
  [T.CROSSWALK]: [0x9ba1a9, 0x4a4f57],
  [T.CITY]: [0x2c3138, 0x282c33],
  [T.BUILDING]: [0x616875, 0x5a6170],
  [T.STATION]: [0x6f6690, 0x665e85],
  [T.MESSE_WALL]: [0x3a414d, 0x353b46],
  [T.MESSE_FLOOR]: [0x31405c, 0x2d3b55],
  [T.FOOD_FLOOR]: [0x6a4426, 0x603d22],
  [T.TOILET_FLOOR]: [0x4a3f78, 0x43396d],
  [T.GOODS_FLOOR]: [0x6d3049, 0x632b42],
  [T.STAND]: [0x8f959d, 0x878d95],
  [T.SEAT]: [0x3465a8, 0x2f5d9a],
  [T.FIELD]: [0x3c8a50, 0x37804a],
  [T.DECK]: [0x23272f, 0x1f232a],
  [T.STAGE_BEACH]: [0xbd9b3e, 0xb08f36],
  [T.FLOOR_PACIFIC]: [0x54314a, 0x4d2c44],
  [T.FLOOR_SPOTIFY]: [0x24473a, 0x204034],
  [T.FLOOR_SONIC]: [0x54402a, 0x4d3a26],
  [T.FLOOR_MOUNTAIN]: [0x31503a, 0x2c4934],
};

const WALKABLE = new Set<T>([
  T.SAND,
  T.GRASS,
  T.PLAZA,
  T.ROUTE,
  T.ROAD,
  T.CROSSWALK,
  T.MESSE_FLOOR,
  T.FOOD_FLOOR,
  T.TOILET_FLOOR,
  T.GOODS_FLOOR,
  T.FIELD,
  T.FLOOR_PACIFIC,
  T.FLOOR_SPOTIFY,
  T.FLOOR_SONIC,
  T.FLOOR_MOUNTAIN,
]);

/**
 * 地形の歩行コスト係数（10 = 標準）。
 * 経路探索はこの係数を掛けたコストで最短経路を選ぶため、
 * 観客は順路（ピンク）や広場・横断歩道を通り、
 * 芝生や車道のショートカットはほとんどしなくなる。
 */
const TERRAIN_COST: Partial<Record<T, number>> = {
  [T.ROUTE]: 9, // 順路: わずかに優先
  [T.CROSSWALK]: 10,
  [T.PLAZA]: 10,
  [T.MESSE_FLOOR]: 10,
  [T.FOOD_FLOOR]: 10,
  [T.TOILET_FLOOR]: 10,
  [T.GOODS_FLOOR]: 10,
  [T.FLOOR_PACIFIC]: 10,
  [T.FLOOR_SPOTIFY]: 10,
  [T.FLOOR_SONIC]: 10,
  [T.FLOOR_MOUNTAIN]: 10,
  [T.FIELD]: 12,
  [T.SAND]: 16, // 砂浜: 歩きにくい
  [T.GRASS]: 45, // 芝生: 立入はできるが避ける
  [T.ROAD]: 70, // 車道: 横断歩道以外はほぼ渡らない
};

/** スタジアムの中心とサイズ（px） */
const STADIUM_CX = 392;
const STADIUM_CY = 277;

export class TileMap {
  readonly tiles = new Uint8Array(COLS * ROWS);

  constructor() {
    this.build();
  }

  // ------------------------------------------------------------------
  // 参照
  // ------------------------------------------------------------------

  typeAt(col: number, row: number): T {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return T.CITY;
    return this.tiles[row * COLS + col] as T;
  }

  isWalkableTile(col: number, row: number): boolean {
    return WALKABLE.has(this.typeAt(col, row));
  }

  isWalkable(xPx: number, yPx: number): boolean {
    return this.isWalkableTile(Math.floor(xPx / TILE), Math.floor(yPx / TILE));
  }

  /** タイルの歩行コスト係数（10 = 標準。歩行不可なら Infinity） */
  costFactorTile(col: number, row: number): number {
    const t = this.typeAt(col, row);
    if (!WALKABLE.has(t)) return Infinity;
    return TERRAIN_COST[t] ?? 10;
  }

  /** 指定座標に最も近い歩行可能タイルの中心座標を返す */
  findNearestWalkable(xPx: number, yPx: number): { x: number; y: number } {
    const c0 = Math.floor(xPx / TILE);
    const r0 = Math.floor(yPx / TILE);
    if (this.isWalkableTile(c0, r0)) return { x: xPx, y: yPx };
    for (let radius = 1; radius < 24; radius++) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
          if (this.isWalkableTile(c0 + dc, r0 + dr)) {
            return { x: (c0 + dc) * TILE + TILE / 2, y: (r0 + dr) * TILE + TILE / 2 };
          }
        }
      }
    }
    return { x: xPx, y: yPx };
  }

  // ------------------------------------------------------------------
  // マップ構築
  // ------------------------------------------------------------------

  private set(col: number, row: number, t: T): void {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
    this.tiles[row * COLS + col] = t;
  }

  private fill(col: number, row: number, w: number, h: number, t: T): void {
    for (let r = row; r < row + h; r++) {
      for (let c = col; c < col + w; c++) this.set(c, r, t);
    }
  }

  private build(): void {
    // ---- ベース: 北側は緑地、南側は街区 ----
    this.fill(0, 0, COLS, 100, T.GRASS);
    this.fill(0, 100, COLS, ROWS - 100, T.CITY);

    // ---- 海（上端）と運河（右端上部） ----
    this.fill(0, 0, COLS, 7, T.DEEP_WATER);
    this.fill(0, 7, COLS, 3, T.WATER);
    this.fill(76, 0, 8, 53, T.WATER);
    this.fill(80, 0, 4, 53, T.DEEP_WATER);

    // ---- ビーチ（左上の砂浜） ----
    this.fill(0, 10, 41, 12, T.SAND);
    this.fill(41, 10, 35, 2, T.SAND); // 海沿いの砂の縁
    // BEACH STAGE（ステージ台 + 手前が客席の砂浜）
    this.fill(8, 12, 14, 3, T.STAGE_BEACH);

    // ---- ZOZOマリンスタジアム ----
    this.buildStadium();

    // ---- サブエントランスからの通路（左側）とビーチへの順路 ----
    this.fill(11, 36, 6, 20, T.PLAZA);
    this.fill(11, 22, 6, 14, T.PLAZA); // ビーチへ北上する順路
    this.fill(13, 34, 2, 20, T.ROUTE);
    this.fill(13, 22, 2, 12, T.ROUTE);
    this.fill(17, 20, 8, 2, T.SAND); // 砂浜への取り付き

    // ---- スタジアム前広場（エントランス帯） ----
    this.fill(8, 50, 64, 6, T.PLAZA);

    // ---- 湾岸道路 + 横断歩道 ----
    this.fill(0, 56, COLS, 4, T.ROAD);
    this.fill(47, 56, 5, 4, T.CROSSWALK);
    this.fill(12, 56, 5, 4, T.CROSSWALK);

    // ---- 道路南側の歩道帯 ----
    this.fill(0, 60, COLS, 5, T.PLAZA);

    // ---- 幕張メッセ ----
    this.buildMesse();

    // ---- メッセ東西の外周通路 ----
    this.fill(4, 60, 4, 40, T.PLAZA); // 西側
    this.fill(72, 60, 4, 40, T.PLAZA); // 東側
    this.fill(76, 53, 8, 47, T.GRASS); // 運河跡地の緑地

    // ---- メッセ南広場 ----
    this.fill(4, 89, 72, 11, T.PLAZA);
    this.fill(33, 89, 5, 11, T.ROUTE); // 中央ゲートからの順路
    this.fill(59, 89, 5, 11, T.ROUTE); // 東ゲートからの順路

    // ---- 駅前大通り（ペデストリアンデッキ） ----
    this.fill(30, 100, 8, 34, T.PLAZA);
    this.fill(32, 100, 4, 34, T.ROUTE);

    // ---- ホール9（GOODS）と東側広場 ----
    this.fill(38, 104, 32, 18, T.PLAZA);
    this.fill(42, 106, 24, 7, T.BUILDING); // ホール9建物
    this.fill(42, 113, 24, 7, T.GOODS_FLOOR); // 物販の前庭

    // ---- 海浜幕張駅 ----
    this.fill(22, 130, 27, 4, T.PLAZA); // 駅前広場（退場の吐き出し口なので広め）
    this.fill(18, 134, 48, 6, T.STATION);
    this.fill(26, 134, 16, 2, T.ROUTE); // 改札への入り口

    // ---- 並木（緑地に点在、歩行不可） ----
    this.scatterTrees();
  }

  private buildStadium(): void {
    for (let row = 15; row < 55; row++) {
      for (let col = 30; col < 70; col++) {
        const px = col * TILE + TILE / 2;
        const py = row * TILE + TILE / 2;
        const r = Math.hypot(px - STADIUM_CX, py - STADIUM_CY);
        if (r >= 124) continue;
        // 南側ゲート（フィールドへの入場口）
        const inGate = col >= 47 && col <= 51 && py > STADIUM_CY;
        if (r < 78) this.set(col, row, T.FIELD);
        else if (r < 92) this.set(col, row, inGate ? T.PLAZA : T.SEAT);
        else if (r < 110) this.set(col, row, inGate ? T.PLAZA : T.STAND);
        else this.set(col, row, T.PLAZA); // 外周の広場リング
      }
    }
    // MARINE STAGE のステージ台（フィールド北側）
    this.fill(44, 26, 10, 3, T.DECK);
  }

  private buildMesse(): void {
    // 外壁と床
    this.fill(8, 65, 64, 24, T.MESSE_WALL);
    this.fill(9, 66, 62, 22, T.MESSE_FLOOR);

    // ホール床（客席ゾーン、歩行可）
    this.fill(9, 66, 8, 22, T.FLOOR_PACIFIC); // Hall 8
    this.fill(18, 66, 8, 22, T.FLOOR_SPOTIFY); // Hall 7
    this.fill(43, 66, 8, 22, T.FLOOR_SONIC); // Hall 4
    this.fill(52, 66, 19, 22, T.FLOOR_MOUNTAIN); // Hall 1-3（横使い）

    // ホール間の間仕切り壁（北側から途中まで。南側は開放）
    for (const wallCol of [17, 26, 42, 51]) {
      this.fill(wallCol, 66, 1, 11, T.MESSE_WALL);
    }

    // 各ステージのステージ台
    this.fill(10, 66, 6, 3, T.DECK); // PACIFIC（北端）
    this.fill(19, 66, 6, 3, T.DECK); // Spotify（北端）
    this.fill(44, 66, 6, 3, T.DECK); // SONIC（北端）
    // MOUNTAIN はホールを横に使う: ステージ台は左（西）端の縦置きで、
    // 観客は東側からステージ（西向き）を観る
    this.fill(52, 68, 2, 17, T.DECK);

    // FOOD AREA（Hall 5-6）: 屋台の列で歩行不可タイルを点在させる
    this.fill(27, 74, 16, 11, T.FOOD_FLOOR);
    for (const stallRow of [77, 81]) {
      for (let c = 29; c <= 41; c += 3) this.set(c, stallRow, T.BUILDING);
    }

    // TOILET（Hall 5-6 の北壁沿い）
    this.fill(28, 66, 6, 6, T.TOILET_FLOOR);

    // 南壁のゲート2箇所（中央ゲート・東ゲート）
    this.fill(33, 88, 5, 1, T.MESSE_FLOOR);
    this.fill(59, 88, 5, 1, T.MESSE_FLOOR);

    // スタジアム側トイレ（エントランス広場の東）
    this.fill(58, 50, 7, 4, T.TOILET_FLOOR);
  }

  private scatterTrees(): void {
    for (let row = 11; row < 100; row++) {
      for (let col = 0; col < COLS; col++) {
        if (this.typeAt(col, row) !== T.GRASS) continue;
        // 決定的な擬似乱数で並木を散らす
        const h = (col * 73856093) ^ (row * 19349663);
        const v = (h >>> 8) % 100;
        const dense = col >= 76 || row < 24; // 海沿いと運河跡は木を濃く
        if (v < (dense ? 22 : 7)) this.set(col, row, T.TREE);
      }
    }
  }

  // ------------------------------------------------------------------
  // 描画
  // ------------------------------------------------------------------

  /** タイル全体と装飾ピクセルを Graphics に描く（起動時に1回） */
  paint(g: Graphics): void {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const t = this.typeAt(col, row);
        const [even, odd] = PALETTE[t];
        const x = col * TILE;
        const y = row * TILE;
        g.rect(x, y, TILE, TILE).fill(even);

        // 8pxテクセルのディザ（決定的な擬似乱数で濃淡を散らす）
        const h = ((col * 73856093) ^ (row * 19349663)) >>> 0;
        for (let k = 0; k < 4; k++) {
          if (((h >> (k * 7)) & 3) !== 0) continue;
          const tx = (h >> (k * 7 + 2)) & 3;
          const ty = (h >> (k * 7 + 4)) & 3;
          g.rect(x + tx * 8, y + ty * 8, 8, 8).fill(odd);
        }

        // タイル種類ごとの描き込み
        if (t === T.CROSSWALK && col % 2 === 0) {
          g.rect(x + 8, y, 16, TILE).fill(0xd8d8d8);
        }
        if (t === T.TREE) {
          // 32pxタイルいっぱいの木（幹 + こんもりした樹冠）
          g.rect(x + 13, y + 20, 6, 10).fill(0x4a3220);
          g.rect(x + 4, y + 4, 24, 18).fill(odd);
          g.rect(x + 8, y + 1, 16, 4).fill(odd);
          g.rect(x + 7, y + 7, 8, 6).fill(lighten(odd));
        }
        if (t === T.SEAT && (col + row) % 2 === 0) {
          g.rect(x + 4, y + 4, 8, 8).fill(0x4d7fc0);
          g.rect(x + 20, y + 18, 8, 8).fill(0x4d7fc0);
        }
        if (t === T.CITY && (col * 7 + row * 13) % 11 === 0) {
          g.rect(x + 8, y + 8, 12, 12).fill(0x3a404a);
        }
        if (t === T.BUILDING && row % 2 === 0 && col % 2 === 0) {
          g.rect(x + 8, y + 12, 16, 8).fill(0x77808f);
        }
        if (t === T.STATION && row % 2 === 1 && col % 3 === 0) {
          g.rect(x + 8, y + 8, 16, 12).fill(0x8d84b3);
        }
      }
    }

    // ---- 道路の車線ダッシュ ----
    for (let c = 0; c < COLS; c += 3) {
      g.rect(c * TILE, 58 * TILE - 4, 48, 8).fill(0x9ba1a9);
    }

    // ---- ステージ台の前縁ライト（アクセントカラー） ----
    const edges: Array<{ x: number; y: number; w: number; h: number; c: number }> = [
      { x: 44 * TILE, y: 29 * TILE - 8, w: 10 * TILE, h: 8, c: 0x35b8c9 }, // MARINE
      { x: 8 * TILE, y: 15 * TILE - 8, w: 14 * TILE, h: 8, c: 0xd4af37 }, // BEACH
      { x: 10 * TILE, y: 69 * TILE - 8, w: 6 * TILE, h: 8, c: 0xe4739e }, // PACIFIC
      { x: 19 * TILE, y: 69 * TILE - 8, w: 6 * TILE, h: 8, c: 0x1db954 }, // Spotify
      { x: 44 * TILE, y: 69 * TILE - 8, w: 6 * TILE, h: 8, c: 0xe08a3c }, // SONIC
      { x: 54 * TILE - 8, y: 68 * TILE, w: 8, h: 17 * TILE, c: 0x69c25e }, // MOUNTAIN（縦・東向きの前縁）
    ];
    for (const e of edges) {
      g.rect(e.x, e.y, e.w, e.h).fill(e.c);
    }

    // ---- ゲートのアーチ（入口の目印） ----
    const gates: Array<[number, number]> = [
      [47, 54], // スタジアム ENTRANCE
      [12, 36], // SUB ENTRANCE
      [33, 88], // メッセ中央ゲート
      [59, 88], // メッセ東ゲート
    ];
    for (const [gc, gr] of gates) {
      g.rect(gc * TILE - 8, gr * TILE - 16, 8, 40).fill(0x14161c);
      g.rect(gc * TILE + 5 * TILE, gr * TILE - 16, 8, 40).fill(0x14161c);
      g.rect(gc * TILE - 8, gr * TILE - 16, 5 * TILE + 16, 12).fill(0x14161c);
    }

    // ---- 配置データ駆動の装飾（data/decorations.ts で追加できる） ----
    for (const d of decorations) {
      this.paintDecoration(g, d);
    }
  }

  /** 装飾1つ分の描画。新しい種類は case を1つ足すだけで追加できる */
  private paintDecoration(g: Graphics, d: Decoration): void {
    const { x, y } = d;
    switch (d.kind) {
      case 'palm':
        g.rect(x - 3, y - 6, 6, 22).fill(0x7a5a30); // 幹
        g.rect(x - 16, y - 14, 32, 8).fill(0x3f8a45); // 葉（横）
        g.rect(x - 6, y - 22, 12, 18).fill(0x46994c); // 葉（縦）
        g.rect(x - 12, y - 20, 8, 6).fill(0x57a854);
        g.rect(x + 5, y - 20, 8, 6).fill(0x57a854);
        break;
      case 'flag':
        g.rect(x - 2, y - 26, 4, 30).fill(0x8a8f98); // ポール
        g.rect(x + 2, y - 26, 14, 10).fill(0xe4739e); // 旗
        g.rect(x + 2, y - 16, 10, 4).fill(0xc25a80);
        break;
      case 'bench':
        g.rect(x - 14, y - 4, 28, 8).fill(0x8a6a3a);
        g.rect(x - 12, y + 4, 4, 6).fill(0x5d4526);
        g.rect(x + 8, y + 4, 4, 6).fill(0x5d4526);
        break;
      case 'tent':
        g.rect(x - 18, y - 10, 36, 20).fill(0xf0f0e8); // 屋根
        g.rect(x - 18, y - 10, 36, 4).fill(0xd8d8cc);
        g.rect(x - 16, y + 10, 4, 6).fill(0x6a6a60); // 脚
        g.rect(x + 12, y + 10, 4, 6).fill(0x6a6a60);
        break;
      case 'speaker':
        g.rect(x - 6, y - 18, 12, 24).fill(0x22262e);
        g.rect(x - 3, y - 14, 6, 6).fill(0x3a4150); // ウーファー
        g.rect(x - 3, y - 4, 6, 6).fill(0x3a4150);
        break;
    }
  }
}

/** 色を少し明るくする（樹冠のハイライト用） */
function lighten(color: number): number {
  const r = Math.min(255, Math.floor(((color >> 16) & 0xff) * 1.25));
  const gg = Math.min(255, Math.floor(((color >> 8) & 0xff) * 1.25));
  const b = Math.min(255, Math.floor((color & 0xff) * 1.25));
  return (r << 16) | (gg << 8) | b;
}
