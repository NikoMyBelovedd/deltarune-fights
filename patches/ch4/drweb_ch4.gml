{{include:../common/drweb_core.gml}}

// Chapter 4 story state shared by the Dark Sanctuary fights: Kris, Susie, Ralsei in the Dark World.
// Stats are the Chapter 4 start values from scr_gamestart (chapter == 4); level-ups only come from
// violent/fled battles (scr_defeatrun -> scr_levelup), so a pacifist route keeps them.
function drweb_ch4_party_state(_plot)
{
    global.darkzone = 1;
    global.char[0] = 1;
    global.char[1] = 2;
    global.char[2] = 3;
    for (var _i = 0; _i < 4; _i++)
        global.charauto[_i] = 0;
    global.plot = _plot;
    global.flag[9] = 1;
    // Susie's healing arc: below 6 her Heal reads "Can't use" (scr_spellinfo case 11). The Sanctuary scene
    // obj_ch4_DCA08D sets it to 6 before both the Gerson and Titan fights.
    global.flag[850] = 6;
    global.interact = 0;
    drweb_apply_loadout();
}

// Sends the game into the selected fight. Called at boot and on every restart.
function drweb_boot_fight()
{
    drweb_load_config();
    scr_gamestart();
    if (global.drweb_seed != 0)
        random_set_seed(global.drweb_seed);
    switch (global.drweb_boss)
    {
        case "gerson":
            // Hammer of Justice: room_dw_church_arena, Sanctuary 2 (Gerson's study only exists while plot < 242).
            // flag 851: 1 = secret piano solved, first visit (full intro); 2 = met Gerson already (the game's own
            // rematch path, used for "skip intro" and retries). 852 = axe already won (must be 0), 853 = loss counter
            // (kept 0: > 0 routes the arena through call_later()).
            drweb_ch4_party_state(240);
            global.flag[852] = 0;
            global.flag[853] = 0;
            global.flag[851] = (global.drweb_intro == 0 || global.drweb_attempt > 0) ? 2 : 1;
            global.flag[1548] = 1;
            global.entrance = 0;
            drweb_emit("start", "gerson");
            room_goto(room_dw_church_arena);
            break;
        default:
            // Titan: room_dw_churchc_titanclimb2_post, the top of the climb. tempflag[96] is the game's own
            // loss counter; > 0 selects the shortened retry intro. Keep it at 1 so the "sympathy" chests
            // (losscount >= 2) and slower big shots (> 3) don't appear.
            drweb_ch4_party_state(249);
            global.tempflag[96] = (global.drweb_intro == 0 || global.drweb_attempt > 0) ? 1 : 0;
            global.flag[1640] = global.tempflag[96];
            global.entrance = 0;
            drweb_emit("start", "titan");
            room_goto(room_dw_churchc_titanclimb2_post);
            break;
    }
}

// ---- Titan ----
// Runs at the top of obj_dw_churchc_titanclimb2_post's Step: the cutscene waits for the player to walk right
// (con 4: x >= 3486, con 16: x >= 3877). We walk for them.
function drweb_titan_room_step()
{
    if (con == 4 && obj_mainchara.x < 3486)
        obj_mainchara.x = 3486;
    if (con == 16 && obj_mainchara.x < 3877)
        obj_mainchara.x = 3877;
}

// Attack table for Single/Endless: [phase, myattackchoice]. The phase matters: it scales the Big Shot
// volleys (pattern_bigshots_aimed reads phase >= 4 / >= 6) and phases 2/4/6 are the "unleashed" (shield down) ones.
function drweb_titan_attack(_a)
{
    var _t = [[1, 0], [1, 12], [1, 9], [2, 4], [3, 1], [3, 14], [3, 10], [4, 4], [5, 5], [5, 15], [5, 11], [6, 3], [6, 4]];
    return _t[clamp(_a, 0, array_length(_t) - 1)];
}

function drweb_titan_battlemsg(_a)
{
    switch (_a)
    {
        case 0: return stringsetloc("* The ground shudders.&* A swarm is coming.", "obj_titan_enemy_slash_Other_10_gml_15_0");
        case 1: return stringsetloc("* The darkness gives a long gaze, which slithered like a snake. ", "obj_titan_enemy_slash_Other_10_gml_16_0");
        case 2: return stringsetloc("* For a moment, &* You felt your heart being gripped.", "obj_titan_enemy_slash_Other_10_gml_17_0");
        case 4: case 8: return stringsetloc("* The darkness slithers.", "obj_titan_enemy_slash_Other_10_gml_8_0");
        case 5: case 9: return stringsetloc("* Darkness flows.&* A swarm is coming.", "obj_titan_enemy_slash_Other_10_gml_9_0");
        case 6: case 10: return stringsetloc("* The Titan's hands began to move once more.", "obj_titan_enemy_slash_Other_10_gml_10_0");
        case 3: case 7: return stringsetloc("* Titan's DEFENSE dropped massively! ATTACKs are super effective!", "obj_titan_enemy_slash_Other_10_gml_4_0");
        case 12: return stringsetloc("* Titan's DEFENSEs are dropped! ATTACKs will be super effective!", "obj_titan_enemy_slash_Other_10_gml_12_0");
    }
    return "";
}

