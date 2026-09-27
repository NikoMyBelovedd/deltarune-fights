// Dumps a data.win into a structured JSON + PNG texture pages + audio files.
// Run: UndertaleModCli load <copy-of-data.win> -s export.csx   (env DR_OUT = output dir, DR_GAMEDIR = original chapter dir)
using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UndertaleModLib;
using UndertaleModLib.Models;
using UndertaleModLib.Util;

EnsureDataLoaded();

string outDir = Environment.GetEnvironmentVariable("DR_OUT");
string gameDir = Environment.GetEnvironmentVariable("DR_GAMEDIR");
Directory.CreateDirectory(outDir);
Directory.CreateDirectory(Path.Combine(outDir, "textures"));
Directory.CreateDirectory(Path.Combine(outDir, "audio"));

var tpagIndex = new Dictionary<UndertaleTexturePageItem, int>();
for (int i = 0; i < Data.TexturePageItems.Count; i++) tpagIndex[Data.TexturePageItems[i]] = i;
var texIndex = new Dictionary<UndertaleEmbeddedTexture, int>();
for (int i = 0; i < Data.EmbeddedTextures.Count; i++) texIndex[Data.EmbeddedTextures[i]] = i;

int Tp(UndertaleTexturePageItem t) => t == null ? -1 : tpagIndex[t];
string N(UndertaleNamedResource r) => r?.Name?.Content;
string S(UndertaleString s) => s?.Content;

// ---------- generic reflection serializer (rooms, misc) ----------
JToken Ser(object o, int depth)
{
    if (o == null) return JValue.CreateNull();
    if (depth > 8) return "<deep>";
    switch (o)
    {
        case string s: return s;
        case UndertaleString us: return us.Content;
        case bool or byte or sbyte or short or ushort or int or uint or long or ulong or float or double: return new JValue(o);
        case Enum e: return e.ToString();
        case byte[] b: return Convert.ToBase64String(b);
        case UndertaleTexturePageItem tp: return Tp(tp);
        case UndertaleCode c: return c.Name?.Content;
        case UndertaleRoom r when depth > 0: return r.Name?.Content;
        case UndertaleNamedResource nr when depth > 0: return nr.Name?.Content;
    }
    if (o is IEnumerable en)
    {
        var arr = new JArray();
        foreach (var x in en) arr.Add(Ser(x, depth + 1));
        return arr;
    }
    var obj = new JObject();
    var t = o.GetType();
    obj["$t"] = t.Name;
    foreach (var p in t.GetProperties(BindingFlags.Public | BindingFlags.Instance))
    {
        if (p.GetIndexParameters().Length > 0) continue;
        if (p.Name is "ParentRoom" or "ProjectName" or "ProjectAssetType" or "ProjectExportable") continue;
        object v;
        try { v = p.GetValue(o); } catch { continue; }
        obj[p.Name] = Ser(v, depth + 1);
    }
    foreach (var f in t.GetFields(BindingFlags.Public | BindingFlags.Instance))
    {
        try { obj[f.Name] = Ser(f.GetValue(o), depth + 1); } catch { }
    }
    return obj;
}

var root = new JObject();

// ---------- general ----------
var gi = Data.GeneralInfo;
root["general"] = new JObject {
    ["name"] = S(gi.Name), ["displayName"] = S(gi.DisplayName), ["config"] = S(gi.Config),
    ["bytecode"] = gi.BytecodeVersion, ["gms2fps"] = gi.GMS2FPS,
    ["windowWidth"] = gi.DefaultWindowWidth, ["windowHeight"] = gi.DefaultWindowHeight,
    ["version"] = $"{gi.Major}.{gi.Minor}.{gi.Release}.{gi.Build}",
    ["runtimeVersion"] = gi.Version.ToString(),
    ["info"] = gi.Info.ToString(),
    ["roomOrder"] = new JArray(gi.RoomOrder.Select(r => (JToken)N(r.Resource))),
    ["arrayCopyOnWrite"] = Data.ArrayCopyOnWrite,
    ["shortCircuit"] = Data.ShortCircuit,
    ["lastObj"] = gi.LastObj, ["lastTile"] = gi.LastTile,
};
root["options"] = new JObject {
    ["info"] = Data.Options.Info.ToString(),
    ["windowColor"] = Data.Options.WindowColor,
    ["constants"] = new JArray(Data.Options.Constants.Select(c => new JObject { ["name"] = S(c.Name), ["value"] = S(c.Value) })),
};

