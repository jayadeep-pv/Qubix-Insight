import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { configApi } from "../services/configApi";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import "./TenantSettings.css";
import PageLoading from "../components/PageLoading";

interface TenantSettingsForm {
  tenantKey: string;
  tenantName: string;
  aadTenantId: string;
  allowedDomains: string;
  dataverseUrl: string;
  blobContainerName: string;
  storageAccountName: string;
  storageSasSecretRef: string;
  subscriptionTier: string;
  onboardedDate: string | null;
  isActive: boolean;
}

const EMPTY: TenantSettingsForm = {
  tenantKey: "",
  tenantName: "",
  aadTenantId: "",
  allowedDomains: "",
  dataverseUrl: "",
  blobContainerName: "",
  storageAccountName: "",
  storageSasSecretRef: "",
  subscriptionTier: "",
  onboardedDate: null,
  isActive: true,
};

export default function TenantSettings() {
  const navigate = useNavigate();
  const [form, setForm]         = useState<TenantSettingsForm>(EMPTY);
  const [original, setOriginal] = useState<TenantSettingsForm>(EMPTY);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("general");
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const data = await configApi.getTenantSettings();
      const mapped: TenantSettingsForm = {
        tenantKey:           data.tenantKey          ?? "",
        tenantName:          data.tenantName         ?? "",
        aadTenantId:         data.aadTenantId        ?? "",
        allowedDomains:      data.allowedDomains     ?? "",
        dataverseUrl:        data.dataverseUrl       ?? "",
        blobContainerName:   data.blobContainerName  ?? "",
        storageAccountName:  data.storageAccountName ?? "",
        storageSasSecretRef: data.storageSasSecretRef ?? "",
        subscriptionTier:    data.subscriptionTier   ?? "",
        onboardedDate:       data.onboardedDate      ?? null,
        isActive:            data.isActive           ?? true,
      };
      setForm(mapped);
      setOriginal(mapped);
    } catch {
      setError("Failed to load tenant settings.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!form.tenantName.trim()) {
      alert("Tenant Name is required.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await configApi.updateTenantSettings({
        tenantName:          form.tenantName,
        allowedDomains:      form.allowedDomains,
        dataverseUrl:        form.dataverseUrl,
        blobContainerName:   form.blobContainerName,
        storageAccountName:  form.storageAccountName,
        storageSasSecretRef: form.storageSasSecretRef,
        isActive:            form.isActive,
      });
      setOriginal(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setForm(original);
  }

  async function runMigration() {
    if (!window.confirm(
      "This will stamp the tenant ID on all existing records that are missing it.\n\n" +
      "Run the migration?"
    )) return;
    try {
      setMigrating(true);
      setMigrateResult(null);
      const result = await configApi.migrateExistingData();
      const lines = Object.entries(result.tablesUpdated as Record<string, number>)
        .filter(([k]) => !k.includes("error"))
        .map(([table, count]) => `${table}: ${count} record(s) updated`);
      setMigrateResult("Migration complete:\n" + lines.join("\n"));
    } catch {
      setMigrateResult("Migration failed. Check the browser console for details.");
    } finally {
      setMigrating(false);
    }
  }

  if (loading) return <PageLoading title="Loading tenant settings…" />;

  return (
    <div className="page">

      <PageBreadcrumb
        items={[{ label: "Back", onClick: () => navigate(-1) }, { label: "Tenant Settings" }]}
        actions={form.subscriptionTier ? <span className="ts-tier-badge">{form.subscriptionTier}</span> : undefined}
      />

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h2 className="ts-heading">
            Tenant Settings
            {form.tenantName && (
              <span className="ts-heading-sub">— {form.tenantName}</span>
            )}
          </h2>
          <p className="ts-subtitle">
            Manage your organisation's configuration and infrastructure settings.
          </p>
        </div>
      </div>

      {/* ── Read-only identity strip ── */}
      <div className="ts-identity-strip">
        <InfoChip label="Tenant Key"    value={form.tenantKey} />
        <InfoChip label="AAD Tenant ID" value={form.aadTenantId} mono />
        {form.onboardedDate && (
          <InfoChip
            label="Onboarded"
            value={new Date(form.onboardedDate).toLocaleDateString()}
          />
        )}
        <InfoChip
          label="Status"
          value={form.isActive ? "Active" : "Inactive"}
          accent={form.isActive ? "green" : "red"}
        />
      </div>

      {/* ── Banners ── */}
      {error && <div className="ts-banner ts-banner--error">{error}</div>}
      {saved  && <div className="ts-banner ts-banner--success">Settings saved successfully.</div>}

      {/* ── Tabs ── */}
      <div className="tabs ts-tabs">
        <button
          type="button"
          className={activeTab === "general" ? "tab active" : "tab"}
          onClick={() => setActiveTab("general")}
        >
          General
        </button>
        <button
          type="button"
          className={activeTab === "infrastructure" ? "tab active" : "tab"}
          onClick={() => setActiveTab("infrastructure")}
        >
          Infrastructure
        </button>
        <button
          type="button"
          className={activeTab === "datatools" ? "tab active" : "tab"}
          onClick={() => setActiveTab("datatools")}
        >
          Data Tools
        </button>
      </div>

      {/* ── General tab ── */}
      {activeTab === "general" && (
        <>
          <div className="form-group">
            <label htmlFor="tenantName">Tenant Name *</label>
            <input
              className="form-input ts-field-input"
              id="tenantName"
              value={form.tenantName}
              onChange={(e) => setForm({ ...form, tenantName: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label htmlFor="allowedDomains">Allowed Domains</label>
            <input
              className="form-input ts-field-input"
              id="allowedDomains"
              placeholder="e.g. contoso.com, contoso.co.uk"
              value={form.allowedDomains}
              onChange={(e) => setForm({ ...form, allowedDomains: e.target.value })}
            />
            <span className="ts-field-hint">
              Comma-separated list of permitted email domains.
            </span>
          </div>

          <div className="form-group">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              <span>Active</span>
            </label>
          </div>

          <FormFooter onSave={save} onReset={reset} saving={saving} />
        </>
      )}

      {/* ── Infrastructure tab ── */}
      {activeTab === "infrastructure" && (
        <>
          <div className="form-group">
            <label htmlFor="dataverseUrl">Dataverse URL</label>
            <input
              className="form-input ts-field-input--wide"
              id="dataverseUrl"
              placeholder="https://yourorg.crm11.dynamics.com"
              value={form.dataverseUrl}
              onChange={(e) => setForm({ ...form, dataverseUrl: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label htmlFor="storageAccountName">Storage Account Name</label>
            <input
              className="form-input ts-field-input"
              id="storageAccountName"
              placeholder="e.g. mystorageaccount"
              value={form.storageAccountName}
              onChange={(e) => setForm({ ...form, storageAccountName: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label htmlFor="blobContainerName">Blob Container Name</label>
            <input
              className="form-input ts-field-input"
              id="blobContainerName"
              placeholder="e.g. documents"
              value={form.blobContainerName}
              onChange={(e) => setForm({ ...form, blobContainerName: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label htmlFor="storageSasSecretRef">SAS Secret Reference (Key Vault)</label>
            <input
              className="form-input ts-field-input"
              id="storageSasSecretRef"
              placeholder="Key Vault secret name"
              value={form.storageSasSecretRef}
              onChange={(e) => setForm({ ...form, storageSasSecretRef: e.target.value })}
            />
            <span className="ts-field-hint">
              The name of the Key Vault secret that holds the SAS token or connection string.
            </span>
          </div>

          <FormFooter onSave={save} onReset={reset} saving={saving} />
        </>
      )}

      {/* ── Data Tools tab ── */}
      {activeTab === "datatools" && (
        <div className="form-group">
          <h3 className="ts-data-tools-heading">Migrate Legacy Data</h3>
          <p className="ts-field-hint ts-data-tools-hint">
            Records created before tenant isolation was enabled are missing the tenant ID and
            won't appear in dropdowns or lists. Run this once to stamp them with the current
            tenant ID so they become visible again.
          </p>
          <button
            type="button"
            className="btn-primary ts-data-tools-btn"
            onClick={runMigration}
            disabled={migrating}
          >
            {migrating ? "Running migration…" : "Run Data Migration"}
          </button>
          {migrateResult && (
            <pre className="ts-banner ts-banner--success ts-migration-result">
              {migrateResult}
            </pre>
          )}
        </div>
      )}

    </div>
  );
}

/* ── InfoChip ────────────────────────────────────────────── */

function InfoChip({
  label, value, mono = false, accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: "green" | "red";
}) {
  const valueClass = [
    "ts-chip__value",
    accent === "green" ? "ts-chip__value--green"
      : accent === "red" ? "ts-chip__value--red" : "",
    mono ? "ts-chip__value--mono" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="ts-chip">
      <span className="ts-chip__label">{label}</span>
      <span className={valueClass}>{value || "—"}</span>
    </div>
  );
}

/* ── FormFooter ──────────────────────────────────────────── */

function FormFooter({
  onSave, onReset, saving,
}: {
  onSave: () => void;
  onReset: () => void;
  saving: boolean;
}) {
  return (
    <div className="form-footer">
      <button type="button" className="btn-primary" onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
      <button type="button" className="btn-secondary" onClick={onReset} disabled={saving}>
        Reset
      </button>
    </div>
  );
}
