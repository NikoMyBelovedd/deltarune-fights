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
        case 3: case 7: case 12: return stringsetloc("* Titan's DEFENSEs are dropped! ATTACKs will be super effective!", "obj_titan_enemy_slash_Other_10_gml_12_0");
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
        if (_p == 8)
        {
            // Just above 50% HP: the next hit starts the regeneration / Old Man ending.
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
    }
    // Titan's own "enemytalk" moment (obj_titan_enemy_Step_0: scr_isphase("enemytalk") && talked == 0).
    // It has no speech balloon in phases 1-6: the attack was picked by event_user(0) at the end of the
    // previous turn, together with the menu flavour text. We overwrite that pick here.
    if (global.monster[myself] == 1 && global.mnfight == 1 && talked == 0 && !finalunleashphasedone && phase <= 6)
    {
        drweb_turns += 1;
        var _a = drweb_turn_attack(13);
        if (_a >= 0)
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
