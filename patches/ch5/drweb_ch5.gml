{{include:../common/drweb_core.gml}}

// Chapter 5 story state at the Pink and Flowery fights: Flower Castle, plot 473 (set by the green checkpoint,
// unchanged until Flowery is beaten), party Kris/Susie/Ralsei. scr_gamestart() has already run
// scr_gamestart_chapter_override(), which sets the Chapter 5 base stats (240/290/210 HP, AT 17/22/15, MAG 0/3/14),
// the Chapter 5 spells (Scythemare, ReviveSong) and the default gear (Winglade/ToxicAxe/FlexScarf + 2x GingerGuard).
function drweb_ch5_state()
{
    if (!variable_global_exists("console"))
        global.console = 0;   // read by obj_dw_pink_encounter and obj_flowery_towery_pillars but never assigned on PC
    global.darkzone = 1;
    global.char[0] = 1;
    global.char[1] = 2;
    global.char[2] = 3;
    for (var _i = 0; _i < 4; _i++)
        global.charauto[_i] = 0;
    global.plot = 473;
    global.flag[9] = 0;
    global.interact = 0;
    // Chapter 5 levels up by sparing (scr_levelup after each recruit/spare win). A player reaching the castle
    // has spared plenty: 20 spare-wins reaches every cap (Kris 280/AT 19, Susie 340/AT 24/MAG 5, Ralsei 250/AT 17/MAG 16).
    repeat (20)
        scr_levelup();
    // The five castle-route recruits (Floradinn, Leafling, Shi, Shinobeetle, Kawkaw) join Flowery's ACTs.
    for (var _f = 670; _f <= 674; _f++)
        global.flag[_f] = 1;
    drweb_apply_loadout();
}

// Sends the game into the selected fight. Called at boot and on every restart.
function drweb_boot_fight()
{
    drweb_load_config();
    scr_gamestart();
    if (global.drweb_seed != 0)
        random_set_seed(global.drweb_seed);
    var _quick = (global.drweb_intro == 0 || global.drweb_attempt > 0 || global.drweb_phase > 0);
    switch (global.drweb_boss)
    {
        case "flowery":
            drweb_ch5_state();
            global.tempflag[98] = 0;   // 1 would replay the "we lost" scene instead of the fight
            if (_quick)
            {
                global.tempflag[97] = 1;   // shortened walk-up and battle transition (the game's own retry path)
                global.tempflag[65] = max(global.tempflag[65], 1);   // flag[1865] > 1: no dash tutorial
            }
            drweb_emit("start", "flowery");
            room_goto(room_dw_fcastle_flowery);
            break;
        default:
            drweb_ch5_state();
            global.flag[1846] = 1;   // door opened, not beaten yet (>= 2 skips the encounter)
            // Bomb dial (obj_dw_fcastle_pinkroom): 0 "Default", 1 "Nicer bombs", 2 "Meaner bombs".
            global.flag[1914] = (global.drweb_variant == "easy") ? 1 : ((global.drweb_variant == "harder") ? 2 : 0);
            if (_quick)
            {
                global.tempflag[62] = max(global.tempflag[62], 1);   // short pre-battle scene
                global.tempflag[96] = max(global.tempflag[96], 1);   // flag[1449] > 1: no in-battle opening
            }
            drweb_emit("start", "pink");
            room_goto(room_dw_pink_encounter);
            break;
    }
}

// ---- Flowery ----
// Runs at the top of obj_ch5_DW29's Step. With the full intro the player walks into the room's triggers, exactly
// like the real game. On the shortened retry path we fire each trigger's own effect in place instead (the same
// con / lose_control() the trigger does), so nobody is moved: teleporting Kris onto the triggers left Susie and
// Ralsei behind and had them walk through the air to catch up.
function drweb_flowery_room_step()
{
    if (!_shortened_mode || global.interact != 0 || d_ex())
        exit;
    if (instance_exists(obj_cutscene_master) && obj_cutscene_master.cs_wait_custom != 1)
        exit;
    var _fire = "";
    if (con < 0 && enter_active)
        _fire = "flowery_a";
    else if (con == 3 && customcon == 1)
        _fire = "flowery_b";
    else if (con == 6 && customcon == 1)
        _fire = "flowery_c";
    if (_fire == "")
        exit;
    // Put the party where the player would have walked them: Kris on the trigger, Susie and Ralsei right behind.
    // Then the cutscene's own walks are short and stay on the ground.
    with (obj_trigger)
    {
        if (extflag == _fire)
        {
            obj_mainchara.x += (bbox_left + 8) - obj_mainchara.bbox_left;
            obj_mainchara.y += (bbox_top + 1) - obj_mainchara.bbox_top;
        }
    }
    with (obj_caterpillarchara)
    {
        x = obj_mainchara.x;
        y = obj_mainchara.y;
        scr_caterpillar_interpolate();
    }
    if (_fire == "flowery_a")
    {
        con = 0;
        global.interact = 1;
        enter_active = false;
    }
    else if (_fire == "flowery_b")
    {
        con = 5;
        lose_control();
    }
    else
    {
        con = 7;
        lose_control();
    }
    with (obj_trigger)
    {
        if (extflag == _fire)
            instance_destroy();
    }
}

