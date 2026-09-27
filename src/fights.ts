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
  /** Weapons/armors/items obtainable before this fight in the story. Sandbox ignores these. */
  weapons: number[];
  armors: number[];
  items: number[];
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
  /** Attacks for Single Attack mode, in the boss's own attack ids. Empty = mode unavailable. */
  attacks: { id: number; name: string }[];
  /** Phase starts. Empty = whole fight only. */
  phases: { id: number; name: string }[];
  modes: ModeId[];
  gear: GearRules;
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

const PENDING: GearRules = { weapons: [], armors: [], items: [], unique: { weapons: [], armors: [] }, defaults: { weapons: {}, armors: {}, items: [] } };

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
  },
  { id: 'knight', name: 'ROARING KNIGHT', chapter: 3, sprite: 'boss_knight', music: [], party: [1, 2, 3], attacks: [], phases: [], modes: ['normal'], gear: PENDING, available: false },
  {
    id: 'spamton_neo', name: 'SPAMTON NEO', chapter: 2, sprite: 'boss_spamton_neo', music: [], party: [1, 2, 3], attacks: [], phases: [], modes: ['normal'], gear: PENDING, available: false,
    variants: [{ id: 'normal', name: 'NORMAL' }, { id: 'snowgrave', name: 'SNOWGRAVE' }],
  },
  { id: 'queen', name: 'QUEEN', chapter: 2, sprite: 'boss_queen', music: [], party: [1, 2, 3], attacks: [], phases: [], modes: ['normal'], gear: PENDING, available: false },
  { id: 'tenna', name: 'TENNA', chapter: 3, sprite: 'boss_tenna', music: [], party: [1, 2, 3], attacks: [], phases: [], modes: ['normal'], gear: PENDING, available: false },
  { id: 'titan', name: 'TITAN', chapter: 4, sprite: 'boss_titan', music: [], party: [1, 2, 3], attacks: [], phases: [], modes: ['normal'], gear: PENDING, available: false },
  { id: 'gerson', name: 'GERSON', chapter: 4, sprite: 'boss_gerson', music: [], party: [1, 2, 3], attacks: [], phases: [], modes: ['normal'], gear: PENDING, available: false },
  { id: 'flowery', name: 'FLOWERY', chapter: 5, sprite: 'boss_flowery', music: [], party: [1, 2, 3], attacks: [], phases: [], modes: ['normal'], gear: PENDING, available: false },
  {
    id: 'pink', name: 'PINK', chapter: 5, sprite: 'boss_pink', music: [], party: [1, 2, 3], attacks: [], phases: [], modes: ['normal'], gear: PENDING, available: false,
    variants: [{ id: 'easy', name: 'EASY' }, { id: 'normal', name: 'NORMAL' }, { id: 'harder', name: 'HARDER BOMBS' }],
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
