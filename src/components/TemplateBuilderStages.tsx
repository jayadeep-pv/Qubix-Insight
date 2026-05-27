/**
 * TemplateBuilderStages.tsx
 *
 * Shared components used by both StartSmartBuilder and StartReview (Quick Extract).
 * Ensures identical UI and behaviour for the template save journey regardless
 * of which entry point the user came from.
 *
 * Exports:
 *   - Stepper              — visual progress indicator
 *   - AttributeReviewTable — editable attribute grid
 *   - ClassifyStage        — choose/create document type + name template
 *   - ConfirmStage         — full summary before saving
 *   - DoneStage            — success screen
 *   - useTemplateSave      — save logic hook (createDocType → createTemplate → createAttributes)
 *   - TEMPLATE_STAGE_STYLES — scoped CSS string shared across both pages
 *   - DATA_TYPE_OPTION_MAP  — Dataverse option-set values
 */

import React, { useState } from "react";
import { configApi } from "../services/configApi";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type TemplateStage = "review" | "classify" | "confirm" | "done";
export type ClassifyMode  = "new" | "existing";

export interface Category {
  id: string;
  name: string;
  key?: string;
  description?: string;
}

export interface DocumentType {
  id: string;
  name: string;
  description?: string;
  isActive?: boolean;
  enableCompare?: boolean;
  enableScoring?: boolean;
  enableSummarise?: boolean;
}

export interface TemplateBuilderState {
  attributes:           any[];
  discoveredAttributes: any[];
  categories:           Category[];
  documentTypes:        DocumentType[];
  classifyMode:         ClassifyMode;
  selectedDocTypeId:    string;
  newDocTypeName:       string;
  newDocTypeDesc:       string;
  templateName:         string;
  templateVersion:      string;
  enableAiInsight:      boolean;
  loading:              boolean;
  status:               string;
  error:                string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATAVERSE OPTION-SET MAP  (ilx_expecteddatatype)
// ─────────────────────────────────────────────────────────────────────────────

export const DATA_TYPE_OPTION_MAP: Record<string, number> = {
  Currency: 942870000,
  Text:     942870001,
  Boolean:  942870002,
  Number:   942870003,
  Date:     942870004,
  Email:    942870001,
};

// ─────────────────────────────────────────────────────────────────────────────
// STEPPER
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  { key: "review",   label: "Review"   },
  { key: "classify", label: "Classify" },
  { key: "confirm",  label: "Confirm"  },
  { key: "done",     label: "Done"     },
];

