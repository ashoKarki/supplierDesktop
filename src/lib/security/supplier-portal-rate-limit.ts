import { createHmac } from "node:crypto";
import { isIP } from "node:net";

type Settings = {
  nodeEnv: string | undefined;
  vercel: string | undefined;
  supabaseUrl: string | undefined;
  secret: string | undefined;
  forwardedIp: string | undefined;
};

export function supplierPortalIpKey(settings: Settings): string {
  const local = settings.nodeEnv === "development"
    && (settings.supabaseUrl === "http://127.0.0.1:54321" || settings.supabaseUrl === "http://localhost:54321");
  if (local) {
    return createHmac("sha256", settings.secret ?? "local-development-only").update("local").digest("hex");
  }
  if (settings.vercel !== "1" || !settings.forwardedIp || !isIP(settings.forwardedIp)
    || !settings.secret || settings.secret.length < 32) {
    throw new Error("Supplier portal rate limiting is not configured");
  }
  const ip = isIP(settings.forwardedIp) === 6
    ? new URL(`http://[${settings.forwardedIp}]/`).hostname
    : settings.forwardedIp;
  return createHmac("sha256", settings.secret).update(ip).digest("hex");
}
