export function isLocalNoopScannerAllowed(settings: {
  nodeEnv: string | undefined;
  supabaseUrl: string | undefined;
  scanner: string | undefined;
}): boolean {
  return settings.nodeEnv === "development"
    && settings.scanner === "local-noop"
    && (settings.supabaseUrl === "http://127.0.0.1:54321"
      || settings.supabaseUrl === "http://localhost:54321");
}
