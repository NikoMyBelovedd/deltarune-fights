{{include:../common/drweb_core.gml}}

// ---- Chapter 2 story state ----

// Queen's mansion, just before the Queen fight (plot 160 = after the 4F chase, obj_ch2_scene24e).
// Party Kris, Susie, Ralsei, all player-controlled. Stats are scr_gamestart's Chapter 2 values
// (Kris 120 HP AT 12, Susie 140/16/MAG 1, Ralsei 100/10/MAG 9, all DF 2). A pacifist playthrough never levels up
// (scr_levelup only runs after a battle where an enemy was killed or frozen, flag[63]).
function drweb_ch2_mansion_state()
{
    global.darkzone = 1;
    global.char[0] = 1;
    global.char[1] = 2;
    global.char[2] = 3;
    for (var _i = 0; _i < 4; _i++)
        global.charauto[_i] = 0;
    global.plot = 160;
    global.flag[9] = 1;
    // Story unlocks from Cyber City that a new Chapter 2 file doesn't have yet:
    // flag[34] = 0 is the new battle menu where Susie and Ralsei have their own ACTs (S-Action / R-Action),
    // set by obj_ch2_cyber01; Susie learns UltimatHeal (spell 11) in obj_ch2_city07/city08.
    global.flag[34] = 0;
    scr_spellget(2, 11);
    global.entrance = 0;
    global.interact = 0;
    global.facing = 0;
}

// Resets the per-attempt guards. Called on boot and when a battle starts.
function drweb_ch2_reset_guards()
{
    global.drweb_ch2_hitlock = 0;
}

// Called from every Chapter 2 damage script where HP was really lost (scr_damage, scr_damage_proportional,
// scr_damage_sneo_final_attack). Spamton NEO's finale hits the whole party in one loop; in Hitless only the first
// hit of an attempt may restart the fight.
function drweb_ch2_hit(_amount, _target)
{
    if (global.drweb_mode == "hitless")
    {
        if (global.drweb_ch2_hitlock)
            return;
        global.drweb_ch2_hitlock = 1;
    }
    drweb_on_hit(_amount, _target);
}

// Appended to obj_battlecontroller's Create.
function drweb_ch2_on_battle()
{
    drweb_ch2_reset_guards();
    drweb_emit("battle", global.encounterno);
}

// Sends the game into the selected fight. Called at boot and on every restart.
function drweb_boot_fight()
{
    drweb_load_config();
    scr_gamestart();
    drweb_ch2_reset_guards();
    if (global.drweb_seed != 0)
        random_set_seed(global.drweb_seed);
    var _quick = (global.drweb_intro == 0 || global.drweb_attempt > 0);
    switch (global.drweb_boss)
    {
        case "queen":
            drweb_ch2_mansion_state();
            // Berdly's two earlier battles (flag[529], flag[550]) spared, as in a normal playthrough: sparing Queen
            // (freeing Berdly) then plays the full-spare ending (obj_queen_enemy defeat_cutscene_version).
            global.flag[529] = 2;
            global.flag[550] = 2;
            global.flag[457] = 0;
            global.flag[548] = 0;
            global.tempflag[31] = _quick;
            drweb_apply_loadout();
            drweb_emit("start", "queen");
            room_goto(room_dw_mansion_east_4f_d);
            break;
        default:
            drweb_ch2_mansion_state();
            global.flag[309] = 8;
            global.flag[571] = 0;
            if (global.drweb_variant == "snowgrave")
            {
                // Snowgrave route at the fountain (obj_fountainkris_ch2_sideb): flag[915] = 9 is set by
                // obj_ch2_scene_sideb_noelleroom, and scr_sideb_get_phase() then returns 3. Kris fights alone:
                // the party was lost when Berdly was frozen (obj_berdlyb2_enemy -> scr_losechar).
                global.flag[915] = 9;
                global.flag[916] = 0;
                global.char[1] = 0;
                global.char[2] = 0;
                // Every battle won with a frozen enemy runs scr_levelup (flag[63]). The route freezes up to 19
                // tracked encounters (scr_sideb_checkencounters) plus chase enemies; 20 level-ups is the usual total
                // and puts Kris at the 160 HP cap with AT 14.
                repeat (20)
                    scr_levelup();
                global.tempflag[34] = _quick;
                drweb_apply_loadout();
                drweb_emit("start", "spamton_neo");
                room_goto(room_dw_mansion_fountain);
            }
            else
            {
                global.tempflag[32] = _quick;
                drweb_apply_loadout();
                drweb_emit("start", "spamton_neo");
                room_goto(room_dw_mansion_b_east);
            }
            break;
    }
}

