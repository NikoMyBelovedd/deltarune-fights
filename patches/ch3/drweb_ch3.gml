{{include:../common/drweb_core.gml}}

// Chapter 3 story state shared by both fights: party of Kris, Susie, Ralsei in the Dark World (TV World).
// scr_gamestart() already applied scr_gamestart_chapter_override() for chapter 3, which gives the chapter's
// fixed stats (Kris 160 HP AT14, Susie 190 HP AT18 MAG2, Ralsei 140 HP AT12 MAG11, DF 2) and the default
// equipment (MechaSaber/AutoAxe/FiberScarf + Amber Card + GlowWrist).
function drweb_ch3_state()
{
    global.darkzone = 1;
    global.char[0] = 1;
    global.char[1] = 2;
    global.char[2] = 3;
    for (var _i = 0; _i < 4; _i++)
        global.charauto[_i] = 0;
    global.flag[9] = 1;
    // Best Susiezilla score: > 0 unlocks the Susiezilla minigames in the Tenna fight (the Susiezilla stage is on the main path).
    global.flag[1197] = 1;
    global.interact = 0;
    global.entrance = 0;
    global.facing = 0;
    drweb_apply_loadout();
}

// scr_damage hook. Some Ch3 attacks damage the whole party with one scr_damage call per member in the same frame;
// in Hitless only the first of those may restart the fight (the room change is deferred to the end of the frame).
// The lock is released by the boss's first Step in the restarted fight.
function drweb_ch3_on_hit(_amount, _target)
{
    if (!variable_global_exists("drweb_hitlock"))
        global.drweb_hitlock = 0;
    if (global.drweb_hitlock)
        exit;
    if (global.drweb_mode == "hitless")
        global.drweb_hitlock = 1;
    drweb_on_hit(_amount, _target);
}

// Sends the game into the selected fight. Called at boot and on every restart.
function drweb_boot_fight()
{
    drweb_load_config();
    scr_gamestart();
    if (global.drweb_seed != 0)
        random_set_seed(global.drweb_seed);
    // Leftovers of a previous attempt (both are persistent while a fight runs).
    with (obj_dw_snow_zone_battle_bg)
        instance_destroy();
    global.drweb_bag = [];
    switch (global.drweb_boss)
    {
        case "knight":
            drweb_ch3_state();
            // The Knight fight only exists on the sword route (Kris did the solo sword sections).
            global.flag[1050] = 1;
            global.plot = 320;
            // 4 = the game's own "retry after DEVICE_FAILURE" path of obj_ch3_PTB02 (party in place, Knight appears, battle).
            global.tempflag[90] = 4;
            global.tempflag[93] = 0;
            global.tempflag[96] = 0;
            // knight_battle_losses > 1 makes that path skip the long Knight entrance (con 3 -> 3.1).
            if (global.drweb_intro == 0 || global.drweb_attempt > 0)
                global.knight_battle_losses = 2;
            else
                global.knight_battle_losses = 0;
            drweb_emit("start", "knight");
            room_goto(room_dw_snow_zone);
            break;
        default:
            drweb_ch3_state();
            if (global.drweb_variant == "swordroute")
                global.flag[1050] = 1;
            // Minigame order counter of the Tenna fight (a tempflag, never reset by the game itself).
            global.tempflag[91] = 0;
            if (global.drweb_intro == 0 || global.drweb_attempt > 0)
            {
                // plot 290 = the game's retry path of obj_ch3_BTB06 (short snap-and-fight intro).
                // It expects the persistent split-screen background that obj_ch3_BTB04 normally leaves behind.
                global.plot = 290;
                var _bg = instance_create(0, 0, obj_dw_snow_zone_battle_bg);
                with (_bg)
                {
                    depth = 99000;
                    persistent = true;
                }
            }
            else
            {
                // plot 300 = first time: "just say it with me" cutscene, Susie's attack, then the battle.
                global.plot = 300;
            }
            drweb_emit("start", "tenna");
            room_goto(room_dw_snow_zone_battle);
            break;
    }
}

// ---- Roaring Knight (obj_knight_enemy, encounter 115) ----
// Attack ids for Single/Endless: the scripted turns of phases 1-3 (obj_knight_enemy_Other_10) plus the Roaring.
// Each entry is [phase, phaseturn before event_user(0) increments it].
function drweb_knight_turn(_a)
{
    var _map = [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [3, 0], [3, 1], [3, 2], [3, 3], [3, 4]];
    if (_a >= 15)
    {
        // The Roaring: phase 4, phase4turn 2 -> event_user(0) advances it to 3 (attack 9).
        phase = 4;
        phase4turn = 2;
        rotatingslash3used = true;
        return 0;
    }
    var _e = _map[clamp(_a, 0, 14)];
    phase = _e[0];
    phaseturn = _e[1];
    return 0;
}