// Flowery's attacks, in story order. Each row: myattackchoice, phase, phaseturn before the turn,
// speech counter value before the turn (phase_1_2_turn / phases3turn / phases4turn / phases5turn / phases6turn).
// Setting these at the start of the enemy turn makes Other_11 pick the attack and the speech block pick its own line.
function drweb_flowery_table()
{
    return [
        [3, 1, 0, 0],   // 0 WALL TUTORIAL
        [0, 1, 1, 2],   // 1 PETAL JARONA
        [4, 1, 2, 3],   // 2 HEDGE CHASE
        [2, 1, 3, 4],   // 3 JARONA BARRAGE
        [10, 3, 0, 0],  // 4 SETH'S BOXES
        [21, 3, 1, 1],  // 5 AQUA KNIVES
        [11, 3, 2, 2],  // 6 SETH'S BOXES EX
        [16, 4, 0, 0],  // 7 ORANGE COMBO
        [18, 4, 1, 1],  // 8 JUST KIDDING
        [12, 4, 2, 2],  // 9 WILD CHASE
        [15, 5, 0, 0],  // 10 JUSTICE CHASE
        [19, 6, 0, 0],  // 11 SUPER JARONA
        [14, 6, 1, 1]   // 12 HARD JARONA
    ];
}

// Runs at the top of obj_flowery_enemy's Step (as obj_flowery_enemy).
function drweb_flowery_step()
{
    if (!variable_instance_exists(id, "drweb_init"))
    {
        drweb_init = 1;
        drweb_turns = 0;
        // Phase start: the phase's own ACTs; its friends walk in on the phase's first speech.
        var _p = global.drweb_phase;
        if (_p >= 2 && _p <= 6)
        {
            phase = _p;
            phaseturn = 0;
            global.mercymod[myself] = (_p - 1) * 10;
            event_user(0);
        }
    }
    if (global.monster[myself] == 1 && scr_isphase("enemytalk") && talked == 0 && endcon == 0 && phasetransition_con == 0 && healingscenecon == 0 && flowery_blowkiss_scene_con == 0)
    {
        drweb_turns += 1;
        var _t = drweb_flowery_table();
        var _a = drweb_turn_attack(array_length(_t));
        if (global.drweb_mode == "endless" && drweb_turns > array_length(_t))
            damage = min(damage + 4, 150);
        if (_a >= 0)
        {
            var _r = _t[clamp(_a, 0, array_length(_t) - 1)];
            phase = _r[1];
            phaseturn = _r[2];
            damage_taken_during_tutorial = 0;
            switch (phase)
            {
                case 1:
                    phase_1_2_turn = _r[3];
                    break;
                case 3:
                    phases3turn = _r[3];
                    if (aqua_and_purple_enter == 0 && _r[3] > 0)
                        aqua_and_purple_enter = 1;
                    did_sethaqua_attack_without_getting_hurt = true;
                    break;
                case 4:
                    phases4turn = _r[3];
                    if (green_and_orange_enter == 0 && _r[3] > 0)
                        green_and_orange_enter = 1;
                    break;
                case 5:
                    phases5turn = _r[3];
                    break;
                case 6:
                    phases6turn = _r[3];
                    break;
            }
        }
    }
}

