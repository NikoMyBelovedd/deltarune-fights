# Default loadouts (average first playthrough)

These are typical, not min-maxed, loadouts for each boss. Every id has been checked against `public/data/gear-chN.json` (existence, the `who` equip restriction, and one-of-a-kind chest items equipped only once). Character ids: 1 Kris, 2 Susie, 3 Ralsei.

## Chapter 1: Jevil (secret boss, Card Castle)

Players who find Jevil have usually cleared Card Castle, so they have the Chapter 1 shop gear (Spookysword from Seam, Brave Ax and DaintyScarf from Rouxls) and the unique armors picked up on the way: Dice Brace (Forest), White Ribbon (Field maze) and IronShackle (Prison B1, on the route to Jevil). The Steam Jevil guide recommends an Amber Card on everyone plus the unique armors, the higher-DEF armor on Ralsei, and DaintyScarf on Ralsei for sparing and healing. Items are a normal handful: Seam Darkburgers, a Dark Candy, one ReviveMint and the Top Cake (Malius fixes the Broken Cake). This leaves out the guide's "9-10 Darkburgers" hoard.

Sources: [1](https://steamcommunity.com/sharedfiles/filedetails/?id=3504588287), [2](https://deltarune.wiki/w/Shops), [3](https://deltarune.wiki/w/Armor)

```json
{"fight": "jevil", "weapons": {"1": 5, "2": 6, "3": 10}, "armors": {"1": [1, 2], "2": [1, 5], "3": [1, 4]}, "items": [8, 8, 8, 1, 2, 6]}
```

## Chapter 1: King (final boss)

Same shop and chest gear as Jevil, but no Jevilstail or Devilsknife, since a typical first run does not necessarily beat the secret boss. Ralsei has the free Ragger (Forest, Dark Ponmen room) instead of the 200 D$ DaintyScarf. Trefoil is not included: the wiki lists it as unused and unobtainable.

Sources: [1](https://deltarune.wiki/w/Weapons), [2](https://deltarune.wiki/w/Trefoil), [3](https://deltarune.wiki/w/Top_Cake)

```json
{"fight": "king", "weapons": {"1": 5, "2": 6, "3": 9}, "armors": {"1": [1, 2], "2": [1, 5], "3": [1, 4]}, "items": [8, 8, 1, 1, 2, 6]}
```

## Chapter 2: Spamton NEO (normal route)

Typical Chapter 2 gear by the Queen's Mansion: MechaSaber and AutoAxe from Sweet Cap'n Cakes (250 D$ each), FiberScarf from the Cyber Field APPLE puzzle chest, GlowWrist (chest/shop), Pink Ribbon (Cyber City chest), ChainMail (Mansion 1F chest) and B.ShotBowtie (Swatch, 300 D$), plus the Chapter 1 carry-overs IronShackle and White Ribbon. Items are CD Bagels and ButJuice/SpagettiCode from Swatch's cafe, which guides point to before NEO, plus one ReviveMint. Devilsknife and the Mannequin are left out because average players often don't have them.

Sources: [1](https://deltarune.wiki/w/Spamton_NEO), [2](https://gamerant.com/deltarune-chapter-2-walkthrough-all-items-secrets-recruits-missables/), [3](https://deltarune.wiki/w/Shops)

```json
{"fight": "spamton_neo", "weapons": {"1": 16, "2": 17, "3": 18}, "armors": {"1": [11, 10], "2": [5, 12], "3": [4, 3]}, "items": [16, 16, 16, 24, 25, 2]}
```

## Chapter 2: Spamton NEO (Weird/Snowgrave route, Kris alone)

Kris fights alone. A Steam thread about this fight has the player using the MechaSaber ("the sword you buy from the dancing robots store"). Armor is the Chapter 1 Dice Brace plus a GlowWrist. The wiki's Weird Route notes suggest Top Cake, LightCandy, CD Bagels and ButJuice. No ReviveMint is included, since a downed Kris ends the fight.

Sources: [1](https://steamcommunity.com/app/1671210/discussions/0/604168007382684030/), [2](https://deltarune.wiki/w/Spamton_NEO)

```json
{"fight": "spamton_neo_snowgrave", "weapons": {"1": 16}, "armors": {"1": [2, 10]}, "items": [6, 23, 24, 16, 16, 16]}
```

## Chapter 2: Queen (final boss)

Same gear as the normal-route NEO loadout. Dealmaker (NEO reward) and RoyalPin (1000 D$) are left out as not typical for an average first run. Guides point out that ChainMail and B.ShotBowtie are the mansion's accessible defensive pickups. Items are a small restock of mansion cafe heals.

Sources: [1](https://www.dualshockers.com/deltarune-chapter-two-full-guide-and-walkthrough/), [2](https://deltarune.wiki/w/Shops)

```json
{"fight": "queen", "weapons": {"1": 16, "2": 17, "3": 18}, "armors": {"1": [11, 10], "2": [5, 12], "3": [4, 3]}, "items": [16, 16, 24, 24, 25, 2]}
```

## Chapter 3: Tenna (main boss)

Chapter 3 upgrades come from the Green Room vending machines: Saber10, ToxicAxe and FlexScarf (80 PTs each, Red Carpet Hall) and GingerGuard. Other armor carries over from Chapter 2. Items are the chapter's TV food (TVDinner, DeluxeDinner, TVSlop) and one ReviveMint (Ramb reward or ball machine). The Tenna guide only says to use the healing items gathered during the chapter.

Sources: [1](https://deltarune.wiki/w/Saber10), [2](https://deltarune.wiki/w/GingerGuard), [3](https://gamerant.com/deltarune-how-beat-tenna-boss-chapter-3-guide/)

```json
{"fight": "tenna", "weapons": {"1": 23, "2": 24, "3": 25}, "armors": {"1": [11, 25], "2": [5, 12], "3": [4, 10]}, "items": [34, 34, 39, 37, 2]}
```

## Chapter 3: Roaring Knight (end of chapter)

The fight follows Tenna, and the wiki notes you can backtrack to the save point to restock and re-equip. It recommends Saber10/ToxicAxe-tier weapons and DeluxeDinners/ExecBuffet-style heals. ShadowMantle and BlackShard are left out because they are Sword Route/secret rewards.

Sources: [1](https://deltarune.wiki/w/Roaring_Knight), [2](https://deltarune.wiki/w/Shops)

```json
{"fight": "knight", "weapons": {"1": 23, "2": 24, "3": 25}, "armors": {"1": [11, 25], "2": [5, 12], "3": [4, 10]}, "items": [39, 39, 34, 34, 2]}
```

## Chapter 4: Gerson / Hammer of Justice (Susie alone)

The fight happens in the Dark Sanctuary Study, before climbing the first tower, so only early Chapter 4 gear is available. The wiki recommends giving Susie the best DEF and MAGIC possible and names Waferguard (Old Man, 900 D$), MysticBand (Library worship room) and AbsorbAx (same shelf/piano area) as the Dark Sanctuary finds. AbsorbAx only heals 2 HP per hit in this fight. Healing items are stolen during the fight and OKHeal is the real healing, so the item list is a token handful.

Sources: [1](https://deltarune.wiki/w/Hammer_of_Justice), [2](https://deltarune.wiki/w/AbsorbAx), [3](https://deltarune.wiki/w/Waferguard)

```json
{"fight": "gerson", "weapons": {"2": 54}, "armors": {"2": [50, 51]}, "items": [1, 1, 61, 2]}
```

## Chapter 4: Titan (final boss)

Kris has Winglade (Dark Sanctuary chest reached with the Claimb Claws). Susie has AbsorbAx, whose vampire heal is recommended for Titan. Ralsei has ScarfMark (Old Man, 900 D$). Armor is Waferguard, PowerBand and MysticBand from Chapter 4 plus carry-overs. JusticeAxe (Hammer of Justice reward), GoldWidow (9999 D$ donation) and BlackShard are left out as not typical. Items are Old Man shop drinks (Rhapsotea, Scarlixir), Seam's Darker Candy and one ReviveMint.

Sources: [1](https://deltarune.wiki/w/Titan_(Chapter_4)), [2](https://deltarune.wiki/w/Winglade_(item)), [3](https://deltarune.wiki/w/ScarfMark)

```json
{"fight": "titan", "weapons": {"1": 53, "2": 54, "3": 51}, "armors": {"1": [50, 25], "2": [52, 11], "3": [4, 51]}, "items": [62, 61, 61, 1, 1, 2]}
```

## Chapter 5: Pink (secret boss, Top of Castle)

Players who reach Pink have explored enough to collect 10 Pink Coins, so they plausibly have the exploration weapons: Thatchet (Garden, golden watering can), MistleWP (Cliffs Netskie chest puzzle) and WoodBlade2 (Pink's own Cliffs shop, 500 D$). RedRibbon comes from Garden chests or the cafe (555 D$). The Pink wiki suggests defensive gear, and food matters for the ShareFood ACT (GreenTea, Flavigne, OrangeJuice, ReviveMint all raise Doki). NetskieHat (1500 D$) and the TrueTie fusion are left out as less typical.

Sources: [1](https://deltarune.wiki/w/Pink), [2](https://deltarune.wiki/w/MistleWP), [3](https://deltarune.wiki/w/Thatchet)

```json
{"fight": "pink", "weapons": {"1": 30, "2": 31, "3": 37}, "armors": {"1": [33, 50], "2": [33, 52], "3": [4, 51]}, "items": [42, 41, 41, 43, 1, 2]}
```

## Chapter 5: Flowery (final boss)

An average first run: WoodBlade2 from Pink's Cliffs shop (on the main path), Susie still on Chapter 4's AbsorbAx (Thatchet is hidden), Ralsei on ScarfMark, and RedRibbon added to the Chapter 4 armor. Items are shop food from the Ideal Diner/Green's shop (GreenTea, Flavigne, OrangeJuice) and a Shikacola team heal from the drink dispenser. The flower-shop items (GreenApron/SethSpecs/BlueShoes, the community favourites) are left out because they need the secret Pink fight first. Swap them in for a completionist loadout.

Sources: [1](https://deltarune.wiki/w/Flowery), [2](https://deltarune.wiki/w/Shops), [3](https://gamerant.com/deltarune-chapter-5-secret-weapons-armors-best-pick-what-they-do/)

```json
{"fight": "flowery", "weapons": {"1": 30, "2": 54, "3": 51}, "armors": {"1": [33, 50], "2": [33, 52], "3": [4, 51]}, "items": [42, 41, 41, 70, 43, 2]}
```
