import React, { useEffect, useRef, useState } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { loginRequest } from "../authConfig";
import { useNavigate, useLocation } from "react-router-dom";
import AiSettingsPanel from "../components/AiSettingsPanel";
import { configApi } from "../services/configApi";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import {
  AttributeReviewTable, ClassifyStage, ConfirmStage,
  useTemplateSave, TEMPLATE_BUILDER_STYLES,
  type TemplateStage, type ClassifyMode as TBSClassifyMode,
  type DocumentType,
} from "../components/TemplateBuilderStages";

/* ===== Interfaces ===== */

// DocumentType is imported from TemplateBuilderStages above

interface TemplateType {
  id: string;
  name: string;
}

interface AiProfile {
  id: string;
  name: string;
  isDefault?: boolean;
}

/**
 * InsightMode drives the entire form:
 *   extract         — free scan, no template required, exits to Template Builder
 *   summarise       — 1 document + template, no rules
 *   compare         — 2+ documents + template, side-by-side extraction, no scoring
 *   compare-scoring — 2+ documents + template + rules engine, ranked scoring
 */
type InsightMode = "extract" | "summarise" | "compare" | "compare-scoring";

/* ===== API ===== */

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:7071";

const UPLOAD_FUNCTION_URL  = `${API_BASE}/api/UploadAndStartComparison`;
const EXECUTE_FUNCTION_URL = `${API_BASE}/api/ExecuteComparisonRun`;
const CREATE_INSIGHTS_URL  = `${API_BASE}/api/CreateComparisonInsights`;
const SMART_UPLOAD_URL     = `${API_BASE}/api/DetectAttributesFromDocument`;

/* ===== Mode metadata ===== */