// ---- Spamton NEO ----
// Attacks as (rr, difficulty) pairs, in the order of the scripted turn table in obj_spamton_neo_enemy_Other_10.
// [phase, phaseturn]: event_user(0) runs phaseturn++ and then picks rr/difficulty from it, and the speech line is
// chosen from rr/difficulty right after, so steering phaseturn gives the attack with its own line and turn length.
function drweb_sneo_table()
{
    return [
        [1, 1],   // 0  FLYING HEADS          rr 0   diff 1
        [1, 2],   // 1  RECREW COLUMNS        rr 6   diff 0
        [1, 3],   // 2  HEART ATTACK          rr 2   diff 0
        [1, 4],   // 3  PHONE CALL            rr 8   diff 0
        [1, 5],   // 4  PHONE HANDS           rr 8.5 diff 0
        [1, 6],   // 5  FACE ATTACK           rr 7   diff 0
        [1, 7],   // 6  HEART ATTACK II       rr 2   diff 2
        [1, 8],   // 7  FLYING HEADS II       rr 0   diff 3
        [1, 10],  // 8  PHONE HANDS II        rr 8.5 diff 2 (diff 1 if never hit during PHONE HANDS)
        [1, 11],  // 9  PHONE CALL II         rr 8   diff 1
        [1, 12],  // 10 RECREW COLUMNS II     rr 6   diff 1
        [4, 1],   // 11 HEART ATTACK III      rr 2   diff 1
        [4, 2],   // 12 PHONE CALL III        rr 8   diff 3
        [4, 3]    // 13 NEO FINALE            rr 9   diff 0
    ];
}

// Runs at the top of obj_spamton_neo_enemy's Step.
function drweb_sneo_step()
{
    if (!variable_instance_exists(id, "drweb_init"))
    {
        drweb_init = 1;
        drweb_turns = 0;
    }
    if (global.fighting != 1 || global.monster[myself] != 1)
        return;
    if (!variable_instance_exists(id, "drweb_phase_done"))
    {
        drweb_phase_done = 1;
        var _p = global.drweb_phase;
        if (_p > 0)
        {
            // Phase starts. 2 = the looping part of the script (turn 7+), 3 = below 30% HP (phase 4 of the script),
            // 4 = the NEO FINALE turn at 10% HP (on the Snowgrave route this is where the ending sequence starts).
            var _hp = [1, 1, 0.6, 0.29, 0.09];
            var _pt = [0, 0, 6, 0, 2];
            var _ph = [1, 1, 3, 4, 4];
            _p = clamp(_p, 1, 4);
            global.monsterhp[myself] = ceil(global.monstermaxhp[myself] * _hp[_p]);
            phase = _ph[_p];
            phaseturn = _pt[_p];
        }
    }
    if (scr_isphase("enemytalk") && talked == 0 && endcon == 0 && weirdpathendcon == 0 && !(global.monsterhp[myself] <= 0 && scr_sideb_get_phase() <= 2))
    {
        var _tab = drweb_sneo_table();
        var _n = array_length(_tab);
        drweb_turns += 1;
        var _a = drweb_turn_attack(_n);
        if (global.drweb_mode == "endless" && drweb_turns > _n)
            global.monsterat[myself] = min(global.monsterat[myself] + 0.5, 26);
        if (_a >= 0)
        {
            _a = clamp(_a, 0, _n - 1);
            phase = _tab[_a][0];
            phaseturn = _tab[_a][1] - 1;
            // Speech lines depend on these counters; reset them so every forced turn gets its first-time line.
            haveusedfinalattack = 0;
            finalattackconversationcon = 0;
            faceattackcount = 0;
            nothitduringphonehands = 0;
        }
    }
}

// Appended to obj_ch2_sceneex2's Create: the fight starts when Kris walks left past start_xpos. Put him there.
function drweb_sneo_scene_create()
{
    if (con == 1 && instance_exists(obj_mainchara))
    {
        with (obj_mainchara)
            x = other.start_xpos;
    }
}

