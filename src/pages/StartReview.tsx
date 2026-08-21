import React, { useEffect, useRef, useState } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { AlertTriangle } from "lucide-react";

import { getAccessToken } from "../services/tokenHelper";
import { getAppConfig } from "../appConfig";
import { getExternalIdInstance } from "../authConfig";
import { useNavigate, useLocation } from "react-router-dom";
import { configApi, triggerLoginRedirect } from "../services/configApi";
import { useUser } from "../context/UserContext";
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
  documentTypeId?: string;
}

interface AiProfile {
  id: string;
  name: string;
  description?: string;
  isDefault?: boolean;
  isMandatory?: boolean;
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

const getApiBase = () => getAppConfig().apiBase.replace(/\/api\/?$/, "");
const UPLOAD_FUNCTION_URL  = () => `${getApiBase()}/api/UploadAndStartComparison`;
const EXECUTE_FUNCTION_URL = () => `${getApiBase()}/api/ExecuteComparisonRun`;
const CREATE_INSIGHTS_URL  = () => `${getApiBase()}/api/CreateComparisonInsights`;
const SMART_UPLOAD_URL     = () => `${getApiBase()}/api/DetectAttributesFromDocument`;


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
    label: "Discovery",
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

/* ── Friendly error messages ── */
function parseFriendlyError(raw: string): string {
  const r = raw.toLowerCase();
  if (r.includes("invalid_prompt") || r.includes("safety") || r.includes("content_filter") || r.includes("content filter"))
    return "The document contains content that was flagged by the AI safety system and could not be processed. If you believe this is incorrect, please contact your administrator.";
  if (r.includes("quota") || r.includes("rate limit") || r.includes("too many requests"))
    return "The service is temporarily busy. Please wait a moment and try again. If the problem persists, contact your administrator.";
  if (r.includes("unauthorized") || r.includes("401")) {
    // Session expired — redirect rather than show a static message
    triggerLoginRedirect();
    return "Your session has expired. Redirecting you to the login page…";
  }
  if (r.includes("403") || r.includes("forbidden"))
    return "You do not have permission to perform this action. Please contact your administrator.";
  if (r.includes("file too large") || r.includes("payload too large") || r.includes("413"))
    return "The document is too large to process. Please try a smaller file or contact your administrator for assistance.";
  if (r.includes("unsupported") || r.includes("invalid file") || r.includes("format"))
    return "This file format is not supported. Please upload a PDF or Word document.";
  if (r.includes("timeout") || r.includes("timed out"))
    return "The request timed out — the document may be too large or complex. Please try again or contact your administrator.";
  return "Something went wrong while processing your document. Please try again. If the problem continues, contact your administrator.";
}

/* ── Reusable error panel ── */
function ErrorPanel({ message }: { message: string }) {
  return (
    <div style={{
      display: "flex", gap: 12, alignItems: "flex-start",
      background: "#fff8f8", border: "1px solid #fecaca",
      borderLeft: "4px solid #ef4444", borderRadius: 8,
      padding: "14px 16px", marginTop: 12,
    }}>
      <AlertTriangle size={18} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#b91c1c", marginBottom: 4 }}>
          Unable to process document
        </div>
        <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.6, marginBottom: 8 }}>
          {message}
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          For further assistance, please contact your administrator at{" "}
          <a href="mailto:support@qubixinsight.com" style={{ color: "#F97316", textDecoration: "none", fontWeight: 500 }}>
            support@qubixinsight.com
          </a>
        </div>
      </div>
    </div>
  );
}