// ---------- textures ----------
var texArr = new JArray();
for (int i = 0; i < Data.EmbeddedTextures.Count; i++)
{
    var et = Data.EmbeddedTextures[i];
    try
    {
        using FileStream fs = new(Path.Combine(outDir, "textures", $"{i}.png"), FileMode.Create);
        et.TextureData.Image.SavePng(fs);
    }
    catch (Exception ex) { Console.WriteLine($"texture {i} failed: {ex.Message}"); }
    texArr.Add(new JObject { ["file"] = $"textures/{i}.png", ["width"] = et.TextureData.Width, ["height"] = et.TextureData.Height, ["scaled"] = et.Scaled, ["external"] = et.TextureExternal });
}
root["textures"] = texArr;

var tpagArr = new JArray();
foreach (var t in Data.TexturePageItems)
{
    tpagArr.Add(new JArray(t.SourceX, t.SourceY, t.SourceWidth, t.SourceHeight, t.TargetX, t.TargetY, t.TargetWidth, t.TargetHeight, t.BoundingWidth, t.BoundingHeight, t.TexturePage == null ? -1 : texIndex[t.TexturePage]));
}
root["tpag"] = tpagArr; // [x,y,w,h, xo,yo,cropW,cropH, ow,oh, tex]

var tgArr = new JArray();
if (Data.TextureGroupInfo != null)
    foreach (var tg in Data.TextureGroupInfo)
        tgArr.Add(new JObject { ["name"] = S(tg.Name), ["textures"] = new JArray(tg.TexturePages.Select(x => (JToken)texIndex[x.Resource])) });
root["textureGroups"] = tgArr;

// ---------- sprites ----------
var sprArr = new JArray();
foreach (var s in Data.Sprites)
{
    if (s == null) { sprArr.Add(JValue.CreateNull()); continue; }
    sprArr.Add(new JObject {
        ["name"] = N(s), ["width"] = s.Width, ["height"] = s.Height,
        ["bbox"] = new JArray(s.MarginLeft, s.MarginRight, s.MarginBottom, s.MarginTop),
        ["transparent"] = s.Transparent, ["smooth"] = s.Smooth, ["preload"] = s.Preload,
        ["bboxMode"] = s.BBoxMode, ["sepMasks"] = s.SepMasks.ToString(),
        ["originX"] = s.OriginX, ["originY"] = s.OriginY,
        ["playbackSpeed"] = s.GMS2PlaybackSpeed, ["playbackSpeedType"] = s.GMS2PlaybackSpeedType.ToString(),
        ["type"] = s.SSpriteType.ToString(),
        ["frames"] = new JArray(s.Textures.Select(te => (JToken)Tp(te.Texture))),
        ["masks"] = new JArray(s.CollisionMasks.Select(m => new JObject { ["w"] = m.Width, ["h"] = m.Height, ["data"] = Convert.ToBase64String(m.Data) })),
        ["nineSlice"] = s.V3NineSlice == null ? null : Ser(s.V3NineSlice, 1),
    });
}
root["sprites"] = sprArr;

// ---------- backgrounds / tilesets ----------
var bgArr = new JArray();
foreach (var b in Data.Backgrounds)
{
    bgArr.Add(new JObject {
        ["name"] = N(b), ["tpag"] = Tp(b.Texture), ["transparent"] = b.Transparent, ["smooth"] = b.Smooth,
        ["tileWidth"] = b.GMS2TileWidth, ["tileHeight"] = b.GMS2TileHeight, ["borderX"] = b.GMS2OutputBorderX, ["borderY"] = b.GMS2OutputBorderY,
        ["columns"] = b.GMS2TileColumns, ["tileCount"] = b.GMS2TileCount, ["framesPerTile"] = b.GMS2ItemsPerTileCount, ["frameLength"] = b.GMS2FrameLength,
        ["tileIds"] = new JArray(b.GMS2TileIds.Select(x => (JToken)x.ID)),
    });
}
root["backgrounds"] = bgArr;