// Opens/closes the Titan's shield the way UNLEASH (obj_purify_event -> starshootcon 1) and the de-unleash
// at the end of an unleashed phase (starshootcon 3) do.
function drweb_titan_set_unleashed(_open)
{
    if (_open && !unleashed)
    {
        unleashed = true;
        starshootcon = 1;
        if (drawstate == "defense" || drawstate == "defense end")
            drawstate = "undefense";
    }
    if (!_open && unleashed)
    {
        unleashed = false;
        starshootcon = 3;
    }
}

// Runs at the top of obj_titan_enemy's Step (as obj_titan_enemy).
function drweb_titan_step()
{
    if (!variable_instance_exists(id, "drweb_init"))
    {
        drweb_init = 1;
        drweb_turns = 0;
        var _p = global.drweb_phase;
        if (_p == 3 || _p == 5)
        {
            // Start of phase 3 / 5: the shield has come back after the 1st / 2nd UNLEASH.
            phase = _p;
            phaseturn = 1;
            myattackchoice = (_p == 3) ? 1 : 5;
            unleashcount = (_p == 3) ? 1 : 2;
            global.tension = 0;
            global.monsterhp[myself] = floor(global.monstermaxhp[myself] * ((_p == 3) ? 0.9 : 0.75));
        }
        if (_p == 6)
        {
            // Third UNLEASH: shield gone for good, desperation volley then repeated Big Shots until 50% HP.
            phase = 6;
            phaseturn = 1;
            phase6turn = 2;
            myattackchoice = 3;
            unleashcount = 3;
            global.canact[myself][3] = 0;
            global.actname[myself][3] = "";
            global.actactor[myself][3] = 0;
            global.monsterhp[myself] = floor(global.monstermaxhp[myself] * 0.62);
            drweb_titan_set_unleashed(true);
        }
        if (_p == 7)
        {
            // REGENERATION: just above 50% HP with the shield gone; the next hit starts the "Did we do it...?"
            // ending (obj_titan_enemy_Step_0: monsterhp <= 50% -> finalunleashphasedone, endingcon 1).
            phase = 6;
            phaseturn = 1;
            loopedphase6 = true;
            myattackchoice = 4;
            unleashcount = 3;
            global.canact[myself][3] = 0;
            global.actname[myself][3] = "";
            global.actactor[myself][3] = 0;
            global.monsterhp[myself] = floor(global.monstermaxhp[myself] * 0.5) + 1;
            drweb_titan_set_unleashed(true);
        }
        if (_p == 8)
        {
            // OLD MAN: jump into the ending right where Gerson's hammer hits the Titan (endingcon 16), as if
            // phase 7's third regeneration turn had just been talked through. The game's own script then plays
            // Gerson's lines, adds DualBuster and moves to phase 8.
            finalunleashphasedone = true;
            phase = 7;
            phaseturn = 3;
            unleashcount = 3;
            global.monsterhp[myself] = floor(global.monstermaxhp[myself] * 0.5);
            global.canact[myself][3] = 0;
            global.actname[myself][3] = "";
            global.actactor[myself][3] = 0;
            global.tension = global.maxtension;
            with (obj_writer)
                instance_destroy();
            with (obj_face)
                instance_destroy();
            global.charturn = 3;
            global.myfight = -1;
            global.mnfight = 1;
            talked = 0.1;
            talktimer = 0;
            drawstate = "defense";
            endingcon = 16;
            endingtimer = 0;
        }
    }
    // Titan's own "enemytalk" moment (obj_titan_enemy_Step_0: scr_isphase("enemytalk") && talked == 0).
    // It has no speech balloon in phases 1-6: the attack was picked by event_user(0) at the end of the
    // previous turn, together with the menu flavour text. We overwrite that pick here.
    if (global.monster[myself] == 1 && global.mnfight == 1 && talked == 0)
    {
        drweb_turns += 1;
        var _a = drweb_turn_attack(13);
        if (_a >= 0 && !finalunleashphasedone && phase <= 6)
        {
            var _e = drweb_titan_attack(_a);
            phase = _e[0];
            myattackchoice = _e[1];
            difficulty = 0;
            // Stay in the phase: event_user(0) at the end of the turn advances phaseturn, never the phase
            // for phases 1/3/5, and phase 2/4 -> 3/5 only when phaseturn reaches 2.
            phaseturn = 0;
            if (phase == 6)
                loopedphase6 = true;
            drweb_titan_set_unleashed(phase == 2 || phase == 4 || phase == 6);
            global.battlemsg[0] = drweb_titan_battlemsg(_a);
            // Endless: never reach the 50% HP ending.
            if (global.drweb_mode == "endless")
                global.monsterhp[myself] = max(global.monsterhp[myself], floor(global.monstermaxhp[myself] * 0.5) + 1);
        }
    }
}

