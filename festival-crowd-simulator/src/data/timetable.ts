/**
 * 仮のタイムテーブルデータ。
 * 時刻は内部的に「0時からの分」で管理する（12:00 = 720）。
 * 6ステージ・15アクト。夜は MARINE STAGE で大トリ。
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

/** 開場時刻 11:00 */
export const DAY_START = 660;
/** 閉場時刻 21:30（これ以降は全員 EXIT へ向かう） */
export const DAY_END = 1290;

export const acts: Act[] = [
  { id: 'act_surf', stageId: 'beach_stage', artist: 'SUNRISE SURF', start: 690, end: 730, popularity: 55 }, // 11:30-12:10
  { id: 'act_rock_a', stageId: 'mountain_stage', artist: 'ROCK BAND A', start: 720, end: 765, popularity: 80 }, // 12:00-12:45
  { id: 'act_electro_b', stageId: 'sonic_stage', artist: 'ELECTRO ACT B', start: 735, end: 780, popularity: 70 }, // 12:15-13:00
  { id: 'act_newcomer', stageId: 'spotify_stage', artist: 'NEW COMER F', start: 750, end: 790, popularity: 50 }, // 12:30-13:10
  { id: 'act_idol_c', stageId: 'pacific_stage', artist: 'IDOL GROUP C', start: 780, end: 825, popularity: 90 }, // 13:00-13:45
  { id: 'act_popstar', stageId: 'marine_stage', artist: 'POP STAR G', start: 810, end: 860, popularity: 85 }, // 13:30-14:20
  { id: 'act_headliner_d', stageId: 'mountain_stage', artist: 'HEADLINER D', start: 840, end: 900, popularity: 100 }, // 14:00-15:00
  { id: 'act_chill', stageId: 'beach_stage', artist: 'CHILL DUO H', start: 870, end: 910, popularity: 60 }, // 14:30-15:10
  { id: 'act_dance_e', stageId: 'sonic_stage', artist: 'DANCE ACT E', start: 910, end: 960, popularity: 85 }, // 15:10-16:00
  { id: 'act_rap', stageId: 'spotify_stage', artist: 'RAP CREW I', start: 930, end: 970, popularity: 65 }, // 15:30-16:10
  { id: 'act_anison', stageId: 'pacific_stage', artist: 'ANISON UNIT J', start: 970, end: 1020, popularity: 75 }, // 16:10-17:00
  { id: 'act_icon', stageId: 'marine_stage', artist: 'GLOBAL ICON K', start: 1020, end: 1080, popularity: 95 }, // 17:00-18:00
  { id: 'act_sunset', stageId: 'beach_stage', artist: 'SUNSET DJ L', start: 1050, end: 1090, popularity: 70 }, // 17:30-18:10
  { id: 'act_alt', stageId: 'sonic_stage', artist: 'ALT BAND M', start: 1100, end: 1150, popularity: 80 }, // 18:20-19:10
  { id: 'act_final', stageId: 'marine_stage', artist: 'FINAL HEADLINER Z', start: 1170, end: 1260, popularity: 100 }, // 19:30-21:00
];
