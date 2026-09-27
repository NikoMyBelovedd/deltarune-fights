// Applies a patch manifest to a data.win. Env: DR_MANIFEST = path to manifest.json.
// Manifest: { "ops": [ { "op": "replace|append|prepend|find", "code": "gml_...", "file": "x.gml" | "text": "...", "find": "...", "replace": "..." } ] }
// Paths in "file" are relative to the manifest directory. Anything under {{include:name.gml}} is inlined.
using System;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;
using UndertaleModLib;
using UndertaleModLib.Models;

EnsureDataLoaded();

string manifestPath = Environment.GetEnvironmentVariable("DR_MANIFEST");
string baseDir = Path.GetDirectoryName(manifestPath);
var manifest = JObject.Parse(File.ReadAllText(manifestPath));

string Load(string rel)
{
    string text = File.ReadAllText(Path.Combine(baseDir, rel));
    return Regex.Replace(text, @"\{\{include:([^}]+)\}\}", m => Load(m.Groups[1].Value.Trim()));
}

string Body(JObject op) => op["file"] != null ? Load((string)op["file"]) : (string)op["text"] ?? "";

UndertaleModLib.Compiler.CodeImportGroup importGroup = new(Data)
{
    MainThreadAction = MainThreadAction,
    ThrowOnNoOpFindReplace = true,
    AutoCreateAssets = true,
};

int n = 0;
foreach (JObject op in manifest["ops"])
{
    string kind = (string)op["op"];
    string code = (string)op["code"];
    switch (kind)
    {
        case "replace": importGroup.QueueReplace(code, Body(op)); break;
        case "append": importGroup.QueueAppend(code, Body(op)); break;
        case "prepend": importGroup.QueuePrepend(code, Body(op)); break;
        case "find": importGroup.QueueFindReplace(code, (string)op["find"], op["replaceFile"] != null ? Load((string)op["replaceFile"]) : (string)op["replace"], false); break;
        case "trimfind": importGroup.QueueTrimmedLinesFindReplace(code, (string)op["find"], (string)op["replace"], false); break;
        default: throw new Exception("unknown op " + kind);
    }
    n++;
}
importGroup.Import();

// Object-level tweaks: { "objects": { "obj_drweb": { "persistent": true, "visible": true, "depth": -99999 } } }
if (manifest["objects"] is JObject objs)
{
    foreach (var kv in objs)
    {
        var o = Data.GameObjects.ByName(kv.Key);
        if (o == null) throw new Exception("no object " + kv.Key);
        var v = (JObject)kv.Value;
        if (v["persistent"] != null) o.Persistent = (bool)v["persistent"];
        if (v["visible"] != null) o.Visible = (bool)v["visible"];
        if (v["depth"] != null) o.Depth = (int)v["depth"];
    }
}

Console.WriteLine($"PATCH OK: {n} code operations");
