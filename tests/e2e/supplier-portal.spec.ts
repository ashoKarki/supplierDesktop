import { execFileSync } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../src/lib/supabase/database.types";

const statusSchema = z.object({
  API_URL: z.literal("http://127.0.0.1:54321"),
  ANON_KEY: z.string().min(1),
  SERVICE_ROLE_KEY: z.string().min(1),
});

let admin: SupabaseClient<Database>;
let owner: SupabaseClient<Database>;
let userId: string | undefined;
let companyId: string | undefined;
let requestId: string;
let email: string;
let password: string;
let tokens: string[];

test.beforeEach(async () => {
  userId = undefined;
  companyId = undefined;
  tokens = [];
  const raw: unknown = JSON.parse(execFileSync("./node_modules/.bin/supabase", ["status", "--output", "json"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  }));
  const status = statusSchema.parse(raw);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  admin = createClient<Database>(status.API_URL, status.SERVICE_ROLE_KEY, options);
  owner = createClient<Database>(status.API_URL, status.ANON_KEY, options);
  email = `portal-e2e-${randomUUID()}@example.test`;
  password = `Test-${randomUUID()}-only`;
  const user = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: {
    enrollment_type: "owner", administrator_name: "Test Owner", company_name: "Portal Test Manufacturer",
    country: "AT", business_details: "Disposable local test",
  } });
  if (user.error || !user.data.user) throw new Error("Unable to create portal test user");
  userId = user.data.user.id;
  if ((await owner.auth.signInWithPassword({ email, password })).error) throw new Error("Unable to sign in test user");
  const company = await owner.rpc("create_owner_workspace");
  if (company.error || !company.data) throw new Error("Unable to create test company");
  companyId = company.data;
  const supplier = await owner.from("suppliers").insert({ company_id: companyId, name: "Portal Test Supplier" }).select("id").single();
  if (supplier.error || !supplier.data) throw new Error("Unable to create test supplier");
  const requirements = await owner.from("document_requirements").insert([
    { company_id: companyId, name: "Certificate A", renewal_months: 12 },
    { company_id: companyId, name: "Certificate B", renewal_months: 12 },
  ]).select("id");
  if (requirements.error) throw new Error("Unable to create test requirements");
  const request = await owner.rpc("create_document_request", {
    target_company: companyId, target_supplier: supplier.data.id, requirement_ids: requirements.data.map((item) => item.id),
  });
  if (request.error || !request.data) throw new Error("Unable to create test request");
  requestId = request.data;
});

test.afterEach(async () => {
  const failures: string[] = [];
  if (companyId) {
    const versions = await admin.from("document_versions").select("storage_path").eq("company_id", companyId);
    if (versions.error) failures.push("find test objects");
    else if (versions.data.length) {
      const removed = await admin.storage.from("supplierdesk-documents").remove(versions.data.map((version) => version.storage_path));
      if (removed.error) failures.push("delete test objects");
    }
    const company = await admin.from("companies").delete().eq("id", companyId);
    if (company.error) failures.push("delete test company");
  }
  if (userId && (await admin.auth.admin.deleteUser(userId)).error) failures.push("delete test user");
  const secret = process.env.PLAYWRIGHT_RATE_SECRET;
  if (!secret) failures.push("missing test rate-limit secret");
  else {
    const keys = [createHmac("sha256", secret).update("local").digest("hex"),
      ...tokens.map((token) => createHash("sha256").update(token).digest("hex"))];
    try {
      execFileSync("docker", [
        "exec", "supabase_db_supplierDesktop", "psql", "-U", "postgres", "-d", "postgres",
        "-v", "ON_ERROR_STOP=1", "-c",
        `delete from public.supplier_portal_rate_limits where key_hash in (${keys.map((key) => `'${key}'`).join(",")})`,
      ], { stdio: ["ignore", "ignore", "pipe"] });
    } catch {
      failures.push("delete test rate-limit keys");
    }
  }
  if (failures.length) throw new Error(`Portal test cleanup failed: ${failures.join(", ")}`);
});

