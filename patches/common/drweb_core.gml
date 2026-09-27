// deltaruneWEB core: config, event bridge, modes. Shared by every chapter.
// Events go to the page via show_debug_message lines prefixed "@@DRWEB ".

function drweb_emit(_ev, _data)
{
    show_debug_message("@@DRWEB " + _ev + " " + string(_data));
}

function drweb_load_config()
{
    ini_open("drweb.ini");
    global.drweb_boss = ini_read_string("fight", "boss", "");
    global.drweb_variant = ini_read_string("fight", "variant", "");
    global.drweb_mode = ini_read_string("fight", "mode", "normal");
    global.drweb_intro = ini_read_real("fight", "intro", 1);
    global.drweb_attack = ini_read_real("fight", "attack", -1);
    global.drweb_phase = ini_read_real("fight", "phase", 0);
    global.drweb_seed = ini_read_real("fight", "seed", 0);
    global.drweb_bulletmult = ini_read_real("dials", "bulletmult", 1);
    global.drweb_cooldown = ini_read_real("dials", "cooldown", 100);
    for (var _c = 1; _c <= 4; _c++)
    {
        global.drweb_weapon[_c] = ini_read_real("party", "weapon" + string(_c), -1);
        global.drweb_armor1[_c] = ini_read_real("party", "armor" + string(_c) + "a", -1);
        global.drweb_armor2[_c] = ini_read_real("party", "armor" + string(_c) + "b", -1);
        global.drweb_stat_hp[_c] = ini_read_real("stats", "hp" + string(_c), -1);
        global.drweb_stat_at[_c] = ini_read_real("stats", "at" + string(_c), -1);
        global.drweb_stat_df[_c] = ini_read_real("stats", "df" + string(_c), -1);
        global.drweb_stat_mag[_c] = ini_read_real("stats", "mag" + string(_c), -1);
    }
    for (var _i = 0; _i < 12; _i++)
    {
        global.drweb_item[_i] = ini_read_real("items", "item" + string(_i), -1);
    }
    ini_close();
    if (!variable_global_exists("drweb_attempt"))
    {
        global.drweb_attempt = 0;
    }
    global.drweb_active = 1;
}

// Applies the loadout on top of the story-state defaults. Call after the chapter sets its defaults.
function drweb_apply_loadout()
{
    for (var _c = 1; _c <= 4; _c++)
    {
        if (global.drweb_weapon[_c] >= 0)
            global.charweapon[_c] = global.drweb_weapon[_c];
        if (global.drweb_armor1[_c] >= 0)
            global.chararmor1[_c] = global.drweb_armor1[_c];
        if (global.drweb_armor2[_c] >= 0)
            global.chararmor2[_c] = global.drweb_armor2[_c];
        if (global.drweb_stat_hp[_c] > 0)
            global.maxhp[_c] = global.drweb_stat_hp[_c];
        if (global.drweb_stat_at[_c] >= 0)
            global.at[_c] = global.drweb_stat_at[_c];
        if (global.drweb_stat_df[_c] >= 0)
            global.df[_c] = global.drweb_stat_df[_c];
        if (global.drweb_stat_mag[_c] >= 0)
            global.mag[_c] = global.drweb_stat_mag[_c];
    }
    if (global.drweb_item[0] >= 0)
    {
        for (var _i = 0; _i < 12; _i++)
            global.item[_i] = max(0, global.drweb_item[_i]);
        global.item[12] = 0;
    }
    scr_weaponinfo_mine();
    scr_armorinfo_mine();
    scr_iteminfo_all();
    for (var _c = 0; _c <= 4; _c++)
        global.hp[_c] = global.maxhp[_c];
}

// Called from scr_damage whenever a party member actually loses HP.
function drweb_on_hit(_amount, _target)
{
    drweb_emit("hit", string(_amount) + " " + string(_target));
    if (global.drweb_mode == "hitless")
    {
        drweb_restart("hit");
    }
}

// Called at the top of scr_gameover. Returns true if the mode handled it (skip the real game over).
function drweb_on_gameover()
{
    drweb_emit("gameover", global.drweb_attempt);
    if (global.drweb_mode == "practice" || global.drweb_mode == "single")
    {
        // No game over: bring the whole party back, the way the game revives a downed member.
        for (var _i = 0; _i < 3; _i++)
        {
            if (global.char[_i] != 0)
            {
                global.hp[global.char[_i]] = global.maxhp[global.char[_i]];
                scr_revive(_i);
            }
        }
        return true;
    }
    return false;
}

// Fight won: the chapter calls this when its post-battle sequence would leave the boss room.
function drweb_finish(_how)
{
    drweb_emit("win", _how);
}

// Restart the fight from scratch (retry after game over, or hitless fail).
function drweb_restart(_why)
{
    global.drweb_attempt += 1;
    drweb_emit("restart", _why);
    audio_stop_all();
    global.drweb_restarting = 1;
    drweb_boot_fight();
}

// Runs at the top of obj_battlecontroller's Step. In Single Attack / Endless the party never gets a turn:
// whenever the battle returns to the player's menu we start another enemy turn, the same way ambushes do.
function drweb_battle_step()
{
    if ((global.drweb_mode == "single" || global.drweb_mode == "endless") && global.myfight == 0 && global.mnfight == 0)
    {
        scr_ambush();
    }
}

// Shuffle-bag of attack indices 0..n-1 for Endless.
function drweb_bag_next(_n)
{
    if (!variable_global_exists("drweb_bag") || array_length(global.drweb_bag) == 0)
    {
        global.drweb_bag = [];
        for (var _i = 0; _i < _n; _i++)
            global.drweb_bag[_i] = _i;
        for (var _i = _n - 1; _i > 0; _i--)
        {
            var _j = irandom(_i);
            var _t = global.drweb_bag[_i];
            global.drweb_bag[_i] = global.drweb_bag[_j];
            global.drweb_bag[_j] = _t;
        }
    }
    var _v = global.drweb_bag[array_length(global.drweb_bag) - 1];
    array_resize(global.drweb_bag, array_length(global.drweb_bag) - 1);
    return _v;
}
