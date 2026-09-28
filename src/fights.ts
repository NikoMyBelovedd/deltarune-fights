// Registry of the fights the site offers. Shared by the menu and the bundle builder.

export interface FightVariant { id: string; name: string }
export type ModeId = 'normal' | 'hitless' | 'practice' | 'single' | 'endless';

export interface Loadout {
  /** character id -> weapon id */
  weapons: Record<number, number>;
  /** character id -> [armor1, armor2] */
  armors: Record<number, [number, number]>;
  items: number[];
}

export interface GearRules {
  /** Weapons/armors/items obtainable before this fight in the story. Sandbox ignores these. 'all' = every non-debug item of the chapter. */
  weapons: number[] | 'all';
  armors: number[] | 'all';
  items: number[] | 'all';
  /** Ids that exist only once in the story (can't be equipped twice). */
  unique: { weapons: number[]; armors: number[] };
  defaults: Loadout;
}

export interface FightDef {
  id: string;
  name: string;
  chapter: number;
  /** Battle idle sprite shown in the menus (extracted to /ui/sprites). */
  sprite: string;
  /** Music files (from DELTARUNE/mus) this fight can play, including game over. */
  music: string[];
  variants?: FightVariant[];
  /** Party character ids in slot order (1 Kris, 2 Susie, 3 Ralsei, 4 Noelle). */
  party: number[];
  /** Party overrides for specific variants. */
  variantParty?: Record<string, number[]>;
  /** Attacks for Single Attack mode, in the boss's own attack ids. Empty = mode unavailable. */
  attacks: { id: number; name: string }[];
  /** Phase starts. Empty = whole fight only. */
  phases: { id: number; name: string }[];
  modes: ModeId[];
  gear: GearRules;
  /** Typical loadout of a normal playthrough at this fight (overrides gear.defaults). */
  defaults?: Loadout;
  /** Per-variant defaults (e.g. Snowgrave). */
  variantDefaults?: Record<string, Loadout>;
  available: boolean;
}

const CH1_CASTLE: GearRules = {
  weapons: [1, 2, 3, 5, 6, 9, 10],
  armors: [1, 2, 4, 5],
  items: [1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 15],
  unique: { weapons: [9], armors: [2, 4, 5] },
  defaults: {
    weapons: { 1: 1, 2: 2, 3: 3 },
    armors: { 1: [0, 0], 2: [0, 0], 3: [0, 0] },
    items: [],
  },
};

// Chapter 2 mansion fights. Approximate: every non-debug item of the chapter (needs a per-fight obtainability pass).
const CH2_MANSION: GearRules = {
  weapons: [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 19],
  armors: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  items: [1, 2, 3, 6, 7, 8, 9, 11, 12, 13, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31],
  unique: { weapons: [7, 9], armors: [2, 4, 5, 7] },
  defaults: { weapons: { 1: 1, 2: 2, 3: 3 }, armors: { 1: [0, 0], 2: [0, 0], 3: [0, 0] }, items: [] },
};

// Chapters 3-5: equipment comes from the game's own chapter defaults unless changed ("GAME DEFAULT").
// Legal lists are approximate (every non-debug item of the chapter) until a per-fight obtainability pass.
/** Debug-only gear (EverybodyWeapon) is never "legal". */
export const DEBUG_GEAR = { weapons: [4], armors: [] as number[], items: [] as number[] };
export function isLegal(list: number[] | 'all', id: number, kind: 'weapons' | 'armors' | 'items'): boolean {
  return list === 'all' ? !DEBUG_GEAR[kind].includes(id) : list.includes(id);
}

function chapterRules(weapons: number[] | 'all', armors: number[] | 'all', items: number[] | 'all'): GearRules {
  return { weapons, armors, items, unique: { weapons: [], armors: [] }, defaults: { weapons: {}, armors: {}, items: [] } };
}
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const CH3_RULES = chapterRules([1, 2, 3, 5, 6, 7, 8, 9, 10, ...range(11, 26)], range(1, 27), range(1, 39));
const ALL_RULES = chapterRules('all', 'all', 'all');


