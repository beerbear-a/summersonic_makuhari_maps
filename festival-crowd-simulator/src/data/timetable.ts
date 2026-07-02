/**
 * タイムテーブルデータ。
 * SUMMER SONIC 2025 東京公演 2日目（2025年8月17日・幕張メッセ/ZOZOマリンスタジアム）の
 * 実際の出演ラインナップをもとに構成している（2026年のタイムテーブルは本記事執筆時点で
 * 未発表のため、直近開催の2025年のデータを採用）。
 *
 * データの正確性について:
 * - MARINE STAGE の開演時刻・出演順は公開されたタイムテーブル報道と一致させている
 *   （終演時刻はセット尺の一般的な長さから推定）
 * - MOUNTAIN STAGE のオープニング(INI)とクロージング(優里)、SONIC STAGE クロージングの
 *   JVKE、BEACH STAGE クロージングの Feid は「その枠を務めた」と報じられている実際の
 *   組み合わせ。TINASHE・JORJA SMITH・INFINITY SONG・NiziU・BEABADOOBEE・RIP SLYME は
 *   当日会場に出演したことが確認できる実在アーティストだが、公式の分単位タイムテーブルまでは
 *   参照できなかったため、ステージ・時間帯はゲームバランス上の近い枠に配置している
 * - Spotify STAGE（Early Noise）は新人発掘枠という実際のコンセプトに合わせた
 *   架空アーティスト名で構成
 *
 * 時間は内部的に「0時からの分」で管理する（12:00 = 720）。
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

/** 開場時刻 10:30 */
export const DAY_START = 630;
/** 閉場時刻 21:20（大トリ ALICIA KEYS 終演後、これ以降は全員 EXIT へ向かう） */
export const DAY_END = 1280;

export const acts: Act[] = [
  // ---- 11:00 各ステージ オープニングアクト ----
  { id: 'act_mrsgreenapple', stageId: 'marine_stage', artist: 'Mrs. GREEN APPLE', start: 660, end: 705, popularity: 90 },
  { id: 'act_ini', stageId: 'mountain_stage', artist: 'INI', start: 660, end: 700, popularity: 72 },

  // ---- 12:00台 ----
  { id: 'act_infinitysong', stageId: 'beach_stage', artist: 'INFINITY SONG', start: 720, end: 760, popularity: 58 },
  { id: 'act_novatide', stageId: 'spotify_stage', artist: 'NOVA TIDE', start: 720, end: 760, popularity: 42 },
  { id: 'act_jorjasmith', stageId: 'sonic_stage', artist: 'JORJA SMITH', start: 750, end: 795, popularity: 66 },
  { id: 'act_jo1', stageId: 'marine_stage', artist: 'JO1', start: 735, end: 780, popularity: 78 },

  // ---- 13:00台 ----
  { id: 'act_befirst', stageId: 'marine_stage', artist: 'BE:FIRST', start: 805, end: 855, popularity: 85 },
  { id: 'act_niziu', stageId: 'mountain_stage', artist: 'NiziU', start: 795, end: 840, popularity: 84 },

  // ---- 14:00台 ----
  { id: 'act_beabadoobee', stageId: 'pacific_stage', artist: 'BEABADOOBEE', start: 840, end: 885, popularity: 68 },
  { id: 'act_jbalvin', stageId: 'marine_stage', artist: 'J BALVIN', start: 875, end: 925, popularity: 82 },

  // ---- 15:00台 ----
  { id: 'act_projectamber', stageId: 'spotify_stage', artist: 'PROJECT AMBER', start: 900, end: 940, popularity: 48 },
  { id: 'act_tinashe', stageId: 'sonic_stage', artist: 'TINASHE', start: 930, end: 975, popularity: 75 },

  // ---- 16:00台 ----
  { id: 'act_camilacabello', stageId: 'marine_stage', artist: 'CAMILA CABELLO', start: 965, end: 1020, popularity: 92 },
  { id: 'act_ripslyme', stageId: 'pacific_stage', artist: 'RIP SLYME', start: 990, end: 1035, popularity: 74 },

  // ---- 17:00〜18:00台 ----
  { id: 'act_aespa', stageId: 'marine_stage', artist: 'aespa', start: 1075, end: 1125, popularity: 93 },
  { id: 'act_jvke', stageId: 'sonic_stage', artist: 'JVKE', start: 1110, end: 1160, popularity: 80 },

  // ---- 19:00〜 大トリ ----
  { id: 'act_yuri', stageId: 'mountain_stage', artist: '優里', start: 1140, end: 1190, popularity: 86 },
  { id: 'act_aliciakeys', stageId: 'marine_stage', artist: 'ALICIA KEYS', start: 1170, end: 1250, popularity: 100 },
  { id: 'act_feid', stageId: 'beach_stage', artist: 'Feid', start: 1180, end: 1230, popularity: 82 },
];
