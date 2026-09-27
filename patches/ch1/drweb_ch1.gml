{{include:../common/drweb_core.gml}}

// Chapter 1 story state shared by the late-game fights (party of Kris, Susie, Ralsei in the Card Castle).
function drweb_ch1_castle_state()
{
    global.darkzone = 1;
    global.char[0] = 1;
    global.char[1] = 2;
    global.char[2] = 3;
    for (var _i = 0; _i < 4; _i++)
        global.charauto[_i] = 0;
    global.plot = 165;
    global.flag[9] = 0;
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
            drweb_ch1_castle_state();
            global.flag[241] = 5;
            if (global.drweb_intro == 0 || global.drweb_attempt > 0)
                global.tempflag[4] = 1;
            drweb_emit("start", "jevil");
            room_goto(room_cc_joker);
            break;
    }
}

// ---- Jevil ----
// Scripted turn (jturn) that plays each attack id, so its own speech line and turn length come with it.
function drweb_jevil_jturn(_attack)
{
    var _map = [0, 1, 2, 3, 5, 6, 7, 8, 10, 11, 12, 13, 15, 16, 17, 18];
    return _map[clamp(_attack, 0, 15)];
}

// Runs at the top of obj_joker's Step (as obj_joker).
function drweb_jevil_step()
{
    if (!variable_instance_exists(id, "drweb_init"))
    {
        drweb_init = 1;
        drweb_turns = 0;
        var _p = global.drweb_phase;
        if (_p > 0)
        {
            var _jt = [0, 0, 5, 10, 15, 18];
            var _hp = [1, 1, 0.8, 0.6, 0.4, 0.15];
            var _dance = [0, 0, 1, 1, 3, 2];
            jturn = _jt[_p];
            global.monsterhp[myself] = ceil(global.monstermaxhp[myself] * _hp[_p]);
            var _d = _dance[_p];
            with (body)
                dancelv = _d;
        }
    }
    if (global.monster[myself] == 1 && global.mnfight == 1 && talked == 0)
    {
        drweb_turns += 1;
        var _a = -1;
        if (global.drweb_mode == "single")
            _a = global.drweb_attack;
        else if (global.drweb_mode == "endless")
        {
            _a = drweb_bag_next(16);
            if (drweb_turns > 16)
                global.monsterat[myself] = min(global.monsterat[myself] + 0.5, 20);
        }
        if (_a >= 0)
            jturn = drweb_jevil_jturn(_a);
        drweb_emit("attack", _a);
    }
}
