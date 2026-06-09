import { defineConfig } from "drizzle-kit";

// Migrations are generated into src/db/migrations and applied at app startup
// by the in-app migrator (src/db/migrate.ts) against the local SQLite file
// managed by tauri-plugin-sql.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
});
