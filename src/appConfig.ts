export interface AppConfig {
  clientId: string;
  apiScope: string;
  authorityTenantId: string;
  apiBase: string;
  externalIdClientId?: string;
  /** Tenant GUID for the Entra External ID tenant — found in Azure Portal → External ID → ilogixidentity → Overview → Tenant ID */
  externalIdTenantId?: string;
}

let _config: AppConfig | null = null;

export async function loadAppConfig(): Promise<AppConfig> {
  if (_config) return _config;
  // config.local.json is gitignored — use it to override apiBase for local dev
  // without touching the committed config.json.
  try {
    const local = await fetch("/config.local.json");
    if (local.ok) {
      _config = await local.json();
      return _config!;
    }
  } catch { /* not present — fall through */ }
  const res = await fetch("/config.json");
  if (!res.ok) throw new Error(`Failed to load /config.json: ${res.status}`);
  _config = await res.json();
  return _config!;
}

export function getAppConfig(): AppConfig {
  if (!_config) throw new Error("App config not loaded. Ensure loadAppConfig() completes before use.");
  return _config;
}
