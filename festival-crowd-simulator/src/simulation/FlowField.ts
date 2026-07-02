/**
 * フローフィールド経路探索。
 * 目的地1つにつき、全歩行可能タイルからの歩行距離（Dijkstra）と
 * 「次に進むべき方向」を事前計算しておく。
 * エージェントは自分のいるタイルの方向ベクトルに従うだけで、
 * 建物や水域を迂回して目的地へたどり着ける。
 */

import { TileMap, TILE, COLS, ROWS } from '../map/TileMap';

const ORTHO_COST = 10;
const DIAG_COST = 14;
const DIRS: Array<[number, number, number]> = [
  [1, 0, ORTHO_COST],
  [-1, 0, ORTHO_COST],
  [0, 1, ORTHO_COST],
  [0, -1, ORTHO_COST],
  [1, 1, DIAG_COST],
  [1, -1, DIAG_COST],
  [-1, 1, DIAG_COST],
  [-1, -1, DIAG_COST],
];

/** シンプルな数値の最小ヒープ（cost * 2^17 + index でパック） */
class MinHeap {
  private data: number[] = [];

  push(v: number): void {
    const d = this.data;
    d.push(v);
    let i = d.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (d[p] <= d[i]) break;
      [d[p], d[i]] = [d[i], d[p]];
      i = p;
    }
  }

  pop(): number | undefined {
    const d = this.data;
    if (d.length === 0) return undefined;
    const top = d[0];
    const last = d.pop()!;
    if (d.length > 0) {
      d[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < d.length && d[l] < d[m]) m = l;
        if (r < d.length && d[r] < d[m]) m = r;
        if (m === i) break;
        [d[m], d[i]] = [d[i], d[m]];
        i = m;
      }
    }
    return top;
  }

  get size(): number {
    return this.data.length;
  }
}

const PACK_SHIFT = 17; // COLS*ROWS = 11760 < 2^17

export class FlowField {
  /** 各タイルの目的地までのコスト（ORTHO_COST = 1タイル分） */
  private readonly dist: Float32Array;
  /** 各タイルの進行方向（-1/0/1） */
  private readonly dirX: Int8Array;
  private readonly dirY: Int8Array;

  constructor(map: TileMap, targetXPx: number, targetYPx: number) {
    const n = COLS * ROWS;
    this.dist = new Float32Array(n).fill(Infinity);
    this.dirX = new Int8Array(n);
    this.dirY = new Int8Array(n);

    // 目的地が歩行不可タイルなら近くの歩行可能タイルへスナップ
    const target = map.findNearestWalkable(targetXPx, targetYPx);
    const tc = Math.floor(target.x / TILE);
    const tr = Math.floor(target.y / TILE);

    // ---- Dijkstra（目的地から全タイルへ逆向きに展開） ----
    const heap = new MinHeap();
    const startIdx = tr * COLS + tc;
    this.dist[startIdx] = 0;
    heap.push(startIdx); // cost 0 なので index そのまま

    while (heap.size > 0) {
      const packed = heap.pop()!;
      const cost = Math.floor(packed / (1 << PACK_SHIFT));
      const idx = packed % (1 << PACK_SHIFT);
      if (cost > this.dist[idx]) continue;
      const c = idx % COLS;
      const r = Math.floor(idx / COLS);

      for (const [dc, dr, moveCost] of DIRS) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
        if (!map.isWalkableTile(nc, nr)) continue;
        // 斜め移動は両隣が歩行可能な場合のみ（角のすり抜け防止）
        if (dc !== 0 && dr !== 0) {
          if (!map.isWalkableTile(c + dc, r) || !map.isWalkableTile(c, r + dr)) {
            continue;
          }
        }
        const nIdx = nr * COLS + nc;
        const nCost = cost + moveCost;
        if (nCost < this.dist[nIdx]) {
          this.dist[nIdx] = nCost;
          heap.push(nCost * (1 << PACK_SHIFT) + nIdx);
        }
      }
    }

    // ---- 各タイルの進行方向を事前計算（最小距離の隣接タイルへ） ----
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        if (!Number.isFinite(this.dist[idx])) continue;
        let best = this.dist[idx];
        let bx = 0;
        let by = 0;
        for (const [dc, dr] of DIRS) {
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
          if (dc !== 0 && dr !== 0) {
            if (!map.isWalkableTile(c + dc, r) || !map.isWalkableTile(c, r + dr)) {
              continue;
            }
          }
          const nd = this.dist[nr * COLS + nc];
          if (nd < best) {
            best = nd;
            bx = dc;
            by = dr;
          }
        }
        this.dirX[idx] = bx;
        this.dirY[idx] = by;
      }
    }
  }

  private indexOf(xPx: number, yPx: number): number {
    const c = Math.min(COLS - 1, Math.max(0, Math.floor(xPx / TILE)));
    const r = Math.min(ROWS - 1, Math.max(0, Math.floor(yPx / TILE)));
    return r * COLS + c;
  }

  /** 目的地までの歩行距離（px 換算） */
  distanceAt(xPx: number, yPx: number): number {
    const d = this.dist[this.indexOf(xPx, yPx)];
    return Number.isFinite(d) ? (d / ORTHO_COST) * TILE : Infinity;
  }

  /** 進行方向の単位ベクトル。目的地上または到達不能なら [0, 0] */
  directionAt(xPx: number, yPx: number): [number, number] {
    const idx = this.indexOf(xPx, yPx);
    const dx = this.dirX[idx];
    const dy = this.dirY[idx];
    if (dx === 0 && dy === 0) return [0, 0];
    const len = Math.hypot(dx, dy);
    return [dx / len, dy / len];
  }

  reachableFrom(xPx: number, yPx: number): boolean {
    return Number.isFinite(this.dist[this.indexOf(xPx, yPx)]);
  }
}