// Runs at the top of obj_knight_enemy's Step (as obj_knight_enemy).
function drweb_knight_step()
{
    if (!variable_instance_exists(id, "drweb_init"))
    {
        drweb_init = 1;
        drweb_turns = 0;
        global.drweb_hitlock = 0;
        // obj_ch3_PTB02 sets tempflag[93] right before the battle; it switches obj_gameover_init to the Knight
        // variant (no quick Z retry). Clear it so a game over behaves like any other fight.
        global.tempflag[93] = 0;
        var _p = global.drweb_phase;
        if (_p == 2 || _p == 3)
        {
            phase = _p;
            phaseturn = 0;
        }
        if (_p == 4)
        {
            // Phase 4 starts when the Knight is at 80% HP: rotating slash, charge-up, then the Roaring.
            phase = 4;
            phase4turn = 0;
            global.monsterhp[myself] = floor(global.monstermaxhp[myself] * 0.8);
        }
    }
    // Practice/Single revive the party instead of a game over; let the next wipe be noticed again.
    if (endcon == 1 && end_cutscene_version == 0 && (global.hp[1] > 0 || global.hp[2] > 0 || global.hp[3] > 0))
        endcon = 0;
    if (global.monster[myself] == 1 && global.mnfight == 1 && talked == 0 && end_cutscene_version == 0)
    {
        drweb_turns += 1;
        var _a = drweb_turn_attack(16);
        if (global.drweb_mode == "endless" && drweb_turns > 16)
            global.monsterat[myself] = min(global.monsterat[myself] + 1, 60);
        if (_a >= 0)
            drweb_knight_turn(_a);
    }
}

// ---- Tenna (obj_tenna_enemy, encounter 121) ----
// Attack ids: 0-2 are Tenna's own bullet attacks, 3-11 the minigames ("physical challenges").
function drweb_tenna_attack_def(_a)
{
    // [myattackchoice, minigametype, difficulty]
    var _defs = [[0, "", 0], [1, "", 0], [2, "", 0], [3, "music", 0], [3, "cooking", 0], [3, "cowboy", 0], [3, "cowboy", 1], [3, "battle", 1], [3, "battle", 2], [3, "susiezilla", 2], [3, "susiezilla", 3], [3, "susiezilla", 4]];
    return _defs[clamp(_a, 0, 11)];
}

// Runs at the top of obj_tenna_enemy's Step (as obj_tenna_enemy).
function drweb_tenna_step()
{
    if (!variable_instance_exists(id, "drweb_init"))
    {
        drweb_init = 1;
        drweb_turns = 0;
        drweb_prevfail = 0;
        global.drweb_hitlock = 0;
        var _p = global.drweb_phase;
        if (_p == 2)
        {
            // Below half HP every turn is a minigame (obj_tenna_enemy_Other_10).
            global.monsterhp[myself] = floor(global.monstermaxhp[myself] * 0.5);
            healthphase = 2;
        }
        if (_p == 3)
        {
            // 1000 points: the next turn is the FINAL EPISODE (channel-surfing minigames, then Light 'Em Up).
            with (obj_tenna_enemy_bg)
                myscore = 1000;
        }
        if (global.drweb_mode == "single" || global.drweb_mode == "endless")
        {
            // Skip the story lines so each turn uses the chosen attack's own line.
            turns = 1;
            dialogueorder = 9;
            smashcutdialgue = 1;
            rimshotdialogue = 1;
            minigamedialogue = 1;
            doubleminigamedialogue = 1;
        }
    }
    // A failed minigame counts as a hit (the damage itself is dealt when the minigame ends).
    // (The umbrella minigame counts its fails inside scr_damage, which already reports the hit.)
    if (minigamefailcount > drweb_prevfail && global.drweb_mode == "hitless" && !i_ex(obj_elnina_umbrella))
        drweb_ch3_on_hit(0, -1);
    drweb_prevfail = minigamefailcount;
}

// Appended to obj_tenna_enemy's event_user(0) (its once-per-turn attack choice).
function drweb_tenna_choose()
{
    drweb_turns += 1;
    var _n = 12;
    var _a = drweb_turn_attack(_n);
    if (_a < 0)
        exit;
    var _d = drweb_tenna_attack_def(_a);
    minigameinsanity = false;
    myattackchoice = _d[0];
    minigameactivated = (_d[0] == 3);
    if (_d[0] == 3)
    {
        minigametype = _d[1];
        difficulty = _d[2];
        minigametype2 = "none";
        difficulty2 = 0;
        minigametype3 = "none";
        difficulty3 = 0;
    }
    dialogueorder = 9;
    if (global.drweb_mode == "endless" && drweb_turns > _n)
        global.monsterat[myself] = min(global.monsterat[myself] + 0.5, 20);
}
