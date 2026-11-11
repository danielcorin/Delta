import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import path from "node:path";
import { installTargetVector } from "./scripts/native-package";

const signing = process.env.DELTA_SIGN === "1";
const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: "llc.wvlen.delta", appCategoryType: "public.app-category.productivity",
    asar: { unpack: "**/*.{node,dylib}" },
    icon: path.join(__dirname, "assets/icon"),
    extendInfo: { LSMinimumSystemVersion: "14.0" },
    extraResource: ["src/main/migrations"],
    ignore: [/^\/(?!\.vite|node_modules|package\.json)/],
    ...(signing ? { osxSign: {
      identity: process.env.DEVELOPER_IDENTITY || "Developer ID Application: wvlen LLC (93W5N4LQL7)",
      optionsForFile: () => ({ hardenedRuntime: true, entitlements: "assets/entitlements.plist" }),
    } } : {}),
  },
  hooks: { packageAfterCopy: async (_config, buildPath, _version, _platform, arch) => {
    if (arch !== process.arch) await installTargetVector(buildPath, arch);
  } },
  rebuildConfig: { onlyModules: ["better-sqlite3"] },
  makers: [new MakerZIP({}, ["darwin"])],
  plugins: [
    new VitePlugin({
      build: [
        { entry: "src/main.ts", config: "vite.main.config.ts", target: "main" },
        { entry: "src/preload.ts", config: "vite.preload.config.ts", target: "preload" },
      ],
      renderer: [{ name: "main_window", config: "vite.renderer.config.ts" }],
    }),
    new FusesPlugin({ version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
export default config;
