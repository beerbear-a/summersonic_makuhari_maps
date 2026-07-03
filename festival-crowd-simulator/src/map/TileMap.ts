/**
 * ドット絵タイルマップ。
 * SUMMER SONIC 東京会場マップを 32px タイル（84 x 140 グリッド）で再現する。
 * - 各タイルは TileType を持ち、歩行可否と2色のディザ配色が決まる
 * - paint() で PixiJS Graphics にタイルを描き込む（起動時に1回だけ）
 * - 歩行可否はフローフィールド（経路探索）と移動判定の両方で使う
 * - ステージ（ZOZOマリンスタジアムのスタンドや各ホールのステージ台など）や
 *   FOOD AREA の屋台は、タイル種別に加えて stageRigs / FOOD_STALL_* を使った
 *   paint() 側の追加描画（バックドロップ・PAタワー・庇）で作り込んでいる
 */

import { Graphics } from 'pixi.js';
import { WORLD_WIDTH, WORLD_HEIGHT, WORLD_SCALE } from '../data/venues';
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
  FOOD_STALL, // 飲食屋台（障害物。見た目は paint() 側で個別に描く）
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
  [T.FOOD_STALL]: [0x3a2818, 0x33220f],
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

/**
 * スタジアムの中心とリング半径（ワールドpx）。
 * 論理レイアウト(672x1120)上の値に WORLD_SCALE を掛けて実座標にしている。
 * ここを変え忘れるとスタジアムが描画されない（実際に起きた不具合）ので注意。
 */
const STADIUM_CX = 392 * WORLD_SCALE;
const STADIUM_CY = 277 * WORLD_SCALE;
const STADIUM_FIELD_R = 78 * WORLD_SCALE;
const STADIUM_SEAT_R = 92 * WORLD_SCALE;
const STADIUM_STAND_R = 110 * WORLD_SCALE;
const STADIUM_OUTER_R = 124 * WORLD_SCALE;

/** FOOD AREA の屋台配置（build() と paint() の両方から参照） */
const FOOD_STALL_COLS = [28, 31, 34, 37, 40];
const FOOD_STALL_ROWS = [75, 83];

/** ステージ構造物（バックドロップ・PAタワー）の描画情報 */
interface StageRig {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 客席がある方向 */
  facing: 'south' | 'east';
  color: number;
}