export const FIGHTS: FightDef[] = [
  {
    id: 'jevil',
    name: 'JEVIL',
    chapter: 1,
    sprite: 'boss_jevil',
    music: ['joker.ogg', 'prejoker.ogg', 'AUDIO_DEFEAT.ogg'],
    party: [1, 2, 3],
    attacks: [
      { id: 0, name: 'CHAOS CLONES' }, { id: 1, name: 'RING-AROUND' }, { id: 2, name: 'HEART BOMBS' }, { id: 3, name: 'DEVILSKNIFE' },
      { id: 4, name: 'CAROUSEL' }, { id: 5, name: 'CLUB BOMBS' }, { id: 6, name: 'DIAMOND RISE' }, { id: 7, name: 'SIDE RINGS' },
      { id: 8, name: 'CAROUSEL II' }, { id: 9, name: 'SPADE BOMBS' }, { id: 10, name: 'CLUB FLYERS' }, { id: 11, name: 'DEVILSKNIFE II' },
      { id: 12, name: 'DIAMOND CLONES' }, { id: 13, name: 'CHAOS BOMB' }, { id: 14, name: 'DIAMOND STORM' }, { id: 15, name: 'FINAL CHAOS' },
    ],
    phases: [
      { id: 2, name: '80% HP' }, { id: 3, name: '60% HP' }, { id: 4, name: '40% HP' }, { id: 5, name: 'FINAL CHAOS' },
    ],
    modes: ['normal', 'hitless', 'practice', 'single', 'endless'],
    gear: CH1_CASTLE,
    defaults: { weapons: {1: 5, 2: 6, 3: 10}, armors: {1: [1, 2], 2: [1, 5], 3: [1, 4]}, items: [8, 8, 8, 1, 2, 6] },
    available: true,
  },
  {
    id: 'king', name: 'KING', chapter: 1, sprite: 'boss_king',
    music: ['wind.ogg', 'kingboss.ogg', 'GALLERY.ogg', 'lancer.ogg', 'friendship.ogg', 'AUDIO_DEFEAT.ogg'],
    party: [1, 2, 3],
    attacks: [
      { id: 0, name: 'SPADE VOLLEY' }, { id: 1, name: 'CHAIN KING' }, { id: 2, name: 'SPADE RAIN' }, { id: 3, name: 'BOUNCING BOX' },
      { id: 4, name: 'CHAIN KING II' }, { id: 5, name: 'CHAIN SWING' }, { id: 6, name: 'SPADE SPIRAL' }, { id: 7, name: 'BOUNCING BOX II' },
      { id: 8, name: 'SPADE STORM' }, { id: 9, name: 'CHAIN KING III' }, { id: 10, name: 'CHAIN SWING II' },
    ],
    phases: [], modes: ['normal', 'hitless', 'practice', 'single', 'endless'], gear: CH1_CASTLE, available: true,
    defaults: { weapons: {1: 5, 2: 6, 3: 9}, armors: {1: [1, 2], 2: [1, 5], 3: [1, 4]}, items: [8, 8, 1, 1, 2, 6] },
  },
  {
    id: 'spamton_neo', name: 'SPAMTON NEO', chapter: 2, sprite: 'boss_spamton_neo',
    music: ['shinkansen.ogg', 'spamton_neo_meeting.ogg', 'spamton_neo_mix_ex_wip.ogg', 'spamton_neo_after.ogg', 'gameover_short.ogg', 'AUDIO_DEFEAT.ogg'],
    party: [1, 2, 3],
    attacks: [
      { id: 0, name: 'FLYING HEADS' }, { id: 1, name: 'RECREW COLUMNS' }, { id: 2, name: 'HEART ATTACK' }, { id: 3, name: 'PHONE CALL' },
      { id: 4, name: 'PHONE HANDS' }, { id: 5, name: 'FACE ATTACK' }, { id: 6, name: 'HEART ATTACK II' }, { id: 7, name: 'FLYING HEADS II' },
      { id: 8, name: 'PHONE HANDS II' }, { id: 9, name: 'PHONE CALL II' }, { id: 10, name: 'RECREW COLUMNS II' }, { id: 11, name: 'HEART ATTACK III' },
      { id: 12, name: 'PHONE CALL III' }, { id: 13, name: 'NEO FINALE' },
    ],
    phases: [{ id: 2, name: 'LATE FIGHT' }, { id: 3, name: 'UNDER 30% HP' }, { id: 4, name: 'FINALE' }],
    modes: ['normal', 'hitless', 'practice', 'single', 'endless'], gear: CH2_MANSION, available: true,
    defaults: { weapons: {1: 16, 2: 17, 3: 18}, armors: {1: [11, 10], 2: [5, 12], 3: [4, 3]}, items: [16, 16, 16, 24, 25, 2] },
    variantDefaults: { snowgrave: { weapons: {1: 16}, armors: {1: [2, 10]}, items: [6, 23, 24, 16, 16, 16] } },
    variants: [{ id: 'normal', name: 'NORMAL' }, { id: 'snowgrave', name: 'SNOWGRAVE' }],
    variantParty: { snowgrave: [1] },
  },
  {
    id: 'queen', name: 'QUEEN', chapter: 2, sprite: 'boss_queen',
    music: ['GALLERY.ogg', 'queen_boss.ogg', 'queen.ogg', 'gameover_short.ogg', 'AUDIO_DEFEAT.ogg'],
    party: [1, 2, 3],
    attacks: [
      { id: 0, name: 'BERDLY TORNADO' }, { id: 1, name: 'STOMP' }, { id: 2, name: 'EXPLOSION' }, { id: 3, name: 'QUEEN LASER' },
      { id: 4, name: 'SOCIAL MEDIA' }, { id: 5, name: 'PLUG' }, { id: 6, name: 'QUEEN LASER II' }, { id: 7, name: 'SOCIAL MEDIA II' },
      { id: 8, name: 'BERDLY TORNADO II' }, { id: 9, name: 'EXPLOSION II' }, { id: 10, name: 'PLUG II' }, { id: 11, name: 'QUEEN LASER III' },
      { id: 12, name: 'WINE' }, { id: 13, name: 'WINE II' }, { id: 14, name: 'WINE III' }, { id: 15, name: 'QUEEN ULTIMATE' },
    ],
    phases: [{ id: 2, name: '75% HP' }, { id: 3, name: '50% HP' }, { id: 4, name: '25% HP' }],
    modes: ['normal', 'hitless', 'practice', 'single', 'endless'], gear: CH2_MANSION, available: true,
    defaults: { weapons: {1: 16, 2: 17, 3: 18}, armors: {1: [11, 10], 2: [5, 12], 3: [4, 3]}, items: [16, 16, 24, 24, 25, 2] },
  },
  {
    id: 'tenna', name: 'TENNA', chapter: 3, sprite: 'boss_tenna',
    music: ['tenna_battle.ogg', 'tenna_battle_guitar.ogg', 'flashback_excerpt.ogg', 'rtenna_zoom.ogg', 'tv_results_screen.ogg', 'gameover_short.ogg', 'AUDIO_DEFEAT.ogg'],
    party: [1, 2, 3],
    attacks: [
      { id: 0, name: 'TENNA ATTACK 1' }, { id: 1, name: 'TENNA ATTACK 2' }, { id: 2, name: 'TENNA ATTACK 3' },
      { id: 3, name: 'RHYTHM GAME' }, { id: 4, name: 'COOKING' }, { id: 5, name: 'COWBOY' }, { id: 6, name: 'COWBOY II' },
      { id: 7, name: 'BATTLE' }, { id: 8, name: 'BATTLE II' }, { id: 9, name: 'SUSIEZILLA' }, { id: 10, name: 'SUSIEZILLA II' }, { id: 11, name: 'SUSIEZILLA III' },
    ],
    phases: [{ id: 2, name: 'HALF HP' }, { id: 3, name: 'FINAL EPISODE' }],
    modes: ['normal', 'hitless', 'practice', 'single', 'endless'], gear: CH3_RULES, available: true,
    defaults: { weapons: {1: 23, 2: 24, 3: 25}, armors: {1: [11, 25], 2: [5, 12], 3: [4, 10]}, items: [34, 34, 39, 37, 2] },
  },
  {
    id: 'knight', name: 'ROARING KNIGHT', chapter: 3, sprite: 'boss_knight',
    music: ['knight.ogg', 'gameover_short.ogg', 'AUDIO_DEFEAT.ogg'],
    party: [1, 2, 3],
    attacks: [
      ...[1, 2, 3].flatMap((p) => [1, 2, 3, 4, 5].map((t) => ({ id: (p - 1) * 5 + t - 1, name: `PHASE ${p} - ${t}` }))),
      { id: 15, name: 'THE ROARING' },
    ],
    phases: [{ id: 2, name: 'PHASE 2' }, { id: 3, name: 'PHASE 3' }, { id: 4, name: 'PHASE 4 (80%)' }],
    modes: ['normal', 'hitless', 'practice', 'single', 'endless'], gear: CH3_RULES, available: true,
    defaults: { weapons: {1: 23, 2: 24, 3: 25}, armors: {1: [11, 25], 2: [5, 12], 3: [4, 10]}, items: [39, 39, 34, 34, 2] },
  },
  {
    id: 'gerson', name: 'GERSON', chapter: 4, sprite: 'boss_gerson',
    music: ['church_dark_study.ogg', 'fanfare.ogg', 'gerson_theme_intro.ogg', 'ch4_extra_boss.ogg', 'gerson_defeated.ogg', 'gameover_short.ogg', 'AUDIO_DEFEAT.ogg'],
    party: [2],
    attacks: [
      ...Array.from({ length: 19 }, (_, i) => ({ id: i, name: `TURN ${i + 1}` })),
      { id: 19, name: 'HAMMER OF JUSTICE' },
    ],
    phases: [{ id: 6, name: 'TURN 6' }, { id: 12, name: 'TURN 12 (50%)' }, { id: 16, name: 'TURN 16 (75%)' }, { id: 20, name: 'FINAL HAMMER' }],
    modes: ['normal', 'hitless', 'practice', 'single', 'endless'], gear: ALL_RULES, available: true,
    defaults: { weapons: {2: 54}, armors: {2: [50, 51]}, items: [1, 1, 61, 2] },
  },
  {
    id: 'titan', name: 'TITAN', chapter: 4, sprite: 'boss_titan',
    music: ['wind_highplace.ogg', 'GALLERY.ogg', 'titan_battle.ogg', 'gameover_short.ogg', 'AUDIO_DEFEAT.ogg'],
    party: [1, 2, 3],
    attacks: [
      { id: 0, name: 'SWARM' }, { id: 1, name: 'GAZE' }, { id: 2, name: 'HEART GRIP' }, { id: 3, name: 'UNLEASHED' },
      { id: 4, name: 'SLITHER' }, { id: 5, name: 'SWARM II' }, { id: 6, name: 'HANDS' }, { id: 7, name: 'UNLEASHED II' },
      { id: 8, name: 'SLITHER II' }, { id: 9, name: 'SWARM III' }, { id: 10, name: 'HANDS II' }, { id: 11, name: 'DESPERATION' },
      { id: 12, name: 'UNLEASHED III' },
    ],
    phases: [{ id: 3, name: 'SHIELD RETURNS' }, { id: 5, name: 'SHIELD RETURNS II' }, { id: 6, name: 'THIRD UNLEASH' }, { id: 7, name: 'REGENERATION' }, { id: 8, name: 'OLD MAN' }],
    modes: ['normal', 'hitless', 'practice', 'single', 'endless'], gear: ALL_RULES, available: true,
    defaults: { weapons: {1: 53, 2: 54, 3: 51}, armors: {1: [50, 25], 2: [52, 11], 3: [4, 51]}, items: [62, 61, 61, 1, 1, 2] },
  },
  {
    id: 'pink', name: 'PINK', chapter: 5, sprite: 'boss_pink',
    music: ['pink_theme.ogg', 'pink_theme_mad.ogg', 'rakuichi_buster_wip.ogg', 'pink.ogg', 'gameover_short.ogg', 'AUDIO_DEFEAT.ogg'],
    party: [1, 2, 3],
    attacks: ['PURPLE CATS', 'BOMB BACKSTORY', 'CAT BEAT', 'GEL PEN BOMBS', 'FIRST CONCERT', 'RANDOM CATS', 'SPIN BOX', '3D TUNNEL',
      'NEW HAT BOMBS', 'WISHLIST SONG', 'QUICK SPIN', 'ANIME FACE BOX', 'BIG BOMB', 'CAT CONGA', 'TUNNEL RUSH', 'FLIP CATS',
      'BOMB STORM', 'ENCORE'].map((name, id) => ({ id, name })),
    phases: [{ id: 2, name: 'SECOND DATE' }, { id: 3, name: 'GHOST' }, { id: 4, name: 'FINALE' }],
    modes: ['normal', 'hitless', 'practice', 'single', 'endless'], gear: ALL_RULES, available: true,
    defaults: { weapons: {1: 30, 2: 31, 3: 37}, armors: {1: [33, 50], 2: [33, 52], 3: [4, 51]}, items: [42, 41, 41, 43, 1, 2] },
    variants: [{ id: 'normal', name: 'DEFAULT BOMBS' }, { id: 'easy', name: 'NICER BOMBS' }, { id: 'harder', name: 'MEANER BOMBS' }],
  },
  {
    id: 'flowery', name: 'FLOWERY', chapter: 5, sprite: 'boss_flowery',
    music: ['rakuichi_buster_wip.ogg', 'Flowerman_Arrangement.ogg', 'rudebuster_boss.ogg', 'battle.ogg', 'gameover_short.ogg', 'AUDIO_DEFEAT.ogg'],
    party: [1, 2, 3],
    attacks: ['WALL TUTORIAL', 'PETAL JARONA', 'HEDGE CHASE', 'JARONA BARRAGE', "SETH'S BOXES", 'AQUA KNIVES', "SETH'S BOXES EX",
      'ORANGE COMBO', 'JUST KIDDING', 'WILD CHASE', 'JUSTICE CHASE', 'SUPER JARONA', 'HARD JARONA'].map((name, id) => ({ id, name })),
    phases: [2, 3, 4, 5, 6].map((id) => ({ id, name: `PHASE ${id}` })),
    modes: ['normal', 'hitless', 'practice', 'single', 'endless'], gear: ALL_RULES, available: true,
    defaults: { weapons: {1: 30, 2: 54, 3: 51}, armors: {1: [33, 50], 2: [33, 52], 3: [4, 51]}, items: [42, 41, 41, 70, 43, 2] },
  },
];

export const MODE_NAMES: Record<ModeId, string> = {
  normal: 'NORMAL',
  hitless: 'HITLESS',
  practice: 'PRACTICE',
  single: 'SINGLE ATTACK',
  endless: 'ENDLESS',
};

export const CHAR_NAMES: Record<number, string> = { 1: 'KRIS', 2: 'SUSIE', 3: 'RALSEI', 4: 'NOELLE' };
export const CHAR_HEADS: Record<number, string> = { 1: 'spr_headkris', 2: 'spr_headsusie', 3: 'spr_headralsei', 4: 'spr_headnoelle' };

export function partyOf(f: FightDef, variant: string): number[] {
  return f.variantParty?.[variant] ?? f.party;
}

/** Bump when default loadouts change so saved setups pick up the new defaults once. */
export const DEFAULTS_VERSION = 2;

export function defaultLoadout(f: FightDef, variant: string): Loadout {
  return structuredClone(f.variantDefaults?.[variant] ?? f.defaults ?? f.gear.defaults);
}
