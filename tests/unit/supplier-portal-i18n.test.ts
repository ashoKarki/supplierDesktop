import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import { portalLocale, portalMessages } from "../../src/i18n/supplier-portal";

function messageKeys(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]: [string, unknown]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") return [path];
    if (typeof child === "object" && child !== null) return messageKeys(child, path);
    throw new Error(`Invalid message at ${path}`);
  }).sort();
}

describe("supplier portal translations", () => {
  it("has the same message keys in English and German", () => {
    expect(messageKeys(portalMessages.de)).toEqual(messageKeys(portalMessages.en));
  });

  it("renders the company and supplier in both languages", () => {
    for (const locale of ["en", "de"] as const) {
      const t = createTranslator({ locale, messages: portalMessages[locale] });
      const introduction = t("introduction", { company: "Example Co", supplier: "Example Supplier" });
      expect(introduction).toContain("Example Co");
      expect(introduction).toContain("Example Supplier");
    }
  });

  it("accepts supported languages and defaults to English", () => {
    expect(portalLocale("de")).toBe("de");
    expect(portalLocale("en")).toBe("en");
    expect(portalLocale("fr")).toBe("en");
    expect(portalLocale(undefined)).toBe("en");
  });
});