// ---- Queen ----
// [kind, a, b]: kind 0 = scripted turn (phase a, phaseturn b), 1 = wine/acid shield (phase a, beatwine2nodamage b),
// 2 = final attack. obj_queen_enemy_Other_10 runs phaseturn++ and then picks rr/difficulty.
function drweb_queen_table()
{
    return [
        [0, 1, 1],   // 0  BERDLY TORNADO     rr 7 diff 0
        [0, 1, 2],   // 1  STOMP              rr 3 diff 0
        [0, 1, 3],   // 2  EXPLOSION          rr 6 diff 0
        [0, 1, 4],   // 3  QUEEN LASER        rr 8 diff 0
        [0, 1, 5],   // 4  SOCIAL MEDIA       rr 4 diff 0
        [0, 1, 6],   // 5  PLUG               rr 9 diff 0
        [0, 1, 7],   // 6  QUEEN LASER II     rr 8 diff 4
        [0, 3, 8],   // 7  SOCIAL MEDIA II    rr 4 diff 1
        [0, 3, 9],   // 8  BERDLY TORNADO II  rr 7 diff 1
        [0, 3, 10],  // 9  EXPLOSION II       rr 6 diff 1
        [0, 3, 11],  // 10 PLUG II            rr 9 diff 1
        [0, 3, 12],  // 11 QUEEN LASER III    rr 8 diff 5
        [1, 2, 0],   // 12 WINE               rr 2 diff 0
        [1, 3, 0],   // 13 WINE II            rr 2 diff 1
        [1, 4, 1],   // 14 WINE III           rr 2 diff 2
        [2, 4, 0]    // 15 QUEEN ULTIMATE     rr 1 diff 0
    ];
}

// Runs at the top of obj_queen_enemy's Step.
function drweb_queen_step()
{
    if (!variable_instance_exists(id, "drweb_init"))
    {
        drweb_init = 1;
        drweb_turns = 0;
    }
    if (global.monster[myself] != 1)
        return;
    if (!variable_instance_exists(id, "drweb_phase_done"))
    {
        drweb_phase_done = 1;
        var _p = global.drweb_phase;
        if (_p > 0)
        {
            // Phase 2..4 start where the HP gates in obj_queen_enemy_Other_12 would move her; the gate itself then
            // runs on the first enemy turn and sets up the acid shield exactly as in the real fight.
            var _hp = [1, 1, 0.74, 0.49, 0.24];
            _p = clamp(_p, 1, 4);
            global.monsterhp[myself] = ceil(global.monstermaxhp[myself] * _hp[_p]);
            if (_p >= 3)
                phase = _p - 1;
        }
    }
    if (scr_isphase("enemytalk") && talked == 0 && intro == 0 && endcon == 0 && global.monsterhp[myself] > 0 && bardlymercy <= 99)
    {
        var _tab = drweb_queen_table();
        var _n = array_length(_tab);
        drweb_turns += 1;
        var _a = drweb_turn_attack(_n);
        if (global.drweb_mode == "endless" && drweb_turns > _n)
            global.monsterat[myself] = min(global.monsterat[myself] + 0.5, 20);
        drweb_force = -1;
        if (_a >= 0)
        {
            drweb_force = clamp(_a, 0, _n - 1);
            // Only the final attack has its own speech (usefinalattack picks "Enough You Foolish Children!").
            // Her other lines follow the story order (balloonorder) whatever the attack is.
            usefinalattack = (_tab[drweb_force][0] == 2) ? 1 : 0;
            if (usefinalattack)
                finalattackdialoguecon = 0;
        }
    }
}

// Prepended to obj_queen_enemy_Other_10 (her attack picker, run when the bullet phase starts). Re-applies the forced
// turn here because the shield check and HP gates in her talk phase can change phase/usefinalattack/usewineattack.
function drweb_queen_pick()
{
    if (!variable_instance_exists(id, "drweb_force") || drweb_force < 0)
        return;
    var _t = drweb_queen_table();
    var _e = _t[drweb_force];
    drweb_force = -1;
    usewineattack = 0;
    usefinalattack = 0;
    if (_e[0] == 0)
    {
        phase = _e[1];
        phaseturn = _e[2] - 1;
    }
    else if (_e[0] == 1)
    {
        phase = _e[1];
        beatwine2nodamage = _e[2];
        usewineattack = 1;
    }
    else
    {
        phase = 4;
        usefinalattack = 1;
    }
}

// Appended to obj_ch2_scene25's Create: the cutscene starts once Kris walks right past x=650. Put him there;
// the Step's caterpillarmove block then lines Susie and Ralsei up behind him.
function drweb_queen_scene_create()
{
    if (con == -1 && instance_exists(obj_mainchara) && global.plot < 165)
    {
        with (obj_mainchara)
            x = 660;
    }
}