const MODES: {
  id: InsightMode;
  label: string;
  badge: string;
  badgeColor: string;
  badgeBg: string;
  borderColor: string;
  iconBg: string;
  description: string;
  docCount: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "extract",
    label: "Quick Extract",
    badge: "Discovery",
    badgeColor: "#0F6E56",
    badgeBg: "#E1F5EE",
    borderColor: "#1D9E75",
    iconBg: "#E1F5EE",
    description: "Scan any document freely. No template needed. Save results as a reusable template.",
    docCount: "Any document · no template",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.5" stroke="#0F6E56" strokeWidth="1.3"/>
        <path d="M5 8h6M8 5v6" stroke="#0F6E56" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: "summarise",
    label: "Summarise",
    badge: "1 document",
    badgeColor: "#185FA5",
    badgeBg: "#E6F1FB",
    borderColor: "#185FA5",
    iconBg: "#E6F1FB",
    description: "AI extracts template fields from one document and generates an executive summary.",
    docCount: "1 document · template required",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="#185FA5" strokeWidth="1.3"/>
        <path d="M5 6h6M5 8.5h4" stroke="#185FA5" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: "compare",
    label: "Compare",
    badge: "2+ documents",
    badgeColor: "#993C1D",
    badgeBg: "#FAECE7",
    borderColor: "#D85A30",
    iconBg: "#FAECE7",
    description: "Side-by-side extraction of key fields across two or more documents. No scoring.",
    docCount: "2+ documents · template required",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="3" width="5" height="10" rx="1" stroke="#993C1D" strokeWidth="1.3"/>
        <rect x="9" y="3" width="5" height="10" rx="1" stroke="#993C1D" strokeWidth="1.3"/>
      </svg>
    ),
  },
  {
    id: "compare-scoring",
    label: "Scoring",
    badge: "2+ documents",
    badgeColor: "#5B21B6",
    badgeBg: "#EDE9FE",
    borderColor: "#7C3AED",
    iconBg: "#EDE9FE",
    description: "Side-by-side comparison with AI scoring. Ranks documents against your template rules.",
    docCount: "2+ documents · template + rules",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 12L5 8l3 3 2.5-5L14 11" stroke="#5B21B6" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

/* ================================================================ */

const VALID_MODES: InsightMode[] = ["extract", "summarise", "compare", "compare-scoring"];

function StartReview() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const navigate = useNavigate();
  const location = useLocation();

  const locationMode = (location.state as any)?.mode as InsightMode | undefined;
  const locationFrom = (location.state as any)?.from as string | undefined;
  const fromHome     = locationFrom === "home";

  /* ── Current user ── */
  const getCurrentUser = () => {
    const account = instance.getActiveAccount();
    if (!account) return null;
    return {
      email: account.username,
      name: account.name,
      aadObjectId: account.localAccountId,
    };
  };

  /* ── Core state ── */
  const [mode, setMode] = useState<InsightMode>(
    locationMode && VALID_MODES.includes(locationMode) ? locationMode : "compare-scoring"
  );
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [templates, setTemplates] = useState<TemplateType[]>([]);
  const [aiProfiles, setAiProfiles] = useState<AiProfile[]>([]);

  const [insightName, setInsightName] = useState("");
  const [selectedDocumentType, setSelectedDocumentType] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [aiOptions, setAiOptions] = useState<string[]>(["executiveSummary", "attributeInsight"]);

  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [comparisonRunId, setComparisonRunId] = useState<string | null>(null);
  const [uploadComplete, setUploadComplete] = useState(false);

  /* ── Quick Extract specific state ── */
  const [extractedAttributes, setExtractedAttributes]       = useState<any[]>([]);
  const [discoveredAttributes, setDiscoveredAttributes]     = useState<any[]>([]);
  const [extractComplete, setExtractComplete]               = useState(false);
  const [extractTemplateId, setExtractTemplateId]           = useState("");
  const [confirmedContext, setConfirmedContext]             = useState("");
  const [contextConfirmed, setContextConfirmed]             = useState(false);
  const [rerunningWithContext, setRerunningWithContext]     = useState(false);
  const [enableAiInsight, setEnableAiInsight]               = useState(true);
  const [extractCategories, setExtractCategories]           = useState<{id:string;name:string}[]>([]);

  /* ── Save-as-Insight state (Quick Extract done stage) ── */
  const [insightSaving, setInsightSaving] = useState(false);
  const [insightError,  setInsightError]  = useState("");

  /* ── Template builder inline state (used after scan completes) ── */
  type ExtractStage = "results" | TemplateStage;
  const [extractStage, setExtractStage]         = useState<ExtractStage>("results");
  const [classifyMode, setClassifyMode]         = useState<TBSClassifyMode>("new");
  const [newDocTypeName, setNewDocTypeName]     = useState("");
  const [newDocTypeDesc, setNewDocTypeDesc]     = useState("");
  const [templateName, setTemplateName]         = useState("");
  const [templateVersion, setTemplateVersion]   = useState("1.0");
  const [selectedDocTypeId, setSelectedDocTypeId] = useState("");

  /* ── UI state ── */
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [screen, setScreen] = useState<string>(
    locationMode && VALID_MODES.includes(locationMode) ? "form" : "pick"
  );
  const [hoveredMode, setHoveredMode] = useState<InsightMode | null>(null);

  /* ── Template save hook for Quick Extract inline save ── */
  const extractSave = useTemplateSave();

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Auth ── */
  useEffect(() => {
    if (accounts.length > 0 && !instance.getActiveAccount()) {
      instance.setActiveAccount(accounts[0]);
    }
  }, [accounts, instance]);

  const getToken = async (): Promise<string | null> => {
    const activeAccount = instance.getActiveAccount();
    if (!activeAccount) return null;
    if (inProgress !== InteractionStatus.None) return null;
    try {
      const response = await instance.acquireTokenSilent({
        ...loginRequest,
        account: activeAccount,
      });
      return response.accessToken;
    } catch {
      await instance.acquireTokenRedirect(loginRequest);
      return null;
    }
  };

  /* ── Loaders ── */
  const loadDocumentTypes = async () => {
    try {
      const data = await configApi.getDocumentTypes();
      setDocumentTypes(data);
    } catch (err) {
      console.error("Failed to load document types:", err);
    }
  };

  const filteredDocumentTypes = documentTypes.filter(dt => {
    if (mode === "summarise")       return dt.enableSummarise === true;
    if (mode === "compare")         return dt.enableCompare === true;
    if (mode === "compare-scoring") return dt.enableScoring === true;
    return true;
  });

  const loadProfilesForTemplate = async (templateId: string) => {
    try {
      const data = await configApi.getProfilesByTemplate(templateId);
      const profiles: AiProfile[] = data.map((d: any) => ({
        id: d.profileId,
        name: d.profileName,
        isDefault: d.isDefault,
      }));
      setAiProfiles(profiles);
      setSelectedProfiles(profiles.filter(p => p.isDefault).map(p => p.id));
    } catch {
      setAiProfiles([]);
      setSelectedProfiles([]);
    }
  };

  const loadTemplates = async (documentTypeId: string) => {
    const data = await configApi.getTemplate(documentTypeId);
    setTemplates(data);
  };

  useEffect(() => {
    if (isAuthenticated && accounts.length > 0 && inProgress === InteractionStatus.None) {
      loadDocumentTypes();
      // Load all templates for the "Enrich existing template" dropdown
      configApi.getAllTemplates().then((data: any[]) =>
        setTemplates(data.map((t: any) => ({ id: t.id, name: t.name ?? t.templateName ?? t.ilx_name ?? "Unnamed" })))
      ).catch(() => {/* non-fatal */});
      // Load attribute categories for the confirm stage chip display
      configApi.getAttributeCategories().then((data: any[]) =>
        setExtractCategories(data.map((c: any) => ({ id: c.id, name: c.name ?? c.ilx_name ?? "" })))
      ).catch(() => {/* non-fatal */});
    }
  }, [isAuthenticated, accounts, inProgress]);

  useEffect(() => {
    if (selectedDocumentType) {
      loadTemplates(selectedDocumentType);
    } else {
      setTemplates([]);
      setSelectedTemplate("");
    }
  }, [selectedDocumentType]);

  useEffect(() => {
    if (selectedTemplate) {
      loadProfilesForTemplate(selectedTemplate);
    } else {
      setAiProfiles([]);
      setSelectedProfiles([]);
    }
  }, [selectedTemplate]);

  /* ── Reset when switching modes ── */
  useEffect(() => {
    setUploadedFiles([]);
    setUploadComplete(false);
    setComparisonRunId(null);
    setExtractedAttributes([]);
    setExtractComplete(false);
    setStatus("");
    setError("");
    setSelectedProfiles([]);
    if (mode === "extract") {
      setSelectedDocumentType("");
      setSelectedTemplate("");
    } else if (selectedDocumentType) {
      // Clear selection if the current doc type isn't valid for the new mode
      const stillValid = documentTypes.some(dt => {
        if (dt.id !== selectedDocumentType) return false;
        if (mode === "summarise")       return dt.enableSummarise === true;
        if (mode === "compare")         return dt.enableCompare === true;
        if (mode === "compare-scoring") return dt.enableScoring === true;
        return true;
      });
      if (!stillValid) {
        setSelectedDocumentType("");
        setSelectedTemplate("");
      }
    }
  }, [mode]);

  /* ── File handling ── */
  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const fileArray = Array.from(files);
    if (mode === "compare" || mode === "compare-scoring") {
      // Append new files (de-duplicate by name) so user can add one at a time
      setUploadedFiles(prev => {
        const existingNames = new Set(prev.map(f => f.name));
        const fresh = fileArray.filter(f => !existingNames.has(f.name));
        return [...prev, ...fresh];
      });
    } else {
      // Summarise / Extract: strict 1-document maximum
      setUploadedFiles([fileArray[0]]);
    }
    setUploadComplete(false);
    setComparisonRunId(null);
    setExtractedAttributes([]);
    setExtractComplete(false);
    setStatus("");
    setError("");
  };

  const removeFile = (index: number) => {
    const updated = [...uploadedFiles];
    updated.splice(index, 1);
    setUploadedFiles(updated);
    setUploadComplete(false);
    setComparisonRunId(null);
  };

  /* ── Validation ── */
  const validate = (): string | null => {
    if (!insightName.trim()) return "Enter an insight name.";
    if (!uploadedFiles.length) return "Upload at least one document.";
    if (mode !== "extract") {
      if (!selectedDocumentType) return "Select a document type.";
      if (!selectedTemplate) return "Select a template.";
    }
    if ((mode === "compare" || mode === "compare-scoring") && uploadedFiles.length < 2)
      return "This mode requires at least 2 documents.";
    if (
      mode !== "extract" &&
      aiOptions.includes("executiveSummary") &&
      selectedProfiles.length === 0
    )
      return "Select at least one AI Insight Profile.";
    return null;
  };

  /* ── Quick Extract ── */
  const runExtract = async (contextOverride?: string) => {
    const err = validate();
    if (err) return setError(err);

    const token = await getToken();
    if (!token) return;

    setLoading(true);
    setError("");
    setContextConfirmed(false);

    if (contextOverride) {
      setRerunningWithContext(true);
      setStatus(`Re-scanning as "${contextOverride}"…`);
    } else {
      setStatus("Detecting document type…");
    }

    try {
      const params = new URLSearchParams();
      if (contextOverride)   params.set("context",    contextOverride);
      if (extractTemplateId) params.set("templateId", extractTemplateId);
      const url = `${SMART_UPLOAD_URL}${params.toString() ? "?" + params.toString() : ""}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-Key": accounts[0]?.tenantId || "",
        },
        body: uploadedFiles[0],
      });

      if (!response.ok) throw new Error(await response.text());

      const result   = await response.json();
      const attrs: any[] = result.attributes ?? result;

      // Sanitise context — AI sometimes returns JSON object instead of plain string
      // e.g. {"document_type": "residential lease"} → "residential lease"
      let rawCtx: string = result.documentContext ?? "";
      try {
        const parsed = JSON.parse(rawCtx);
        rawCtx = Object.values(parsed)[0] as string ?? rawCtx;
      } catch { /* already a plain string */ }
      const ctx: string  = rawCtx.trim().replace(/^["']|["']$/g, "");

      const tmpl: boolean = result.hasTemplate ?? false;

      // Split configured vs discovered
      const configured  = attrs.filter((a: any) =>
        a.IsConfigured === true || a.isConfigured === true);
      const discovered  = attrs.filter((a: any) =>
        (a.IsConfigured === false || a.isConfigured === false) &&
        (a.SuggestAddToTemplate === true || a.suggestAddToTemplate === true));
      const noSplit     = attrs.filter((a: any) =>
        a.IsConfigured === undefined && a.isConfigured === undefined);

      setConfirmedContext(ctx);
      setExtractedAttributes(configured.length > 0 ? configured : noSplit);
      setDiscoveredAttributes(discovered);
      setExtractComplete(true);
      setStatus(`${attrs.length} attributes detected${tmpl ? ` (${configured.length} from template, ${discovered.length} new)` : ""}`);
    } catch {
      setError("Extraction failed. Please try again.");
    }

    setRerunningWithContext(false);
    setLoading(false);
  };

  /* ── Save as Template (Quick Extract exit path) ── */

  /* ── Upload (Summarise / Compare) ── */
  const startUpload = async () => {
    const err = validate();
    if (err) return setError(err);

    const token = await getToken();
    if (!token) return;

    setLoading(true);
    setError("");
    setStatus("Uploading documents…");

    const formData = new FormData();
    formData.append("comparisonName", insightName);
    formData.append("documentTypeId", selectedDocumentType);
    formData.append("comparisonTemplateId", selectedTemplate);
    formData.append("mode", mode === "summarise" ? "Summarise" : mode === "compare-scoring" ? "Scoring" : "Compare");
    formData.append("aiScope", "Hybrid");
    uploadedFiles.forEach((file) => formData.append("files", file));

    const user = getCurrentUser();

    const response = await fetch(UPLOAD_FUNCTION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-user-email": user?.email ?? "",
        "x-user-name": user?.name ?? "",
        "x-user-id": user?.aadObjectId ?? "",
      },
      body: formData,
    });

    const result = await response.json();
    setComparisonRunId(result.runRecordId);
    setUploadComplete(true);
    setLoading(false);
    setStatus("Upload complete. Ready to generate report.");
  };

  /* ── Generate Report ── */
  const executeReview = async () => {
    const token = await getToken();
    if (!token || !comparisonRunId) return;

    setLoading(true);
    setStatus("Generating report…");
    await new Promise((resolve) => setTimeout(resolve, 50));

    const includeExecutiveSummary = aiOptions.includes("executiveSummary");
    const includeAttributeInsight = aiOptions.includes("attributeInsight");

    if (includeExecutiveSummary && selectedProfiles.length > 0) {
      await fetch(CREATE_INSIGHTS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ comparisonRunId, selectedProfileIds: selectedProfiles }),
      });
    }

    const user = getCurrentUser();

    await fetch(EXECUTE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-user-email": user?.email ?? "",
        "x-user-name": user?.name ?? "",
        "x-user-id": user?.aadObjectId ?? "",
      },
      body: JSON.stringify({
        comparisonRunId,
        includeExecutiveSummary,
        includeAttributeInsight,
        includeScoring: mode === "compare-scoring",
      }),
    });

    navigate(`/results/${comparisonRunId}`);
  };

  /* ── Save Quick Extract result as an Insight ── */
  const saveAsInsight = async () => {
    const token = await getToken();
    if (!token) return;

    setInsightSaving(true);
    setInsightError("");

    try {
      const formData = new FormData();
      formData.append("comparisonName", insightName || templateName);
      formData.append("documentTypeId", extractSave.savedDocTypeId);
      formData.append("comparisonTemplateId", extractSave.savedTemplateId);
      formData.append("mode", "Summarise");
      formData.append("aiScope", "Extracted");
      formData.append("files", uploadedFiles[0]);

      const user = getCurrentUser();

      const uploadRes = await fetch(UPLOAD_FUNCTION_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-user-email": user?.email ?? "",
          "x-user-name": user?.name ?? "",
          "x-user-id": user?.aadObjectId ?? "",
        },
        body: formData,
      });

      if (!uploadRes.ok) throw new Error(await uploadRes.text());

      const { runRecordId } = await uploadRes.json();

      await fetch(EXECUTE_FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-user-email": user?.email ?? "",
          "x-user-name": user?.name ?? "",
          "x-user-id": user?.aadObjectId ?? "",
        },
        body: JSON.stringify({
          comparisonRunId: runRecordId,
          includeExecutiveSummary: false,
          includeAttributeInsight: true,
          includeScoring: false,
        }),
      });

      navigate(`/runs/${runRecordId}`);
    } catch (ex: any) {
      setInsightError(`Failed to save insight: ${ex?.message ?? "Unknown error"}`);
      setInsightSaving(false);
    }
  };

  /* ── Helpers ── */
  const activeMeta = MODES.find((m) => m.id === mode)!;
  const needsTemplate = mode !== "extract";
  const isCompare = mode === "compare" || mode === "compare-scoring";

  /* ================================================================
     RENDER
  ================================================================ */

  /* ── SCREEN 1: MODE PICKER ── */
  if (screen === "pick") {
    return (
      <div className="dc-container" style={{ maxWidth: 700 }}>

        <PageBreadcrumb
          items={[
            fromHome
              ? { label: "Home", onClick: () => navigate("/") }
              : { label: "My Insights", onClick: () => navigate("/dashboard") },
            { label: "New Insight" },
          ]}
        />

        {/* Page header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 700, color: "#111827" }}>
            New Insight
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
            Choose how you want to analyse your documents — click a card to get started.
          </p>
        </div>

        {/* Mode cards — clicking navigates directly to the form */}
        <div className="sr-pick-cards">
          {MODES.map((m) => {
            const isHovered = hoveredMode === m.id;
            return (
              <button
                key={m.id}
                className="sr-pick-card"
                style={{ borderTopColor: isHovered ? m.borderColor : "transparent" }}
                onClick={() => { setMode(m.id); setScreen("form"); }}
                onMouseEnter={() => setHoveredMode(m.id)}
                onMouseLeave={() => setHoveredMode(null)}
              >
                <div className="sr-pick-icon" style={{ background: m.iconBg }}>
                  {m.icon}
                </div>
                <div className="sr-pick-label">{m.label}</div>
                <div className="sr-pick-desc">{m.description}</div>
                <div className="sr-pick-footer">
                  <span className="sr-pick-count" style={{ color: m.badgeColor, background: m.badgeBg }}>
                    {m.docCount}
                  </span>
                  <span className="sr-pick-arrow" style={{ color: m.badgeColor }}>
                    Start →
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <style>{`
          .sr-pick-cards {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            margin-bottom: 8px;
          }
          .sr-pick-card {
            position: relative;
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-top: 3px solid transparent;
            border-radius: 14px;
            padding: 24px 22px 20px;
            text-align: left;
            cursor: pointer;
            transition: all 0.18s ease;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .sr-pick-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 28px rgba(0,0,0,0.09);
            border-color: #d1d5db;
          }
          .sr-pick-icon {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 4px;
            flex-shrink: 0;
          }
          .sr-pick-label {
            font-size: 16px;
            font-weight: 700;
            color: #111827;
          }
          .sr-pick-desc {
            font-size: 13px;
            color: #6b7280;
            line-height: 1.6;
            flex: 1;
          }
          .sr-pick-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-top: 8px;
          }
          .sr-pick-count {
            font-size: 11px;
            font-weight: 600;
            padding: 4px 10px;
            border-radius: 999px;
            display: inline-block;
          }
          .sr-pick-arrow {
            font-size: 12px;
            font-weight: 600;
            opacity: 0;
            transition: opacity 0.15s ease;
          }
          .sr-pick-card:hover .sr-pick-arrow { opacity: 1; }
          @media (max-width: 560px) {
            .sr-pick-cards { grid-template-columns: 1fr; }
          }
        `}</style>
      </div>
    );
  }

  /* ── SCREEN 2: FORM ── */
  return (
    <div className="dc-container">

      {/* ── BREADCRUMB ── */}
      <PageBreadcrumb
        items={[
          fromHome
            ? { label: "Home", onClick: () => navigate("/") }
            : { label: "My Insights", onClick: () => navigate("/dashboard") },
          ...(!fromHome ? [{ label: "New Insight", onClick: () => { setScreen("pick"); setError(""); setStatus(""); } }] : []),
          { label: activeMeta.label, dot: activeMeta.borderColor, badge: { text: activeMeta.badge, color: activeMeta.badgeColor, bg: activeMeta.badgeBg } },
        ]}
      />

      {/* ── STAGE 1: Insight Name + How it works + Upload (hidden once scan completes) ── */}
      {!(mode === "extract" && extractComplete) && (
      <div className="dc-card" style={{ marginBottom: 16 }}>
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label htmlFor="insightName">Insight Name</label>
          <input id="insightName" value={insightName}
            onChange={(e) => setInsightName(e.target.value)}
            placeholder="e.g. Contract Risk Review Q2 2026"/>
        </div>

        {mode === "extract" && (
          <>
            <div className="sr-extract-info" style={{ marginBottom: 14 }}>
              <div className="sr-extract-info-title">How it works</div>
              <div className="sr-extract-info-steps">
                <div className="sr-extract-step"><div className="sr-extract-step-num">1</div><div>Upload any document — no setup needed</div></div>
                <div className="sr-extract-step"><div className="sr-extract-step-num">2</div><div>AI detects all key attributes and values</div></div>
                <div className="sr-extract-step"><div className="sr-extract-step-num">3</div><div>Review results — save as a template when ready</div></div>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>
                Enrich an existing template?
                <span style={{fontSize:11,fontWeight:400,color:"#9ca3af",marginLeft:4}}>(optional)</span>
              </label>
              <p style={{fontSize:12,color:"#9ca3af",margin:"3px 0 6px"}}>
                Extracts configured fields plus discovers any new ones.
              </p>
              <select value={extractTemplateId}
                onChange={(e) => setExtractTemplateId(e.target.value)}
                aria-label="Enrich existing template" title="Enrich existing template">
                <option value="">— None, discover freely —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* ── Upload ── */}
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <h3 style={{ margin:0 }}>{isCompare ? "Upload Documents" : "Upload Document"}</h3>
            {isCompare && (
              <span className={`sr-file-count-badge${uploadedFiles.length >= 2 ? " sr-file-count-badge--ok" : ""}`}>
                {uploadedFiles.length} / 2 minimum required
              </span>
            )}
            {(mode === "summarise" || mode === "extract") && (
              <span className="sr-file-count-badge sr-file-count-badge--single">
                1 document only
              </span>
            )}
          </div>

          {uploadedFiles.length > 0 ? (
            <div>
              {uploadedFiles.map((file, index) => (
                <div key={index} className="sr-uploaded-file-row">
                  <div className="sr-uploaded-file-icon">📄</div>
                  <div className="sr-uploaded-file-info">
                    <div className="file-name">{file.name}</div>
                    <div className="file-size">{(file.size/1024/1024).toFixed(2)} MB</div>
                  </div>
                  <button type="button" className="sr-uploaded-file-remove"
                    onClick={() => removeFile(index)}>Remove</button>
                </div>
              ))}
              {!isCompare && (
                <button type="button" className="sr-change-file-btn"
                  onClick={() => fileInputRef.current?.click()}>
                  ↻ Change file
                </button>
              )}
              {isCompare && (
                <button type="button" className="sr-add-more-btn"
                  onClick={() => fileInputRef.current?.click()}>
                  + Add another document
                </button>
              )}
            </div>
          ) : (
            <div className={`dc-dropzone ${loading ? "disabled-zone" : ""}`} style={{ minHeight:80 }}
              onClick={() => !loading && fileInputRef.current?.click()}>
              <div className="dropzone-inner">
                <div className="dropzone-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                    stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 16l-4-4-4 4"/><path d="M12 12v7"/>
                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 4 16.3"/>
                  </svg>
                </div>
                <div className="dropzone-primary">Drag &amp; drop file here</div>
                <div className="dropzone-secondary">or click to browse</div>
              </div>
            </div>
          )}
          {isCompare && uploadedFiles.length > 0 && uploadedFiles.length < 2 && (
            <div className="sr-file-warning">At least 2 documents are required for this mode</div>
          )}
        </div>

        {/* ── Scan button (extract mode, pre-results) ── */}
        {mode === "extract" && !extractComplete && (
          <div style={{ marginTop: 16 }}>
            <div className="action-flow-horizontal">
              <button className="primary-btn" onClick={() => runExtract()}
                disabled={loading || uploadedFiles.length === 0}>
                {loading ? "Scanning…" : "Scan Document"}
              </button>
            </div>
            <div className="flow-status">{status}</div>
            <div className="error-text">{error}</div>
          </div>
        )}
      </div>
      )}
      <input type="file" multiple={isCompare} hidden ref={fileInputRef}
        onChange={(e) => handleFiles(e.target.files)}/>

      {/* ── SETTINGS (template modes only) ── */}
      {needsTemplate && (
        <div className="top-grid" style={{ alignItems:"stretch", marginBottom:0, marginTop:16 }}>
          <div className="setup-panel">
            <div className="form-group">
              <label htmlFor="documentType">Document Type</label>
              <select id="documentType" value={selectedDocumentType}
                onChange={(e) => setSelectedDocumentType(e.target.value)}>
                <option value="">Select document type</option>
                {filteredDocumentTypes.map((dt) => (
                  <option key={dt.id} value={dt.id}>{dt.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="reviewTemplate">Review Template</label>
              <select id="reviewTemplate" value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                disabled={!selectedDocumentType}>
                <option value="">Select template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <AiSettingsPanel aiOptions={aiOptions} setAiOptions={setAiOptions}
            aiProfiles={aiProfiles} selectedProfiles={selectedProfiles}
            setSelectedProfiles={setSelectedProfiles}/>
        </div>
      )}
      {/* ── ACTION FLOW (summarise / compare modes) ── */}
      {needsTemplate && (
        <div className="dc-card sr-action-card">
          {error && <div className="error-text sr-action-msg">{error}</div>}
          {status && <div className="flow-status sr-action-msg">{status}</div>}
          <div className="action-flow-horizontal">
            {!uploadComplete ? (
              <button
                type="button"
                className="primary-btn"
                onClick={startUpload}
                disabled={
                  loading ||
                  uploadedFiles.length === 0 ||
                  (isCompare && uploadedFiles.length < 2)
                }
              >
                {loading ? "Uploading…" : isCompare ? "Upload Documents" : "Upload Document"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => {
                    setUploadComplete(false);
                    setComparisonRunId(null);
                    setStatus("");
                    setError("");
                  }}
                  disabled={loading}
                >
                  ← Re-upload
                </button>
                <button
                  type="button"
                  className={`primary-btn sr-action-btn--${mode}`}
                  onClick={executeReview}
                  disabled={loading}
                >
                  {loading ? "Generating…" : "Generate Report →"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── QUICK EXTRACT — multi-stage inline flow ── */}
      {mode === "extract" && extractComplete && (
        <>
          {/* Stepper — shown once scan is complete */}
          {/* ── Dynamic stepper — 2 steps initially, expands to 5 when saving ── */}
          {(() => {
            const inSave = extractStage !== "results";
            const steps = inSave
              ? ["Upload","Review","Classify","Confirm","Done"]
              : ["Upload","Review Fields"];
            const activeIdx = inSave
              ? ({"classify":2,"confirm":3,"done":4} as Record<string,number>)[extractStage] ?? 2
              : 1;
            return (
              <div className="qe-stepper">
                {steps.map((lbl, i) => {
                  const done   = i < activeIdx;
                  const active = i === activeIdx;
                  return (
                    <React.Fragment key={lbl}>
                      <div className={`qe-step ${done?"qe-step--done":""} ${active?"qe-step--active":""}`}>
                        <div className="qe-step-circle">
                          {done
                            ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l2.5 2.5L10 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            : <span>{i+1}</span>}
                        </div>
                        <span className="qe-step-label">{lbl}</span>
                      </div>
                      {i < steps.length - 1 && (
                        <div className={`qe-step-line ${done?"qe-step-line--done":""}`}/>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            );
          })()}

          {/* ── STAGE: RESULTS — editable attribute review ── */}
          {extractStage === "results" && (
            <>
              {/* Context strip */}
              <div className={`sr-context-strip ${contextConfirmed?"sr-context-strip--confirmed":""}`} style={{marginTop:12}}>
                <div className="sr-context-left">
                  <span className="sr-context-label">Detected as</span>
                  <input className="sr-context-input" value={confirmedContext}
                    onChange={(e)=>{setConfirmedContext(e.target.value);setContextConfirmed(false);}}
                    placeholder="e.g. commercial lease"/>
                </div>
                <div className="sr-context-right">
                  {!contextConfirmed ? (
                    <>
                      <button className="sr-context-btn sr-context-btn--confirm" onClick={()=>setContextConfirmed(true)}>✓ Confirm</button>
                      <button className="sr-context-btn sr-context-btn--rerun"
                        onClick={()=>runExtract(confirmedContext)}
                        disabled={rerunningWithContext||!confirmedContext.trim()}>
                        {rerunningWithContext?"Re-scanning…":"↻ Re-scan"}
                      </button>
                    </>
                  ) : (
                    <span className="sr-context-confirmed-badge">✓ Confirmed</span>
                  )}
                </div>
              </div>

              {/* Fields table */}
              <div className="dc-card" style={{marginTop:12}}>
                <AttributeReviewTable
                  attributes={[...extractedAttributes,...discoveredAttributes.map(a=>({
                    ...a,
                    dataType: a.dataType ?? (a.SuggestedDataType==="String"?"Text":(a.SuggestedDataType??"Text")),
                    category: a.category ?? a.Category ?? "",
                  }))]}
                  discoveredAttributes={[]}
                  categories={[]}
                  onUpdate={(i,f,v) => {
                    const all = [...extractedAttributes,...discoveredAttributes.map(a=>({
                      ...a,
                      dataType: a.dataType??(a.SuggestedDataType==="String"?"Text":(a.SuggestedDataType??"Text")),
                      category: a.category??a.Category??"",
                    }))];
                    all[i] = {...all[i],[f]:v};
                    setExtractedAttributes(all.slice(0,extractedAttributes.length));
                    setDiscoveredAttributes(all.slice(extractedAttributes.length));
                  }}
                  onRemove={(i) => {
                    const all = [...extractedAttributes,...discoveredAttributes];
                    all.splice(i,1);
                    setExtractedAttributes(all.slice(0,Math.min(extractedAttributes.length,all.length)));
                    setDiscoveredAttributes(all.slice(Math.min(extractedAttributes.length,all.length)));
                  }}
                  onAdd={()=>setExtractedAttributes(prev=>[...prev,{AttributeName:"",Description:"",dataType:"Text",category:"",SampleValue:""}])}
                />
              </div>

              {/* Action row — two exit paths */}
              <div className="dc-card tbs-action-card">
                <div className="tbs-action-row tbs-action-row--spread">
                  <button className="primary-btn tbs-back-btn"
                    onClick={()=>{setExtractComplete(false);setExtractedAttributes([]);setDiscoveredAttributes([]);}}>
                    ↺ Re-scan
                  </button>
                  <div style={{display:"flex",gap:16,alignItems:"center"}}>
                    <label style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:"#374151",cursor:"pointer",userSelect:"none"}}>
                      <input type="checkbox" checked={enableAiInsight}
                        onChange={(e)=>setEnableAiInsight(e.target.checked)} style={{width:14,height:14,marginTop:0}}/>
                      <span style={{fontWeight:500,lineHeight:"1"}}>AI Insight</span>
                    </label>
                    <button className="primary-btn tbs-back-btn"
                      onClick={()=>{
                        setExtractComplete(false);
                        setExtractedAttributes([]);
                        setDiscoveredAttributes([]);
                        setExtractStage("results");
                        setUploadedFiles([]);
                        setInsightName("");
                        setConfirmedContext("");
                        setContextConfirmed(false);
                        setExtractTemplateId("");
                        setStatus("");
                        setError("");
                        setScreen("pick");
                      }}>
                      ✓ Done
                    </button>
                    <button className="primary-btn"
                      onClick={()=>{
                        if(!templateName) setTemplateName(confirmedContext?`${confirmedContext} — Default Template`:`${insightName} — Default Template`);
                        if(!newDocTypeName&&confirmedContext) setNewDocTypeName(confirmedContext.split(" ").map((w:string)=>w.charAt(0).toUpperCase()+w.slice(1)).join(" "));
                        setExtractStage("classify");
                      }}
                      disabled={[...extractedAttributes,...discoveredAttributes].length===0}>
                      Save as Template ▶
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

                    {/* ── STAGE: CLASSIFY ── */}
          {extractStage === "classify" && (
            <ClassifyStage
              classifyMode={classifyMode}
              documentTypes={documentTypes}
              selectedDocTypeId={selectedDocTypeId}
              newDocTypeName={newDocTypeName}
              newDocTypeDesc={newDocTypeDesc}
              templateName={templateName}
              templateVersion={templateVersion}
              error={extractSave.error}
              onModeChange={setClassifyMode}
              onDocTypeChange={setSelectedDocTypeId}
              onNewNameChange={setNewDocTypeName}
              onNewDescChange={setNewDocTypeDesc}
              onTemplateNameChange={setTemplateName}
              onTemplateVersionChange={setTemplateVersion}
              onBack={() => { extractSave.setError(""); setExtractStage("results"); }}
              onNext={() => {
                if (classifyMode === "new" && !newDocTypeName.trim()) return extractSave.setError("Enter a Document Type name.");
                if (classifyMode === "existing" && !selectedDocTypeId) return extractSave.setError("Select a Document Type.");
                if (!templateName.trim()) return extractSave.setError("Enter a Template name.");
                extractSave.setError("");
                setExtractStage("confirm");
              }}
            />
          )}

          {/* ── STAGE: CONFIRM ── */}
          {extractStage === "confirm" && (
            <ConfirmStage
              classifyMode={classifyMode}
              documentTypes={documentTypes}
              selectedDocTypeId={selectedDocTypeId}
              newDocTypeName={newDocTypeName}
              newDocTypeDesc={newDocTypeDesc}
              templateName={templateName}
              templateVersion={templateVersion}
              enableAiInsight={enableAiInsight}
              attributes={[...extractedAttributes, ...discoveredAttributes.map(a => ({
                ...a,
                dataType: a.dataType ?? (a.SuggestedDataType === "String" ? "Text" : (a.SuggestedDataType ?? "Text")),
                category: a.category ?? a.Category ?? "",
              }))]}
              categories={extractCategories as any}
              loading={extractSave.loading}
              status={extractSave.status}
              error={extractSave.error}
              onBack={() => { extractSave.setError(""); setExtractStage("classify"); }}
              onSave={async () => {
                const allAttrs = [...extractedAttributes, ...discoveredAttributes.map(a => ({
                  ...a,
                  dataType: a.dataType ?? (a.SuggestedDataType === "String" ? "Text" : (a.SuggestedDataType ?? "Text")),
                  category: a.category ?? a.Category ?? "",
                }))];
                const ok = await extractSave.save({
                  classifyMode, selectedDocTypeId, newDocTypeName, newDocTypeDesc,
                  templateName, templateVersion, attributes: allAttrs, categories: extractCategories,
                });
                if (ok) setExtractStage("done");
              }}
            />
          )}

          {/* ── STAGE: DONE ── */}
          {extractStage === "done" && (
            <>
              {/* Template saved confirmation */}
              <div className="dc-card tbs-done-card">
                <div className="tbs-done-icon">✅</div>
                <h3 className="tbs-done-title">Template saved successfully!</h3>
                <p className="tbs-done-sub">
                  Your document type, template and <strong>{extractedAttributes.length + discoveredAttributes.length}</strong> attribute{extractedAttributes.length + discoveredAttributes.length !== 1 ? "s" : ""} have been created.
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
                    <span className="tbs-done-value">{extractedAttributes.length + discoveredAttributes.length} fields</span>
                  </div>
                </div>
              </div>

              {/* Save as Insight prompt */}
              <div className="dc-card qe-insight-prompt">
                <div className="qe-insight-prompt-icon">💡</div>
                <div className="qe-insight-prompt-body">
                  <div className="qe-insight-prompt-title">Save this as an Insight?</div>
                  <div className="qe-insight-prompt-sub">
                    Run the AI extraction pipeline against <strong>{uploadedFiles[0]?.name}</strong> using your new template. The results will be saved as a full Insight with field highlighting.
                  </div>
                  {insightError && (
                    <div className="error-text qe-insight-error">{insightError}</div>
                  )}
                </div>
                <div className="qe-insight-prompt-actions">
                  <button
                    type="button"
                    className="primary-btn qe-insight-save-btn"
                    onClick={saveAsInsight}
                    disabled={insightSaving}
                  >
                    {insightSaving ? "Saving…" : "Yes, Save Insight →"}
                  </button>
                  <button
                    type="button"
                    className="primary-btn tbs-back-btn qe-insight-skip-btn"
                    onClick={() => navigate("/my-insights")}
                    disabled={insightSaving}
                  >
                    Skip
                  </button>
                </div>
              </div>

              {/* Full-screen processing overlay when saving insight */}
              {insightSaving && (
                <div className="page-loader-overlay">
                  <div className="sr-processing-card sr-processing-card--extract">
                    <div className="sr-processing-mode-badge">
                      {MODES.find(m => m.id === "extract")?.icon}
                      Quick Extract
                    </div>
                    <div className="sr-processing-spinner" />
                    <div className="sr-processing-title">Generating Insight…</div>
                    <div className="sr-processing-hint">Running AI extraction against your new template</div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}


      {loading && (
        <div className="page-loader-overlay">
          <div className={`sr-processing-card sr-processing-card--${mode}`}>
            <div className="sr-processing-mode-badge">
              {activeMeta.icon}
              {activeMeta.label}
            </div>
            <div className="sr-processing-spinner" />
            <div className="sr-processing-title">{status || "Processing…"}</div>
            <div className="sr-processing-hint">This may take a moment</div>
          </div>
        </div>
      )}

      {/* ── SCOPED STYLES ── */}
      <style>{`
        ${TEMPLATE_BUILDER_STYLES}

        /* ── MODE CARDS (kept for potential reuse) ── */
        .sr-mode-cards {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 12px;
        }

        /* ── MODE HINT STRIP ── */
        .sr-mode-hint {
          font-size: 12px;
          color: #6b7280;
          border-left: 3px solid #e5e7eb;
          padding: 6px 12px;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .sr-mode-hint-tip {
          margin-left: 8px;
          font-style: italic;
          color: #9ca3af;
        }

        /* ── QUICK EXTRACT INFO ── */
        .sr-extract-info {
          background: #f9fafb;
          border: 0.5px solid #e5e7eb;
          border-radius: 10px;
          padding: 14px 16px;
          margin-bottom: 0;
        }
        .sr-extract-info-title {
          font-size: 12px;
          font-weight: 600;
          color: #374151;
          margin-bottom: 12px;
        }
        .sr-extract-info-steps {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .sr-extract-step {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 12px;
          color: #6b7280;
          line-height: 1.5;
        }
        .sr-extract-step-num {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #1D9E75;
          color: white;
          font-size: 10px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        /* ── QUICK EXTRACT TIP CARD ── */
        .sr-extract-tip-card {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .sr-extract-tip-title {
          font-size: 12px;
          font-weight: 600;
          color: #374151;
          margin-bottom: 4px;
        }
        .sr-extract-tip-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 12px;
          color: #6b7280;
          line-height: 1.5;
        }
        .sr-extract-tip-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
          margin-top: 3px;
        }

        /* ── FILE COUNT BADGE ── */
        .sr-file-count-badge {
          font-size: 11px;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 999px;
          background: #FAECE7;
          color: #993C1D;
        }
        .sr-file-count-badge--ok {
          background: #dcfce7;
          color: #15803d;
        }
        .sr-file-count-badge--single {
          background: #E6F1FB;
          color: #185FA5;
        }

        /* ── ADD MORE FILES BUTTON (compare mode) ── */
        .sr-add-more-btn {
          display: block;
          width: 100%;
          margin-top: 8px;
          padding: 8px 14px;
          border: 2px dashed #d1d5db;
          border-radius: 8px;
          background: transparent;
          color: #6b7280;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          text-align: center;
          transition: all 0.15s ease;
        }
        .sr-add-more-btn:hover {
          border-color: #D85A30;
          color: #D85A30;
          background: #fff7f5;
        }

        /* ── FILE WARNING ── */
        .sr-file-warning {
          font-size: 12px;
          color: #D85A30;
          padding: 6px 10px;
          background: #FAECE7;
          border-radius: 6px;
          margin-top: 6px;
        }

        /* ── EXTRACT RESULTS TABLE ── */
        .sr-attr-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #f94b16;
          color: white;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          padding: 1px 8px;
          margin-left: 8px;
          vertical-align: middle;
        }
        .sr-extract-table-wrap {
          border: 0.5px solid #e5e7eb;
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 14px;
        }
        .sr-extract-table-head,
        .sr-extract-table-row {
          display: grid;
          grid-template-columns: 28px 1.6fr 1.1fr 0.9fr 1.4fr;
        }
        .sr-extract-table-head > div {
          padding: 8px 12px;
          font-size: 11px;
          font-weight: 700;
          color: #374151;
          white-space: nowrap;
          background: #f3f4f6;
          border-bottom: 0.5px solid #e5e7eb;
        }
        .sr-extract-table-row {
          border-top: 0.5px solid #f3f4f6;
          align-items: center;
          transition: background 0.12s ease;
        }
        .sr-extract-table-row:hover { background: #fafafa; }
        .sr-extract-table-row > div {
          padding: 9px 12px;
          font-size: 13px;
          color: #374151;
        }
        .sr-extract-idx {
          color: #9ca3af;
          font-size: 11px;
          font-weight: 600;
        }
        .sr-cat-chip {
          background: #f0fdf4;
          color: #166534;
          border: 0.5px solid #bbf7d0;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
        }
        .sr-type-chip {
          background: #e0f2fe;
          color: #075985;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
        }
        .sr-sample-val {
          color: #6b7280;
          font-size: 12px;
          font-style: italic;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* ── EXTRACT FOOTER ── */
        .sr-extract-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          color: #9ca3af;
          padding-top: 4px;
        }

        /* ── ALSO DISCOVERED SECTION ── */
        .sr-discovered-card {
          background: #fafbff;
          border: 1px solid #e0e7ff;
          border-left: 3px solid #6366f1;
          border-radius: 10px;
          padding: 16px 18px;
          margin-top: 8px;
        }
        .sr-discovered-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 14px;
          gap: 12px;
          flex-wrap: wrap;
        }
        .sr-discovered-title {
          font-size: 13px;
          font-weight: 600;
          color: #4338ca;
        }
        .sr-discovered-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #6366f1;
          color: white;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          padding: 1px 7px;
          margin: 0 6px;
          vertical-align: middle;
        }
        .sr-discovered-sub {
          font-size: 12px;
          color: #6b7280;
        }
        .sr-add-all-btn {
          padding: 6px 14px;
          border-radius: 6px;
          border: 1px solid #6366f1;
          background: #eef2ff;
          color: #4338ca;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s ease;
          flex-shrink: 0;
        }
        .sr-add-all-btn:hover { background: #e0e7ff; }
        .sr-discovered-table {
          border: 0.5px solid #e0e7ff;
          border-radius: 8px;
          overflow: hidden;
        }
        .sr-discovered-head,
        .sr-discovered-row {
          display: grid;
          grid-template-columns: 28px 1.4fr 1fr 0.9fr 1.4fr 70px;
          gap: 8px;
          align-items: center;
        }
        .sr-discovered-head > div {
          padding: 8px 10px;
          font-size: 11px;
          font-weight: 700;
          color: #374151;
          background: #eef2ff;
          border-bottom: 0.5px solid #e0e7ff;
        }
        .sr-discovered-row {
          border-top: 0.5px solid #f3f4f6;
          transition: background 0.12s ease;
        }
        .sr-discovered-row:hover { background: #f5f3ff; }
        .sr-discovered-row > div { padding: 9px 10px; font-size: 13px; }
        .sr-disc-idx    { color: #9ca3af; font-size: 11px; font-weight: 600; }
        .sr-disc-name   { font-weight: 500; color: #111827; }
        .sr-disc-sample { font-size: 12px; color: #6b7280; font-style: italic;
                          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sr-promote-btn {
          padding: 4px 10px;
          border-radius: 5px;
          border: none;
          background: #eef2ff;
          color: #4338ca;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .sr-promote-btn:hover { background: #e0e7ff; }
        .sr-promote-btn--include { background: #f0fdf4; color: #16a34a; }
        .sr-promote-btn--include:hover { background: #dcfce7; }

        /* ── UPLOADED FILE ROW ── */
        .sr-uploaded-file-row {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #f8fafc;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 10px 14px;
          margin-bottom: 6px;
        }
        .sr-uploaded-file-icon { font-size: 20px; flex-shrink: 0; }
        .sr-uploaded-file-info { flex: 1; min-width: 0; }
        .sr-uploaded-file-remove {
          padding: 5px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          background: #fff;
          color: #ef4444;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          flex-shrink: 0;
        }
        .sr-uploaded-file-remove:hover { background: #fef2f2; border-color: #fca5a5; }
        .sr-change-file-btn {
          margin-top: 8px;
          background: none;
          border: none;
          color: #6b7280;
          font-size: 12px;
          cursor: pointer;
          padding: 4px 0;
        }
        .sr-change-file-btn:hover { color: #374151; }


        /* ── QUICK EXTRACT STEPPER ── */
        .qe-stepper { display:flex; align-items:center; margin:16px 0 4px; flex-wrap:wrap; }
        .qe-step { display:flex; flex-direction:column; align-items:center; gap:4px; min-width:60px; }
        .qe-step-circle { width:26px; height:26px; border-radius:50%; border:2px solid #d1d5db; background:#f9fafb; color:#9ca3af; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; transition:all 0.2s; }
        .qe-step--active .qe-step-circle { border-color:#1D9E75; background:#1D9E75; color:white; box-shadow:0 2px 8px rgba(29,158,117,0.35); }
        .qe-step--done   .qe-step-circle { border-color:#16a34a; background:#16a34a; color:white; }
        .qe-step-label { font-size:10px; font-weight:500; color:#9ca3af; text-align:center; white-space:nowrap; }
        .qe-step--active .qe-step-label { color:#1D9E75; font-weight:700; }
        .qe-step--done   .qe-step-label { color:#16a34a; }
        .qe-step-line { flex:1; height:2px; background:#e5e7eb; min-width:14px; margin-bottom:14px; }
        .qe-step-line--done { background:#16a34a; }

        /* ── CONTEXT STRIP (Quick Extract) ── */
        .sr-context-strip {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-left: 3px solid #f94b16;
          border-radius: 10px;
          padding: 12px 16px;
          margin-top: 16px;
          margin-bottom: 4px;
          flex-wrap: wrap;
        }
        .sr-context-strip--confirmed {
          border-left-color: #16a34a;
          background: #f0fdf4;
        }
        .sr-context-left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
          min-width: 0;
        }
        .sr-context-label {
          font-size: 12px;
          font-weight: 500;
          color: #6b7280;
          white-space: nowrap;
        }
        .sr-context-input {
          flex: 1;
          min-width: 0;
          height: 32px;
          padding: 0 10px;
          font-size: 13px;
          font-weight: 500;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          max-width: 300px;
          background: #fff;
        }
        .sr-context-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .sr-context-btn {
          height: 32px;
          padding: 0 14px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .sr-context-btn--confirm {
          background: #FA4616;
          color: white;
        }
        .sr-context-btn--confirm:hover { background: #c7340f; }
        .sr-context-btn--rerun {
          background: #f3f4f6;
          color: #374151;
          border: 1px solid #e5e7eb !important;
        }
        .sr-context-btn--rerun:hover { background: #e5e7eb; }
        .sr-context-btn--rerun:disabled { opacity: 0.5; cursor: not-allowed; }
        .sr-context-confirmed-badge {
          font-size: 12px;
          font-weight: 600;
          color: #16a34a;
        }

        /* ── PROCESSING OVERLAY — per-mode colour tokens ── */
        .sr-processing-card--extract        { --proc-badge-bg: #E1F5EE; --proc-badge-color: #0F6E56; --proc-spinner-top: #1D9E75; }
        .sr-processing-card--summarise      { --proc-badge-bg: #E6F1FB; --proc-badge-color: #185FA5; --proc-spinner-top: #185FA5; }
        .sr-processing-card--compare        { --proc-badge-bg: #FAECE7; --proc-badge-color: #993C1D; --proc-spinner-top: #D85A30; }
        .sr-processing-card--compare-scoring{ --proc-badge-bg: #EDE9FE; --proc-badge-color: #5B21B6; --proc-spinner-top: #7C3AED; }

        /* ── ACTION FLOW CARD (summarise / compare) ── */
        .sr-action-card { margin-top: 16px; }
        .sr-action-msg  { margin-bottom: 12px; }
        .sr-action-btn--summarise,
        .sr-action-btn--compare,
        .sr-action-btn--compare-scoring {
          background: linear-gradient(145deg, #FA4616, #c7340f);
          box-shadow: 0 4px 12px rgba(250,70,22,0.3);
        }

        /* ── SAVE AS TEMPLATE BUTTON ── */
        .sr-save-template-btn {
          margin-top: 0 !important;
          background: linear-gradient(145deg, #FA4616, #c7340f) !important;
          box-shadow: 0 4px 12px rgba(250,70,22,0.3) !important;
          font-size: 13px !important;
          padding: 8px 16px !important;
        }
        .sr-save-template-btn:hover {
          box-shadow: 0 6px 18px rgba(250,70,22,0.45) !important;
        }
        .sr-save-template-btn-flow {
          margin-top: 20px;
          padding: 12px 22px;
          background: linear-gradient(145deg, #FA4616, #c7340f);
          color: white;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(250,70,22,0.3);
        }
        .sr-save-template-btn-flow:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(250,70,22,0.45);
        }

        @media (max-width: 640px) {
          .sr-mode-cards { grid-template-columns: 1fr; }
        }

        /* ── SAVE AS INSIGHT PROMPT (Done stage) ── */
        .qe-insight-prompt {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          margin-top: 14px;
          padding: 20px 24px;
          background: linear-gradient(135deg, #fff7f5, #fff3f0);
          border: 1px solid #fcd9bd;
          border-left: 4px solid #FA4616;
        }
        .qe-insight-prompt-icon {
          font-size: 28px;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .qe-insight-prompt-body {
          flex: 1;
          min-width: 0;
        }
        .qe-insight-prompt-title {
          font-size: 15px;
          font-weight: 700;
          color: #7a1f07;
          margin-bottom: 5px;
        }
        .qe-insight-prompt-sub {
          font-size: 13px;
          color: #374151;
          line-height: 1.55;
        }
        .qe-insight-prompt-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex-shrink: 0;
          align-items: stretch;
        }
        .qe-insight-save-btn {
          margin: 0 !important;
          background: linear-gradient(145deg, #FA4616, #c7340f) !important;
          box-shadow: 0 4px 12px rgba(250,70,22,0.3) !important;
          min-width: 150px;
          white-space: nowrap;
        }
        .qe-insight-save-btn:hover {
          box-shadow: 0 6px 18px rgba(250,70,22,0.45) !important;
        }
        .qe-insight-skip-btn {
          margin: 0 !important;
          text-align: center;
        }
        @media (max-width: 600px) {
          .qe-insight-prompt { flex-direction: column; }
          .qe-insight-prompt-actions { flex-direction: row; }
        }
      `}</style>
    </div>
  );
}

export default StartReview;