export class TileMap {
  readonly tiles = new Uint8Array(COLS * ROWS);
  /** 各ステージの構造物描画データ（build 中に集める） */
  private readonly stageRigs: StageRig[] = [];

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
    this.stageRigs.push({
      x: 8 * TILE,
      y: 12 * TILE,
      w: 14 * TILE,
      h: 3 * TILE,
      facing: 'south',
      color: 0xd4af37,
    });

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
        if (r >= STADIUM_OUTER_R) continue;
        // 南側ゲート（フィールドへの入場口）
        const inGate = col >= 47 && col <= 51 && py > STADIUM_CY;
        if (r < STADIUM_FIELD_R) this.set(col, row, T.FIELD);
        else if (r < STADIUM_SEAT_R) this.set(col, row, inGate ? T.PLAZA : T.SEAT);
        else if (r < STADIUM_STAND_R) this.set(col, row, inGate ? T.PLAZA : T.STAND);
        else this.set(col, row, T.PLAZA); // 外周の広場リング
      }
    }
    // MARINE STAGE のステージ台（フィールド北側）
    this.fill(44, 26, 10, 3, T.DECK);
    this.stageRigs.push({
      x: 44 * TILE,
      y: 26 * TILE,
      w: 10 * TILE,
      h: 3 * TILE,
      facing: 'south',
      color: 0x35b8c9,
    });
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

    // 各ステージのステージ台（北端。バックドロップ・PAタワーは paint() で描く）
    this.fill(10, 66, 6, 3, T.DECK); // PACIFIC
    this.stageRigs.push({ x: 10 * TILE, y: 66 * TILE, w: 6 * TILE, h: 3 * TILE, facing: 'south', color: 0xe4739e });
    this.fill(19, 66, 6, 3, T.DECK); // Spotify
    this.stageRigs.push({ x: 19 * TILE, y: 66 * TILE, w: 6 * TILE, h: 3 * TILE, facing: 'south', color: 0x1db954 });
    this.fill(44, 66, 6, 3, T.DECK); // SONIC
    this.stageRigs.push({ x: 44 * TILE, y: 66 * TILE, w: 6 * TILE, h: 3 * TILE, facing: 'south', color: 0xe08a3c });
    // MOUNTAIN はホールを横に使う: ステージ台は左（西）端の縦置きで、
    // 観客は東側からステージ（西向き）を観る
    this.fill(52, 68, 2, 17, T.DECK);
    this.stageRigs.push({ x: 52 * TILE, y: 68 * TILE, w: 2 * TILE, h: 17 * TILE, facing: 'east', color: 0x69c25e });

    // FOOD AREA（Hall 5-6）: 南北2列の屋台 + 中央に飲食スペース
    this.fill(27, 74, 16, 11, T.FOOD_FLOOR);
    for (const col of FOOD_STALL_COLS) {
      this.fill(col, FOOD_STALL_ROWS[0], 2, 1, T.FOOD_STALL);
      this.fill(col, FOOD_STALL_ROWS[1], 2, 1, T.FOOD_STALL);
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
        if (t === T.STAND) {
          // スタンド外周に屋根のシルエットを入れて建物らしさを出す
          const r = Math.hypot(x + TILE / 2 - STADIUM_CX, y + TILE / 2 - STADIUM_CY);
          if (r > STADIUM_STAND_R - TILE) {
            g.rect(x, y, TILE, 6).fill(0x272b33);
          }
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
        if (t === T.TOILET_FLOOR && col % 2 === 0) {
          // 個室の仕切り線
          g.rect(x, y + 6, 3, TILE - 12).fill(0x241f3d);
        }
      }
    }

    // ---- 道路の車線ダッシュ ----
    for (let c = 0; c < COLS; c += 3) {
      g.rect(c * TILE, 58 * TILE - 4, 48, 8).fill(0x9ba1a9);
    }

    // ---- ステージ構造物（バックドロップ・PAタワー・前縁ライト） ----
    for (const rig of this.stageRigs) {
      this.paintStageRig(g, rig);
    }

    // ---- FOOD AREA の屋台（庇の色をローテーションして描く） ----
    this.paintFoodStalls(g);

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

  /**
   * ステージ1つぶんの構造物を描く: 前縁ライト（客席側）・バックドロップ
   * （大型スクリーン風の背面パネル）・両脇の PA タワー。
   */
  private paintStageRig(g: Graphics, rig: StageRig): void {
    const { x, y, w, h, facing, color } = rig;
    const dark = 0x14161c;
    const screen = 0x1c2128;

    if (facing === 'south') {
      // 前縁ライト（客席に面した下端）
      g.rect(x, y + h - 6, w, 6).fill(color);
      // バックドロップ（ステージ背後の大型スクリーン/トラス）
      const bw = w * 0.72;
      const bx = x + (w - bw) / 2;
      const bh = TILE * 2.1;
      g.rect(bx, y - bh, bw, bh).fill(dark);
      g.rect(bx, y - bh, bw, 6).fill(color);
      g.rect(bx + 6, y - bh + 12, bw - 12, bh - 22).fill(screen);
      // 左右の PA タワー
      const tw = TILE * 0.5;
      const th = h + TILE * 0.6;
      g.rect(x - tw - 4, y - TILE * 0.6, tw, th).fill(0x1a1d23);
      g.rect(x + w + 4, y - TILE * 0.6, tw, th).fill(0x1a1d23);
      g.rect(x - tw - 4, y - TILE * 0.6, tw, 5).fill(color);
      g.rect(x + w + 4, y - TILE * 0.6, tw, 5).fill(color);
    } else {
      // facing === 'east'（MOUNTAIN STAGE: 西端のステージ、客席は東側）
      g.rect(x + w - 6, y, 6, h).fill(color);
      const bh = h * 0.65;
      const by = y + (h - bh) / 2;
      const bw = TILE * 1.3;
      g.rect(x - bw, by, bw, bh).fill(dark);
      g.rect(x - bw, by, 6, bh).fill(color);
      g.rect(x - bw + 10, by + 6, bw - 16, bh - 12).fill(screen);
      const tw = TILE * 0.5;
      const twid = w + TILE * 0.6;
      g.rect(x - TILE * 0.6, y - tw - 4, twid, tw).fill(0x1a1d23);
      g.rect(x - TILE * 0.6, y + h + 4, twid, tw).fill(0x1a1d23);
      g.rect(x - TILE * 0.6, y - tw - 4, 5, tw).fill(color);
      g.rect(x - TILE * 0.6, y + h + 4, 5, tw).fill(color);
    }
  }

  /** FOOD AREA の屋台（庇 + カウンター）を色をローテーションして描く */
  private paintFoodStalls(g: Graphics): void {
    const awnings = [0xd94f3d, 0xe0a83c, 0x3f8a6a];
    let i = 0;
    for (const row of FOOD_STALL_ROWS) {
      for (const col of FOOD_STALL_COLS) {
        const x = col * TILE;
        const y = row * TILE;
        const w = 2 * TILE;
        const awning = awnings[i % awnings.length];
        i++;
        // 庇（縞模様）
        g.rect(x, y, w, 10).fill(awning);
        g.rect(x, y, 10, 10).fill(lighten(awning));
        g.rect(x + w - 10, y, 10, 10).fill(lighten(awning));
        // 屋台本体とカウンター
        g.rect(x, y + 10, w, TILE - 10).fill(0x2c1f13);
        g.rect(x + 4, y + 18, w - 8, 8).fill(0x6a4426);
      }
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
      case 'bunting': {
        // 三角旗のガーランド（紐 + 3色の三角旗）
        const buntingColors = [0xe4739e, 0xffd166, 0x4fc3f7];
        g.rect(x - 13, y - 1, 26, 1).fill(0x5a5a5a);
        for (let i = 0; i < 3; i++) {
          const px = x - 11 + i * 8;
          const c = buntingColors[i % buntingColors.length];
          g.poly([px, y, px + 6, y, px + 3, y + 7]).fill(c);
        }
        break;
      }
      case 'balloon': {
        // 風船クラスター（3色、ひも付き）
        const balloonColors = [0xe74c3c, 0xf1c40f, 0x4fc3f7];
        const offsets: Array<[number, number]> = [
          [-7, -18],
          [0, -24],
          [7, -18],
        ];
        offsets.forEach(([dx, dy], i) => {
          g.circle(x + dx, y + dy, 5).fill(balloonColors[i % balloonColors.length]);
          g.rect(x + dx, y + dy + 5, 1, -dy - 5).fill(0x333333); // ひも（風船からy地点まで）
        });
        break;
      }
      case 'barrier': {
        // 客席前のクラウドコントロールフェンス
        const white = 0xe8e8ec;
        const redBand = 0xd32f2f;
        if (d.orientation === 'v') {
          g.rect(x - 4, y - 13, 4, 26).fill(white);
          g.rect(x - 4, y - 13, 1, 26).fill(redBand);
          g.rect(x - 4, y - 3, 4, 6).fill(0x555a63); // 脚
        } else {
          g.rect(x - 13, y - 4, 26, 4).fill(white);
          g.rect(x - 13, y - 4, 26, 1).fill(redBand);
          g.rect(x - 3, y - 4, 6, 6).fill(0x555a63); // 脚
        }
        break;
      }
      case 'trash':
        g.rect(x - 5, y - 10, 10, 10).fill(0x2f6b3a);
        g.rect(x - 6, y - 11, 12, 2).fill(0x1f4a28); // 蓋
        g.rect(x - 3, y - 8, 1, 6).fill(0x1f4a28);
        g.rect(x + 2, y - 8, 1, 6).fill(0x1f4a28);
        break;
      case 'planter':
        g.rect(x - 7, y - 4, 14, 6).fill(0x5d4526); // 木箱
        g.rect(x - 7, y - 10, 14, 7).fill(0x3f8a45); // 葉
        g.rect(x - 3, y - 10, 2, 2).fill(0xe4739e); // 花
        g.rect(x + 2, y - 9, 2, 2).fill(0xffd166);
        break;
      case 'umbrella':
        g.rect(x - 1, y - 2, 2, 16).fill(0x8a5a30); // 軸
        g.poly([x - 13, y - 2, x + 13, y - 2, x, y - 17]).fill(0xe4739e);
        g.poly([x - 13, y - 2, x - 4, y - 2, x - 8.5, y - 13]).fill(0xffffff);
        g.poly([x + 4, y - 2, x + 13, y - 2, x + 8.5, y - 13]).fill(0xffffff);
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
