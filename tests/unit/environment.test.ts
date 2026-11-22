import { describe, expect, it } from "vitest";
import { parseServerEnvironment } from "../../src/lib/env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key",
  SITE_URL: "https://supplierdesk.example",
};

describe("server environment", () => {
  it("rejects missing configuration", () => {
    expect(() => parseServerEnvironment({})).toThrow();
  });

  it("rejects a site URL with a path or insecure remote origin", () => {
    expect(() => parseServerEnvironment({ ...valid, SITE_URL: "https://supplierdesk.example/path" })).toThrow();
    expect(() => parseServerEnvironment({ ...valid, SITE_URL: "http://supplierdesk.example" })).toThrow();
    expect(() => parseServerEnvironment({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "http://example.test" })).toThrow();
  });

  it("accepts HTTPS origins and local development over HTTP", () => {
    expect(parseServerEnvironment(valid).SITE_URL).toBe(valid.SITE_URL);
    expect(parseServerEnvironment({ ...valid, SITE_URL: "http://localhost:3000" }).SITE_URL).toBe("http://localhost:3000");
  });
});
