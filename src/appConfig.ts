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
  const res = await fetch("/config.json");
  if (!res.ok) throw new Error(`Failed to load /config.json: ${res.status}`);
  _config = await res.json();
  return _config!;
}

export function getAppConfig(): AppConfig {
  if (!_config) throw new Error("App config not loaded. Ensure loadAppConfig() completes before use.");
  return _config;
}
