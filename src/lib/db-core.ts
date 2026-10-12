import { createClient, type Client } from "@libsql/client";

let client: Client | null = null;

// Lazy so builds don't crash when env vars are absent. TURSO_DATABASE_URL may be `file:local.db`.
export function db(): Client {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error("TURSO_DATABASE_URL not set");
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  }
  return client;
}
