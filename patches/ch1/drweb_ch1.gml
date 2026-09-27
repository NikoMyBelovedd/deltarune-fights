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
