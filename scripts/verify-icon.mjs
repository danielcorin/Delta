import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const input = path.resolve(process.argv[2] || `out/Delta-darwin-${process.arch}/Delta.app`);
const isApp = input.endsWith(".app");
const resources = isApp ? path.join(input, "Contents/Resources") : input;
const assets = JSON.parse(execFileSync("xcrun", ["assetutil", "--info", path.join(resources, "Assets.car")], { encoding: "utf8" }));
const stacks = assets.filter((asset) => asset.AssetType === "IconImageStack" && asset.Name === "AppIcon");
assert.equal(stacks.length, 3, "Expected native default, dark, and tinted icon stacks");
assert.deepEqual(new Set(stacks.map((asset) => asset.Appearance)), new Set(["NSAppearanceNameAqua", "NSAppearanceNameDarkAqua", "ISAppearanceTintable"]));
for (const layer of ["river", "canopy"]) {
  assert(assets.some((asset) => asset.AssetType === "Vector" && asset.Name === `AppIcon_Assets/${layer}`), `Missing vector layer: ${layer}`);
}
const fallback = path.join(resources, "AppIcon.icns");
assert(existsSync(fallback) && statSync(fallback).size > 1000, "Missing legacy ICNS fallback");
if (isApp) {
  const plist = path.join(input, "Contents/Info.plist");
  const value = (key) => execFileSync("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, plist], { encoding: "utf8" }).trim();
  assert.equal(value("CFBundleIconName"), "AppIcon");
  assert.equal(value("CFBundleIconFile"), "AppIcon.icns");
  assert.equal(value("LSMinimumSystemVersion"), "14.0");
}
console.log("Verified Liquid Glass icon: three appearances, two vector layers, legacy fallback.");
