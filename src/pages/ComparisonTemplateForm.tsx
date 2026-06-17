import { useEffect, useState } from "react";
import { configApi } from "../services/configApi";
import { useNavigate, useParams } from "react-router-dom";
import TemplateAttributesList from "../components/templates/TemplateAttributesList";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import type { TemplateAiProfile } from "../types/TemplateAiProfile";
import { useUser } from "../context/UserContext";

export default function ComparisonTemplateForm() {

  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { isTrial } = useUser();



  const [activeTab, setActiveTab] = useState("details");

  const switchTab = (tab: string) => {
    setActiveTab(tab);
    document.querySelector<HTMLElement>('.content')?.scrollTo({ top: 0, behavior: 'auto' });
  };

  const [documentTypes, setDocumentTypes] = useState<any[]>([]);
  const [createdOn, setCreatedOn] = useState<string | null>(null);
  const [modifiedOn, setModifiedOn] = useState<string | null>(null);
  const [aiOutputStyles, setAiOutputStyles] = useState<any[]>([]);

  // AI Profiles tab state
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [templateProfiles, setTemplateProfiles] = useState<TemplateAiProfile[]>([]);
  const [profilesSaving, setProfilesSaving] = useState(false);
  const [profilesSaved, setProfilesSaved] = useState(false);

  const [form, setForm] = useState({
    name: "",
    templateAiPrompt: "",
    suggestedPrompts: "",
    documentTypeId: "",
    aiOutputStyleId: "",
    isDefault: false,
    version: "",
    isActive: true
  });

  useEffect(() => {
    loadLookups();
    if (id) {
      loadTemplate();
      loadTemplateProfiles();
    }
  }, [id]);

  async function loadLookups() {
    const [docs, styles, profiles] = await Promise.all([
      configApi.getDocumentTypes(),
      configApi.getChoiceOptions("ilx_analysistemplate", "ilx_aioutputstyle"),
      configApi.getAllAiInsightProfiles(),
    ]);
    setDocumentTypes(docs);
    setAiOutputStyles(styles);
    setAllProfiles(profiles.filter((p: any) => (p.statecode ?? 0) === 0));
  }

  async function loadTemplateProfiles() {
    if (!id) return;
    try {
      const data = await configApi.getProfilesByTemplate(id);
      setTemplateProfiles(data.map((d: any) => ({
        id: d.id,
        templateId: id,
        profileId: d.profileId,
        profileName: d.profileName,
        isDefault: d.isDefault,
        displayOrder: d.displayOrder,
      })));
    } catch {
      // non-fatal — table may not exist yet in Dataverse
    }
  }

  function isProfileAttached(profileId: string) {
    return templateProfiles.some(tp => tp.profileId === profileId);
  }

  function isProfileDefault(profileId: string) {
    return templateProfiles.find(tp => tp.profileId === profileId)?.isDefault ?? false;
  }

  function toggleProfileAttached(profileId: string, profileName: string) {
    if (isProfileAttached(profileId)) {
      setTemplateProfiles(prev => prev.filter(tp => tp.profileId !== profileId));
    } else {
      setTemplateProfiles(prev => [...prev, {
        templateId: id!,
        profileId,
        profileName,
        isDefault: true,
        displayOrder: prev.length,
      }]);
    }
  }

  function toggleProfileDefault(profileId: string) {
    setTemplateProfiles(prev =>
      prev.map(tp => tp.profileId === profileId ? { ...tp, isDefault: !tp.isDefault } : tp)
    );
  }

  async function saveProfiles() {
    if (!id) return;
    setProfilesSaving(true);
    setProfilesSaved(false);
    await configApi.saveTemplateProfiles(id, templateProfiles.map((tp, i) => ({
      profileId: tp.profileId,
      isDefault: tp.isDefault,
      displayOrder: tp.displayOrder ?? i,
    })));
    setProfilesSaving(false);
    setProfilesSaved(true);
    setTimeout(() => setProfilesSaved(false), 2500);
  }

  async function loadTemplate() {

    if (!id) return;

    try {

      const list = await configApi.getAllTemplates();

      const item = list.find((x:any)=>x.id===id);

      if (!item) return;

      setForm({
        name: item.name ?? "",
        templateAiPrompt: item.templateAiPrompt ?? "",
        suggestedPrompts: item.suggestedPrompts ?? "",
        documentTypeId: item.documentTypeId ?? "",
        aiOutputStyleId: item.aiOutputStyleId?.toString() ?? "",
        isDefault: item.isDefault ?? false,
        version: item.version ?? "",
        isActive: item.isActive ?? true
      });

      setCreatedOn(item.createdOn ?? null);
      setModifiedOn(item.modifiedOn ?? null);

    }
    catch (err) {
      console.error("Failed loading template", err);
    }
  }

  async function save() {

    if (!form.name.trim()) {
      alert("Template Name is required");
      return;
    }

    if (!form.documentTypeId) {
      alert("Please select a Document Type");
      return;
    }

    if (id) {

      await configApi.updateTemplate(id, {
        name: form.name,
        templateAiPrompt: form.templateAiPrompt,
        suggestedPrompts: form.suggestedPrompts,
        documentTypeId: form.documentTypeId,
        aiOutputStyleId: form.aiOutputStyleId || null,
        isDefault: form.isDefault,
        version: form.version,
        isActive: form.isActive
      });

    } else {

      await configApi.createTemplate(form);

    }

    navigate("/comparison-templates");
  }

  return (

    <div className="page">

      <div className="page-sticky-header">
        <PageBreadcrumb
          items={[
            { label: "Templates", onClick: () => navigate("/comparison-templates") },
            { label: id ? `Template — ${form.name}` : "New Template" },
          ]}
        />

        <div className="admin-form-header">
          <h2>{id ? `Template — ${form.name}` : "New Template"}</h2>
        </div>
        {id && (
          <div className="tabs">
            <button type="button" className={activeTab === "details" ? "tab active" : "tab"} onClick={() => switchTab("details")}>Details</button>
            <button type="button" className={activeTab === "attributes" ? "tab active" : "tab"} onClick={() => switchTab("attributes")}>Template Attributes</button>
            <button type="button" className={activeTab === "aiProfiles" ? "tab active" : "tab"} onClick={() => switchTab("aiProfiles")}>
              AI Profiles{templateProfiles.length > 0 && <span className="tab-badge">{templateProfiles.length}</span>}
            </button>
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

          <div className="form-group">
            <label htmlFor="name">Template Name *</label>
            <input
              type="text"
              id="name"
              className="form-input"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="documentType">Document Type *</label>
              <select
                id="documentType"
                className="form-input"
                value={form.documentTypeId}
                onChange={e => setForm({ ...form, documentTypeId: e.target.value })}
              >
                <option value="">Select</option>
                {documentTypes.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="aiStyle">AI Output Style</label>
              <select
                id="aiStyle"
                className="form-input"
                value={form.aiOutputStyleId || ""}
                onChange={e => setForm({ ...form, aiOutputStyleId: e.target.value })}
              >
                <option value="">Select…</option>
                {aiOutputStyles.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="prompt">Template AI Prompt</label>
            <textarea
              id="prompt"
              className="form-input"
              value={form.templateAiPrompt}
              onChange={e => setForm({ ...form, templateAiPrompt: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label htmlFor="suggestedPrompts">Qubix Bot — Suggested Questions</label>
            <textarea
              id="suggestedPrompts"
              className="form-input"
              rows={5}
              placeholder={"One question per line, e.g.:\nWho are the parties involved?\nIs there a break clause?\nWhat are the key obligations?"}
              value={form.suggestedPrompts}
              onChange={e => setForm({ ...form, suggestedPrompts: e.target.value })}
            />
            <span className="form-hint">Each line becomes a suggestion chip in the chat panel.</span>
          </div>

          <div className="form-group">
            <label htmlFor="version">Version</label>
            <input
              type="text"
              id="version"
              className="form-input"
              value={form.version}
              onChange={e => setForm({ ...form, version: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label htmlFor="isDefault">Default Template</label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                id="isDefault"
                checked={form.isDefault}
                onChange={e => setForm({ ...form, isDefault: e.target.checked })}
              />
              <span>Use as the default template for this document type</span>
            </label>
          </div>

          <div className="form-group form-group-last">
            <label htmlFor="isActive">Active</label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                id="isActive"
                checked={form.isActive}
                onChange={e => setForm({ ...form, isActive: e.target.checked })}
              />
              <span>This template is active and available for selection</span>
            </label>
          </div>

          {id && (createdOn || modifiedOn) && (
            <div className="meta">
              {createdOn && <span>Created: {createdOn}</span>}
              {modifiedOn && <span>Modified: {modifiedOn}</span>}
            </div>
          )}

          <div className="form-footer">
            <button type="button" className="btn-primary" onClick={save} disabled={isTrial}
              title={isTrial ? "Not available on trial" : undefined}>
              Save
            </button>
            <button type="button" className="btn-secondary" onClick={() => navigate("/comparison-templates")}>
              Cancel
            </button>
          </div>

        </div>

      <div className="dc-card guidance-card">
        <p className="guide-about">About Templates</p>
        <p className="guide-about-desc">
          Templates define the fields the AI extracts from documents. Link attributes to build your extraction schema, then attach AI profiles to run analysis automatically.
        </p>
        <div className="guide-divider">
          <p className="guide-section-title">How it works</p>
          <div className="guide-steps">
            <div className="guide-step"><div className="guide-step-num">1</div><div>Create a template and link it to a document type</div></div>
            <div className="guide-step"><div className="guide-step-num">2</div><div>Add attributes below to define each field to extract</div></div>
            <div className="guide-step"><div className="guide-step-num">3</div><div>Attach AI Insight Profiles to customise AI analysis</div></div>
          </div>
        </div>
      </div>

      </div>
      )}

      {activeTab === "attributes" && id && (
        <div className="admin-tab-panel">
          <TemplateAttributesList templateId={id} hideHeader embedded />
        </div>
      )}

      {activeTab === "aiProfiles" && id && (
        <div className={`admin-form-card${isTrial ? " admin-form-card--readonly" : ""}`}>
          {isTrial && (
            <div className="trial-banner">
              <span className="trial-banner-icon">🔒</span>
              <span>Trial account — this record is read only. Upgrade to enable editing.</span>
            </div>
          )}
          <p className="tp-profiles-hint">
            Attach AI Insight Profiles to this template. Profiles marked as <strong>Default</strong> will be pre-selected when users start a review with this template — they can still deselect them if needed.
          </p>

          {allProfiles.length === 0 ? (
            <p className="tp-profiles-empty">No active AI Insight Profiles found. Create profiles in the AI Profiles section first.</p>
          ) : (
            <div className="tp-profiles-list">
              {allProfiles.map((profile: any) => {
                const attached = isProfileAttached(profile.id);
                const isDefault = isProfileDefault(profile.id);
                return (
                  <div key={profile.id} className={`tp-profile-row${attached ? " tp-profile-row--attached" : ""}`}>
                    <label className="tp-profile-attach">
                      <input
                        type="checkbox"
                        checked={attached}
                        onChange={() => toggleProfileAttached(profile.id, profile.profileName)}
                      />
                      <span className="tp-profile-name">{profile.profileName}</span>
                    </label>
                    {attached && (
                      <label className="tp-profile-default">
                        <input
                          type="checkbox"
                          checked={isDefault}
                          onChange={() => toggleProfileDefault(profile.id)}
                        />
                        <span>Default</span>
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="form-footer">
            <button type="button" className="btn-primary" onClick={saveProfiles} disabled={profilesSaving || isTrial}
              title={isTrial ? "Not available on trial" : undefined}>
              {profilesSaving ? "Saving…" : profilesSaved ? "Saved ✓" : "Save Profiles"}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