// ---- Gerson (Hammer of Justice) ----
// Runs at the end of obj_dw_church_arena's Create (manifest "append"). Starts the fight without the player walking.
function drweb_gerson_arena_create()
{
    if (global.drweb_boss != "gerson")
        exit;
    if (scr_flag_get(851) == 2)
    {
        // Rematch path (scr_text case 1390 sets con = 25): pan to the arena, then con 11 starts the battle.
        con = 25;
    }
    else
    {
        // First visit: what walking past x >= 410 does (obj_dw_church_arena_Step_0:5-10) -> con 2 = full intro cutscene.
        con = 1;
        alarm[0] = 1;
        global.interact = 1;
    }
}

// Scripted order: event_user(0) (Other_10:2170-2249) builds the pattern stored in attackpattern, then picks the
// pattern for the NEXT turn from trueturn. Speech is keyed on `turn` (Step_0:128-282). Attack id == trueturn.
function drweb_gerson_pattern(_t)
{
    var _p = [0, 1, 2, 3, 4, 72, 70, 6, 7, 12, 9, 47, 70, 13, 14, 53, 55, 56, 220];
    return _p[clamp(_t, 0, 18)];
}

// Forces enemy turn _a (0..18 = scripted turns, 19 = the final HAMMER OF JUSTICE) with its own speech line.
function drweb_gerson_force(_a)
{
    drweb_forced = _a;
    gothitlastturn = 0;       // otherwise turn 1 replays the tutorial (Step_0:147-156)
    repeatonce = 1;
    if (_a >= 19)
    {
        // Step_0:121: progress >= 84 -> trueturn = 20 -> final speech (dialogue_string53..59) + pattern 19.
        progress = 84;
    }
    else
    {
        progress = min(progress, 83);
        trueturn = _a;
        turn = _a;
        attackpattern = drweb_gerson_pattern(_a);
        reachedendphase = 0;
    }
}

// Runs at the top of obj_hammer_of_justice_enemy's Step (as obj_hammer_of_justice_enemy).
function drweb_gerson_step()
{
    var _loop = (global.drweb_mode == "single" || global.drweb_mode == "endless");
    if (!variable_instance_exists(id, "drweb_init"))
    {
        drweb_init = 1;
        drweb_turns = 0;
        drweb_latch = 0;
        drweb_forced = -1;
        // Create sets global.invc = 0.5 (after drweb_apply_dials ran); re-apply the i-frames dial on top.
        if (variable_global_exists("drweb_iframes"))
            global.invc = 0.5 * global.drweb_iframes / 100;
        var _p = global.drweb_phase;
        if (_p > 0)
        {
            firstconversationhappened = true;
            repeatonce = 1;
            if (_p >= 20)
            {
                progress = 84;
            }
            else
            {
                trueturn = _p;
                turn = _p;
                attackpattern = drweb_gerson_pattern(_p);
                progress = (_p >= 16) ? 75 : ((_p >= 12) ? 50 : 25);
            }
        }
        else if (global.drweb_attempt > 0 && !_loop)
        {
            // The game's own retry (Create:95-101, flag 853 != 0): skip the tutorial turn 0.
            trueturn = 1;
            turn = 1;
            attackpattern = 1;
            repeatonce = 1;
        }
    }
    // Gerson's turn start (Step_0:97): enemytalk && talked == 0 && endcon == 0 (+ waits for rude buster / item steal).
    if (scr_isphase("enemytalk") && talked == 0 && endcon == 0)
    {
        if (!drweb_latch)
        {
            drweb_latch = 1;
            drweb_turns += 1;
            var _a = drweb_turn_attack(20);
            if (_a >= 0)
                drweb_gerson_force(_a);
        }
        if (_loop && drweb_forced >= 0 && drweb_forced < 19)
            progress = min(progress, 83);    // mercy-laugh stars may still add progress before the block fires
    }
    else if (!scr_isphase("enemytalk"))
    {
        drweb_latch = 0;
    }
    if (_loop)
    {
        // Never reach the win cutscene (Step_0:883-893, 921-934) and never jump to the final phase on our own.
        have_used_final_attack = false;
        if (drweb_forced < 19)
            progress = min(progress, 83);
    }
}

// scr_damage: Susie at 0 HP is a *loss* here, not a game over (scr_damage:192-217 refills her HP and ends the
// battle with flag[36] = 1). Practice / Single: keep fighting. Returns true to skip the loss.
function drweb_gerson_down()
{
    if (global.drweb_mode == "practice" || global.drweb_mode == "single")
    {
        drweb_on_gameover();                  // emits "gameover", revives
        global.hp[2] = global.maxhp[2];
        return true;
    }
    return false;
}

// Arena Step (con 15, flag[36] > 0): the battle was lost. The real game plays a consolation scene and lets you
// talk to Gerson for a rematch; we retry immediately (normal / hitless / endless).
function drweb_gerson_lost()
{
    if (!drweb_on_gameover())
        drweb_restart("gameover");
}
