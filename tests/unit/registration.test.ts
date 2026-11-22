import { describe, expect, it } from "vitest";
import { registrationSchema } from "../../src/domain/registration";

const validRegistration = {
  administratorName: "Ada Example",
  email: "  ADA@example.com ",
  password: "a secure password",
  companyName: "Example Manufacturing",
  country: "AT",
  businessDetails: "Industrial components manufacturer",
};

describe("company registration", () => {
  it("normalizes the administrator's email and company details", () => {
    expect(registrationSchema.parse(validRegistration)).toEqual({
      ...validRegistration,
      email: "ada@example.com",
    });
  });

  it.each([
    ["administratorName", "   "],
    ["email", "not-an-email"],
    ["password", "short"],
    ["companyName", ""],
    ["country", "Austria"],
    ["businessDetails", ""],
  ])("rejects invalid %s", (field, value) => {
    expect(
      registrationSchema.safeParse({ ...validRegistration, [field]: value })
        .success,
    ).toBe(false);
  });

  it("does not trim or alter the password", () => {
    const password = " a secure password ";
    expect(registrationSchema.parse({ ...validRegistration, password }).password)
      .toBe(password);
  });

  it("enforces the password length boundaries", () => {
    expect(registrationSchema.safeParse({ ...validRegistration, password: "x".repeat(12) }).success).toBe(true);
    expect(registrationSchema.safeParse({ ...validRegistration, password: "x".repeat(129) }).success).toBe(false);
  });
});
