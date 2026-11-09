import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

// Execute the actual startup seed with a database tripwire: production must
// never query, insert or backfill demo content, even after deleting all pets.
const source = readFileSync(new URL("../src/lib/seed.ts", import.meta.url), "utf8");
const names = [...source.matchAll(/\b(\w+Table|adminUsersTable)\b/g)].map(m => m[1]);
const result = await build({
  stdin: { contents: `${source}\nexport { db as testDb } from "@workspace/db";`, loader: "ts",
    resolveDir: new URL("../src/lib/", import.meta.url).pathname },
  bundle: true, write: false, platform: "node", format: "esm",
  plugins: [{ name: "seed-boundaries", setup(b) {
    b.onResolve({ filter: /^@workspace\/db$|^drizzle-orm$|logger$|auth-utils$/ }, args => ({ path: args.path, namespace: "seed-test" }));
    b.onLoad({ filter: /.*/, namespace: "seed-test" }, args => {
      if (args.path === "@workspace/db") return { contents: `
        export const db = { calls: [], execute(...args) { this.calls.push(args); throw new Error("database tripwire"); },
          select(...args) { this.calls.push(args); throw new Error("database tripwire"); },
          insert(...args) { this.calls.push(args); throw new Error("database tripwire"); },
          update(...args) { this.calls.push(args); throw new Error("database tripwire"); } };
        export const settings = {};
        ${[...new Set(names)].map(name => `export const ${name} = {};`).join("\n")}` };
      if (args.path === "drizzle-orm") return { contents: "export const eq = () => {}, isNull = () => {}, sql = { raw: v => v };" };
      if (args.path.endsWith("logger")) return { contents: "export const logger = { info() {}, warn() {} };" };
      return { contents: "export const hashPassword = async v => v;" };
    });
  } }],
});
const { seedIfEmpty, testDb } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);

test("production startup and restarts never restore demos or backfill photos", async () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    await seedIfEmpty();
    await seedIfEmpty();
    assert.equal(testDb.calls.length, 0, "no DB operation is allowed in production seeding");
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test("development retains demo initialization", async () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "development";
    await assert.rejects(seedIfEmpty(), /database tripwire/);
    assert.equal(testDb.calls.length, 1);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
