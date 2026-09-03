// Phase 7 audit — inspect the actual database state.
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const tables = await p.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%' ORDER BY name`
  );
  console.log("Tables:", tables.map((t) => t.name).join(", "));
  for (const t of tables) {
    const cols = await p.$queryRawUnsafe<Array<{ name: string; type: string; notnull: number; pk: number; dflt_value: string | null }>>(`PRAGMA table_info(${t.name})`);
    const idxs = await p.$queryRawUnsafe<Array<{ name: string; unique: number }>>(`PRAGMA index_list(${t.name})`);
    const fks = await p.$queryRawUnsafe<Array<{ from: string; table: string; to: string; on_delete: string; on_update: string }>>(`PRAGMA foreign_key_list(${t.name})`);
    console.log(`\n=== ${t.name} ===`);
    console.log("Cols:", cols.map((c) => `${c.name}:${c.type}${c.notnull ? " NOT NULL" : ""}${c.pk ? " PK" : ""}${c.dflt_value ? " default=" + c.dflt_value : ""}`).join(", "));
    console.log("FKs:", fks.map((f) => `${f.from}->${f.table}.${f.to} onDel=${f.on_delete} onUpd=${f.on_update}`).join("; ") || "(none)");
    console.log("Indexes:", idxs.map((i) => `${i.name}${i.unique ? "(UNIQUE)" : ""}`).join(", ") || "(none)");
  }
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
