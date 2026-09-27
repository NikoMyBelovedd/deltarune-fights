// Registry of the fights the site offers. Shared by the menu and the bundle builder.

export interface FightVariant { id: string; name: string }

export interface FightDef {
  id: string;
  name: string;
  chapter: number;
  /** Music files (from DELTARUNE/mus) this fight can play, including game over. */
  music: string[];
  variants?: FightVariant[];
  /** Party character ids in slot order (1 Kris, 2 Susie, 3 Ralsei, 4 Noelle). */
  party: number[];
  /** Number of selectable attacks for Single Attack mode (0 = not supported yet). */
  attacks: { id: number; name: string }[];
  phases: { id: number; name: string }[];
  available: boolean;
}

export const FIGHTS: FightDef[] = [
  {
    id: 'jevil',
    name: 'JEVIL',
    chapter: 1,
    music: ['joker.ogg', 'prejoker.ogg', 'AUDIO_DEFEAT.ogg'],
    party: [1, 2, 3],
    attacks: [],
    phases: [],
    available: true,
  },
  { id: 'king', name: 'KING', chapter: 1, music: ['kingboss.ogg', 'AUDIO_DEFEAT.ogg'], party: [1, 2, 3], attacks: [], phases: [], available: false },
  { id: 'knight', name: 'ROARING KNIGHT', chapter: 3, music: [], party: [1, 2, 3], attacks: [], phases: [], available: false },
  {
    id: 'spamton_neo', name: 'SPAMTON NEO', chapter: 2, music: [], party: [1, 2, 3], attacks: [], phases: [], available: false,
    variants: [{ id: 'normal', name: 'NORMAL' }, { id: 'snowgrave', name: 'SNOWGRAVE' }],
  },
  { id: 'queen', name: 'QUEEN', chapter: 2, music: [], party: [1, 2, 3], attacks: [], phases: [], available: false },
  { id: 'tenna', name: 'TENNA', chapter: 3, music: [], party: [1, 2, 3], attacks: [], phases: [], available: false },
  { id: 'titan', name: 'TITAN', chapter: 4, music: [], party: [1, 2, 3], attacks: [], phases: [], available: false },
  { id: 'gerson', name: 'GERSON', chapter: 4, music: [], party: [1, 2, 3], attacks: [], phases: [], available: false },
  { id: 'flowery', name: 'FLOWERY', chapter: 5, music: [], party: [1, 2, 3], attacks: [], phases: [], available: false },
  {
    id: 'pink', name: 'PINK', chapter: 5, music: [], party: [1, 2, 3], attacks: [], phases: [], available: false,
    variants: [{ id: 'easy', name: 'EASY' }, { id: 'normal', name: 'NORMAL' }, { id: 'harder', name: 'HARDER BOMBS' }],
  },
];
