/**
 * 混雑ヒートマップの描画。
 * CrowdGrid の各セルを、人数に応じた色（黄→橙→赤）の半透明矩形で塗る。
 * 危険水準（13人以上/24pxセル）のセルはゆっくり点滅させて目立たせる。
 */

import { Container, Graphics } from 'pixi.js';
import type { CrowdGrid } from '../simulation/CrowdGrid';

export class HeatmapRenderer {
  readonly container = new Container();
  private readonly graphics = new Graphics();
  private pulse = 0;

  constructor(private readonly grid: CrowdGrid) {
    this.container.addChild(this.graphics);
  }

  update(dtSeconds: number): void {
    this.pulse += dtSeconds * 3;
    const g = this.graphics;
    const { grid } = this;
    const cs = grid.cellSize;

    g.clear();
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        const count = grid.counts[row * grid.cols + col];
        if (count < 3) continue; // 空いているセルは塗らない

        let color: number;
        let alpha: number;
        if (count >= 13) {
          // 危険水準: 赤 + 点滅
          color = 0xff1744;
          alpha = 0.42 + Math.sin(this.pulse) * 0.12;
        } else if (count >= 7) {
          // 混雑: 橙〜赤へ補間
          const t = (count - 7) / 6;
          color = lerpColor(0xff7043, 0xff1744, t);
          alpha = 0.26 + t * 0.14;
        } else {
          // やや混雑: 黄〜橙へ補間
          const t = (count - 3) / 4;
          color = lerpColor(0xffc107, 0xff7043, t);
          alpha = 0.14 + t * 0.12;
        }
        g.rect(col * cs, row * cs, cs, cs).fill({ color, alpha });
      }
    }
  }
}

/** 2色を t (0-1) で線形補間する */
function lerpColor(from: number, to: number, t: number): number {
  const tt = Math.min(1, Math.max(0, t));
  const r1 = (from >> 16) & 0xff;
  const g1 = (from >> 8) & 0xff;
  const b1 = from & 0xff;
  const r2 = (to >> 16) & 0xff;
  const g2 = (to >> 8) & 0xff;
  const b2 = to & 0xff;
  const r = Math.round(r1 + (r2 - r1) * tt);
  const g = Math.round(g1 + (g2 - g1) * tt);
  const b = Math.round(b1 + (b2 - b1) * tt);
  return (r << 16) | (g << 8) | b;
}
