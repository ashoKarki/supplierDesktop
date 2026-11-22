import { z } from "zod";

const siteOrigin = z.string().url().refine((value) => {
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  return (
    (url.protocol === "https:" || (local && url.protocol === "http:")) &&
    !url.username &&
    !url.password &&
    url.pathname === "/" &&
    !url.search &&
    !url.hash
  );
}, "SITE_URL must be an HTTPS origin (HTTP is allowed for localhost)");

const serverEnvironment = z.object({
  NEXT_PUBLIC_SUPABASE_URL: siteOrigin,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SITE_URL: siteOrigin.transform((value) => new URL(value).origin),
});

export function parseServerEnvironment(values: Record<string, string | undefined>) {
  return serverEnvironment.parse(values);
}

export function getServerEnvironment() {
  return parseServerEnvironment({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SITE_URL: process.env.SITE_URL,
  });
}