// ---- Pink ----
// Pink's turns are keyed on (datecount, phaseturns, looping): Other_10 picks myattackchoice/difficulty from them and
// the speech block picks the line. Rows: datecount, phaseturns, looping, myattackchoice, difficulty.
function drweb_pink_table()
{
    return [
        [0, 0, false, 1, 0],   // 0 PURPLE CATS
        [0, 1, false, 6, 1],   // 1 BOMB BACKSTORY
        [0, 2, false, 1, 1],   // 2 CAT BEAT
        [0, 3, false, 6, 0],   // 3 GEL PEN BOMBS
        [0, 4, false, 5, 0],   // 4 FIRST CONCERT
        [0, 5, true, 1, 4],    // 5 RANDOM CATS
        [1, 0, false, 3, 0],   // 6 SPIN BOX
        [1, 1, false, 4, 0],   // 7 3D TUNNEL
        [1, 2, false, 6, 4],   // 8 NEW HAT BOMBS
        [1, 3, false, 5, 1],   // 9 WISHLIST SONG
        [1, 4, false, 3, 2],   // 10 QUICK SPIN
        [2, 0, false, 3, 1],   // 11 ANIME FACE BOX
        [2, 1, false, 6, 2],   // 12 BIG BOMB
        [2, 2, false, 1, 2],   // 13 CAT CONGA
        [2, 3, false, 4, 1],   // 14 TUNNEL RUSH
        [2, 4, true, 1, 3],    // 15 FLIP CATS
        [2, 5, true, 6, 3],    // 16 BOMB STORM
        [2, 6, true, 5, 2]     // 17 ENCORE
    ];
}

// Moves Pink to another date phase the way her debug key does (obj_pink_enemy_Step_0:31-62).
function drweb_pink_set_datecount(_dc)
{
    if (_dc < 2 && datecount >= 2)
    {
        // Leaving the ghost phase: put the ghost back inside the body.
        ghostintrocon = 0;
        saturation_effect_enabled = false;
        pos = 0;
        with (ghostmarker)
            image_alpha = 0;
    }
    datecount = _dc;
    dokimax = (datecount >= 2) ? 20 : 15;
    with (obj_date_ui)
        dokimax = other.dokimax;
    if (datecount >= 2)
    {
        with (obj_heroralsei)
            defeatsprite = spr_ralsei_kneel;
        if (ghostintrocon == 0)
            ghostintrocon = 1;
    }
    if (datecount == 3)
    {
        turnredcon = 1;
        mus_volume(global.batmusic[0], 0, 15);
        mus_volume(global.batmusic[1], 0, 15);
        global.actsimul[myself][1] = 0;
        global.actsimulsus[myself][0] = 0;
        global.actsimulral[myself][0] = 0;
        global.actsimul[myself][2] = 0;
        global.actsimulsus[myself][1] = 0;
        global.actsimulral[myself][1] = 0;
    }
}

// Runs at the top of obj_pink_enemy's Step (as obj_pink_enemy).
function drweb_pink_step()
{
    if (!variable_instance_exists(id, "drweb_init"))
    {
        drweb_init = 1;
        drweb_turns = 0;
        drweb_row = -1;
        drweb_latch = 0;
        var _p = global.drweb_phase;
        if (_p >= 2 && _p <= 4)
        {
            drweb_pink_set_datecount(_p - 1);
            phaseturns = 0;
            looping = false;
            doki = 0;
        }
    }
    if (global.mnfight != 1)
        drweb_latch = 0;
    if (global.monster[myself] != 1)
        exit;
    // Start of the enemy turn (the test at obj_pink_enemy_Step_0:136). It can hold for several frames
    // (doki-bar kick, multi-bubble speeches, ghost entrance), so the attack is picked once per turn.
    // damagedialogue 2 ("This body is invincible") turns into 3 later in this same Step, right before the turn starts.
    if (scr_isphase("enemytalk") && talked == 0 && explosioncon == 0 && ghostintrocon != 1 && damagedialogue != 1)
    {
        if (drweb_latch == 0)
        {
            drweb_latch = 1;
            drweb_turns += 1;
            var _t = drweb_pink_table();
            var _a = drweb_turn_attack(array_length(_t));
            if (global.drweb_mode == "endless" && drweb_turns > array_length(_t))
                damage = min(damage + 6, 200);
            drweb_row = (_a >= 0) ? _t[clamp(_a, 0, array_length(_t) - 1)] : -1;
        }
        if (is_array(drweb_row))
        {
            if (datecount != drweb_row[0])
                drweb_pink_set_datecount(drweb_row[0]);
            phaseturns = drweb_row[1];
            looping = drweb_row[2];
            doki = min(doki, dokimax - 1);   // never reach the doki-max speech / a date
        }
    }
    // After Other_10 ran (talked > 0) and before mnfight 1.5 builds the box: pin the exact attack
    // (the looping slots otherwise pick cats or bombs at random).
    if (is_array(drweb_row) && global.mnfight == 1 && talked > 0)
    {
        myattackchoice = drweb_row[3];
        difficulty = drweb_row[4];
    }
}
