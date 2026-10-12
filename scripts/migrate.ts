import { config } from "dotenv";
config({ path: ".env.local" });
import { readdirSync, readFileSync } from "node:fs";
import { db } from "../src/lib/db-core";

async function main() {
  const c = db();
  await c.execute(
    "create table if not exists _migrations (name text primary key, applied_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
  );
  const done = new Set((await c.execute("select name from _migrations")).rows.map((r) => String(r.name)));
  const files = readdirSync("db/migrations").filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    await c.executeMultiple(readFileSync(`db/migrations/${f}`, "utf8"));
    await c.execute({ sql: "insert into _migrations (name) values (?)", args: [f] });
    console.log("applied", f);
  }
  console.log("up to date");
}

main().catch((e) => { console.error(e); process.exit(1); });