test("mobile supplier submits, resubmits after rejection, and sees both languages", async ({ page, browser }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Business email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await page.goto(`/workspace/${companyId}/requests`);
  await page.getByRole("button", { name: "Create supplier link" }).click();
  const link = await page.getByLabel(/Copy and securely share this link/).inputValue();
  const token = new URL(link).pathname.split("/").pop();
  if (!token) throw new Error("Supplier token was not returned");
  tokens.push(token);
  const supplierContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const supplier = await supplierContext.newPage();
  try {
    await supplier.goto(link);
    await expect(supplier.getByRole("heading", { name: "Upload your documents" })).toBeVisible();
    await supplier.getByRole("link", { name: "Deutsch" }).click();
    await expect(supplier.getByRole("heading", { name: "Laden Sie Ihre Dokumente hoch" })).toBeVisible();
    const germanAccessibility = await new AxeBuilder({ page: supplier }).include("main").analyze();
    expect(germanAccessibility.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
    const germanItem = supplier.locator(".supplier-document-item").filter({ hasText: "Certificate A" });
    await germanItem.locator('input[type="file"]').setInputFiles({
      name: "Certificate A.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 disposable test"),
    });
    await germanItem.getByRole("button", { name: "Dokument einreichen" }).click();
    await expect(germanItem.locator(".document-status")).toHaveText("Eingereicht");
    await expect(supplier).toHaveURL(/lang=de/);
    await expect(supplier.getByRole("status")).toContainText("Das Dokument wurde zur Prüfung eingereicht");
    await supplier.getByRole("link", { name: "English" }).click();
    const englishAccessibility = await new AxeBuilder({ page: supplier }).include("main").analyze();
    expect(englishAccessibility.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
    const englishItem = supplier.locator(".supplier-document-item").filter({ hasText: "Certificate B" });
    await englishItem.locator('input[type="file"]').setInputFiles({
      name: "Certificate B.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 disposable test"),
    });
    await englishItem.getByRole("button", { name: "Submit document" }).click();
    await expect(englishItem.locator(".document-status")).toHaveText("Submitted");
    await expect(supplier.getByRole("status")).toContainText("Document submitted for review");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Recent supplier submissions" })).toBeVisible();
    const first = page.locator(".document-item").filter({ hasText: "Certificate A" });
    await first.getByRole("button", { name: "Start review" }).click();
    await expect(first.locator(".document-status")).toHaveText("under review");
    await first.getByLabel("Review notes (required for rejection)").fill("Please provide a signature");
    await first.getByRole("button", { name: "Reject" }).click();
    await expect(first.locator(".document-status")).toHaveText("rejected");
    const second = page.locator(".document-item").filter({ hasText: "Certificate B" });
    await second.getByRole("button", { name: "Start review" }).click();
    await expect(second.locator(".document-status")).toHaveText("under review");
    await second.getByRole("button", { name: "Approve" }).click();
    await expect(second.locator(".document-status")).toHaveText("approved");
    await supplier.reload();
    const rejected = supplier.locator(".supplier-document-item").filter({ hasText: "Certificate A" });
    await expect(rejected).toContainText("Please provide a signature");
    await rejected.locator('input[type="file"]').setInputFiles({
      name: "replacement.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 replacement test"),
    });
    await rejected.getByRole("button", { name: "Submit document" }).click();
    await expect(rejected.locator(".document-status")).toHaveText("Submitted");
    await expect(supplier.getByRole("status")).toContainText("Document submitted for review");
    await page.reload();
    await first.getByRole("button", { name: "Start review" }).click();
    await expect(first.locator(".document-status")).toHaveText("under review");
    await first.getByRole("button", { name: "Approve" }).click();
    await expect(first.locator(".document-status")).toHaveText("approved");
    await expect(second.locator(".document-status")).toHaveText("approved");
  } finally {
    await supplierContext.close();
  }
});

test("invalid, expired and revoked links show the same safe message", async ({ page }) => {
  const issued = await owner.rpc("create_supplier_upload_link", { target_company: companyId ?? "", target_request: requestId });
  if (issued.error || !issued.data) throw new Error("Unable to create test supplier link");
  tokens.push(issued.data);
  const tokenHash = createHash("sha256").update(issued.data).digest("hex");
  const expired = await admin.from("supplier_upload_links").update({ expires_at: "2020-01-01T00:00:00Z" }).eq("token_hash", tokenHash);
  if (expired.error) throw new Error("Unable to expire test link");
  const invalidResponse = await page.goto(`/supplier/upload/${"0".repeat(64)}`);
  expect(invalidResponse?.status()).toBe(404);
  const invalidText = await page.locator("main").innerText();
  const expiredResponse = await page.goto(`/supplier/upload/${issued.data}`);
  expect(expiredResponse?.status()).toBe(404);
  expect(await page.locator("main").innerText()).toBe(invalidText);
  const other = await owner.rpc("create_supplier_upload_link", { target_company: companyId ?? "", target_request: requestId });
  if (other.error || !other.data) throw new Error("Unable to create revocation fixture");
  tokens.push(other.data);
  const revoked = await admin.rpc("revoke_supplier_link_hash", {
    target_company: companyId ?? "", target_hash: createHash("sha256").update(other.data).digest("hex"),
  });
  if (revoked.error) throw new Error("Unable to revoke test link");
  const revokedResponse = await page.goto(`/supplier/upload/${other.data}`);
  expect(revokedResponse?.status()).toBe(404);
  expect(await page.locator("main").innerText()).toBe(invalidText);
});