function StartReview() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const { isTrial, isAdmin, runsUsed, runLimit, refreshUser } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const locationMode = (location.state as any)?.mode as InsightMode | undefined;
  const locationFrom = (location.state as any)?.from as string | undefined;
  const fromHome     = locationFrom === "home";

  /* ── Current user ── */
  const getCurrentUser = () => {
    // Try main Azure AD instance first; fall back to External ID for CIAM trial users.
    const account = instance.getActiveAccount();
    if (account) return { email: account.username, name: account.name, aadObjectId: account.localAccountId };
    const extId = getExternalIdInstance();
    const extAccount = extId?.getActiveAccount() ?? extId?.getAllAccounts()[0];
    if (extAccount) return { email: extAccount.username, name: extAccount.name, aadObjectId: extAccount.localAccountId };
    return null;
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

  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  /* ── Scan progress ── */
  const [scanning, setScanning]         = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [, setTick] = useState(0); // forces re-render for dot animation
  useEffect(() => {
    if (!scanning) return;
    const t = setInterval(() => setTick(n => n + 1), 500);
    return () => clearInterval(t);
  }, [scanning]);
  const [scanStageIdx, setScanStageIdx] = useState(0);
  const scanProgressRef = useRef(0);
  const scanTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Quick Extract specific state ── */
  const [extractedAttributes, setExtractedAttributes]       = useState<any[]>([]);
  const [discoveredAttributes, setDiscoveredAttributes]     = useState<any[]>([]);
  const [extractComplete, setExtractComplete]               = useState(false);
  const [extractTemplateId, setExtractTemplateId]           = useState("");
  const [confirmedContext, setConfirmedContext]             = useState("");
  const [contextConfirmed, setContextConfirmed]             = useState(false);
  const [rerunningWithContext, setRerunningWithContext]     = useState(false);
  const [enableAiInsight, setEnableAiInsight]               = useState(false);
  const [extractCategories, setExtractCategories]           = useState<{id:string;name:string}[]>([]);

  // "Enrich an existing template?" save choice — create a brand-new template (default)
  // or append the newly-discovered fields onto the template that was enriched from.
  const [appendToTemplate, setAppendToTemplate]              = useState(false);
  // Names of attributes that were already configured on the enrichment template at
  // scan time — used to filter out only the genuinely NEW attributes when appending,
  // so already-configured fields are never re-created or duplicated.
  const configuredNamesRef = useRef<Set<string>>(new Set());

  /* ── Save-as-Insight state (Quick Extract done stage) ── */
  const [insightSaving, setInsightSaving] = useState(false);
  const [insightError,  setInsightError]  = useState("");

  const SCAN_STAGES = (mode === "extract" && !insightSaving)
    ? ["Uploading document", "Detecting attributes"]
    : mode === "compare-scoring"
      ? ["Uploading document", "Extracting attributes", "Running AI profiles", "Allocating scores", "Generating report"]
      : ["Uploading document", "Extracting attributes", "Running AI profiles", "Generating report"];

  /* ── Template builder inline state (used after scan completes) ── */
  type ExtractStage = "results" | "savemode" | TemplateStage;
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
    const token = await getAccessToken(instance, instance.getActiveAccount() ?? accounts[0], inProgress);
    if (!token) triggerLoginRedirect();
    return token;
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
    if (mode === "summarise")       return dt.enableSummarise !== false;
    if (mode === "compare")         return dt.enableCompare !== false;
    if (mode === "compare-scoring") return dt.enableScoring !== false;
    return true;
  });

  const loadProfilesForTemplate = async (templateId: string) => {
    try {
      const data = await configApi.getProfilesByTemplate(templateId);
      let profiles: AiProfile[] = data.map((d: any) => ({
        id: d.profileId,
        name: d.profileName,
        description: d.description ?? d.profileDescription ?? "",
        isDefault: d.isDefault,
        isMandatory: d.isMandatory,
      }));

      // No template-specific profiles — fall back to global defaults
      if (profiles.length === 0) {
        const allProfiles = await configApi.getAllAiInsightProfiles();
        profiles = (allProfiles as any[])
          .filter(p => p.isDefault || p.isMandatory)
          .map(p => ({
            id: p.id,
            name: p.profileName,
            description: p.description ?? "",
            isDefault: p.isDefault,
            isMandatory: p.isMandatory,
          }));
      }

      setAiProfiles(profiles);
      setSelectedProfiles(profiles.filter(p => p.isDefault || p.isMandatory).map(p => p.id));
    } catch {
      setAiProfiles([]);
      setSelectedProfiles([]);
    }
  };

  const loadTemplates = async (documentTypeId: string) => {
    const data = await configApi.getTemplate(documentTypeId);
    setTemplates(data);
  };

  /* Discovery mode: profiles aren't tied to a saved template yet, so load
     template-specific profiles when enriching an existing template, otherwise
     fall back to the full tenant profile list (mirrors loadProfilesForTemplate). */
  const loadExtractProfiles = async (templateId: string) => {
    try {
      let profiles: AiProfile[] = [];

      if (templateId) {
        const data = await configApi.getProfilesByTemplate(templateId);
        profiles = data.map((d: any) => ({
          id: d.profileId,
          name: d.profileName,
          description: d.description ?? d.profileDescription ?? "",
          isDefault: d.isDefault,
          isMandatory: d.isMandatory,
        }));
      }

      if (profiles.length === 0) {
        const allProfiles = await configApi.getAllAiInsightProfiles();
        profiles = (allProfiles as any[]).map(p => ({
          id: p.id,
          name: p.profileName,
          description: p.description ?? "",
          isDefault: p.isDefault,
          isMandatory: p.isMandatory,
        }));
      }

      setAiProfiles(profiles);
      setSelectedProfiles(profiles.filter(p => p.isDefault || p.isMandatory).map(p => p.id));
    } catch {
      setAiProfiles([]);
      setSelectedProfiles([]);
    }
  };

  useEffect(() => {
    if (isAuthenticated && accounts.length > 0 && inProgress === InteractionStatus.None) {
      loadDocumentTypes();
      // Load all templates for the "Enrich existing template" dropdown
      configApi.getAllTemplates().then((data: any[]) =>
        setTemplates(data.map((t: any) => ({
          id: t.id,
          name: t.name ?? t.templateName ?? t.ilx_name ?? "Unnamed",
          documentTypeId: t.documentTypeId ?? t.ilx_documenttype ?? "",
        })))
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

  useEffect(() => {
    if (mode === "extract") {
      loadExtractProfiles(extractTemplateId);
    }
  }, [mode, extractTemplateId]);

  /* ── Reset when switching modes ── */
  useEffect(() => {
    setUploadedFiles([]);


    setExtractedAttributes([]);
    setExtractComplete(false);
    setStatus("");
    setError("");
    setSelectedProfiles([]);
    setAiProfiles([]);
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


    setExtractedAttributes([]);
    setExtractComplete(false);
    setStatus("");
    setError("");
  };

  const removeFile = (index: number) => {
    const updated = [...uploadedFiles];
    updated.splice(index, 1);
    setUploadedFiles(updated);
  };

  /* ── Drag-and-drop handlers (shared by both dropzones) ── */
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (!scanning) handleFiles(e.dataTransfer.files);
  };

  /* ── Validation ── */
  const validate = (): string | null => {
    if (isTrial && (mode === "compare" || mode === "compare-scoring"))
      return "Compare and Scoring are not available on a Trial account. Please contact your administrator to upgrade.";
    if (mode !== "extract" && !insightName.trim()) return "Enter an insight name.";
    if (!uploadedFiles.length) return "Upload at least one document.";
    if (mode !== "extract") {
      if (!selectedDocumentType) return "Select a document type.";
      if (!selectedTemplate) return "Select a template.";
    }
    if ((mode === "compare" || mode === "compare-scoring") && uploadedFiles.length < 2)
      return "This mode requires at least 2 documents.";
    if (aiProfiles.length > 0 && selectedProfiles.length === 0)
      return "Select at least one AI Insight Profile.";
    return null;
  };

  /* ── Quick Extract ── */
  const runExtract = async (contextOverride?: string) => {
    const err = validate();
    if (err) return setError(err);

    const token = await getToken();
    if (!token) return;

    setScanning(true);
    snapProgress(0);
    setScanStageIdx(0);
    setError("");
    setContextConfirmed(false);
    if (contextOverride) setRerunningWithContext(true);

    try {
      startProgressAnim(30, 2500);  // stage 0: uploading — quick 2.5s

      // Auto-advance to "Detecting attributes" after upload animation completes
      const detectTimer = setTimeout(() => {
        setScanStageIdx(1);
        startProgressAnim(92, 210000);  // stage 1: AI extraction — up to 3.5 min
      }, 3000);
      stageTimeoutsRef.current.push(detectTimer);

      const params = new URLSearchParams();
      if (contextOverride)   params.set("context",    contextOverride);
      if (extractTemplateId) params.set("templateId", extractTemplateId);
      const url = `${SMART_UPLOAD_URL()}${params.toString() ? "?" + params.toString() : ""}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-Key": accounts[0]?.tenantId || "",
        },
        body: uploadedFiles[0],
      });

      if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`);

      // Response received — clear auto-advance timer and complete
      clearStageTimers();

      const result   = await response.json();
      const attrs: any[] = result.attributes ?? result;

      // Sanitise context — AI sometimes returns JSON object instead of plain string
      // e.g. {"document_type": "residential lease"} → "residential lease"
      let rawCtx: string = result.documentContext ?? "";
      try {
        const parsed = JSON.parse(rawCtx);
        rawCtx = Object.values(parsed)[0] as string ?? rawCtx;
      } catch { /* already a plain string */ }
      const ctx: string  = rawCtx.trim().replace(/^["']|["']$/g, "")
        .split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

      const tmpl: boolean = result.hasTemplate ?? false;

      // Split configured vs discovered
      const configured  = attrs.filter((a: any) =>
        a.IsConfigured === true || a.isConfigured === true);
      const discovered  = attrs.filter((a: any) =>
        (a.IsConfigured === false || a.isConfigured === false) &&
        (a.SuggestAddToTemplate === true || a.suggestAddToTemplate === true));
      const noSplit     = attrs.filter((a: any) =>
        a.IsConfigured === undefined && a.isConfigured === undefined);

      clearStageTimers();
      snapProgress(100);
      setScanStageIdx(2);  // past last stage → "Complete!"
      await new Promise(r => setTimeout(r, 600));

      configuredNamesRef.current = new Set(
        configured.map((a: any) => (a.AttributeName ?? a.attributeName ?? "").trim().toLowerCase()).filter(Boolean)
      );

      setConfirmedContext(ctx);
      // Suggest an Insight Name from what the AI detected — user can still edit it,
      // but no longer has to type one blind before scanning.
      if (!insightName.trim()) {
        const dateLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        const fallback = uploadedFiles[0]?.name.replace(/\.[^./]+$/, "") ?? "Insight";
        setInsightName(`${ctx.trim() || fallback} — ${dateLabel}`);
      }
      setExtractedAttributes(configured.length > 0 ? configured : noSplit);
      setDiscoveredAttributes(discovered);
      setExtractComplete(true);
      setStatus(`${attrs.length} attributes detected${tmpl ? ` (${configured.length} from template, ${discovered.length} new)` : ""}`);
      refreshUser(); // re-fetch runsUsed so the disable check stays accurate
    } catch (ex: any) {
      clearStageTimers();
      snapProgress(0);
      setScanStageIdx(0);
      setError(parseFriendlyError(ex?.message ?? ""));
    }

    setRerunningWithContext(false);
    setScanning(false);
  };

  /* ── Scan progress helpers ── */
  const stageTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const startProgressAnim = (to: number, durationMs: number) => {
    const from = scanProgressRef.current;
    const tickMs = 80;
    const steps = Math.max(10, Math.ceil(durationMs / tickMs));
    const stepSize = (to - from) / steps;
    let step = 0;
    if (scanTimerRef.current) clearInterval(scanTimerRef.current);
    scanTimerRef.current = setInterval(() => {
      step++;
      const next = Math.min(from + stepSize * step, to);
      scanProgressRef.current = next;
      setScanProgress(Math.round(next));
      if (step >= steps) { clearInterval(scanTimerRef.current!); scanTimerRef.current = null; }
    }, tickMs);
  };
  const snapProgress = (pct: number) => {
    if (scanTimerRef.current) { clearInterval(scanTimerRef.current); scanTimerRef.current = null; }
    scanProgressRef.current = pct;
    setScanProgress(pct);
  };
  const clearStageTimers = () => {
    stageTimeoutsRef.current.forEach(t => clearTimeout(t));
    stageTimeoutsRef.current = [];
  };

  /* ── Combined Start Analysis (replaces Upload + Generate Report) ── */
  const startAnalysis = async () => {
    const err = validate();
    if (err) return setError(err);
    const token = await getToken();
    if (!token) return;

    setError("");
    setScanning(true);
    snapProgress(0);
    setScanStageIdx(0);

    const formData = new FormData();
    formData.append("comparisonName", insightName);
    formData.append("documentTypeId", selectedDocumentType);
    formData.append("comparisonTemplateId", selectedTemplate);
    formData.append("mode", mode === "summarise" ? "Summarise" : mode === "compare-scoring" ? "Scoring" : "Compare");
    uploadedFiles.forEach((file) => formData.append("files", file));
    const user = getCurrentUser();

    try {
      // ── Stage 0: Upload (animate 0→10% while real upload runs) ──
      startProgressAnim(10, 9000);
      const uploadResp = await fetch(UPLOAD_FUNCTION_URL(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-user-email": user?.email ?? "",
          "x-user-name": user?.name ?? "",
          "x-user-id": user?.aadObjectId ?? "",
        },
        body: formData,
      });
      if (uploadResp.status === 401) { triggerLoginRedirect(); return; }
      if (uploadResp.status === 403) {
        const msg = await uploadResp.text();
        clearStageTimers(); snapProgress(0); setScanning(false);
        setError(msg.toLowerCase().includes("trial")
          ? "Compare and Scoring are not available on a Trial account. Please contact your administrator to upgrade."
          : parseFriendlyError(msg));
        return;
      }
      if (!uploadResp.ok) throw new Error(await uploadResp.text() || `HTTP ${uploadResp.status}`);
      const { runRecordId } = await uploadResp.json();

      // ── Stage progress (timer-based, concurrent with execute fetch) ──
      // All modes:   Upload 10% | Extract 40% | AI 30% | Report 20%
      // Scoring:     Upload 10% | Extract 30% | AI 30% | Scores 10% | Report 20%
      const isScoring = mode === "compare-scoring";
      snapProgress(10); setScanStageIdx(1);
      startProgressAnim(isScoring ? 40 : 50, 30000);                    // extract: 30s

      stageTimeoutsRef.current.push(setTimeout(() => {
        snapProgress(isScoring ? 40 : 50); setScanStageIdx(2);
        startProgressAnim(isScoring ? 70 : 80, 20000);                  // AI: 20s
      }, 30000));

      if (isScoring) {
        stageTimeoutsRef.current.push(setTimeout(() => {
          snapProgress(70); setScanStageIdx(3);
          startProgressAnim(80, 10000);                                  // allocate scores: 10s
        }, 50000));
        stageTimeoutsRef.current.push(setTimeout(() => {
          snapProgress(80); setScanStageIdx(4);
          startProgressAnim(95, 10000);                                  // report: 10s
        }, 60000));
      } else {
        stageTimeoutsRef.current.push(setTimeout(() => {
          snapProgress(80); setScanStageIdx(3);
          startProgressAnim(95, 14000);                                  // report: 14s
        }, 50000));
      }

      // Create AI insight records (fire-and-forget alongside execute)
      if (selectedProfiles.length > 0) {
        fetch(CREATE_INSIGHTS_URL(), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ comparisonRunId: runRecordId, selectedProfileIds: selectedProfiles }),
        }).catch(() => {}); // non-critical — execute proceeds regardless
      }

      const execResp = await fetch(EXECUTE_FUNCTION_URL(), {
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
          includeScoring: mode === "compare-scoring",
        }),
      });
      if (execResp.status === 401) { clearStageTimers(); triggerLoginRedirect(); return; }

      // ── Done ──
      clearStageTimers();
      setScanStageIdx(4);
      snapProgress(100);
      await new Promise(r => setTimeout(r, 700));
      navigate(`/results/${runRecordId}`);

    } catch (ex: any) {
      clearStageTimers();
      snapProgress(0);
      setScanning(false);
      setScanStageIdx(0);
      setError(parseFriendlyError(ex?.message ?? ""));
    }
  };

  /* ── Save as Template (Quick Extract exit path) ── */


  /* ── Save Quick Extract result as an Insight ── */
  const saveAsInsight = async () => {
    const token = await getToken();
    if (!token) return;

    setInsightSaving(true);
    setInsightError("");
    setScanning(true);
    snapProgress(0);
    setScanStageIdx(0);

    try {
      // Stage 0: Upload (0→10%)
      startProgressAnim(10, 6000);

      const formData = new FormData();
      formData.append("comparisonName", insightName || templateName);
      formData.append("documentTypeId", extractSave.savedDocTypeId);
      formData.append("comparisonTemplateId", extractSave.savedTemplateId);
      formData.append("mode", "Summarise");

      formData.append("files", uploadedFiles[0]);

      const user = getCurrentUser();

      const uploadRes = await fetch(UPLOAD_FUNCTION_URL(), {
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

      // Stage 1: Extracting attributes (10→50%)
      snapProgress(10);
      setScanStageIdx(1);
      startProgressAnim(50, 30000);

      // Create AI insight records using the profiles the user selected up-front
      if (selectedProfiles.length > 0) {
        try {
          // Stage 2: Running AI profiles (50→80%)
          snapProgress(50);
          setScanStageIdx(2);
          startProgressAnim(80, 20000);

          await fetch(CREATE_INSIGHTS_URL(), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ comparisonRunId: runRecordId, selectedProfileIds: selectedProfiles }),
          });
        } catch {
          // non-critical — continue to execute even if insight creation fails
        }
      }

      // Stage 3: Generating report (80→95%)
      snapProgress(80);
      setScanStageIdx(3);
      startProgressAnim(95, 14000);

      const execRes = await fetch(EXECUTE_FUNCTION_URL(), {
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
          includeScoring: false,
        }),
      });

      if (!execRes.ok) {
        console.warn(`[SaveInsight] Execute returned ${execRes.status} — navigating to results anyway`);
      }

      clearStageTimers();
      snapProgress(100);
      setScanStageIdx(4);
      await new Promise(r => setTimeout(r, 700));

      navigate(`/runs/${runRecordId}`);
    } catch (ex: any) {
      clearStageTimers();
      snapProgress(0);
      setScanStageIdx(0);
      setInsightError(parseFriendlyError(ex?.message ?? ""));
      setInsightSaving(false);
      setScanning(false);
    }
  };

  /* ── Helpers ── */
  const activeMeta = MODES.find((m) => m.id === mode)!;
  const needsTemplate = mode !== "extract";
  const isCompare = mode === "compare" || mode === "compare-scoring";

  // The enrichment template's name/doc-type — only meaningful when extractTemplateId is set.
  const enrichTemplate = templates.find(t => t.id === extractTemplateId);

  // Attributes to save when appending to the enrichment template: everything the user is
  // keeping MINUS whatever was already configured on that template at scan time — so
  // already-configured fields are never re-created or duplicated.
  const getNewAttributesForAppend = () => {
    const all = [...extractedAttributes, ...discoveredAttributes.map(a => ({
      ...a,
      dataType: a.dataType ?? (a.SuggestedDataType === "String" ? "Text" : (a.SuggestedDataType ?? "Text")),
      category: a.category ?? a.Category ?? "",
    }))];
    return all.filter(a => {
      const name = (a.AttributeName ?? a.attributeName ?? "").trim().toLowerCase();
      return name && !configuredNamesRef.current.has(name);
    });
  };

  /* ================================================================
     RENDER
  ================================================================ */

  /* ── SCREEN 1: MODE PICKER ── */
  if (screen === "pick") {
    return (
      <div className="dc-container" style={{ maxWidth: 920 }}>

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
            const trialLocked = isTrial && (m.id === "compare" || m.id === "compare-scoring");
            return (
              <button
                key={m.id}
                className={`sr-pick-card${trialLocked ? " sr-pick-card--locked" : ""}`}
                style={{ borderTopColor: !trialLocked && isHovered ? m.borderColor : "transparent" }}
                onClick={() => { if (!trialLocked) { setMode(m.id); setScreen("form"); } }}
                onMouseEnter={() => !trialLocked && setHoveredMode(m.id)}
                onMouseLeave={() => setHoveredMode(null)}
              >
                <div className="sr-pick-icon" style={{ background: trialLocked ? "#f3f4f6" : m.iconBg }}>
                  {m.icon}
                </div>
                <div className="sr-pick-label">{m.label}</div>
                <div className="sr-pick-desc">{m.description}</div>
                <div className="sr-pick-footer">
                  <span className="sr-pick-count" style={{ color: m.badgeColor, background: m.badgeBg }}>
                    {m.docCount}
                  </span>
                  {trialLocked ? (
                    <span className="sr-pick-upgrade">Upgrade →</span>
                  ) : (
                    <span className="sr-pick-arrow" style={{ color: m.badgeColor }}>
                      Start →
                    </span>
                  )}
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
          .sr-pick-card:hover:not(.sr-pick-card--locked) {
            transform: translateY(-3px);
            box-shadow: 0 10px 28px rgba(0,0,0,0.09);
            border-color: #d1d5db;
          }
          .sr-pick-card--locked {
            opacity: 0.55;
            cursor: default;
            background: #fafafa;
          }
          .sr-pick-upgrade {
            font-size: 11px;
            font-weight: 600;
            color: #6b7280;
            background: #f3f4f6;
            padding: 3px 8px;
            border-radius: 999px;
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

      {/* ── Trial run usage banner ── */}
      {isTrial && !extractComplete && (() => {
        const remaining = runLimit - runsUsed;
        const pct       = runLimit > 0 ? (runsUsed / runLimit) * 100 : 0;
        const isAtLimit = remaining <= 0;
        const isWarning = remaining === 1;
        const bg        = isAtLimit ? "#fef2f2" : isWarning ? "#fffbeb" : "#f0f9ff";
        const border    = isAtLimit ? "#fecaca" : isWarning ? "#fde68a" : "#bae6fd";
        const textColor = isAtLimit ? "#b91c1c" : isWarning ? "#92400e" : "#0369a1";
        const icon      = isAtLimit ? "🚫" : isWarning ? "⚠️" : "ℹ️";
        return (
          <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8,
                        padding: "6px 14px", marginBottom: 8, display: "flex",
                        alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14 }}>{icon}</span>
            <span style={{ fontSize: 12, color: textColor, flex: 1 }}>
              {isAtLimit
                ? <strong>You have used all {runLimit} free runs for this month. Allowance resets on the 1st.</strong>
                : <><strong>Used {runsUsed} of {runLimit}</strong> free runs this month{remaining > 0 && <> &mdash; <strong>{remaining} remaining</strong></>}</>
              }
            </span>
            <div style={{ width: 80, height: 3, background: "#e5e7eb", borderRadius: 999, overflow: "hidden", flexShrink: 0 }}>
              <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`,
                            background: isAtLimit ? "#ef4444" : isWarning ? "#f59e0b" : "#0ea5e9",
                            borderRadius: 999 }} />
            </div>
          </div>
        );
      })()}

      {/* ── Quick Extract: two-column layout ── */}
      {mode === "extract" && !(extractComplete) && (
      <div className="top-grid">
        <div className="dc-card" style={{ marginTop: 0, marginBottom: 0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <h3 style={{ margin:0 }}>Upload Document</h3>
            <span className="sr-file-count-badge sr-file-count-badge--single">1 document only</span>
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
                  <button type="button" className="sr-uploaded-file-remove" onClick={() => removeFile(index)}>Remove</button>
                </div>
              ))}
              <button type="button" className="sr-change-file-btn" onClick={() => fileInputRef.current?.click()}>↻ Change file</button>
            </div>
          ) : (
            <div
              className={`dc-dropzone${scanning ? " disabled-zone" : ""}${isDragging ? " dc-dropzone--dragging" : ""}`}
              style={{ minHeight: 56 }}
              onClick={() => !scanning && fileInputRef.current?.click()}
              onDragEnter={onDragEnter}
              onDragLeave={onDragLeave}
              onDragOver={onDragOver}
              onDrop={onDrop}
            >
              <div className="dropzone-inner">
                <div className="dropzone-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 16l-4-4-4 4"/><path d="M12 12v7"/>
                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 4 16.3"/>
                  </svg>
                </div>
                <div className="dropzone-primary">{isDragging ? "Drop to upload" : "Drag & drop file here"}</div>
                <div className="dropzone-secondary">or click to browse</div>
              </div>
            </div>
          )}

          <div className="form-group" style={{ marginTop: 10, marginBottom: 10 }}>
            <label style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
              Enrich an existing template?
              <span style={{fontSize:11,fontWeight:400,color:"#9ca3af"}}>(optional)</span>
              <span
                title="Extracts configured fields plus discovers any new ones."
                style={{cursor:"help", color:"#9ca3af", fontSize:12, lineHeight:1}}
              >ⓘ</span>
            </label>
            <select value={extractTemplateId} onChange={(e) => setExtractTemplateId(e.target.value)}
              aria-label="Enrich existing template" title="Enrich existing template" style={{marginTop:4}}>
              <option value="">— None, discover freely —</option>
              {templates.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
            </select>
          </div>

          <div style={{ marginTop: 10, marginBottom: 4 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 6 }}>
              <h3 style={{ margin:0 }}>AI Insight Profiles</h3>
              {aiProfiles.length > 0 && (
                <span style={{ fontSize:11, color:"#6b7280" }}>{selectedProfiles.length} of {aiProfiles.length} selected</span>
              )}
            </div>
            {aiProfiles.length === 0 ? (
              <p className="aip-no-profiles" style={{ margin:0 }}>No AI Insight Profiles are configured yet.</p>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                {aiProfiles.map((profile) => {
                  const isSelected = selectedProfiles.includes(profile.id);
                  return (
                    <button key={profile.id} type="button"
                      className={`aip-profile-card${isSelected ? " aip-profile-card--on" : ""}`}
                      style={{ padding:"8px 11px" }}
                      onClick={() => isSelected
                        ? setSelectedProfiles(selectedProfiles.filter((id) => id !== profile.id))
                        : setSelectedProfiles([...selectedProfiles, profile.id])}>
                      <div className="aip-profile-card-header">
                        <span className="aip-profile-card-name">{profile.name}</span>
                        <div className={`aip-profile-card-radio${isSelected ? " aip-profile-card-radio--on" : ""}`} />
                      </div>
                      {profile.description && <div className="aip-profile-card-desc">{profile.description}</div>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ marginTop: 10 }}>
            <button className="primary-btn" onClick={() => runExtract()}
              disabled={scanning || uploadedFiles.length === 0 || (isTrial && runsUsed >= runLimit)}>
              {scanning ? "Scanning…" : "Scan Document"}
            </button>
            {isTrial && runsUsed >= runLimit && (
              <p style={{ fontSize:12, color:"#b91c1c", marginTop:8, marginBottom:0 }}>
                You have used all {runLimit} free runs for this month. Your allowance resets on the 1st of next month.
              </p>
            )}
            {error && <ErrorPanel message={error} />}
          </div>
        </div>
        <div className="dc-card guidance-card">
          <p className="guide-about">How it works</p>
          <p className="guide-about-desc">Upload any document — no template or setup required. The AI detects fields automatically.</p>
          <div className="guide-steps" style={{ marginBottom: 16 }}>
            <div className="guide-step"><div className="guide-step-num">1</div><div>Upload a document — optionally enrich from an existing template</div></div>
            <div className="guide-step"><div className="guide-step-num">2</div><div>Choose which AI Insight Profiles to run</div></div>
            <div className="guide-step"><div className="guide-step-num">3</div><div>AI detects all key attributes and values</div></div>
            <div className="guide-step"><div className="guide-step-num">4</div><div>Review results — save as a template when ready</div></div>
          </div>
          <div className="guide-divider">
            <p className="guide-section-title">Best for</p>
            <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, margin: 0 }}>
              Exploring a new document type, one-off extractions, or building a template from scratch.
            </p>
          </div>
        </div>
      </div>
      )}

      {/* ── UNIFIED CARD: needsTemplate modes (Summarise / Compare / Scoring) ── */}
      {needsTemplate && (
      <div className="top-grid">
      <div className="dc-card" style={{ padding: 0, overflow: "hidden", marginTop: 0, marginBottom: 0 }}>

        {/* Section 1: Insight Name */}
        <div style={{ padding:"12px 22px", borderBottom:"1px solid #f3f4f6" }}>
          <label htmlFor="insightName" style={{ fontSize:13, fontWeight:600, color:"#374151", display:"block", marginBottom:4, letterSpacing:"0.01em" }}>Insight Name</label>
          <input id="insightName" value={insightName}
            onChange={(e) => setInsightName(e.target.value)}
            placeholder="e.g. Contract Risk Review Q2 2026"
            style={{ margin:0, width:"100%", boxSizing:"border-box", height:38, fontSize:14 }}/>
        </div>

        {/* Section 2: Document Type + Template — stacked so long names display in full */}
        <div style={{ padding:"12px 22px", borderBottom:"1px solid #f3f4f6", display:"flex", flexDirection:"column", gap:10 }}>
          <div>
            <label htmlFor="documentType" style={{ fontSize:13, fontWeight:600, color:"#374151", display:"block", marginBottom:4, letterSpacing:"0.01em" }}>Document Type</label>
            <select id="documentType" value={selectedDocumentType} style={{ margin:0, width:"100%", height:38, fontSize:14 }}
              onChange={(e) => setSelectedDocumentType(e.target.value)}>
              <option value="">Select document type</option>
              {filteredDocumentTypes.map((dt) => (<option key={dt.id} value={dt.id}>{dt.name}</option>))}
            </select>
          </div>
          <div>
            <label htmlFor="reviewTemplate" style={{ fontSize:13, fontWeight:600, color:"#374151", display:"block", marginBottom:4, letterSpacing:"0.01em" }}>Review Template</label>
            <select id="reviewTemplate" value={selectedTemplate} style={{ margin:0, width:"100%", height:38, fontSize:14 }}
              onChange={(e) => setSelectedTemplate(e.target.value)} disabled={!selectedDocumentType}>
              <option value="">Select template</option>
              {templates.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
            </select>
          </div>
        </div>

        {/* Section 3: Upload */}
        <div style={{ padding:"12px 22px", borderBottom:"1px solid #f3f4f6" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
            <label style={{ fontSize:13, fontWeight:600, color:"#374151", margin:0, letterSpacing:"0.01em" }}>{isCompare ? "Upload Documents" : "Upload Document"}</label>
            {isCompare ? (
              <span className={`sr-file-count-badge${uploadedFiles.length >= 2 ? " sr-file-count-badge--ok" : ""}`}>{uploadedFiles.length} / 2 minimum</span>
            ) : (
              <span className="sr-file-count-badge sr-file-count-badge--single">1 document only</span>
            )}
          </div>
          {uploadedFiles.length > 0 ? (
            <div>
              {uploadedFiles.map((file, index) => (
                <div key={index} className="sr-uploaded-file-row" style={{ padding:"7px 10px" }}>
                  <div className="sr-uploaded-file-icon">📄</div>
                  <div className="sr-uploaded-file-info">
                    <div className="file-name">{file.name}</div>
                    <div className="file-size">{(file.size/1024/1024).toFixed(2)} MB</div>
                  </div>
                  <button type="button" className="sr-uploaded-file-remove" onClick={() => removeFile(index)}>Remove</button>
                </div>
              ))}
              {!isCompare && <button type="button" className="sr-change-file-btn" onClick={() => fileInputRef.current?.click()}>↻ Change file</button>}
              {isCompare && (
                <div
                  className={`dc-dropzone dc-dropzone--compact${isDragging ? " dc-dropzone--dragging" : ""}`}
                  onClick={() => !scanning && fileInputRef.current?.click()}
                  onDragEnter={onDragEnter}
                  onDragLeave={onDragLeave}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                >
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>
                    {isDragging ? "Drop to add" : "+ Drop more files or click to browse"}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div
              className={`dc-dropzone${scanning ? " disabled-zone" : ""}${isDragging ? " dc-dropzone--dragging" : ""}`}
              style={{ minHeight: 70 }}
              onClick={() => !scanning && fileInputRef.current?.click()}
              onDragEnter={onDragEnter}
              onDragLeave={onDragLeave}
              onDragOver={onDragOver}
              onDrop={onDrop}
            >
              <div className="dropzone-inner">
                <div className="dropzone-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 16l-4-4-4 4"/><path d="M12 12v7"/>
                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 4 16.3"/>
                  </svg>
                </div>
                <div className="dropzone-primary">{isDragging ? "Drop to upload" : "Drag & drop file here"}</div>
                <div className="dropzone-secondary">or click to browse</div>
              </div>
            </div>
          )}
          {isCompare && uploadedFiles.length > 0 && uploadedFiles.length < 2 && (
            <div className="sr-file-warning">At least 2 documents are required for this mode</div>
          )}
        </div>

        {/* Section 4: AI Insight Profiles */}
        <div style={{ padding:"12px 22px", borderBottom:"1px solid #f3f4f6" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: aiProfiles.length > 0 ? 8 : 0 }}>
            <label style={{ fontSize:13, fontWeight:600, color:"#374151", margin:0, letterSpacing:"0.01em" }}>AI Insight Profiles</label>
            {aiProfiles.length > 0 && (
              <span style={{ fontSize:11, color:"#6b7280" }}>{selectedProfiles.length} of {aiProfiles.length} selected</span>
            )}
          </div>
          {aiProfiles.length === 0 ? (
            <p className="aip-no-profiles" style={{ margin:0 }}>Select a template to load its configured profiles.</p>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
              {aiProfiles.map((profile) => {
                const isSelected = selectedProfiles.includes(profile.id);
                return (
                  <button key={profile.id} type="button"
                    className={`aip-profile-card${isSelected ? " aip-profile-card--on" : ""}`}
                    style={{ padding:"8px 11px" }}
                    onClick={() => isSelected
                      ? setSelectedProfiles(selectedProfiles.filter((id) => id !== profile.id))
                      : setSelectedProfiles([...selectedProfiles, profile.id])}>
                    <div className="aip-profile-card-header">
                      <span className="aip-profile-card-name">{profile.name}</span>
                      <div className={`aip-profile-card-radio${isSelected ? " aip-profile-card-radio--on" : ""}`} />
                    </div>
                    {profile.description && <div className="aip-profile-card-desc">{profile.description}</div>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 5: Action footer */}
        <div style={{ padding:"10px 22px", background:"#fafafa" }}>
          {error && <ErrorPanel message={error} />}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            {aiProfiles.length > 0 ? (
              <span style={{ fontSize:12, color:"#9ca3af" }}>
                {selectedProfiles.length} of {aiProfiles.length} profile{aiProfiles.length !== 1 ? "s" : ""} selected
              </span>
            ) : <span />}
            <div className="action-flow-horizontal" style={{ margin:0 }}>
              <button
                type="button"
                className="primary-btn"
                onClick={startAnalysis}
                disabled={
                  scanning ||
                  uploadedFiles.length === 0 ||
                  (isCompare && uploadedFiles.length < 2)
                }
                style={{ padding:"11px 28px", fontSize:15, letterSpacing:"0.01em" }}
              >
                Start Analysis →
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="dc-card guidance-card">
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
          <span className="guide-about" style={{ margin:0, fontSize:15 }}>{activeMeta.label}</span>
          <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:999, background:activeMeta.badgeBg, color:activeMeta.badgeColor }}>{activeMeta.badge}</span>
        </div>
        <p className="guide-about-desc" style={{ fontSize:13.5 }}>{activeMeta.description}</p>
        <div className="guide-steps" style={{ marginBottom: 16 }}>
          {mode === "summarise" && <>
            <div className="guide-step"><div className="guide-step-num">1</div><div>Select document type and template</div></div>
            <div className="guide-step"><div className="guide-step-num">2</div><div>Upload your document</div></div>
            <div className="guide-step"><div className="guide-step-num">3</div><div>AI extracts all template fields and writes a summary</div></div>
          </>}
          {mode === "compare" && <>
            <div className="guide-step"><div className="guide-step-num">1</div><div>Select document type and template</div></div>
            <div className="guide-step"><div className="guide-step-num">2</div><div>Upload two or more documents</div></div>
            <div className="guide-step"><div className="guide-step-num">3</div><div>AI extracts the same fields from all documents side by side</div></div>
          </>}
          {mode === "compare-scoring" && <>
            <div className="guide-step"><div className="guide-step-num">1</div><div>Select document type and template</div></div>
            <div className="guide-step"><div className="guide-step-num">2</div><div>Upload two or more documents and choose AI profiles</div></div>
            <div className="guide-step"><div className="guide-step-num">3</div><div>AI scores and ranks each document against your rules</div></div>
          </>}
        </div>
        <div className="guide-divider">
          <p className="guide-section-title">Requirements</p>
          <p style={{ fontSize:13, color:"#374151", margin:0 }}>{activeMeta.docCount}</p>
        </div>
        <div style={{ borderTop:"1px dashed #e5e7eb", marginTop:14, paddingTop:14 }}>
          <p className="guide-section-title" style={{ color:"#059669" }}>Tip</p>
          <p style={{ fontSize:12, color:"#6b7280", lineHeight:1.6, margin:0 }}>
            {(!isAdmin || isTrial)
              ? <>No template yet? Use <strong>Discovery</strong> to discover and build one, or contact your System Administrator.</>
              : <>No template yet? Go to <strong>Admin → Document Types</strong> to create one, then return here.</>
            }
          </p>
        </div>
      </div>
      </div>
      )}

      <input type="file" multiple={isCompare} hidden ref={fileInputRef}
        onChange={(e) => handleFiles(e.target.files)}/>

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
              ? ({"savemode":2,"classify":2,"confirm":3,"done":4} as Record<string,number>)[extractStage] ?? 2
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
              {/* Insight Name — pre-filled from the detected context, editable */}
              <div className="dc-card" style={{marginTop:12, padding:"12px 16px"}}>
                <label htmlFor="insightName" style={{ fontSize:12, fontWeight:600, color:"#374151", display:"block", marginBottom:4 }}>Insight Name</label>
                <input id="insightName" value={insightName}
                  onChange={(e) => setInsightName(e.target.value)}
                  placeholder="e.g. Contract Risk Review Q2 2026"
                  style={{ margin:0, width:"100%", boxSizing:"border-box", height:36, fontSize:14 }}/>
              </div>

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
                        disabled={scanning||rerunningWithContext||!confirmedContext.trim()}>
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
                  onAdd={()=>setExtractedAttributes(prev=>[...prev,{AttributeName:"",Description:"",dataType:"Text",category:"",SampleValue:"",enableAiInsight:false}])}
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
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setEnableAiInsight(checked);
                          setExtractedAttributes(prev => prev.map(a => ({ ...a, enableAiInsight: checked })));
                          setDiscoveredAttributes(prev => prev.map(a => ({ ...a, enableAiInsight: checked })));
                        }}
                        style={{width:14,height:14,marginTop:0}}/>
                      <span style={{fontWeight:500,lineHeight:"1"}}>Enable AI Insight for all</span>
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
                        const toTitle = (s:string) => s.split(" ").map((w:string)=>w.charAt(0).toUpperCase()+w.slice(1)).join(" ");
                        if(!templateName) setTemplateName(confirmedContext?`${toTitle(confirmedContext)} — Default Template`:`${toTitle(insightName)} — Default Template`);
                        if(!newDocTypeName&&confirmedContext) setNewDocTypeName(toTitle(confirmedContext));
                        setAppendToTemplate(false);
                        // Only ask new-vs-append when we actually enriched from an existing template
                        setExtractStage(enrichTemplate ? "savemode" : "classify");
                      }}
                      disabled={[...extractedAttributes,...discoveredAttributes].length===0}>
                      Save as Template ▶
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── STAGE: SAVE MODE (only reachable when enriched from an existing template) ── */}
          {extractStage === "savemode" && enrichTemplate && (() => {
            const newAttrs = getNewAttributesForAppend();
            return (
              <>
                <div className="dc-card">
                  <h3>How do you want to save this?</h3>
                  <p className="tbs-hint">
                    You enriched from <strong>{enrichTemplate.name}</strong>. Create a brand-new template, or add the newly-discovered fields straight onto it.
                  </p>

                  <div className="tbs-mode-toggle">
                    <button className={`tbs-mode-btn ${!appendToTemplate ? "tbs-mode-btn--active" : ""}`}
                      onClick={() => setAppendToTemplate(false)}>
                      <span>✦</span> Create a New Template
                    </button>
                    <button className={`tbs-mode-btn ${appendToTemplate ? "tbs-mode-btn--active" : ""}`}
                      onClick={() => setAppendToTemplate(true)}>
                      <span>⊕</span> Add to &ldquo;{enrichTemplate.name}&rdquo;
                    </button>
                  </div>

                  <div style={{marginTop: 14}}>
                    {!appendToTemplate ? (
                      <p style={{fontSize:13,color:"#6b7280",margin:0}}>
                        A new Document Type and Template will be created from all {extractedAttributes.length + discoveredAttributes.length} field{extractedAttributes.length + discoveredAttributes.length !== 1 ? "s" : ""} below.
                      </p>
                    ) : (
                      <p style={{fontSize:13,color:"#6b7280",margin:0}}>
                        <strong>{newAttrs.length}</strong> new field{newAttrs.length !== 1 ? "s" : ""} will be added to <strong>{enrichTemplate.name}</strong>. Fields already configured on that template stay untouched.
                        {newAttrs.length === 0 && (
                          <><br/><span style={{color:"#b91c1c"}}>No new fields were discovered, so there's nothing to add — choose &ldquo;Create a New Template&rdquo; instead, or go back and re-scan.</span></>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                <div className="dc-card tbs-action-card">
                  <div className="tbs-action-row">
                    <button className="primary-btn tbs-back-btn" onClick={() => setExtractStage("results")}>◀ Back</button>
                    <div className="tbs-flow-arrow">━━━▶</div>
                    <button className="primary-btn"
                      onClick={() => setExtractStage(appendToTemplate ? "confirm" : "classify")}
                      disabled={appendToTemplate && newAttrs.length === 0}>
                      Next: {appendToTemplate ? "Confirm" : "Classify"} ▶
                    </button>
                  </div>
                </div>
              </>
            );
          })()}

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
              appendToTemplateName={appendToTemplate ? enrichTemplate?.name : undefined}
              attributes={appendToTemplate ? getNewAttributesForAppend() : [...extractedAttributes, ...discoveredAttributes.map(a => ({
                ...a,
                dataType: a.dataType ?? (a.SuggestedDataType === "String" ? "Text" : (a.SuggestedDataType ?? "Text")),
                category: a.category ?? a.Category ?? "",
              }))]}
              categories={extractCategories as any}
              loading={extractSave.loading}
              status={extractSave.status}
              error={extractSave.error}
              // Editing (e.g. the per-field AI Insight toggle) is index-based against the full
              // extractedAttributes/discoveredAttributes arrays — the append view shows a filtered
              // subset, so indices wouldn't line up. Keep that view read-only instead.
              onUpdateAttribute={appendToTemplate ? undefined : (i, f, v) => {
                const all = [...extractedAttributes, ...discoveredAttributes.map(a => ({
                  ...a,
                  dataType: a.dataType ?? (a.SuggestedDataType === "String" ? "Text" : (a.SuggestedDataType ?? "Text")),
                  category: a.category ?? a.Category ?? "",
                }))];
                all[i] = { ...all[i], [f]: v };
                setExtractedAttributes(all.slice(0, extractedAttributes.length));
                setDiscoveredAttributes(all.slice(extractedAttributes.length));
              }}
              onBack={() => { extractSave.setError(""); setExtractStage(appendToTemplate ? "savemode" : "classify"); }}
              onSave={async () => {
                const ok = appendToTemplate
                  ? await extractSave.save({
                      classifyMode, selectedDocTypeId: enrichTemplate?.documentTypeId ?? "",
                      newDocTypeName, newDocTypeDesc, templateName, templateVersion,
                      attributes: getNewAttributesForAppend(), categories: extractCategories,
                      appendToTemplateId: enrichTemplate?.id,
                    })
                  : await extractSave.save({
                      classifyMode, selectedDocTypeId, newDocTypeName, newDocTypeDesc,
                      templateName, templateVersion,
                      attributes: [...extractedAttributes, ...discoveredAttributes.map(a => ({
                        ...a,
                        dataType: a.dataType ?? (a.SuggestedDataType === "String" ? "Text" : (a.SuggestedDataType ?? "Text")),
                        category: a.category ?? a.Category ?? "",
                      }))],
                      categories: extractCategories,
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
                <h3 className="tbs-done-title">
                  {appendToTemplate ? "New fields added!" : "Template saved successfully!"}
                </h3>
                <p className="tbs-done-sub">
                  {appendToTemplate ? (
                    <>
                      <strong>{getNewAttributesForAppend().length}</strong> new attribute{getNewAttributesForAppend().length !== 1 ? "s" : ""} {getNewAttributesForAppend().length !== 1 ? "have" : "has"} been added to <strong>{enrichTemplate?.name}</strong>.
                    </>
                  ) : (
                    <>Your document type, template and <strong>{extractedAttributes.length + discoveredAttributes.length}</strong> attribute{extractedAttributes.length + discoveredAttributes.length !== 1 ? "s" : ""} have been created.</>
                  )}
                </p>
                <div className="tbs-done-details">
                  {!appendToTemplate && classifyMode === "new" && (
                    <div className="tbs-done-row">
                      <span className="tbs-done-label">Document Type</span>
                      <span className="tbs-done-value">{newDocTypeName}</span>
                    </div>
                  )}
                  <div className="tbs-done-row">
                    <span className="tbs-done-label">Template</span>
                    <span className="tbs-done-value">{appendToTemplate ? enrichTemplate?.name : templateName}</span>
                  </div>
                  <div className="tbs-done-row">
                    <span className="tbs-done-label">{appendToTemplate ? "New Attributes" : "Attributes"}</span>
                    <span className="tbs-done-value">{appendToTemplate ? getNewAttributesForAppend().length : extractedAttributes.length + discoveredAttributes.length} fields</span>
                  </div>
                </div>
              </div>

              {/* Save as Insight prompt */}
              <div className="dc-card qe-insight-prompt">
                <div className="qe-insight-prompt-icon">💡</div>
                <div className="qe-insight-prompt-body">
                  <div className="qe-insight-prompt-title">Save this as an Insight?</div>
                  <div className="qe-insight-prompt-sub">
                    Run the AI extraction pipeline against <strong>{uploadedFiles[0]?.name}</strong> using your new template
                    {selectedProfiles.length > 0 && (
                      <> with <strong>{aiProfiles.filter(p => selectedProfiles.includes(p.id)).map(p => p.name).join(", ")}</strong></>
                    )}. The results will be saved as a full Insight with field highlighting.
                  </div>
                  {insightError && <ErrorPanel message={insightError} />}
                </div>
                <div className="qe-insight-prompt-actions">
                  <button
                    type="button"
                    className="primary-btn qe-insight-save-btn"
                    onClick={saveAsInsight}
                    disabled={scanning}
                  >
                    Yes, Save Insight →
                  </button>
                  <button
                    type="button"
                    className="primary-btn tbs-back-btn qe-insight-skip-btn"
                    onClick={() => navigate("/my-insights")}
                    disabled={scanning}
                  >
                    Skip
                  </button>
                </div>
              </div>

            </>
          )}
        </>
      )}


      {scanning && (
        <div className="page-loader-overlay">
          <div className={`sr-processing-card sr-processing-card--${mode}`}>
            <div className="sr-processing-mode-badge">
              {activeMeta.icon}
              {activeMeta.label}
            </div>

            {scanning ? (
              /* ── Multi-stage progress ── */
              <div style={{ width: "100%", marginTop: 4 }}>
                {/* Progress bar */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                      {scanStageIdx < SCAN_STAGES.length ? SCAN_STAGES[scanStageIdx] : "Complete!"}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>
                      {scanProgress}%
                    </span>
                  </div>
                  <div style={{ height: 7, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${scanProgress}%`,
                      background: "linear-gradient(90deg,#16a34a,#22c55e)",
                      borderRadius: 99,
                      transition: "width 0.4s ease",
                    }} />
                  </div>
                </div>

                {/* Stage list */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {SCAN_STAGES.map((stage, i) => {
                    const done    = i < scanStageIdx || scanProgress === 100;
                    const current = i === scanStageIdx && scanProgress < 100;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                          width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 700,
                          background: done ? "#dcfce7" : current ? "#f0fdf4" : "#f1f5f9",
                          border: `2px solid ${done ? "#22c55e" : current ? "#16a34a" : "#e2e8f0"}`,
                          color: done ? "#16a34a" : current ? "#16a34a" : "#94a3b8",
                        }}>
                          {done ? "✓" : current ? "⟳" : "○"}
                        </div>
                        <span style={{
                          fontSize: 13,
                          fontWeight: current ? 600 : 400,
                          color: done ? "#16a34a" : current ? "#0f172a" : "#94a3b8",
                        }}>
                          {stage}
                          {current && (
                            <span style={{ color: "#16a34a" }}>
                              {"·".repeat(Math.floor(Date.now() / 500) % 4 + 1)}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* ── Simple spinner (Quick Extract / other flows) ── */
              <>
                <div className="sr-processing-spinner" />
                <div className="sr-processing-title">{status || "Processing…"}</div>
                <div className="sr-processing-hint">This may take a moment</div>
              </>
            )}
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
        .file-name { font-size: 13px; font-weight: 500; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .file-size { font-size: 11px; color: #9ca3af; margin-top: 1px; }
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
          background: #F97316;
          color: white;
        }
        .sr-context-btn--confirm:hover { background: #EA580C; }
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
          background: linear-gradient(145deg, #F97316, #EA580C);
          box-shadow: 0 4px 12px rgba(250,70,22,0.3);
        }

        /* ── SAVE AS TEMPLATE BUTTON ── */
        .sr-save-template-btn {
          margin-top: 0 !important;
          background: linear-gradient(145deg, #F97316, #EA580C) !important;
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
          background: linear-gradient(145deg, #F97316, #EA580C);
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
          border-left: 4px solid #F97316;
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
          background: linear-gradient(145deg, #F97316, #EA580C) !important;
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
