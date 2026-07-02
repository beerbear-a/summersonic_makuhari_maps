/**
 * 仮のタイムテーブルデータ。
 * 時刻は内部的に「0時からの分」で管理する（12:00 = 720）。
 */

export interface Act {
  id: string;
  stageId: string;
  artist: string;
  /** 開演（分） */
  start: number;
  /** 終演（分） */
  end: number;
  /** 人気度 0-100 */
  popularity: number;
}

/** 開場時刻 11:30 */
export const DAY_START = 690;
/** 閉場時刻 16:30（これ以降は全員 EXIT へ向かう） */
export const DAY_END = 990;

export const acts: Act[] = [
  {
    id: 'act_rock_a',
    stageId: 'mountain_stage',
    artist: 'ROCK BAND A',
    start: 720, // 12:00
    end: 765, // 12:45
    popularity: 80,
  },
  {
    id: 'act_electro_b',
    stageId: 'sonic_stage',
    artist: 'ELECTRO ACT B',
    start: 735, // 12:15
    end: 780, // 13:00
    popularity: 70,
  },
  {
    id: 'act_idol_c',
    stageId: 'pacific_stage',
    artist: 'IDOL GROUP C',
    start: 780, // 13:00
    end: 825, // 13:45
    popularity: 90,
  },
  {
    id: 'act_headliner_d',
    stageId: 'mountain_stage',
    artist: 'HEADLINER D',
    start: 840, // 14:00
    end: 900, // 15:00
    popularity: 100,
  },
  {
    id: 'act_dance_e',
    stageId: 'sonic_stage',
    artist: 'DANCE ACT E',
    start: 910, // 15:10
    end: 960, // 16:00
    popularity: 85,
  },
];
