import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import MakerDMG from "@electron-forge/maker-dmg";

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: "*.{node,dylib}",
      unpackDir: "{better-sqlite3,sqlite-vec*,sqlite-vec-darwin-arm64}",
    },
    icon: path.join(__dirname, "assets", "icon"),
    extraResource: ["src/main/migrations"],
  },
  rebuildConfig: {
    onlyModules: ["better-sqlite3", "sqlite-vec", "sqlite-vec-darwin-arm64"],
    force: true,
    platform: process.platform,
    buildFromSource: false,
  },
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ["darwin"]),
    new MakerDMG(),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: "src/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  hooks: {
    async packageAfterCopy(_forgeConfig, buildPath) {
      const requiredNativePackages = [
        "better-sqlite3",
        "bindings",
        "file-uri-to-path",

        "sqlite-vec",
        "sqlite-vec-darwin-arm64",

        "knex",
        "tarn",
        "lodash",
        "colorette",
        "escalade",
        "pg-connection-string",
        "rechoir",
        "resolve-from",
        "tildify",
        "get-package-type",
      ];

      const sourceNodeModulesPath = path.resolve(__dirname, "node_modules");
      const destNodeModulesPath = path.resolve(buildPath, "node_modules");

      await Promise.all(
        requiredNativePackages.map(async (packageName) => {
          const sourcePath = path.join(sourceNodeModulesPath, packageName);
          const destPath = path.join(destNodeModulesPath, packageName);

          await mkdir(path.dirname(destPath), { recursive: true });
          await cp(sourcePath, destPath, {
            recursive: true,
            preserveTimestamps: true,
          });
        }),
      );

      const sourceMigrationsPath = path.resolve(
        __dirname,
        "src",
        "main",
        "migrations",
      );
      const destMigrationsPath = path.resolve(buildPath, "migrations");

      await mkdir(destMigrationsPath, { recursive: true });
      await cp(sourceMigrationsPath, destMigrationsPath, {
        recursive: true,
        preserveTimestamps: true,
      });
    },
  },
};

export default config;