// ---------- sounds ----------
var agArr = new JArray();
foreach (var ag in Data.AudioGroups) agArr.Add(new JObject { ["name"] = S(ag.Name), ["path"] = S(ag.Path) });
root["audioGroups"] = agArr;

var groupCache = new Dictionary<int, IList<UndertaleEmbeddedAudio>>();
IList<UndertaleEmbeddedAudio> GroupAudio(UndertaleSound snd)
{
    if (groupCache.TryGetValue(snd.GroupID, out var cached)) return cached;
    string rel = snd.AudioGroup?.Path?.Content;
    if (string.IsNullOrEmpty(rel)) rel = $"audiogroup{snd.GroupID}.dat";
    string p = Path.Combine(gameDir, rel);
    IList<UndertaleEmbeddedAudio> res = null;
    if (File.Exists(p))
    {
        using var st = new FileStream(p, FileMode.Open, FileAccess.Read);
        res = UndertaleIO.Read(st, (w, _) => { }).EmbeddedAudio;
    }
    groupCache[snd.GroupID] = res;
    return res;
}

var sndArr = new JArray();
foreach (var snd in Data.Sounds)
{
    bool comp = snd.Flags.HasFlag(UndertaleSound.AudioEntryFlags.IsCompressed);
    bool emb = snd.Flags.HasFlag(UndertaleSound.AudioEntryFlags.IsEmbedded);
    string file = null;
    byte[] bytes = null;
    string ext = (emb && !comp) ? ".wav" : ".ogg";
    if (comp || emb)
    {
        if (snd.GroupID > Data.GetBuiltinSoundGroupID())
        {
            var ga = GroupAudio(snd);
            if (ga != null && snd.AudioID >= 0 && snd.AudioID < ga.Count) bytes = ga[snd.AudioID].Data;
        }
        else bytes = snd.AudioFile?.Data;
        if (bytes != null)
        {
            file = $"audio/{N(snd)}{ext}";
            File.WriteAllBytes(Path.Combine(outDir, file), bytes);
        }
    }
    else
    {
        string ext2 = S(snd.File);
        if (ext2 != null && !ext2.Contains('.')) ext2 += ".ogg";
        string src = ext2 == null ? null : Path.Combine(gameDir, ext2);
        if (src != null && File.Exists(src))
        {
            file = $"audio/{Path.GetFileName(ext2)}";
            File.Copy(src, Path.Combine(outDir, file), true);
        }
    }
    sndArr.Add(new JObject {
        ["name"] = N(snd), ["flags"] = snd.Flags.ToString(), ["type"] = S(snd.Type), ["origFile"] = S(snd.File),
        ["file"] = file, ["volume"] = snd.Volume, ["pitch"] = snd.Pitch, ["preload"] = snd.Preload,
        ["group"] = snd.GroupID, ["effects"] = snd.Effects, ["length"] = snd.AudioLength,
    });
}
root["sounds"] = sndArr;

// ---------- fonts ----------
var fontArr = new JArray();
foreach (var f in Data.Fonts)
{
    fontArr.Add(new JObject {
        ["name"] = N(f), ["displayName"] = S(f.DisplayName), ["size"] = f.EmSize, ["bold"] = f.Bold, ["italic"] = f.Italic,
        ["first"] = f.RangeStart, ["last"] = f.RangeEnd, ["charset"] = f.Charset, ["aa"] = f.AntiAliasing,
        ["tpag"] = Tp(f.Texture), ["scaleX"] = f.ScaleX, ["scaleY"] = f.ScaleY,
        ["ascender"] = f.Ascender, ["ascenderOffset"] = f.AscenderOffset, ["lineHeight"] = f.LineHeight, ["sdfSpread"] = f.SDFSpread,
        ["glyphs"] = new JArray(f.Glyphs.Select(g => new JObject {
            ["c"] = g.Character, ["x"] = g.SourceX, ["y"] = g.SourceY, ["w"] = g.SourceWidth, ["h"] = g.SourceHeight,
            ["shift"] = g.Shift, ["offset"] = g.Offset,
            ["kerning"] = new JArray(g.Kerning.Select(k => new JArray(k.Character, k.ShiftModifier))),
        })),
    });
}
root["fonts"] = fontArr;