export function Stepper({ stage }: { stage: TemplateStage }) {
  const idx = STEPS.findIndex((s) => s.key === stage);
  return (
    <div className="tbs-stepper">
      {STEPS.map((s, i) => (
        <React.Fragment key={s.key}>
          <div className={`tbs-step ${i < idx ? "tbs-step--done" : ""} ${i === idx ? "tbs-step--active" : ""}`}>
            <div className="tbs-step-circle">
              {i < idx ? (
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M2 6.5l3 3 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <span>{i + 1}</span>
              )}
            </div>
            <span className="tbs-step-label">{s.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`tbs-step-line ${i < idx ? "tbs-step-line--done" : ""}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTRIBUTE REVIEW TABLE
// ─────────────────────────────────────────────────────────────────────────────

interface AttributeReviewTableProps {
  attributes:           any[];
  discoveredAttributes: any[];
  categories:           Category[];
  existingTemplateId?:  string;
  onUpdate:    (index: number, field: string, value: any) => void;
  onRemove:    (index: number) => void;
  onAdd:       () => void;
  onPromote?:  (attr: any, index: number) => void;
  onInclude?:  (attr: any, index: number) => void;
}

export function AttributeReviewTable({
  attributes, discoveredAttributes, categories,
  existingTemplateId, onUpdate, onRemove, onAdd, onPromote, onInclude,
}: AttributeReviewTableProps) {
  return (
    <>
      {/* ── Configured / main attributes ── */}
      <div className="tbs-attr-header">
        <div>Field Name</div>
        <div>Description</div>
        <div>Data Type</div>
        <div>Category</div>
        <div>Sample Value</div>
        <div></div>
      </div>

      {attributes.map((attr: any, i: number) => (
        <div key={i} className="tbs-attr-row">
          <input
            value={attr.AttributeName ?? attr.attributeName ?? ""}
            onChange={(e) => onUpdate(i, "AttributeName", e.target.value)}
            placeholder="Field name"
            aria-label="Field Name"
          />
          <input
            value={attr.Description ?? attr.description ?? ""}
            onChange={(e) => onUpdate(i, "Description", e.target.value)}
            placeholder="Description"
            aria-label="Description"
          />
          <select
            value={attr.dataType ?? "Text"}
            onChange={(e) => onUpdate(i, "dataType", e.target.value)}
            aria-label="Data Type"
          >
            <option value="Text">Text</option>
            <option value="Number">Number</option>
            <option value="Date">Date</option>
            <option value="Currency">Currency</option>
            <option value="Boolean">Boolean</option>
            <option value="Email">Email</option>
          </select>
          <select
            value={attr.category ?? ""}
            onChange={(e) => onUpdate(i, "category", e.target.value)}
            aria-label="Category"
            title="Category"
          >
            <option value="">Select Category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.name}>{cat.name}</option>
            ))}
          </select>
          <input
            value={attr.SampleValue ?? attr.sampleValue ?? ""}
            onChange={(e) => onUpdate(i, "SampleValue", e.target.value)}
            placeholder="Sample value"
            aria-label="Sample Value"
          />
          <button className="tbs-delete-btn" onClick={() => onRemove(i)} title="Remove">🗑</button>
        </div>
      ))}

      {attributes.length === 0 && (
        <div className="tbs-empty">No attributes yet. Add one below.</div>
      )}

      <button className="tbs-add-btn" onClick={onAdd}>⊕ Add Attribute</button>

      {/* ── Also Discovered ── */}
      {discoveredAttributes.length > 0 && (
        <div className="tbs-discovered-card">
          <div className="tbs-discovered-header">
            <div>
              <span className="tbs-discovered-title">Also discovered</span>
              <span className="tbs-discovered-count">{discoveredAttributes.length}</span>
              <span className="tbs-discovered-sub">Found in document but not in template yet.</span>
            </div>
            {existingTemplateId && onPromote && (
              <button className="tbs-add-all-btn"
                onClick={() => discoveredAttributes.forEach((a, i) => onPromote!(a, i))}>
                ➕ Add all to template
              </button>
            )}
          </div>
          <div className="tbs-discovered-table">
            <div className="tbs-discovered-head">
              <div>#</div><div>Field Name</div><div>Category</div>
              <div>Data Type</div><div>Sample Value</div><div></div>
            </div>
            {discoveredAttributes.map((attr: any, i: number) => (
              <div key={i} className="tbs-discovered-row">
                <div className="tbs-disc-idx">{i + 1}</div>
                <div className="tbs-disc-name">{attr.AttributeName ?? attr.attributeName ?? "—"}</div>
                <div>{attr.Category ? <span className="tbs-cat-chip">{attr.Category}</span> : <span style={{color:"#d1d5db"}}>—</span>}</div>
                <div><span className="tbs-type-chip">{attr.SuggestedDataType === "String" ? "Text" : (attr.SuggestedDataType ?? "Text")}</span></div>
                <div className="tbs-disc-sample">{attr.SampleValue ?? attr.sampleValue ?? "—"}</div>
                <div>
                  {existingTemplateId && onPromote ? (
                    <button className="tbs-promote-btn" onClick={() => onPromote(attr, i)}>➕ Add</button>
                  ) : onInclude ? (
                    <button className="tbs-promote-btn tbs-promote-btn--include" onClick={() => onInclude(attr, i)}>✓ Include</button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFY STAGE
// ─────────────────────────────────────────────────────────────────────────────

interface ClassifyStageProps {
  classifyMode:      ClassifyMode;
  documentTypes:     DocumentType[];
  selectedDocTypeId: string;
  newDocTypeName:    string;
  newDocTypeDesc:    string;
  templateName:      string;
  templateVersion:   string;
  error:             string;
  onModeChange:      (m: ClassifyMode) => void;
  onDocTypeChange:   (id: string) => void;
  onNewNameChange:   (v: string) => void;
  onNewDescChange:   (v: string) => void;
  onTemplateNameChange:    (v: string) => void;
  onTemplateVersionChange: (v: string) => void;
  onBack:    () => void;
  onNext:    () => void;
}

export function ClassifyStage({
  classifyMode, documentTypes, selectedDocTypeId,
  newDocTypeName, newDocTypeDesc, templateName, templateVersion,
  error, onModeChange, onDocTypeChange, onNewNameChange, onNewDescChange,
  onTemplateNameChange, onTemplateVersionChange, onBack, onNext,
}: ClassifyStageProps) {
  return (
    <>
      <div className="dc-card">
        <h3>Classify Template</h3>
        <p className="tbs-hint">Choose whether to create a new Document Type or add this template to an existing one.</p>

        <div className="tbs-mode-toggle">
          <button className={`tbs-mode-btn ${classifyMode === "new" ? "tbs-mode-btn--active" : ""}`}
            onClick={() => onModeChange("new")}>
            <span>✦</span> New Document Type
          </button>
          <button className={`tbs-mode-btn ${classifyMode === "existing" ? "tbs-mode-btn--active" : ""}`}
            onClick={() => onModeChange("existing")}>
            <span>⊕</span> Add to Existing
          </button>
        </div>

        {classifyMode === "new" && (
          <div className="tbs-classify-fields">
            <div className="form-group">
              <label>Document Type Name *</label>
              <input value={newDocTypeName} onChange={(e) => onNewNameChange(e.target.value)} placeholder="e.g. Lease Agreement"/>
            </div>
            <div className="form-group">
              <label>Description</label>
              <input value={newDocTypeDesc} onChange={(e) => onNewDescChange(e.target.value)} placeholder="Optional"/>
            </div>
          </div>
        )}

        {classifyMode === "existing" && (
          <div className="tbs-classify-fields">
            <div className="form-group">
              <label>Select Document Type *</label>
              {documentTypes.length === 0 ? (
                <div className="tbs-empty">No active document types found.</div>
              ) : (
                <select value={selectedDocTypeId} onChange={(e) => onDocTypeChange(e.target.value)}
                  aria-label="Select Document Type" title="Select Document Type">
                  <option value="">— Select —</option>
                  {documentTypes.map((dt) => (
                    <option key={dt.id} value={dt.id}>{dt.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        <div className="tbs-section-divider"><span>Template Details</span></div>

        <div className="tbs-classify-fields">
          <div className="form-group">
            <label>Template Name *</label>
            <input value={templateName} onChange={(e) => onTemplateNameChange(e.target.value)} placeholder="e.g. Lease Agreement — Default Template"/>
          </div>
          <div className="form-group">
            <label>Version</label>
            <input value={templateVersion} onChange={(e) => onTemplateVersionChange(e.target.value)} placeholder="1.0"/>
          </div>
        </div>
      </div>

      <div className="dc-card tbs-action-card">
        <div className="tbs-action-row">
          <button className="primary-btn tbs-back-btn" onClick={onBack}>◀ Back</button>
          <div className="tbs-flow-arrow">━━━▶</div>
          <button className="primary-btn" onClick={onNext}>Next: Confirm ▶</button>
        </div>
        {error && <div className="error-text" style={{marginTop:12}}>{error}</div>}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRM STAGE
// ─────────────────────────────────────────────────────────────────────────────

interface ConfirmStageProps {
  classifyMode:      ClassifyMode;
  documentTypes:     DocumentType[];
  selectedDocTypeId: string;
  newDocTypeName:    string;
  newDocTypeDesc:    string;
  templateName:      string;
  templateVersion:   string;
  enableAiInsight:   boolean;
  attributes:        any[];
  categories:        Category[];
  loading:           boolean;
  status:            string;
  error:             string;
  onBack:   () => void;
  onSave:   () => void;
}

export function ConfirmStage({
  classifyMode, documentTypes, selectedDocTypeId,
  newDocTypeName, newDocTypeDesc, templateName, templateVersion,
  enableAiInsight, attributes, categories,
  loading, status, error, onBack, onSave,
}: ConfirmStageProps) {
  return (
    <>
      <div className="dc-card">
        <h3>Confirm &amp; Save</h3>
        <p className="tbs-hint">Review everything below then click <strong>Save Template</strong> to create the records.</p>

        <div className="tbs-summary-grid">
          {/* Document Type */}
          <div className="tbs-summary-section">
            <div className="tbs-summary-title"><span>📄</span> Document Type</div>
            <div className="tbs-summary-body">
              {classifyMode === "new" ? (
                <>
                  <div className="tbs-summary-row"><span className="tbs-summary-label">Action</span><span className="tbs-badge tbs-badge--new">Create New</span></div>
                  <div className="tbs-summary-row"><span className="tbs-summary-label">Name</span><span>{newDocTypeName}</span></div>
                  {newDocTypeDesc && <div className="tbs-summary-row"><span className="tbs-summary-label">Description</span><span>{newDocTypeDesc}</span></div>}
                </>
              ) : (
                <>
                  <div className="tbs-summary-row"><span className="tbs-summary-label">Action</span><span className="tbs-badge tbs-badge--existing">Add to Existing</span></div>
                  <div className="tbs-summary-row"><span className="tbs-summary-label">Type</span><span>{documentTypes.find((d) => d.id === selectedDocTypeId)?.name ?? selectedDocTypeId}</span></div>
                </>
              )}
            </div>
          </div>

          {/* Template */}
          <div className="tbs-summary-section">
            <div className="tbs-summary-title"><span>🗂</span> Template</div>
            <div className="tbs-summary-body">
              <div className="tbs-summary-row"><span className="tbs-summary-label">Name</span><span>{templateName}</span></div>
              <div className="tbs-summary-row"><span className="tbs-summary-label">Version</span><span>{templateVersion || "1.0"}</span></div>
              <div className="tbs-summary-row"><span className="tbs-summary-label">Default</span><span>Yes</span></div>
              <div className="tbs-summary-row"><span className="tbs-summary-label">AI Insight</span><span>{enableAiInsight ? "Enabled" : "Disabled"}</span></div>
            </div>
          </div>
        </div>

        {/* Attributes table */}
        <div className="tbs-summary-section tbs-summary-section--full">
          <div className="tbs-summary-title">
            <span>🔖</span> Attributes&nbsp;
            <span className="tbs-count-badge">{attributes.length}</span>
          </div>
          <div className="tbs-confirm-scroll">
            <div className="tbs-confirm-table">
              <div className="tbs-confirm-head">
                <div>#</div><div>Field Name</div><div>Description</div>
                <div>Data Type</div><div>Category</div><div>Sample Value</div>
              </div>
              {attributes.map((attr, i) => {
                const matchedCat = categories.find(
                  (c) => c.name.trim().toLowerCase() === (attr.category ?? "").trim().toLowerCase()
                );
                return (
                  <div key={i} className="tbs-confirm-row">
                    <div className="tbs-ci">{i + 1}</div>
                    <div className="tbs-cn">{attr.AttributeName ?? attr.attributeName ?? "—"}</div>
                    <div className="tbs-cd">{attr.Description ?? attr.description ?? "—"}</div>
                    <div><span className="tbs-type-chip">{attr.dataType ?? "Text"}</span></div>
                    <div>
                      {matchedCat
                        ? <span className="tbs-cat-chip">{matchedCat.name}</span>
                        : attr.category
                          ? <span className="tbs-cat-chip tbs-cat-chip--warn">{attr.category} ⚠</span>
                          : <span className="tbs-none">—</span>
                      }
                    </div>
                    <div className="tbs-cs">{attr.SampleValue ?? attr.sampleValue ?? "—"}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="dc-card tbs-action-card">
        <div className="tbs-action-row">
          <button className="primary-btn tbs-back-btn" onClick={onBack} disabled={loading}>◀ Back</button>
          <div className="tbs-flow-arrow">━━━▶</div>
          <button className="primary-btn tbs-save-btn" onClick={onSave} disabled={loading}>
            {loading ? "Saving…" : "💾 Save Template"}
          </button>
        </div>
        {status && <div className="tbs-status">{status}</div>}
        {error  && <div className="error-text" style={{marginTop:8}}>{error}</div>}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DONE STAGE
// ─────────────────────────────────────────────────────────────────────────────

interface DoneStageProps {
  classifyMode:   ClassifyMode;
  newDocTypeName: string;
  templateName:   string;
  attributeCount: number;
  onReset?:       () => void;
  resetLabel?:    string;
}

export function DoneStage({ classifyMode, newDocTypeName, templateName, attributeCount, onReset, resetLabel }: DoneStageProps) {
  return (
    <div className="dc-card tbs-done-card">
      <div className="tbs-done-icon">✅</div>
      <h3 className="tbs-done-title">Template saved successfully!</h3>
      <p className="tbs-done-sub">
        Your document type, template and <strong>{attributeCount}</strong> attribute{attributeCount !== 1 ? "s" : ""} have been created.
      </p>
      <div className="tbs-done-details">
        {classifyMode === "new" && (
          <div className="tbs-done-row">
            <span className="tbs-done-label">Document Type</span>
            <span className="tbs-done-value">{newDocTypeName}</span>
          </div>
        )}
        <div className="tbs-done-row">
          <span className="tbs-done-label">Template</span>
          <span className="tbs-done-value">{templateName}</span>
        </div>
        <div className="tbs-done-row">
          <span className="tbs-done-label">Attributes</span>
          <span className="tbs-done-value">{attributeCount} fields</span>
        </div>
      </div>
      {onReset && (
        <button className="primary-btn" style={{marginTop:0}} onClick={onReset}>
          {resetLabel ?? "Build Another Template"}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// useTemplateSave HOOK
// ─────────────────────────────────────────────────────────────────────────────

interface SaveOptions {
  classifyMode:      ClassifyMode;
  selectedDocTypeId: string;
  newDocTypeName:    string;
  newDocTypeDesc:    string;
  templateName:      string;
  templateVersion:   string;
  attributes:        any[];
  categories:        Category[];
}

export function useTemplateSave() {
  const [loading, setLoading] = useState(false);
  const [status,  setStatus]  = useState("");
  const [error,   setError]   = useState("");
  const [savedDocTypeId,  setSavedDocTypeId]  = useState("");
  const [savedTemplateId, setSavedTemplateId] = useState("");

  const save = async (opts: SaveOptions): Promise<boolean> => {
    setLoading(true);
    setError("");
    setStatus("Saving…");

    try {
      let docTypeId = opts.selectedDocTypeId;

      if (opts.classifyMode === "new") {
        setStatus("Creating Document Type…");
        const newId = await configApi.createDocumentType({
          name: opts.newDocTypeName.trim(),
          description: opts.newDocTypeDesc.trim() || undefined,
          isActive: true,
        });
        docTypeId = typeof newId === "string" ? newId : newId?.id ?? newId;
        setSavedDocTypeId(docTypeId);
      } else {
        setSavedDocTypeId(docTypeId);
      }

      setStatus("Creating Template…");
      const templateResult = await configApi.createTemplate({
        name:             opts.templateName.trim(),
        documentTypeId:   docTypeId,
        isDefault:        true,
        templateAiPrompt: `Extract key attributes from this ${opts.templateName.trim()} document.`,
        aiOutputStyleId:  "",
        isActive:         true,
        version:          opts.templateVersion.trim() || "1.0",
      } as any);

      const templateId = templateResult?.id ?? templateResult?.Id ?? templateResult;
      setSavedTemplateId(templateId);

      for (let i = 0; i < opts.attributes.length; i++) {
        const attr = opts.attributes[i];
        setStatus(`Saving attribute ${i + 1} of ${opts.attributes.length}…`);

        const attrCategoryName = attr.category ?? "";
        const matchedCat = opts.categories.find(
          (c) => c.name.trim().toLowerCase() === attrCategoryName.trim().toLowerCase()
        );

        const attrName = (attr.AttributeName ?? attr.attributeName ?? "").trim();
        const attributeKey = attrName
          .replace(/[^a-zA-Z0-9 ]/g, "").trim().split(/\s+/)
          .map((w: string, idx: number) =>
            idx === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
          ).join("");

        await configApi.createTemplateAttribute({
          name:             attrName,
          displayName:      attrName,
          attributeKey:     attributeKey || `field${i + 1}`,
          aiExtractionHint: (attr.Description ?? attr.description ?? "").trim(),
          categoryId:       matchedCat?.id ?? null,
          expectedDataType: DATA_TYPE_OPTION_MAP[attr.dataType] ?? DATA_TYPE_OPTION_MAP["Text"] ?? 942870001,
          displayOrder:     i + 1,
          isMandatory:      attr.isMandatory ?? false,
          templateId,
        });
      }

      setStatus("All saved successfully!");
      setLoading(false);
      return true;
    } catch (ex: any) {
      setError(`Save failed: ${ex?.message ?? "Unknown error"}`);
      setLoading(false);
      return false;
    }
  };

  return { loading, status, error, setError, setStatus, savedDocTypeId, savedTemplateId, save };
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED CSS
// ─────────────────────────────────────────────────────────────────────────────

export const TEMPLATE_BUILDER_STYLES = `
  /* ── STEPPER ── */
  .tbs-stepper { display:flex; align-items:center; margin-bottom:24px; flex-wrap:wrap; }
  .tbs-step { display:flex; flex-direction:column; align-items:center; gap:5px; min-width:64px; }
  .tbs-step-circle { width:30px; height:30px; border-radius:50%; border:2px solid #d1d5db; background:#f9fafb; color:#9ca3af; font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:center; transition:all 0.2s; }
  .tbs-step--active .tbs-step-circle { border-color:#f94b16; background:#f94b16; color:white; box-shadow:0 3px 10px rgba(249,75,22,0.35); }
  .tbs-step--done   .tbs-step-circle { border-color:#16a34a; background:#16a34a; color:white; }
  .tbs-step-label { font-size:11px; font-weight:500; color:#9ca3af; text-align:center; white-space:nowrap; }
  .tbs-step--active .tbs-step-label { color:#f94b16; font-weight:700; }
  .tbs-step--done   .tbs-step-label { color:#16a34a; }
  .tbs-step-line { flex:1; height:2px; background:#e5e7eb; min-width:16px; margin-bottom:16px; transition:background 0.2s; }
  .tbs-step-line--done { background:#16a34a; }

  /* ── ATTRIBUTE REVIEW TABLE ── */
  .tbs-attr-header, .tbs-attr-row {
    display:grid;
    grid-template-columns:1.2fr 2fr 1fr 1.2fr 1.5fr 44px;
    gap:8px; align-items:center;
  }
  .tbs-attr-header { font-weight:600; font-size:12px; color:#374151; border-bottom:1px solid #e5e7eb; padding-bottom:8px; margin-bottom:4px; }
  .tbs-attr-row { margin-bottom:6px; }
  .tbs-attr-row input, .tbs-attr-row select { width:100%; min-width:0; height:32px; padding:0 8px; font-size:13px; border:1px solid #d1d5db; border-radius:6px; background:#fff; }
  .tbs-attr-row input:focus, .tbs-attr-row select:focus { outline:none; border-color:#2563eb; box-shadow:0 0 0 2px rgba(37,99,235,0.15); }
  .tbs-delete-btn { background:none; border:none; cursor:pointer; font-size:15px; color:#9ca3af; transition:color 0.15s; }
  .tbs-delete-btn:hover { color:#ef4444; }
  .tbs-empty { color:#9ca3af; font-style:italic; font-size:13px; padding:10px 0; }
  .tbs-add-btn { margin-top:10px; width:100%; padding:8px; border:2px dashed #d1d5db; border-radius:8px; background:transparent; color:#6b7280; font-size:13px; font-weight:600; cursor:pointer; transition:all 0.15s; }
  .tbs-add-btn:hover { border-color:#f94b16; color:#f94b16; background:#fff7ed; }

  /* ── DISCOVERED ── */
  .tbs-discovered-card { background:#fafbff; border:1px solid #e0e7ff; border-left:3px solid #6366f1; border-radius:10px; padding:14px 16px; margin-top:12px; }
  .tbs-discovered-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; gap:10px; flex-wrap:wrap; }
  .tbs-discovered-title { font-size:13px; font-weight:600; color:#4338ca; }
  .tbs-discovered-count { display:inline-flex; align-items:center; justify-content:center; background:#6366f1; color:white; border-radius:999px; font-size:11px; font-weight:700; padding:1px 7px; margin:0 5px; }
  .tbs-discovered-sub { font-size:12px; color:#6b7280; }
  .tbs-add-all-btn { padding:5px 12px; border-radius:6px; border:1px solid #6366f1; background:#eef2ff; color:#4338ca; font-size:12px; font-weight:600; cursor:pointer; white-space:nowrap; }
  .tbs-add-all-btn:hover { background:#e0e7ff; }
  .tbs-discovered-table { border:0.5px solid #e0e7ff; border-radius:8px; overflow:hidden; }
  .tbs-discovered-head, .tbs-discovered-row { display:grid; grid-template-columns:28px 1.4fr 1fr 0.9fr 1.4fr 70px; gap:6px; align-items:center; }
  .tbs-discovered-head > div { padding:7px 10px; font-size:11px; font-weight:700; color:#374151; background:#eef2ff; border-bottom:0.5px solid #e0e7ff; }
  .tbs-discovered-row { border-top:0.5px solid #f3f4f6; }
  .tbs-discovered-row:hover { background:#f5f3ff; }
  .tbs-discovered-row > div { padding:8px 10px; font-size:13px; }
  .tbs-disc-idx { color:#9ca3af; font-size:11px; font-weight:600; }
  .tbs-disc-name { font-weight:500; color:#111827; }
  .tbs-disc-sample { font-size:12px; color:#6b7280; font-style:italic; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .tbs-promote-btn { padding:3px 9px; border-radius:5px; border:none; background:#eef2ff; color:#4338ca; font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap; }
  .tbs-promote-btn:hover { background:#e0e7ff; }
  .tbs-promote-btn--include { background:#f0fdf4; color:#16a34a; }
  .tbs-promote-btn--include:hover { background:#dcfce7; }

  /* ── CLASSIFY ── */
  .tbs-hint { font-size:13px; color:#6b7280; margin:0 0 16px; }
  .tbs-mode-toggle { display:flex; gap:10px; margin-bottom:20px; flex-wrap:wrap; }
  .tbs-mode-btn { flex:1; min-width:180px; padding:14px 18px; border-radius:10px; border:2px solid #e5e7eb; background:#f9fafb; cursor:pointer; font-weight:600; font-size:13px; color:#374151; display:flex; align-items:center; gap:8px; transition:all 0.18s; }
  .tbs-mode-btn:hover { border-color:#f94b16; background:#fff7ed; }
  .tbs-mode-btn--active { border-color:#f94b16; background:linear-gradient(135deg,#fff7ed,#fef2e9); color:#c2410c; box-shadow:0 3px 12px rgba(249,75,22,0.12); }
  .tbs-classify-fields { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:18px; }
  @media(max-width:540px){ .tbs-classify-fields { grid-template-columns:1fr; } }
  .tbs-section-divider { display:flex; align-items:center; gap:10px; margin:22px 0 18px; color:#6b7280; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; }
  .tbs-section-divider::before, .tbs-section-divider::after { content:""; flex:1; height:1px; background:#e5e7eb; }

  /* ── CONFIRM ── */
  .tbs-summary-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:18px; }
  @media(max-width:640px){ .tbs-summary-grid { grid-template-columns:1fr; } }
  .tbs-summary-section { background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px; padding:13px 15px; }
  .tbs-summary-section--full { grid-column:1/-1; }
  .tbs-summary-title { font-size:13px; font-weight:700; color:#111827; margin-bottom:10px; display:flex; align-items:center; gap:5px; }
  .tbs-count-badge { background:#f94b16; color:white; border-radius:999px; font-size:11px; font-weight:700; padding:1px 7px; margin-left:4px; }
  .tbs-summary-body { display:flex; flex-direction:column; gap:5px; }
  .tbs-summary-row { display:flex; align-items:center; gap:8px; font-size:13px; }
  .tbs-summary-label { width:100px; flex-shrink:0; color:#6b7280; font-weight:500; }
  .tbs-badge { padding:2px 9px; border-radius:999px; font-size:11px; font-weight:600; }
  .tbs-badge--new { background:#dbeafe; color:#1d4ed8; }
  .tbs-badge--existing { background:#d1fae5; color:#065f46; }
  .tbs-confirm-scroll { overflow-x:auto; border:0.5px solid #e5e7eb; border-radius:8px; }
  .tbs-confirm-table { display:table; width:100%; min-width:680px; border-collapse:collapse; }
  .tbs-confirm-head { display:table-row; background:#f3f4f6; }
  .tbs-confirm-head > div { display:table-cell; padding:8px 11px; font-size:11px; font-weight:700; color:#374151; white-space:nowrap; border-bottom:1px solid #e5e7eb; }
  .tbs-confirm-row { display:table-row; }
  .tbs-confirm-row:not(:last-child) > div { border-bottom:1px solid #f3f4f6; }
  .tbs-confirm-row:hover > div { background:#fafafa; }
  .tbs-confirm-row > div { display:table-cell; padding:8px 11px; vertical-align:middle; font-size:13px; }
  .tbs-confirm-head > div:nth-child(1), .tbs-confirm-row > div:nth-child(1) { width:28px; color:#9ca3af; font-size:11px; }
  .tbs-confirm-head > div:nth-child(2), .tbs-confirm-row > div:nth-child(2) { width:145px; font-weight:500; }
  .tbs-confirm-head > div:nth-child(4), .tbs-confirm-row > div:nth-child(4) { width:85px; }
  .tbs-confirm-head > div:nth-child(5), .tbs-confirm-row > div:nth-child(5) { width:130px; }
  .tbs-confirm-head > div:nth-child(6), .tbs-confirm-row > div:nth-child(6) { width:130px; font-style:italic; color:#6b7280; font-size:12px; }
  .tbs-ci { color:#9ca3af; font-size:11px; font-weight:600; }
  .tbs-cd { font-size:12px; color:#6b7280; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .tbs-cs { font-size:12px; color:#6b7280; font-style:italic; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .tbs-none { color:#d1d5db; }

  /* ── SHARED CHIPS ── */
  .tbs-type-chip { background:#e0f2fe; color:#075985; padding:2px 7px; border-radius:999px; font-size:11px; font-weight:600; }
  .tbs-cat-chip  { background:#f0fdf4; color:#166534; border:0.5px solid #bbf7d0; padding:2px 7px; border-radius:999px; font-size:11px; font-weight:600; }
  .tbs-cat-chip--warn { background:#fff7ed; color:#9a3412; border-color:#fed7aa; }

  /* ── ACTION ROW ── */
  .tbs-action-card { margin-top:14px; }
  .tbs-action-row { display:flex; align-items:center; justify-content:center; gap:16px; }
  .tbs-action-row--spread { justify-content:space-between; }
  .tbs-action-row .primary-btn { margin-top:0; }
  .tbs-flow-arrow { font-size:20px; color:#d1d5db; line-height:1; }
  .tbs-back-btn { background:#e5e7eb !important; color:#374151 !important; box-shadow:none !important; margin-top:0 !important; }
  .tbs-back-btn:hover { background:#d1d5db !important; }
  .tbs-save-btn { background:linear-gradient(145deg,#FA4616,#c7340f) !important; box-shadow:0 4px 14px rgba(250,70,22,0.3) !important; margin-top:0 !important; }
  .tbs-save-btn:hover { box-shadow:0 6px 18px rgba(250,70,22,0.45) !important; }
  .tbs-status { margin-top:10px; font-size:13px; color:#6b7280; text-align:center; }

  /* ── DONE ── */
  .tbs-done-card { text-align:center; padding:44px 32px; }
  .tbs-done-icon { font-size:48px; margin-bottom:10px; }
  .tbs-done-title { font-size:21px; font-weight:700; color:#111827; margin:0 0 8px; }
  .tbs-done-sub { color:#6b7280; font-size:14px; margin-bottom:24px; }
  .tbs-done-details { display:inline-flex; flex-direction:column; gap:9px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px; padding:14px 26px; margin-bottom:24px; text-align:left; min-width:260px; }
  .tbs-done-row { display:flex; gap:14px; font-size:14px; }
  .tbs-done-label { width:110px; color:#6b7280; font-weight:500; }
  .tbs-done-value { color:#111827; font-weight:600; }
`;
