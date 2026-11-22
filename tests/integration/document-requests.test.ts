import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { MAX_DOCUMENT_BYTES } from "../../src/domain/document-upload";
import type { Database } from "../../src/lib/supabase/database.types";

const localStatusSchema = z.object({
  API_URL: z.literal("http://127.0.0.1:54321"),
  ANON_KEY: z.string().min(1),
  SERVICE_ROLE_KEY: z.string().min(1),
});

type TestTenant = {
  userId: string;
  companyId: string;
  client: SupabaseClient<Database>;
};

describe("document requests against local Supabase", () => {
  const createdUsers: string[] = [];
  const createdCompanies: string[] = [];
  const uploadedObjects: string[] = [];
  let admin: SupabaseClient<Database>;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let viewer: SupabaseClient<Database>;
  let supplierId: string;
  let requirementId: string;
  let otherRequirementId: string;

  beforeAll(async () => {
    const raw: unknown = JSON.parse(execFileSync(resolve("node_modules/.bin/supabase"), ["status", "--output", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }));
    const { API_URL, ANON_KEY, SERVICE_ROLE_KEY } = localStatusSchema.parse(raw);
    const options = { auth: { autoRefreshToken: false, persistSession: false } };
    admin = createClient<Database>(API_URL, SERVICE_ROLE_KEY, options);

    async function createTenant(): Promise<TestTenant> {
      const email = `integration-${randomUUID()}@example.test`;
      const password = `Test-${randomUUID()}-only`;
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          enrollment_type: "owner",
          administrator_name: "Integration owner",
          company_name: "Integration company",
          country: "AT",
          business_details: "Isolated local integration test",
        },
      });
      if (created.error || !created.data.user) throw new Error("Unable to create local test user");
      createdUsers.push(created.data.user.id);
      const client = createClient<Database>(API_URL, ANON_KEY, options);
      const login = await client.auth.signInWithPassword({ email, password });
      if (login.error || !login.data.user) throw new Error("Unable to sign in local test user");
      const workspace = await client.rpc("create_owner_workspace");
      if (workspace.error || !workspace.data) throw new Error("Unable to create local test workspace");
      createdCompanies.push(workspace.data);
      return { userId: login.data.user.id, companyId: workspace.data, client };
    }

    tenantA = await createTenant();
    tenantB = await createTenant();
    const viewerEmail = `integration-${randomUUID()}@example.test`;
    const viewerPassword = `Test-${randomUUID()}-only`;
    const viewerUser = await admin.auth.admin.createUser({ email: viewerEmail, password: viewerPassword, email_confirm: true });
    if (viewerUser.error || !viewerUser.data.user) throw new Error("Unable to create local test viewer");
    createdUsers.push(viewerUser.data.user.id);
    const membership = await admin.from("company_memberships").insert({
      company_id: tenantA.companyId,
      user_id: viewerUser.data.user.id,
      role: "viewer",
    });
    if (membership.error) throw new Error("Unable to create local test membership");
    viewer = createClient<Database>(API_URL, ANON_KEY, options);
    const viewerLogin = await viewer.auth.signInWithPassword({ email: viewerEmail, password: viewerPassword });
    if (viewerLogin.error) throw new Error("Unable to sign in local test viewer");
    const supplier = await tenantA.client.from("suppliers")
      .insert({ company_id: tenantA.companyId, name: "Test supplier" }).select("id").single();
    if (supplier.error || !supplier.data) throw new Error("Unable to create local test supplier");
    supplierId = supplier.data.id;
    const requirement = await tenantA.client.from("document_requirements")
      .insert({ company_id: tenantA.companyId, name: "Test requirement", renewal_months: 12 }).select("id").single();
    if (requirement.error || !requirement.data) throw new Error("Unable to create local test requirement");
    requirementId = requirement.data.id;
    const otherRequirement = await tenantB.client.from("document_requirements")
      .insert({ company_id: tenantB.companyId, name: "Other company requirement", renewal_months: 12 }).select("id").single();
    if (otherRequirement.error || !otherRequirement.data) throw new Error("Unable to create other company requirement");
    otherRequirementId = otherRequirement.data.id;
  }, 30000);

  afterAll(async () => {
    if (!admin) return;
    const failures: string[] = [];
    if (uploadedObjects.length) {
      const { error } = await admin.storage.from("supplierdesk-documents").remove(uploadedObjects);
      if (error) failures.push(`objects: ${error.name}`);
    }
    for (const companyId of createdCompanies) {
      const { error } = await admin.from("companies").delete().eq("id", companyId);
      if (error) failures.push(`company: ${error.code}`);
    }
    for (const userId of createdUsers) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) failures.push(`user: ${error.code}`);
    }
    if (failures.length) throw new Error(`Local test cleanup failed: ${failures.join(", ")}`);
  });

  it("creates a request and item, visible only to the owning company", async () => {
    const created = await tenantA.client.rpc("create_document_request", {
      target_company: tenantA.companyId,
      target_supplier: supplierId,
      requirement_ids: [requirementId],
    });
    expect(created.error).toBeNull();
    if (!created.data) throw new Error("Request creation did not return an ID");

    const ownItems = await tenantA.client.from("document_request_items")
      .select("id").eq("request_id", created.data);
    expect(ownItems.error).toBeNull();
    expect(ownItems.data).toHaveLength(1);
    const otherRequests = await tenantB.client.from("document_requests").select("id").eq("id", created.data);
    expect(otherRequests.error).toBeNull();
    expect(otherRequests.data).toEqual([]);
    const otherItems = await tenantB.client.from("document_request_items")
      .select("id").eq("request_id", created.data);
    expect(otherItems.error).toBeNull();
    expect(otherItems.data).toEqual([]);
    const viewerItems = await viewer.from("document_request_items").select("id").eq("request_id", created.data);
    expect(viewerItems.error).toBeNull();
    expect(viewerItems.data).toHaveLength(1);
  });

  it("rejects cross-company request creation and leaves no partial request", async () => {
    const attempt = await tenantB.client.rpc("create_document_request", {
      target_company: tenantB.companyId,
      target_supplier: supplierId,
      requirement_ids: [requirementId],
    });
    expect(attempt.error?.code).toBe("22023");
    const requests = await tenantB.client.from("document_requests").select("id");
    expect(requests.error).toBeNull();
    expect(requests.data).toEqual([]);
  });

  it("denies a viewer and another company's owner from creating requests in the workspace", async () => {
    for (const client of [viewer, tenantB.client]) {
      const attempt = await client.rpc("create_document_request", {
        target_company: tenantA.companyId,
        target_supplier: supplierId,
        requirement_ids: [requirementId],
      });

      expect(attempt.error?.code).toBe("42501");
    }
  });

  it("allows only authorized members to update their company profile", async () => {
    const updated = await tenantA.client.from("companies").update({ name: "Updated company", country: "DE" })
      .eq("id", tenantA.companyId).select("id");
    expect(updated.error).toBeNull();
    expect(updated.data).toHaveLength(1);
    for (const client of [viewer, tenantB.client]) {
      const forbidden = await client.from("companies").update({ name: "Unauthorized change" })
        .eq("id", tenantA.companyId).select("id");
      expect(forbidden.error).toBeNull();
      expect(forbidden.data).toEqual([]);
    }
    const company = await tenantA.client.from("companies").select("name, country").eq("id", tenantA.companyId).single();
    expect(company.error).toBeNull();
    expect(company.data).toEqual({ name: "Updated company", country: "DE" });
  });

  it("enforces supplier capacity across concurrent API writes per company", async () => {
    const seed = await tenantB.client.from("suppliers").insert(
      Array.from({ length: 99 }, (_, index) => ({
        company_id: tenantB.companyId,
        name: `Capacity fixture ${index}`,
        archived_at: index === 0 ? new Date().toISOString() : null,
      })),
    );
    expect(seed.error).toBeNull();
    const writes = await Promise.all(["First", "Second"].map((name) =>
      tenantB.client.from("suppliers").insert({ company_id: tenantB.companyId, name }),
    ));
    expect(writes.filter((result) => result.error === null)).toHaveLength(1);
    expect(writes.filter((result) => result.error?.code === "P1001")).toHaveLength(1);
    const total = await tenantB.client.from("suppliers").select("id", { count: "exact", head: true });
    expect(total.count).toBe(100);
    const otherCompany = await tenantA.client.from("suppliers")
      .insert({ company_id: tenantA.companyId, name: "Independent capacity" });
    expect(otherCompany.error).toBeNull();
  });

  it("enforces the member limit on concurrent privileged membership writes", async () => {
    const userIds: string[] = [];
    for (let index = 0; index < 9; index++) {
      const created = await admin.auth.admin.createUser({
        email: `capacity-${randomUUID()}@example.test`,
        password: `Test-${randomUUID()}-only`,
        email_confirm: true,
      });
      if (created.error || !created.data.user) throw new Error("Unable to create capacity test user");
      userIds.push(created.data.user.id);
      createdUsers.push(created.data.user.id);
    }
    const seeded = await admin.from("company_memberships").insert(userIds.slice(0, 7).map((userId) => ({
      company_id: tenantA.companyId,
      user_id: userId,
      role: "viewer",
    })));
    expect(seeded.error).toBeNull();
    const writes = await Promise.all(userIds.slice(7).map((userId) =>
      admin.from("company_memberships").insert({ company_id: tenantA.companyId, user_id: userId, role: "viewer" }),
    ));
    expect(writes.filter((result) => result.error === null)).toHaveLength(1);
    expect(writes.filter((result) => result.error?.code === "P1002")).toHaveLength(1);
    const total = await admin.from("company_memberships").select("user_id", { count: "exact", head: true })
      .eq("company_id", tenantA.companyId);
    expect(total.count).toBe(10);
  });

  it("keeps the workspace accessible after the trial has expired", async () => {
    const updated = await admin.from("company_trials").update({
      started_at: "2020-01-01T00:00:00Z",
      ends_at: "2020-01-31T00:00:00Z",
    }).eq("company_id", tenantA.companyId);
    expect(updated.error).toBeNull();
    const supplier = await tenantA.client.from("suppliers")
      .insert({ company_id: tenantA.companyId, name: "After trial expiry" });
    expect(supplier.error).toBeNull();
  });

  it("rejects invalid requirement sets without creating a partial request", async () => {
    const before = await tenantA.client.from("document_requests")
      .select("id", { count: "exact", head: true });
    expect(before.error).toBeNull();
    for (const requirementIds of [
      [],
      [requirementId, requirementId],
      [requirementId, randomUUID()],
      [requirementId, otherRequirementId],
    ]) {
      const attempt = await tenantA.client.rpc("create_document_request", {
        target_company: tenantA.companyId,
        target_supplier: supplierId,
        requirement_ids: requirementIds,
      });
      expect(attempt.error?.code).toBe("22023");
    }
    const after = await tenantA.client.from("document_requests")
      .select("id", { count: "exact", head: true });
    expect(after.error).toBeNull();
    expect(after.count).toBe(before.count);
  });

  it("rejects requests for archived suppliers", async () => {
    const supplier = await tenantA.client.from("suppliers")
      .insert({ company_id: tenantA.companyId, name: "Archived supplier" }).select("id").single();
    if (supplier.error || !supplier.data) throw new Error("Unable to create archived supplier fixture");
    const archive = await tenantA.client.from("suppliers")
      .update({ archived_at: new Date().toISOString() }).eq("id", supplier.data.id);
    expect(archive.error).toBeNull();
    const attempt = await tenantA.client.rpc("create_document_request", {
      target_company: tenantA.companyId,
      target_supplier: supplier.data.id,
      requirement_ids: [requirementId],
    });
    expect(attempt.error?.code).toBe("22023");
  });

  it("prevents direct request and item insertion that bypasses the atomic workflow", async () => {
    const request = await tenantA.client.from("document_requests")
      .insert({ company_id: tenantA.companyId, supplier_id: supplierId });
    expect(request.error?.code).toBe("42501");
    const item = await tenantA.client.from("document_request_items")
      .insert({ company_id: tenantA.companyId, request_id: randomUUID(), requirement_id: requirementId });
    expect(item.error?.code).toBe("42501");
  });

  it("keeps real storage private and enforces version and review transitions", async () => {
    const request = await tenantA.client.rpc("create_document_request", {
      target_company: tenantA.companyId,
      target_supplier: supplierId,
      requirement_ids: [requirementId],
    });
    if (request.error || !request.data) throw new Error("Unable to create document request");
    const item = await tenantA.client.from("document_request_items").select("id")
      .eq("request_id", request.data).single();
    if (item.error || !item.data) throw new Error("Unable to load document request item");
    const itemId = item.data.id;

    async function uploadVersion() {
      const versionId = randomUUID();
      const objectPath = `${tenantA.companyId}/${itemId}/${versionId}`;
      uploadedObjects.push(objectPath);
      const bytes = new TextEncoder().encode("%PDF-1.7 test");
      const upload = await admin.storage.from("supplierdesk-documents")
        .upload(objectPath, bytes, { contentType: "application/pdf", upsert: false });
      if (upload.error) throw new Error(`Storage upload failed: ${upload.error.name}`);
      const recorded = await admin.rpc("record_document_upload", {
        target_company: tenantA.companyId,
        target_item: itemId,
        new_version: versionId,
        file_name: "test.pdf",
        media_type: "application/pdf",
        file_size: bytes.length,
        expiration: "2027-01-01",
        submitted_by: tenantA.userId,
      });
      if (recorded.error) throw new Error(`Version recording failed: ${recorded.error.code}`);
      return { versionId, objectPath };
    }

    const first = await uploadVersion();
    for (const client of [tenantA.client, tenantB.client]) {
      const directDownload = await client.storage.from("supplierdesk-documents").download(first.objectPath);
      expect(directDownload.error).not.toBeNull();
      const forgedPath = `${tenantA.companyId}/${itemId}/${randomUUID()}`;
      uploadedObjects.push(forgedPath);
      const directUpload = await client.storage.from("supplierdesk-documents")
        .upload(forgedPath, new TextEncoder().encode("%PDF-forged"), { contentType: "application/pdf" });
      expect(directUpload.error).not.toBeNull();
    }
    const directUpdate = await tenantA.client.from("document_versions")
      .update({ filename: "forged.pdf" }).eq("id", first.versionId);
    expect(directUpdate.error?.code).toBe("42501");

    const review = async (versionId: string, nextStatus: string, reason: string | null, expiry: string | null) =>
      tenantA.client.rpc("review_document", {
        target_company: tenantA.companyId,
        target_item: itemId,
        target_version: versionId,
        next_status: nextStatus,
        decision_reason: reason,
        revised_expiry: expiry,
      });
    expect((await review(first.versionId, "under_review", null, null)).error).toBeNull();
    expect((await review(first.versionId, "rejected", "Missing signature", null)).error).toBeNull();
    const second = await uploadVersion();
    expect((await review(first.versionId, "under_review", null, null)).error?.code).toBe("40001");
    expect((await review(second.versionId, "under_review", null, null)).error).toBeNull();
    expect((await review(second.versionId, "approved", null, "2028-01-01")).error).toBeNull();

    const versions = await tenantA.client.from("document_versions").select("version_number").eq("item_id", item.data.id)
      .order("version_number");
    expect(versions.error).toBeNull();
    expect(versions.data).toEqual([{ version_number: 1 }, { version_number: 2 }]);
    const reviewedItem = await tenantA.client.from("document_request_items").select("status, expires_on")
      .eq("id", item.data.id).single();
    expect(reviewedItem.error).toBeNull();
    expect(reviewedItem.data).toEqual({ status: "approved", expires_on: "2028-01-01" });
    const events = await tenantA.client.from("document_review_events").select("status").eq("item_id", item.data.id);
    expect(events.error).toBeNull();
    expect(events.data?.map((event) => event.status).sort())
      .toEqual(["approved", "rejected", "submitted", "submitted", "under_review", "under_review"]);
    const otherVersions = await tenantB.client.from("document_versions").select("id").eq("item_id", item.data.id);
    expect(otherVersions.error).toBeNull();
    expect(otherVersions.data).toEqual([]);
    await uploadVersion();
    const superseded = await tenantA.client.from("document_review_events").select("version_id, status")
      .eq("item_id", itemId).eq("status", "superseded").single();
    expect(superseded.error).toBeNull();
    expect(superseded.data).toEqual({ version_id: second.versionId, status: "superseded" });
  });

  it("limits supplier upload links to their request and enforces revocation", async () => {
    const request = await tenantA.client.rpc("create_document_request", {
      target_company: tenantA.companyId,
      target_supplier: supplierId,
      requirement_ids: [requirementId],
    });
    const unrelated = await tenantA.client.rpc("create_document_request", {
      target_company: tenantA.companyId,
      target_supplier: supplierId,
      requirement_ids: [requirementId],
    });
    if (request.error || !request.data || unrelated.error || !unrelated.data) throw new Error("Unable to create supplier link fixtures");
    const items = await tenantA.client.from("document_request_items").select("id, request_id")
      .in("request_id", [request.data, unrelated.data]);
    if (items.error) throw new Error("Unable to load supplier link fixtures");
    const allowedItem = items.data.find((item) => item.request_id === request.data);
    const otherItem = items.data.find((item) => item.request_id === unrelated.data);
    if (!allowedItem || !otherItem) throw new Error("Supplier link fixture items are missing");

    const issued = await tenantA.client.rpc("create_supplier_upload_link", {
      target_company: tenantA.companyId,
      target_request: request.data,
    });
    if (issued.error || !issued.data) throw new Error("Unable to create supplier link");
    expect(issued.data).toMatch(/^[a-f0-9]{64}$/);
    const hash = createHash("sha256").update(issued.data).digest("hex");
    const resolved = await admin.rpc("resolve_supplier_upload_link", { link_hash: hash });
    expect(resolved.error).toBeNull();
    expect(resolved.data?.map(({ company_id, request_id }) => ({ company_id, request_id })))
      .toEqual([{ company_id: tenantA.companyId, request_id: request.data }]);
    const forbiddenLookup = await tenantA.client.rpc("resolve_supplier_upload_link", { link_hash: hash });
    expect(forbiddenLookup.error?.code).toBe("42501");
    const forbiddenIssue = await viewer.rpc("create_supplier_upload_link", {
      target_company: tenantA.companyId,
      target_request: request.data,
    });
    expect(forbiddenIssue.error?.code).toBe("42501");

    const versionId = randomUUID();
    const objectPath = `${tenantA.companyId}/${allowedItem.id}/${versionId}`;
    uploadedObjects.push(objectPath);
    const bytes = new TextEncoder().encode("%PDF-1.7 supplier test");
    const stored = await admin.storage.from("supplierdesk-documents")
      .upload(objectPath, bytes, { contentType: "application/pdf", upsert: false });
    if (stored.error) throw new Error(`Storage upload failed: ${stored.error.name}`);
    const details = {
      target_company: tenantA.companyId,
      target_item: allowedItem.id,
      new_version: versionId,
      file_name: "supplier.pdf",
      media_type: "application/pdf",
      file_size: bytes.length,
      expiration: null,
      link_hash: hash,
    };
    const wrongItem = await admin.rpc("record_supplier_document_upload", { ...details, target_item: otherItem.id });
    expect(wrongItem.error?.code).toBe("42501");
    const uploaded = await admin.rpc("record_supplier_document_upload", details);
    expect(uploaded.error).toBeNull();
    const versions = await tenantA.client.from("document_versions").select("submitted_by").eq("id", versionId).single();
    expect(versions.error).toBeNull();
    expect(versions.data).toEqual({ submitted_by: null });
    const links = await tenantA.client.from("supplier_upload_links").select("id").eq("request_id", request.data).single();
    if (links.error || !links.data) throw new Error("Unable to find created link");
    const revoke = await tenantA.client.rpc("revoke_supplier_upload_link", {
      target_company: tenantA.companyId,
      target_link: links.data.id,
    });
    expect(revoke.error).toBeNull();
    const revoked = await admin.rpc("resolve_supplier_upload_link", { link_hash: hash });
    expect(revoked.error).toBeNull();
    expect(revoked.data).toEqual([]);
    const afterRevoke = await admin.rpc("record_supplier_document_upload", details);
    expect(afterRevoke.error?.code).toBe("42501");
  });

  it("enforces the exact 15 MB limit in private storage", async () => {
    const bucket = admin.storage.from("supplierdesk-documents");
    const validPath = `integration-limit/${randomUUID()}`;
    const oversizedPath = `integration-limit/${randomUUID()}`;
    uploadedObjects.push(validPath, oversizedPath);
    const bytes = new Uint8Array(MAX_DOCUMENT_BYTES + 1);
    bytes.set(new TextEncoder().encode("%PDF-1.7"));
    const valid = await bucket.upload(validPath, bytes.subarray(0, MAX_DOCUMENT_BYTES), { contentType: "application/pdf" });
    expect(valid.error).toBeNull();
    const oversized = await bucket.upload(oversizedPath, bytes, { contentType: "application/pdf" });
    expect(oversized.error).not.toBeNull();
  }, 30000);
});
