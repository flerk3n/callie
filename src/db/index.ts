import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var callieSql: ReturnType<typeof postgres> | undefined;
}

export function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL must be configured before using persistent data.");
  }

  const sql = global.callieSql ?? postgres(connectionString, {
    max: 1,
    prepare: false,
    ssl: "require",
  });
  if (process.env.NODE_ENV !== "production") global.callieSql = sql;

  return drizzle(sql, { schema });
}
