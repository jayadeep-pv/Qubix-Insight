import { useState, useEffect } from "react";
import { configApi } from "../services/configApi";
import { DocumentType } from "../types/DocumentType";
import { useNavigate, useParams } from "react-router-dom";
import TemplatesList from "../components/templates/TemplatesList";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import PageLoading from "../components/PageLoading";
import { useUser } from "../context/UserContext";

export default function DocumentTypeForm() {

  const { id } = useParams();
  const navigate = useNavigate();
  const { isTrial } = useUser();

  const [form, setForm] = useState<DocumentType>({
    name: "",
    description: "",
    baseAiPrompt: "",
    isActive: true,
    enableCompare: false,
    enableScoring: false,
    enableSummarise: false,
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

  const switchTab = (tab: string) => {
    setActiveTab(tab);
    document.querySelector<HTMLElement>('.content')?.scrollTo({ top: 0, behavior: 'auto' });
  };

  /* =========================
     LOAD DOCUMENT TYPE
  ========================= */
  async function load() {

    if (!id) return;

    try {

      setLoading(true);

      const list = await configApi.getDocumentTypes();
      const item = list.find((x: any) => x.id === id);

      if (item) {
        setForm({
          id: item.id,
          name: item.name || "",
          description: item.description || "",
          baseAiPrompt: item.baseAiPrompt || "",
          isActive: item.isActive ?? true,
          enableCompare: item.enableCompare ?? false,
          enableScoring: item.enableScoring ?? false,
          enableSummarise: item.enableSummarise ?? false,
          createdOn: item.createdOn,
          modifiedOn: item.modifiedOn
        });
      }

    } catch (err) {
      console.error("Failed to load document type", err);
    }
    finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  /* =========================
     SAVE DOCUMENT TYPE
  ========================= */
  async function save() {

    if (!form.name.trim()) {
      alert("Document Type Name is required");
      return;
    }

    try {

      setSaving(true);

      const payload = {
        name: form.name,
        description: form.description,
        baseAiPrompt: form.baseAiPrompt,
        isActive: form.isActive,
        enableCompare: form.enableCompare ?? false,
        enableScoring: form.enableScoring ?? false,
        enableSummarise: form.enableSummarise ?? false,
      };

      if (id) {
        await configApi.updateDocumentType(id, payload);
      } else {
        await configApi.createDocumentType(payload);
      }

      navigate("/document-types");

    } catch (err) {
      console.error("Save failed", err);
      alert("Failed to save document type");
    } finally {
      setSaving(false);
    }
  }

  /* =========================
     UI
  ========================= */
  if (loading) return <PageLoading title="Loading document type…" />;

  return (
    <div className="page">

      <div className="page-sticky-header">
        <PageBreadcrumb
          items={[
            { label: "Document Types", onClick: () => navigate("/document-types") },
            { label: id ? `Document Type — ${form.name}` : "New Document Type" },
          ]}
        />
        <div className="admin-form-header">
          <h2>{id ? `Document Type — ${form.name}` : "New Document Type"}</h2>
        </div>
        {id && (
          <div className="tabs">
            <button type="button" className={activeTab === "details" ? "tab active" : "tab"} onClick={() => switchTab("details")}>Details</button>
            <button type="button" className={activeTab === "templates" ? "tab active" : "tab"} onClick={() => switchTab("templates")}>Templates</button>
          </div>
        )}
      </div>

      {activeTab === "details" && (
      <div className="top-grid">
        <div className={`admin-form-card${isTrial ? " admin-form-card--readonly" : ""}`}>

          {isTrial && (
            <div className="trial-banner">
              <span className="trial-banner-icon">🔒</span>
              <span>Trial account — this record is read only. Upgrade to enable editing.</span>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="name">Name *</label>
              <input type="text" className="form-input" id="name" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="description">Description</label>
              <input type="text" className="form-input" id="description" value={form.description || ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="baseAiPrompt">Base AI Prompt</label>
            <textarea className="form-input" id="baseAiPrompt" value={form.baseAiPrompt || ""}
              onChange={(e) => setForm({ ...form, baseAiPrompt: e.target.value })} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Usage Modes</label>
              <label className="checkbox-row">
                <input type="checkbox" checked={form.enableCompare ?? false}
                  onChange={(e) => setForm({ ...form, enableCompare: e.target.checked })} />
                <span>Enable Compare</span>
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={form.enableScoring ?? false}
                  onChange={(e) => setForm({ ...form, enableScoring: e.target.checked })} />
                <span>Enable Scoring</span>
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={form.enableSummarise ?? false}
                  onChange={(e) => setForm({ ...form, enableSummarise: e.target.checked })} />
                <span>Enable Summarise</span>
              </label>
            </div>
            <div className="form-group form-group-checkboxes">
              <label htmlFor="isActive">Status</label>
              <label className="checkbox-row">
                <input type="checkbox" id="isActive" checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                <span>Active — available for selection</span>
              </label>
            </div>
          </div>

          {(form.createdOn || form.modifiedOn) && (
            <div className="meta">
              {form.createdOn && <span>Created: {new Date(form.createdOn).toLocaleString()}</span>}
              {form.modifiedOn && <span>Modified: {new Date(form.modifiedOn).toLocaleString()}</span>}
            </div>
          )}

          <div className="form-footer">
            <button type="button" className="btn-primary" onClick={save} disabled={saving || isTrial}
              title={isTrial ? "Not available on trial" : undefined}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => navigate("/document-types")}>
              Cancel
            </button>
          </div>

        </div>

        <div className="dc-card guidance-card">
          <p className="guide-about">About Document Types</p>
          <p className="guide-about-desc">
            Document types categorise documents for analysis. Each type controls which modes are available and sets the base AI context for extraction.
          </p>
          <div className="guide-divider">
            <p className="guide-section-title">How it works</p>
            <div className="guide-steps">
              <div className="guide-step"><div className="guide-step-num">1</div><div>Create a document type to categorise a class of documents</div></div>
              <div className="guide-step"><div className="guide-step-num">2</div><div>Enable the analysis modes relevant to those documents</div></div>
              <div className="guide-step"><div className="guide-step-num">3</div><div>Link templates below to define the fields to extract</div></div>
            </div>
          </div>
        </div>
      </div>
      )}

      {activeTab === "templates" && id && (
        <div className="admin-tab-panel">
          <TemplatesList documentTypeId={id} documentTypeName={form.name} hideHeader embedded />
        </div>
      )}

    </div>
  );
}