// ---------- objects ----------
string[] evTypes = { "Create", "Destroy", "Alarm", "Step", "Collision", "Keyboard", "Mouse", "Other", "Draw", "KeyPress", "KeyRelease", "Trigger", "CleanUp", "Gesture", "PreCreate" };
var objArr = new JArray();
foreach (var o in Data.GameObjects)
{
    var evs = new JArray();
    for (int et = 0; et < o.Events.Count; et++)
    {
        foreach (var e in o.Events[et])
        {
            var code = e.Actions.FirstOrDefault(a => a.CodeId != null)?.CodeId;
            evs.Add(new JObject { ["type"] = et, ["typeName"] = et < evTypes.Length ? evTypes[et] : et.ToString(), ["sub"] = e.EventSubtype, ["code"] = code?.Name?.Content });
        }
    }
    objArr.Add(new JObject {
        ["name"] = N(o), ["sprite"] = N(o.Sprite), ["mask"] = N(o.TextureMaskId), ["parent"] = N(o.ParentId),
        ["visible"] = o.Visible, ["solid"] = o.Solid, ["depth"] = o.Depth, ["persistent"] = o.Persistent,
        ["managed"] = o.Managed, ["physics"] = o.UsesPhysics, ["events"] = evs,
    });
}
root["objects"] = objArr;

// ---------- rooms ----------
var roomArr = new JArray();
foreach (var r in Data.Rooms) roomArr.Add(Ser(r, 0));
root["rooms"] = roomArr;

// ---------- code / scripts ----------
var codeArr = new JArray();
foreach (var c in Data.Code)
{
    codeArr.Add(new JObject {
        ["name"] = S(c.Name), ["args"] = c.ArgumentsCount, ["locals"] = c.LocalsCount,
        ["parent"] = c.ParentEntry?.Name?.Content, ["offset"] = c.Offset, ["length"] = c.Length,
    });
}
root["code"] = codeArr;
root["scripts"] = new JArray(Data.Scripts.Select(s => new JObject { ["name"] = N(s), ["code"] = s.Code?.Name?.Content, ["constructor"] = s.IsConstructor }));
root["globalInit"] = new JArray(Data.GlobalInitScripts.Select(g => (JToken)g.Code?.Name?.Content));
root["gameEnd"] = new JArray((Data.GameEndScripts ?? new List<UndertaleGlobalInit>()).Select(g => (JToken)g.Code?.Name?.Content));

// ---------- shaders ----------
root["shaders"] = new JArray(Data.Shaders.Select(sh => new JObject {
    ["name"] = N(sh), ["type"] = sh.Type.ToString(),
    ["vertex"] = S(sh.GLSL_ES_Vertex), ["fragment"] = S(sh.GLSL_ES_Fragment),
    ["attributes"] = new JArray(sh.VertexShaderAttributes.Select(a => (JToken)S(a.Name))),
}));

// ---------- misc ----------
root["paths"] = new JArray(Data.Paths.Select(p => Ser(p, 0)));
root["timelines"] = new JArray(Data.Timelines.Select(t => Ser(t, 0)));
root["animCurves"] = Data.AnimationCurves == null ? new JArray() : new JArray(Data.AnimationCurves.Select(a => Ser(a, 0)));
root["sequences"] = Data.Sequences == null ? new JArray() : new JArray(Data.Sequences.Select(a => (JToken)N(a)));
root["extensions"] = new JArray(Data.Extensions.Select(e => (JToken)N(e)));
root["functions"] = new JArray(Data.Functions.Select(f => (JToken)S(f.Name)));

File.WriteAllText(Path.Combine(outDir, "data.json"), root.ToString(Formatting.None));
Console.WriteLine($"EXPORT OK: {Data.Sprites.Count} sprites, {Data.EmbeddedTextures.Count} textures, {Data.Sounds.Count} sounds, {Data.GameObjects.Count} objects, {Data.Rooms.Count} rooms");
