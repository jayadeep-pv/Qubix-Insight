import { useState, useEffect } from "react";
import { configApi } from "../services/configApi";
import { DocumentType } from "../types/DocumentType";
import { useNavigate, useParams } from "react-router-dom";
import TemplatesList from "../components/templates/TemplatesList";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import PageLoading from "../components/PageLoading";

export default function DocumentTypeForm() {

  const { id } = useParams();
  const navigate = useNavigate();

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
  const [activeTab, setActiveTab] = useState("details"); // 👈 default changed

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
          <button
            type="button"
            className={activeTab === "details" ? "tab active" : "tab"}
            onClick={() => setActiveTab("details")}
          >
            Details
          </button>
          <button
            type="button"
            className={activeTab === "templates" ? "tab active" : "tab"}
            onClick={() => setActiveTab("templates")}
          >
            Templates
          </button>
        </div>
      )}

      {activeTab === "details" && (
        <div className="admin-form-card">

          <div className="form-group">
            <label htmlFor="name">Name *</label>
            <input
              type="text"
              className="form-input"
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <input
              type="text"
              className="form-input"
              id="description"
              value={form.description || ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label htmlFor="baseAiPrompt">Base AI Prompt</label>
            <textarea
              className="form-input"
              id="baseAiPrompt"
              value={form.baseAiPrompt || ""}
              onChange={(e) => setForm({ ...form, baseAiPrompt: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Usage Modes</label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.enableCompare ?? false}
                onChange={(e) => setForm({ ...form, enableCompare: e.target.checked })}
              />
              <span>Enable Compare</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.enableScoring ?? false}
                onChange={(e) => setForm({ ...form, enableScoring: e.target.checked })}
              />
              <span>Enable Scoring</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.enableSummarise ?? false}
                onChange={(e) => setForm({ ...form, enableSummarise: e.target.checked })}
              />
              <span>Enable Summarise</span>
            </label>
          </div>

          <div className="form-group form-group-last">
            <label htmlFor="isActive">Active</label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                id="isActive"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              <span>This document type is active and available for selection</span>
            </label>
          </div>

          {(form.createdOn || form.modifiedOn) && (
            <div className="meta">
              {form.createdOn && <span>Created: {new Date(form.createdOn).toLocaleString()}</span>}
              {form.modifiedOn && <span>Modified: {new Date(form.modifiedOn).toLocaleString()}</span>}
            </div>
          )}

          <div className="form-footer">
            <button type="button" className="btn-primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => navigate("/document-types")}>
              Cancel
            </button>
          </div>

        </div>
      )}

      {activeTab === "templates" && id && (
        <div className="admin-tab-panel">
          <TemplatesList documentTypeId={id} documentTypeName={form.name} hideHeader />
        </div>
      )}

    </div>
  );
}