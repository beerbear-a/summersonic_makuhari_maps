/**
 * 混雑グリッド。
 * マップ全体を cellSize(96px = 3タイル) のグリッドに分割し、
 * 各セル内の観客数をカウントする。
 * ヒートマップ描画と、混雑による移動速度低下の両方で使う。
 *
 * 混雑レベルの基準（96pxセル = 会場比で旧24pxセルと同一。
 * 仕様書の 40pxセル基準「0-4 / 5-14 / 15-29 / 30+」を面積比で換算したもの）:
 *   0-2人  : 空いている  (level 0)
 *   3-6人  : やや混雑    (level 1)
 *   7-12人 : 混雑        (level 2)
 *   13人以上: 危険水準    (level 3)
 */

export class CrowdGrid {
  readonly cols: number;
  readonly rows: number;
  readonly counts: Int32Array;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly cellSize = 96,
  ) {
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.counts = new Int32Array(this.cols * this.rows);
  }

  clear(): void {
    this.counts.fill(0);
  }

  private cellIndex(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellSize)));
    return cy * this.cols + cx;
  }

  /** 座標 (x, y) にいる観客を1人カウントする */
  add(x: number, y: number): void {
    this.counts[this.cellIndex(x, y)]++;
  }

  /** 座標 (x, y) が属するセルの観客数 */
  countAt(x: number, y: number): number {
    return this.counts[this.cellIndex(x, y)];
  }

  /** 混雑レベル 0(空き) / 1(やや混雑) / 2(混雑) / 3(危険水準) */
  levelAt(x: number, y: number): 0 | 1 | 2 | 3 {
    return CrowdGrid.levelOf(this.countAt(x, y));
  }

  static levelOf(count: number): 0 | 1 | 2 | 3 {
    if (count >= 13) return 3;
    if (count >= 7) return 2;
    if (count >= 3) return 1;
    return 0;
  }

  /** 混雑による移動速度の倍率（1.0 = 通常速度） */
  speedFactorAt(x: number, y: number): number {
    switch (CrowdGrid.levelOf(this.countAt(x, y))) {
      case 3:
        return 0.25; // 危険水準: ほぼ動けない
      case 2:
        return 0.45; // 混雑
      case 1:
        return 0.75; // やや混雑
      default:
        return 1.0;
    }
  }

  /** 座標 (x, y) を中心に radiusCells セル分の合計人数（イベント検知用） */
  countAround(x: number, y: number, radiusCells: number): number {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    let total = 0;
    for (let gy = cy - radiusCells; gy <= cy + radiusCells; gy++) {
      if (gy < 0 || gy >= this.rows) continue;
      for (let gx = cx - radiusCells; gx <= cx + radiusCells; gx++) {
        if (gx < 0 || gx >= this.cols) continue;
        total += this.counts[gy * this.cols + gx];
      }
    }
    return total;
  }
}
