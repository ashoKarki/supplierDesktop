import { describe, expect, it } from "vitest";
import { isLocalNoopScannerAllowed } from "../../src/domain/local-scanner";

describe("local no-op scanner guard", () => {
  const allowed = {
    nodeEnv: "development",
    supabaseUrl: "http://127.0.0.1:54321",
    scanner: "local-noop",
  };

  it("allows explicit no-op scanning only for the local Supabase stack in development", () => {
    expect(isLocalNoopScannerAllowed(allowed)).toBe(true);
    expect(isLocalNoopScannerAllowed({ ...allowed, supabaseUrl: "http://localhost:54321" })).toBe(true);
  });

  it.each([
    { ...allowed, nodeEnv: "production" },
    { ...allowed, scanner: undefined },
    { ...allowed, supabaseUrl: "https://example.com" },
    { ...allowed, supabaseUrl: "http://127.0.0.1:54322" },
    { ...allowed, supabaseUrl: "http://127.0.0.1:54321@evil.example" },
    { ...allowed, supabaseUrl: "invalid" },
  ])("rejects unsafe configuration", (settings) => {
    expect(isLocalNoopScannerAllowed(settings)).toBe(false);
  });
});
