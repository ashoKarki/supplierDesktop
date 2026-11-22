import { describe, expect, it } from "vitest";
import { supplierPortalIpKey } from "../../src/lib/security/supplier-portal-rate-limit";

const production = {
  nodeEnv: "production",
  vercel: "1",
  supabaseUrl: "https://example.supabase.co",
  secret: "0123456789abcdef0123456789abcdef",
  forwardedIp: "203.0.113.15",
};

describe("supplier portal rate-limit identity", () => {
  it("uses a keyed fingerprint, not the client IP", () => {
    const key = supplierPortalIpKey(production);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain(production.forwardedIp);
    expect(supplierPortalIpKey(production)).toBe(key);
    expect(supplierPortalIpKey({ ...production, forwardedIp: "203.0.113.16" })).not.toBe(key);
  });

  it("normalizes equivalent IPv6 addresses", () => {
    expect(supplierPortalIpKey({ ...production, forwardedIp: "2001:0db8:0:0:0:0:0:1" }))
      .toBe(supplierPortalIpKey({ ...production, forwardedIp: "2001:db8::1" }));
  });

  it.each([
    { ...production, vercel: undefined },
    { ...production, forwardedIp: undefined },
    { ...production, forwardedIp: "203.0.113.15, 203.0.113.16" },
    { ...production, forwardedIp: "not-an-ip" },
    { ...production, secret: "too-short" },
  ])("rejects untrusted or incomplete production settings", (settings) => {
    expect(() => supplierPortalIpKey(settings)).toThrow();
  });

  it("ignores forwarded headers only on the local development stack", () => {
    const local = {
      nodeEnv: "development",
      vercel: undefined,
      supabaseUrl: "http://127.0.0.1:54321",
      secret: undefined,
      forwardedIp: "203.0.113.15",
    };
    expect(supplierPortalIpKey(local)).toBe(supplierPortalIpKey({ ...local, forwardedIp: "spoofed" }));
    expect(() => supplierPortalIpKey({ ...local, supabaseUrl: "https://example.supabase.co" })).toThrow();
  });
});
