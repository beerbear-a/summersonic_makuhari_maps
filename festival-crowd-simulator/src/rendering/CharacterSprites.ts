/**
 * ドット絵キャラクターのテクスチャ生成。
 * 6x10ピクセルの人物を「前向き / 後ろ向き / 横向き」×「歩行2フレーム」で描き、
 * 起動時に一度だけテクスチャ化して全スプライトで使い回す。
 * 観客はシャツの色が状態（鑑賞中・食事中など）を表す。
 */

import { Graphics, Rectangle, Renderer, Texture } from 'pixi.js';

export interface PersonPalette {
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  /** true なら帽子（プレイヤー用の赤キャップなど）を被る */
  cap?: boolean;
  capColor?: number;
}

export type ViewKey = 'front' | 'back' | 'side';

/** 向きごとの歩行フレーム（[静止/歩行A, 歩行B]） */
export type PersonTextureSet = Record<ViewKey, [Texture, Texture]>;

const FRAME = new Rectangle(0, 0, 6, 10);
const EYE = 0x1c1c24;
const SHOE = 0x14141a;

function drawPerson(
  g: Graphics,
  p: PersonPalette,
  view: ViewKey,
  frame: 0 | 1,
): void {
  const hairColor = p.cap ? (p.capColor ?? 0xd32f2f) : p.hair;

  if (view === 'front') {
    g.rect(1, 0, 4, 2).fill(hairColor); // 髪 / 帽子
    if (p.cap) g.rect(0, 1, 6, 1).fill(darken(p.capColor ?? 0xd32f2f)); // つば
    g.rect(1, 2, 4, 2).fill(p.skin); // 顔
    g.rect(1, 3, 1, 1).fill(EYE); // 目
    g.rect(4, 3, 1, 1).fill(EYE);
    g.rect(0, 4, 6, 3).fill(p.shirt); // シャツ + 腕
    g.rect(1, 7, 2, 2).fill(p.pants); // ズボン
    g.rect(3, 7, 2, 2).fill(p.pants);
    if (frame === 0) {
      g.rect(1, 9, 2, 1).fill(SHOE);
      g.rect(3, 9, 2, 1).fill(SHOE);
    } else {
      g.rect(0, 9, 2, 1).fill(SHOE); // 歩行: 足を開く
      g.rect(4, 9, 2, 1).fill(SHOE);
    }
    return;
  }

  if (view === 'back') {
    g.rect(1, 0, 4, 4).fill(hairColor); // 後頭部（顔は見えない）
    if (p.cap) g.rect(1, 0, 4, 1).fill(darken(p.capColor ?? 0xd32f2f));
    g.rect(0, 4, 6, 3).fill(p.shirt);
    g.rect(1, 7, 2, 2).fill(p.pants);
    g.rect(3, 7, 2, 2).fill(p.pants);
    if (frame === 0) {
      g.rect(1, 9, 2, 1).fill(SHOE);
      g.rect(3, 9, 2, 1).fill(SHOE);
    } else {
      g.rect(0, 9, 2, 1).fill(SHOE);
      g.rect(4, 9, 2, 1).fill(SHOE);
    }
    return;
  }

  // side（右向き。左向きは scale.x = -1 で反転）
  g.rect(1, 0, 4, 2).fill(hairColor);
  if (p.cap) g.rect(3, 1, 3, 1).fill(darken(p.capColor ?? 0xd32f2f)); // 前方のつば
  g.rect(1, 2, 1, 2).fill(hairColor); // 後頭部の髪
  g.rect(2, 2, 3, 2).fill(p.skin);
  g.rect(4, 3, 1, 1).fill(EYE);
  g.rect(1, 4, 4, 3).fill(p.shirt);
  g.rect(2, 7, 2, 2).fill(p.pants);
  if (frame === 0) {
    g.rect(2, 9, 2, 1).fill(SHOE);
  } else {
    g.rect(1, 9, 1, 1).fill(SHOE); // 歩行: 前後に足を開く
    g.rect(4, 9, 1, 1).fill(SHOE);
  }
}

function darken(color: number): number {
  const r = Math.floor(((color >> 16) & 0xff) * 0.72);
  const g = Math.floor(((color >> 8) & 0xff) * 0.72);
  const b = Math.floor((color & 0xff) * 0.72);
  return (r << 16) | (g << 8) | b;
}

/** 1人分（3方向×2フレーム）のテクスチャセットを生成する */
export function makePersonSet(
  renderer: Renderer,
  palette: PersonPalette,
): PersonTextureSet {
  const make = (view: ViewKey, frame: 0 | 1): Texture => {
    const g = new Graphics();
    drawPerson(g, palette, view, frame);
    const tex = renderer.generateTexture({ target: g, frame: FRAME });
    g.destroy();
    return tex;
  };
  return {
    front: [make('front', 0), make('front', 1)],
    back: [make('back', 0), make('back', 1)],
    side: [make('side', 0), make('side', 1)],
  };
}

/** 観客の髪色バリエーション */
export const HAIR_COLORS = [0x2e2226, 0x5b3a24, 0x8a6a3a, 0x3a3d4d];

/** 観客のズボン色バリエーション */
export const PANTS_COLORS = [0x27334d, 0x3d3d43, 0x4a3648];

/** 肌色バリエーション */
export const SKIN_COLORS = [0xf3c89b, 0xe0b088, 0xc99870];
