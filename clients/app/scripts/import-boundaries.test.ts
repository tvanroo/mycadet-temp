import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import tsconfig from "../tsconfig.json";
import appConfig from "../vite.config";

const appRoot = path.resolve(import.meta.dir, "../src");
const webRoot = path.resolve(appRoot, "../../web/src");

describe("explicit client imports", () => {
  test("app source uses explicit ownership instead of the bare alias", () => {
    const files = new Bun.Glob("**/*.{ts,tsx}").scanSync({ cwd: appRoot });
    for (const file of files) {
      const source = readFileSync(path.join(appRoot, file), "utf8");
      const transpiler = new Bun.Transpiler({
        loader: file.endsWith(".tsx") ? "tsx" : "ts",
      });
      const imports = transpiler.scanImports(source).map((entry) => entry.path);
      const mocks = [...source.matchAll(/mock\.module\(\s*["']([^"']+)/g)].map(
        (match) => match[1],
      );
      expect(
        [...imports, ...mocks].filter((specifier) =>
          specifier.startsWith("@/"),
        ),
        file,
      ).toEqual([]);
    }
  });

  test("TypeScript aliases each resolve into one client", () => {
    expect(tsconfig.compilerOptions.paths["@app/*"]).toEqual(["./src/*"]);
    expect(tsconfig.compilerOptions.paths["@web/*"]).toEqual(["../web/src/*"]);
    expect(tsconfig.compilerOptions.paths["@/*"]).toEqual(["../web/src/*"]);
  });

  test("Vite keeps a missing app module in app instead of falling through to web", async () => {
    if (typeof appConfig !== "function") {
      throw new Error("Expected the app Vite config factory");
    }
    const config = await appConfig({ command: "build", mode: "test" });
    const aliases = config.resolve?.alias;
    if (!Array.isArray(aliases)) {
      throw new Error("Expected explicit Vite aliases");
    }
    const aliasEntries = aliases;
    function resolveAlias(specifier: string): string {
      const alias = aliasEntries.find((entry) =>
        typeof entry.find === "string"
          ? specifier.startsWith(entry.find)
          : entry.find.test(specifier),
      );
      if (!alias) {
        throw new Error(`Missing alias for ${specifier}`);
      }
      return specifier.replace(alias.find, alias.replacement);
    }
    expect(resolveAlias("@app/domains/account/account-route.tsx")).toBe(
      path.join(appRoot, "domains/account/account-route.tsx"),
    );
    expect(resolveAlias("@web/i18n/index.ts")).toBe(
      path.join(webRoot, "i18n/index.ts"),
    );
    const missingAppModule = resolveAlias("@app/i18n/index.ts");
    expect(missingAppModule).toBe(path.join(appRoot, "i18n/index.ts"));
    expect(existsSync(missingAppModule)).toBe(false);
    expect(existsSync(path.join(webRoot, "i18n/index.ts"))).toBe(true);
  });
});
