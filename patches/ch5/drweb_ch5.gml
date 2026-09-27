{{include:../common/drweb_core.gml}}

function drweb_ch5_state()
{
    global.darkzone = 1;
    global.char[0] = 1;
    global.char[1] = 2;
    global.char[2] = 3;
    for (var _i = 0; _i < 4; _i++)
        global.charauto[_i] = 0;
    global.plot = 480;
    global.flag[9] = 0;
    drweb_apply_loadout();
}

function drweb_boot_fight()
{
    drweb_load_config();
    scr_gamestart();
    if (global.drweb_seed != 0)
        random_set_seed(global.drweb_seed);
    switch (global.drweb_boss)
    {
        case "flowery":
            drweb_ch5_state();
            global.tempflag[98] = 0;
            global.tempflag[97] = (global.drweb_intro == 0 || global.drweb_attempt > 0) ? 1 : 0;
            drweb_emit("start", "flowery");
            room_goto(room_dw_fcastle_flowery);
            break;
        default:
            drweb_ch5_state();
            if (global.drweb_intro == 0 || global.drweb_attempt > 0)
                global.tempflag[62] = 1;
            drweb_emit("start", "pink");
            room_goto(room_dw_pink_encounter);
            break;
    }
}

// ---- Flowery ----
// Runs at the top of obj_ch5_DW29's Step: walks Kris into whichever trigger the cutscene is waiting for.
function drweb_flowery_room_step()
{
    if (!variable_instance_exists(id, "dbgt")) dbgt = 0;
    dbgt++;
    if (dbgt % 30 == 0 && dbgt < 3000) show_debug_message("DBG " + string(dbgt) + " con=" + string(con) + " cc=" + string(customcon) + " int=" + string(global.interact) + " bt=" + string(instance_exists(obj_flowery_battle_transition) ? obj_flowery_battle_transition.con : -99) + " cm=" + string(instance_number(obj_cutscene_master)) + " pu=" + string(instance_number(obj_ch5_DW29_power_up)) + " d=" + string(d_ex()));
    if (global.interact != 0 || d_ex())
        exit;
    var _want = "";
    if (con < 0 && enter_active)
        _want = "flowery_a";
    else if (con == 3 && customcon == 1)
        _want = "flowery_b";
    else if (con == 6 && customcon == 1)
        _want = "flowery_c";
    if (_want == "")
        exit;
    with (obj_trigger)
    {
        if (extflag == _want)
        {
            // Line up Kris's collision box with the trigger's so place_meeting() fires this frame.
            obj_mainchara.x += (bbox_left + 8) - obj_mainchara.bbox_left;
            obj_mainchara.y += (bbox_top + 1) - obj_mainchara.bbox_top;
        }
    }
}
