import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
import { z } from "zod";

const raw: unknown = JSON.parse(execFileSync("./node_modules/.bin/supabase", ["status", "--output", "json"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
}));
const local = z.object({
  API_URL: z.literal("http://127.0.0.1:54321"),
  ANON_KEY: z.string().min(1),
  SERVICE_ROLE_KEY: z.string().min(1),
}).parse(raw);
if (!process.env.PLAYWRIGHT_RUN_ID) {
  process.env.PLAYWRIGHT_RUN_ID = randomUUID();
  process.env.PLAYWRIGHT_RATE_SECRET = randomBytes(32).toString("hex");
}
const rateSecret = z.string().min(32).parse(process.env.PLAYWRIGHT_RATE_SECRET);

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: `test-results/supplier-portal-${process.env.PLAYWRIGHT_RUN_ID}`,
  workers: 1,
  timeout: 60_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:3100",
    actionTimeout: 10_000,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PLAYWRIGHT_TEST: "1",
      NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
      SUPPLIER_PORTAL_RATE_SECRET: rateSecret,
      DOCUMENT_SCANNER: "local-noop",
      SITE_URL: "http://localhost:3100",
    },
  },
});
