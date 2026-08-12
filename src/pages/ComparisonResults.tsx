import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { getAccessToken } from "../services/tokenHelper";
import { getAppConfig } from "../appConfig";
import AiInsightsSection from "../components/AiInsightsSection";
import { useNavigate } from "react-router-dom";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { LayoutDashboard, FileText, Sparkles, ChevronDown, Download, BarChart2, Search, X } from "lucide-react";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import ChatTab from "../components/ChatTab";
import { configApi, triggerLoginRedirect } from "../services/configApi";
import PageLoading from "../components/PageLoading";
import { useUser } from "../context/UserContext";


pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

//const API_BASE = "https://hollis-document-comparison-hzhddjeuayebdwbf.uksouth-01.azurewebsites.net";

/* =====================================================
   Interfaces
===================================================== */

const getApiBase = () => getAppConfig().apiBase.replace(/\/api\/?$/, "");


interface Candidate {
  id: string;
  label: string;
  totalScore: number;
  isWinner: boolean;
}

interface AttributeValue {
  attributeId: string;
  attributeName: string;
  riskLevel?: string;   // ✅ ADD THIS
  values: {
    candidateId: string;
    value: string;
    attributeAiInsight?: string;
    coordinates?: any;
    pageNumber?: number;
     // ✅ ADD THIS
    confidenceScore?: number;
  }[];
}

interface Evaluation {
  evaluationId: string;
  candidateId: string;

  attributeName?: string;
  attributeId?: string;

  advisoryText?: string;

  severity?: string;
  riskLevel?: string;

  severityColor?: string;

  score: number;
  isWinner: boolean;

  confidence?: number;
}

/* =====================================================
   ADDED: AI Insight Records (Comparison Run Insight)
===================================================== */

interface AiInsightRecord {
  id: string;
  profileId?: string;
  profileName: string;
  executionTime?: number;
  aiSummaryJsonOutput: any;
}

interface NormalisedAiInsight {
  executiveSummary?: string;
  keyInsights?: any[];
  confidenceLevel?: any;
}

function getRiskLevelClass(risk?: string): string {
  if (!risk) return "badge-info";

  switch (risk.toLowerCase()) {
    case "high":
      return "badge-risk-high";
    case "medium":
      return "badge-risk-medium";
    case "low":
      return "badge-risk-low";
    default:
      return "badge-info";
  }
}

function normalizeText(value?: string) {
  if (!value) return "";

  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isEmptyValue(value?: string) {
  if (!value) return true;

  const v = value.toLowerCase().trim();

  return (
    v === "not found" ||
    v === "-" ||
    v === "—" ||
    v === ""
  );
}

function getWinner(_attributeName: string, left?: string, right?: string) {
  const leftEmpty = isEmptyValue(left);
  const rightEmpty = isEmptyValue(right);

  const leftNorm = normalizeText(left);
  const rightNorm = normalizeText(right);

  if (leftNorm === rightNorm) return null;

  if (!leftEmpty && rightEmpty) return "left";
  if (!rightEmpty && leftEmpty) return "right";

  const leftNum = Number(left?.replace(/[^\d.]/g, ""));
  const rightNum = Number(right?.replace(/[^\d.]/g, ""));

  if (!isNaN(leftNum) && !isNaN(rightNum)) {
    if (leftNum < rightNum) return "left";
    if (rightNum < leftNum) return "right";
  }

  const leftDate = parseDate(left);
  const rightDate = parseDate(right);

  if (leftDate !== null && rightDate !== null) {
    if (leftDate < rightDate) return "left";
    if (rightDate < leftDate) return "right";
  }

  return null;
}

function parseDate(value?: string): number | null {
  if (!value) return null;

  const parsed = new Date(value);
  if (!isNaN(parsed.getTime())) return parsed.getTime();

  return null;
}

function safeParseInsight(jsonString: unknown): any {
  try {
    if (!jsonString) return null;

    if (typeof jsonString === "object") return jsonString;

    if (typeof jsonString === "string") {
      const cleaned = jsonString
        .replace(/\r\n/g, " ")
        .replace(/\n/g, " ")
        .replace(/\r/g, " ")
        .replace(/\\n/g, " ")
        .trim();

      const parsed = JSON.parse(cleaned);

      return {
        title: parsed.title || parsed.summary || "",
        description: parsed.description || parsed.explanation || "",
        impact: parsed.impact || parsed.risk || ""
      };
    }

    return null;
  } catch {
    return null;
  }
}

function hasValidAiInsight(attr: AttributeValue) {
  return attr.values?.some(v => {
    if (!v.attributeAiInsight) return false;

    const text = v.attributeAiInsight.trim();

    if (!text || text === "Not Found") return false;

    try {
      const parsed = safeParseInsight(text);

      // ✅ Only valid if meaningful fields exist
      return (
        parsed &&
        (parsed.title || parsed.description || parsed.impact)
      );
    } catch {
      return false;
    }
  });
}

export default function ComparisonResults() {
  const { runId } = useParams();
  const { instance, accounts } = useMsal();
  const { isTrial } = useUser();

  const [mode, setMode] = useState<"Compare" | "Scoring" | "Summarise">("Compare");
  const [runName, setRunName] = useState<string>("");
  const [comparisonName, setComparisonName] = useState<string>("");
  const [documentTypeName, setDocumentTypeName] = useState<string>("");
  const [templateName, setTemplateName] = useState<string>("");
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [attributes, setAttributes] = useState<AttributeValue[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [runMeta, setRunMeta] = useState<{
  createdBy?: string;
  createdOn?: string;
} | null>(null);
  // summary state removed — Overview is driven by insightRows from getRunInsights
  const [loading, setLoading] = useState(true);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [expandedAttributes, setExpandedAttributes] = useState<string[]>([]);
  const [expandedAiAttributes, setExpandedAiAttributes] = useState<string[]>([]);
  const [attrSearch, setAttrSearch] = useState("");
  const [error, setError] = useState("");


  const navigate = useNavigate();


  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);

  const [numPages, setNumPages] = useState(0);

  const [highlight, setHighlight] = useState<any>(null);

  const pdfRef = useRef<HTMLDivElement>(null);

  const [pageSizes, setPageSizes] = useState<Record<number, { width: number; height: number }>>({});


  const [documents, setDocuments] = useState<{ id: string; name: string; url: string }[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const [selectedAttribute, setSelectedAttribute] = useState<any>(null);

  const pdfContainerRef = useRef<HTMLDivElement | null>(null);
  const splitPaneContainerRef = useRef<HTMLDivElement>(null);
  const [pdfWidth, setPdfWidth] = useState<number>(600);

  const [chatMessages, setChatMessages] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);


 const [activeTab, setActiveTab] = useState<"summary" | "fields" | "scoring" | "ai" | "chat">("summary");

 const [expandedScoreRow, setExpandedScoreRow] = useState<string | null>(null);

  const [selectedAttrId, setSelectedAttrId] = useState<string | null>(null);
  const [connectorData, setConnectorData] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const computeConnector = useCallback(() => {
    if (!splitPaneContainerRef.current) { setConnectorData(null); return; }
    const container = splitPaneContainerRef.current;
    const containerRect = container.getBoundingClientRect();
    const cardEl = container.querySelector(".attr-card.selected") as HTMLElement | null;
    const highlightEl = container.querySelector(".pdf-highlight-overlay") as HTMLElement | null;
    if (!cardEl || !highlightEl) { setConnectorData(null); return; }
    const cardRect = cardEl.getBoundingClientRect();
    const highlightRect = highlightEl.getBoundingClientRect();
    const x1 = cardRect.right - containerRect.left;
    const y1 = Math.max(0, Math.min(cardRect.top + cardRect.height / 2 - containerRect.top, containerRect.height));
    const x2 = highlightRect.left - containerRect.left;
    const y2 = Math.max(0, Math.min(highlightRect.top + highlightRect.height / 2 - containerRect.top, containerRect.height));
    setConnectorData({ x1, y1, x2, y2 });
  }, []);

 const handleExportPdf = async () => {
  if (!runId) return;
  setExportError("");
  try {
    setPdfExporting(true);
    const { blob, filename } = await configApi.exportComparisonPdf(runId);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err: any) {
    console.error(err);
    if (err?.response?.status === 403) {
      setExportError("PDF export is not available on trial accounts. Please upgrade to export reports.");
    } else {
      setExportError("PDF export failed. Please try again, or contact support if this persists.");
    }
  } finally {
    setPdfExporting(false);
  }
};

  const handleAttributeClick = (attr: any) => {

      setSelectedAttribute(attr);
      setSelectedAttrId(attr.attributeId);

      // Prefer the value whose document matches the currently visible PDF
      let valueWithCoords = attr.values.find(
          (v: any) =>
            v.documentId === selectedDocId &&
            (v.coordinates || v.Coordinates)
        );

        // Fall back to the first value that has coordinates
        if (!valueWithCoords) {
          valueWithCoords = attr.values.find(
            (v: any) => v.coordinates || v.Coordinates
          );
        }

        // No coordinates available — clear any previous highlight and stop
        if (!valueWithCoords) {
          setHighlight(null);
          return;
        }

        // Switch to the document that owns the coordinates
        if (valueWithCoords?.documentId && valueWithCoords.documentId !== selectedDocId) {
              const targetDoc = documents.find(
                (d) => d.id === valueWithCoords.documentId
              );

              if (targetDoc) {
                setSelectedDocId(targetDoc.id);
                setPdfUrl(targetDoc.url);
              }
            }

        try {
          const rawCoords = valueWithCoords.coordinates ?? valueWithCoords.Coordinates;

          const coords =
            typeof rawCoords === "string"
              ? JSON.parse(rawCoords)
              : rawCoords;

          const page =
            valueWithCoords.pageNumber ??
            valueWithCoords.PageNumber ??
            1;

          console.log("📄 PAGE:", page);    
          console.log("📍 COORDS:", coords);

          // ✅ SET BOTH
          setPageNumber(page); // keep this
          setHighlight({ coords, page }); // keep as-is

          setTimeout(() => {
            const el = document.getElementById(`pdf-page-${page}`);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }, 150);

        } catch (err) {
          console.error("Failed to parse coordinates", err);
        }
      };


  const handleAttributeRowClick = (attr: any, candidateId: string | null, documentId?: string, valueIndex?: number) => {

    setSelectedAttribute(attr);
    setSelectedAttrId(attr.attributeId);

    // Resolve the specific value: prefer ID match, fall back to index
    const valueByDoc = documentId ? attr.values.find((v: any) => v.documentId === documentId) : null;
    const valueByCand = !valueByDoc && candidateId ? attr.values.find((v: any) => v.candidateId === candidateId) : null;
    const resolvedValue = valueByDoc ?? valueByCand ?? (valueIndex !== undefined ? attr.values[valueIndex] : null);
    const resolvedDocId = documentId ?? resolvedValue?.documentId;

    // Find document: direct ID → name-match via candidate → index fallback
    const candidate = candidateId ? candidates.find(c => c.id === candidateId) : null;
    const targetDoc = documents.find(d => d.id === resolvedDocId)
      || documents.find(d => d.name?.toLowerCase() === candidate?.label?.toLowerCase())
      || (valueIndex !== undefined ? documents[valueIndex] : null);

    if (targetDoc) {
      setSelectedDocId(targetDoc.id);
      setPdfUrl(targetDoc.url);
    }

    // Find the value that has coordinates — same resolution order as above
    const valueWithCoords = (() => {
      if (documentId) {
        const v = attr.values.find((v: any) => v.documentId === documentId && (v.coordinates || v.Coordinates));
        if (v) return v;
      }
      if (candidateId !== undefined) {
        const v = attr.values.find((v: any) => v.candidateId === candidateId && (v.coordinates || v.Coordinates));
        if (v) return v;
      }
      if (valueIndex !== undefined) {
        const v = attr.values[valueIndex];
        if (v?.coordinates || v?.Coordinates) return v;
      }
      return null;
    })();

    if (!valueWithCoords) {
      setHighlight(null);
      return;
    }

    try {
      const rawCoords = valueWithCoords.coordinates ?? valueWithCoords.Coordinates;

      const coords =
        typeof rawCoords === "string"
          ? JSON.parse(rawCoords)
          : rawCoords;

      const page =
        valueWithCoords.pageNumber ??
        valueWithCoords.PageNumber ??
        1;

      // 🔥 CRITICAL FIX: delay highlight until PDF loads
      setTimeout(() => {
        setPageNumber(page);
        setHighlight({ coords, page });

        const el = document.getElementById(`pdf-page-${page}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 250); // 🔥 slightly longer delay

    } catch (err) {
      console.error("Highlight failed", err);
    }
  };

  /* =====================================================
     ADDED: Insights State
  ===================================================== */

  const [insightRows, setInsightRows] = useState<AiInsightRecord[]>([]);
  const [selectedInsightProfileName, setSelectedInsightProfileName] =
    useState<string>("");

  const toggleAttribute = (attributeId: string) => {
    setExpandedAttributes((prev) =>
      prev.includes(attributeId)
        ? prev.filter((id) => id !== attributeId)
        : [...prev, attributeId]
    );
  };

  const toggleAiAttribute = (attributeId: string) => {
  setExpandedAiAttributes((prev) =>
    prev.includes(attributeId)
      ? prev.filter((id) => id !== attributeId)
      : [...prev, attributeId]
  );
};

  /* =====================================================
     ADDED: Helpers for Insight JSON parsing
  ===================================================== */

  const safeJsonParse = (value: any) => {
    if (!value) return null;
    if (typeof value === "object") return value;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return null;
  };

  const normaliseInsightJson = (json: any): NormalisedAiInsight | null => {
    const parsed = safeJsonParse(json);
    if (!parsed) return null;

    const executiveSummary =
      parsed.executiveSummary ?? parsed.ExecutiveSummary ?? "";
    const keyInsights = parsed.keyInsights ?? parsed.KeyInsights ?? [];
    const confidenceLevel =
      parsed.confidenceLevel ?? parsed.ConfidenceLevel ?? "";

    return { executiveSummary, keyInsights, confidenceLevel };
  };



const sendChatQuestion = async () => {
  if (!chatInput.trim()) return;

  const question = chatInput;

  // Add user message
  setChatMessages(prev => [...prev, { role: "user", text: question }]);
  setChatInput("");
  setChatLoading(true);

  try {
    const token = await getAccessToken(instance, accounts[0]);
    if (!token) return;

    const res = await fetch(`${getApiBase()}/api/AskRunQuestion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        runId: runId,
        question: question
      })
    });

    const data = await res.json();

    const answer =
      typeof data.answer === "string"
        ? JSON.stringify(JSON.parse(data.answer), null, 2)
        : JSON.stringify(data.answer, null, 2);

    setChatMessages(prev => [...prev, { role: "ai", text: answer }]);

  } catch (err) {
    console.error(err);
    setChatMessages(prev => [...prev, { role: "ai", text: "Error getting response." }]);
  } finally {
    setChatLoading(false);
  }
};


  /* =====================================================
     Load Results
  ===================================================== */

  useEffect(() => {
    if (!runId || !accounts.length) return;

    const loadResults = async () => {
      try {
        setLoading(true);
        setError("");

        const tokenStr = await getAccessToken(instance, accounts[0]);
        if (!tokenStr) return;

        const response = await fetch(
          `${getApiBase()}/api/GetComparisonRunResults?comparisonRunId=${runId}`,
          {
            headers: {
              Authorization: `Bearer ${tokenStr}`,
            },
          }
        );

        
        if (response.status === 401) {
          triggerLoginRedirect();
          return;
        }
        if (!response.ok) {
          throw new Error(await response.text());
        }

        const raw = await response.json();

        /* ============================
          🔥 ADD DOCUMENTS MAPPING HERE
        ============================ */
        const docs = (raw.Documents ?? []).map((d: any) => ({
          id: d.Id,
          name: d.Name || d.FileName || "Document",
          url: d.DocumentUrl || d.documentUrl
        }));

        setDocuments(docs);

        /* ============================
          SET DEFAULT PDF
        ============================ */
        if (docs.length > 0) {
          setSelectedDocId(docs[0].id);
          setPdfUrl(docs[0].url);
        } else {
          setPdfUrl(null);
        }

        console.log("Resolved Documents:", docs);

        setComparisonName(raw.InsightName || "");
        setDocumentTypeName(raw.DocumentTypeName || "");
        setTemplateName(raw.TemplateName || "");
        if (raw.SuggestedPrompts) {
          setSuggestedPrompts(
            (raw.SuggestedPrompts as string)
              .split("\n")
              .map((p: string) => p.trim())
              .filter((p: string) => p.length > 0)
          );
        }

        console.log("RAW RESPONSE:", raw);
        console.log("SummaryJson:", raw.SummaryJson);
        console.log("typeof SummaryJson:", typeof raw.SummaryJson);
        console.log("RAW ATTRIBUTES:", raw.Attributes);
        console.log("RAW ATTRIBUTES COUNT:", raw.Attributes?.length);

        const data = {
          runId: raw.RunId,
          mode: raw.Mode,

          candidates: (raw.Candidates ?? []).map((c: any) => ({
            id: c.Id,
            label: c.Label,
            totalScore: c.TotalScore,
            isWinner: c.IsWinner,
          })),

          attributes: (raw.Attributes ?? []).map((a: any) => ({
            attributeId: a.AttributeId,
            attributeName: a.AttributeName,
            riskLevel: a.RiskLevel,
           values: (a.Values ?? []).map((v: any) => ({
          candidateId: v.CandidateId,
          documentId: v.DocumentId,
          value: v.Value,
          attributeAiInsight: v.AttributeAiInsight,
          coordinates: v.Coordinates,
          pageNumber: v.PageNumber,
          confidenceScore: v.ConfidenceScore
        }))
          })),

          evaluations: (raw.Evaluations ?? []).map((e: any) => ({
            candidateId: e.CandidateId,
            score: e.Score,
            isWinner: e.IsWinner,
            evaluationId: e.EvaluationId,

            attributeId: e.AttributeId,
            attributeName: e.AttributeName,

            advisoryText: e.AdvisoryText,
            severity: e.Severity,
            riskLevel: e.RiskLevel,

            severityColor: e.SeverityColor,
            confidence: e.Confidence,
          })),

          summaryJson: raw.SummaryJson ?? null,
        };

        setRunMeta({
          createdBy: raw.CreatedBy,
          createdOn: raw.CreatedOn,
        });
        setRunName(raw.RunName ?? "");

        setMode(
          data.mode === "Summarise" || data.mode === 857270001
            ? "Summarise"
            : data.candidates.length > 0
              ? "Scoring"
              : "Compare"
        );

        setCandidates(data.candidates);
        setAttributes(data.attributes);
        setEvaluations(data.evaluations);

        // summaryJson was previously used for the overview; now handled via getRunInsights below

        try {
            const insightRaw = await configApi.getRunInsights(runId);

            console.log("INSIGHT RAW:", insightRaw);

            const rows: AiInsightRecord[] = (insightRaw ?? []).map((r: any) => ({
            id: r.insightId,
            profileId: r.profileId,
            profileName: r.profileName,
            executionTime: r.executionTime,
            aiSummaryJsonOutput: r.output,
          }));           
          
            setInsightRows(rows);

            if (!selectedInsightProfileName && rows.length > 0) {
              setSelectedInsightProfileName(rows[0].profileName);
            }
          } 
        catch (insErr) {
          console.warn("Failed to load AI insight rows:", insErr);
        }
      } catch (err: any) {
        console.error(err);
        const msg = err?.message ?? "";
        if (msg.includes("401") || msg.toLowerCase().includes("unauthorized")) {
          triggerLoginRedirect();
        } else {
          setError("Unable to load comparison results.");
        }
      } finally {
        setLoading(false);
      }
    };

    loadResults();
  }, [runId, accounts, instance]);



  useEffect(() => {
      if (!selectedAttribute || !selectedDocId) return;

      // 🔁 re-run highlight logic — match by documentId (the document GUID)
      const valueWithCoords = selectedAttribute.values.find(
        (v: any) =>
          v.documentId === selectedDocId &&
          (v.coordinates || v.Coordinates)
      );

      if (!valueWithCoords) {
        setHighlight(null);
        return;
      }

      try {
        const rawCoords = valueWithCoords.coordinates ?? valueWithCoords.Coordinates;

        const coords =
          typeof rawCoords === "string"
            ? JSON.parse(rawCoords)
            : rawCoords;

        const page =
          valueWithCoords.pageNumber ??
          valueWithCoords.PageNumber ??
          1;

        setPageNumber(page);
        setHighlight({ coords, page });

      } catch (err) {
        console.error("Highlight re-run failed", err);
      }

    }, [selectedDocId]); // 🔥 THIS IS THE KEY





    useEffect(() => {
      if (activeTab !== "fields" || !pdfContainerRef.current) return;

      const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
          setPdfWidth((entry.target as HTMLElement).offsetWidth);
        }
      });

      observer.observe(pdfContainerRef.current);
      return () => observer.disconnect();
}, [activeTab]);

  useEffect(() => {
    if (!selectedAttrId || !highlight || activeTab !== "fields") { setConnectorData(null); return; }
    const timer = setTimeout(computeConnector, 400);
    return () => clearTimeout(timer);
  }, [selectedAttrId, highlight, pageNumber, activeTab, computeConnector]);

  // Scroll the layout content container to top once results finish loading
  useEffect(() => {
    if (!loading && attributes.length > 0) {
      const el = document.querySelector(".content") as HTMLElement | null;
      if (el) el.scrollTop = 0;
    }
  }, [loading]);


  /* =====================================================
     Helpers
  ===================================================== */

  const sortedCandidates = [...candidates].sort(
    (a, b) => b.totalScore - a.totalScore
  );

  const formatValue = (attributeName: string, value?: string): string => {
    if (!value) return "-";
    const numeric = Number(value);
    if (!isNaN(numeric) && attributeName.toLowerCase().includes("price")) {
      return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 0 }).format(numeric);
    }
    if (!isNaN(numeric)) return new Intl.NumberFormat("en-GB").format(numeric);
    return value;
  };

  const shortDocName = (name: string, max = 28): string => {
    if (!name) return "Document";
    const noExt = name.replace(/\.[^.]+$/, "");
    if (noExt.length <= max) return noExt;
    return noExt.slice(0, max - 1) + "…";
  };

  // Renders a value as a bulleted list when it's a JSON array, otherwise plain text.
  const FormatValue = ({ name, value }: { name: string; value?: string }) => {
    if (!value) return <span>—</span>;
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return (
          <ul style={{ margin: "4px 0 0 0", paddingLeft: 16, display: "flex", flexDirection: "column", gap: 2 }}>
            {parsed.map((item, i) => (
              <li key={i} style={{ fontSize: "inherit", lineHeight: 1.5 }}>{String(item)}</li>
            ))}
          </ul>
        );
      }
    } catch {}
    return <span>{formatValue(name, value)}</span>;
  };



  const getEvaluationForAttributeCandidate = (
    attribute: AttributeValue,
    candidateId: string
  ) => {
    return evaluations.find(
      (e) =>
        e.candidateId === candidateId &&
        (
          (e.attributeId && e.attributeId === attribute.attributeId) ||
          (e.attributeName && e.attributeName === attribute.attributeName)
        )
    );
  };

  const getCompareWinnerForCandidate = (
    attribute: AttributeValue,
    candidateId: string
  ) => {
    const evaluationMatch = getEvaluationForAttributeCandidate(attribute, candidateId);
    if (evaluationMatch?.isWinner) return true;

    if (candidates.length === 2) {
      const leftCandidate = candidates[0];
      const rightCandidate = candidates[1];

      const leftValue = attribute.values.find(v => v.candidateId === leftCandidate?.id)?.value;
      const rightValue = attribute.values.find(v => v.candidateId === rightCandidate?.id)?.value;

      const winner = getWinner(attribute.attributeName, leftValue, rightValue);

      return (
        (winner === "left" && candidateId === leftCandidate?.id) ||
        (winner === "right" && candidateId === rightCandidate?.id)
      );
    }

    return false;
  };

  if (loading) return <PageLoading title="Loading results…" hint="Fetching your comparison data" />;
  if (error) return <PageLoading error={error} />;

  /* =====================================================
     ADDED: Selected insight row + parsed insight json
  ===================================================== */


  const selectedInsightRow =
  insightRows.find(r => r.profileName === selectedInsightProfileName) || null;

  const selectedInsight = selectedInsightRow
  ? normaliseInsightJson(selectedInsightRow.aiSummaryJsonOutput)
  : null;

    console.log("Selected Insight Row:", selectedInsightRow);
    console.log("Selected Insight Parsed:", selectedInsight);


const pdfViewer = pdfUrl ? (
  <div
    style={{
      height: "100%",
      overflow: "visible",   // ✅ FIX
      border: "none",        // ✅ IMPORTANT (avoid double border)
      background: "#fafafa",
      padding: "12px 8px 12px 12px"
    }}
  >
    <div
  ref={pdfRef}
  style={{
    position: "relative",
    width: "100%"
  }}
>

      <Document
        file={pdfUrl}
        onLoadSuccess={(pdf) => {
          console.log("PDF loaded:", pdf);
          setNumPages(pdf.numPages);
        }}
        onLoadError={(err) => console.error("PDF load error:", err)}
        loading={<div className="pdf-loading-placeholder">Loading PDF…</div>}
        error={<div className="pdf-loading-placeholder pdf-loading-placeholder--error">Failed to load PDF</div>}
      >
      

        {Array.from(new Array(numPages), (_, index) => {
          const currentPage = index + 1;

          return (
            <div
              key={`page_${currentPage}`}
              id={`pdf-page-${currentPage}`}
              style={{ position: "relative", marginBottom: 16 }}
            >
              <Page
                pageNumber={currentPage}
                width={pdfWidth - 12}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                onLoadSuccess={(page: any) => {
                  // getViewport({scale:1}) is the PDF.js canonical source for natural page
                  // dimensions in PDF points (72 pt = 1 in). page.width alone can return
                  // view[2] (raw xMax) instead of the true width (xMax - xMin), or may
                  // reflect rendered CSS pixels in some react-pdf versions.
                  const vp = page.getViewport?.({ scale: 1 });
                  const natW = vp ? vp.width  : page.view ? page.view[2] - (page.view[0] || 0) : page.width;
                  const natH = vp ? vp.height : page.view ? page.view[3] - (page.view[1] || 0) : page.height;
                  setPageSizes(prev => ({
                    ...prev,
                    [currentPage]: { width: natW, height: natH }
                  }));
              }}
                              />

              
              {highlight &&
                  highlight.page === currentPage &&
                  pageSizes[currentPage] &&
                  (() => {

                    const coords = highlight.coords;

                    if (!coords || coords.length < 8) return null;

                    const xs = [coords[0], coords[2], coords[4], coords[6]];
                    const ys = [coords[1], coords[3], coords[5], coords[7]];

                    const minX = Math.min(...xs);
                    const maxX = Math.max(...xs);
                    const minY = Math.min(...ys);
                    const maxY = Math.max(...ys);

                    // Natural page size in PDF points (from getViewport — 72 pt = 1 inch).
                    // Azure DI polygon coords for PDFs are in inches from the top-left.
                    // pxPerInch = 72 * (renderedPx / naturalPts) = renderedPx / naturalInches
                    const renderedWidth = pdfWidth - 12;
                    const natW = pageSizes[currentPage].width;   // pts
                    const natH = pageSizes[currentPage].height;  // pts
                    const pxPerInchX = 72 * (renderedWidth / natW);
                    const pxPerInchY = 72 * (renderedWidth / natW); // same uniform scale
                    const padTop = 0.22;  // extra clearance above first line
                    const pad    = 0.15;  // left / right / bottom

                    console.log(
                      `[Highlight pg${currentPage}] coords:`, coords.map((v: number) => v.toFixed(3)),
                      `| natW(pts): ${natW.toFixed(0)} natH(pts): ${natH.toFixed(0)}`,
                      `| renderedWidth(px): ${renderedWidth}`,
                      `| pxPerInch: ${pxPerInchX.toFixed(1)}`,
                      `| box: left=${((minX - pad) * pxPerInchX).toFixed(0)} top=${((minY - padTop) * pxPerInchY).toFixed(0)} w=${((maxX - minX + pad * 2) * pxPerInchX).toFixed(0)} h=${((maxY - minY + padTop + pad) * pxPerInchY).toFixed(0)}`
                    );

                    return (
                      <div
                        className="pdf-highlight-overlay"
                        style={{
                          position: "absolute",
                          left:   (minX - pad)           * pxPerInchX,
                          top:    (minY - padTop)         * pxPerInchY,
                          width:  (maxX - minX + pad * 2) * pxPerInchX,
                          height: (maxY - minY + padTop + pad) * pxPerInchY,
                        }}
                      />
                    );
                  })()}




            </div>
          );
        })}




      </Document>



    </div>
  </div>
) : null;

    


















  /* =====================================================
     OVERVIEW STATS (Summarise mode)
  ===================================================== */

  const PROFILE_COLORS = ["#7c3aed", "#ef4444", "#f97316", "#3b82f6", "#10b981", "#6b7280"];

  const allParsedInsights = insightRows
    .map(r => normaliseInsightJson(r.aiSummaryJsonOutput))
    .filter((i): i is NormalisedAiInsight => i !== null);
  const allKeyInsights = allParsedInsights.flatMap(i => i.keyInsights ?? []);
  const totalFindings = allKeyInsights.length;
  const findingsHigh   = allKeyInsights.filter(k => (k?.Impact ?? k?.impact ?? "").toLowerCase() === "high").length;
  const findingsMedium = allKeyInsights.filter(k => (k?.Impact ?? k?.impact ?? "").toLowerCase() === "medium").length;
  const findingsLow    = allKeyInsights.filter(k => (k?.Impact ?? k?.impact ?? "").toLowerCase() === "low").length;
  const filteredAttributes = attrSearch.trim()
    ? attributes.filter(a => a.attributeName.toLowerCase().includes(attrSearch.toLowerCase()))
    : attributes;

  const totalFields    = attributes.length;
  const extractedFields = attributes.filter(a =>
    a.values.some((v: any) => v.value && v.value.trim() !== "" && v.value !== "-")
  ).length;
  const allConfScores = attributes.flatMap(a =>
    a.values.map((v: any) => v.confidenceScore).filter((s: any) => s != null && !isNaN(Number(s)))
  ) as number[];
  const avgConfidence = allConfScores.length > 0
    ? Math.round((allConfScores.reduce((sum, s) => sum + s, 0) / allConfScores.length) * 100)
    : null;

  /* =====================================================
     SUMMARISE MODE
  ===================================================== */

  if (mode === "Summarise") {
    return (
      <>
      <div className="results-container">        

      <PageBreadcrumb
        items={[
          { label: "Back", onClick: () => navigate(-1) },
          { label: "Summarise Results" },
        ]}
        actions={
          <button type="button" className="btn btn-secondary" onClick={handleExportPdf}
            title={isTrial ? "PDF export is not available on trial accounts" : "Export to PDF"}
            disabled={isTrial}>
            <Download size={15} />
            <span>Download PDF</span>
          </button>
        }
      />

      {exportError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 14px", marginBottom: 12, fontSize: 13, color: "#b91c1c", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{exportError}</span>
          <button onClick={() => setExportError("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#b91c1c", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      <div className="comparison-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span className="mode-pill mode-pill-summarise">{mode}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{comparisonName || "Untitled Run"}</span>
          </div>
              <div className="header-meta">
            {[documentTypeName || null, templateName || null].filter(Boolean).map((item, i, arr) => (
              <React.Fragment key={i}>
                <span style={{ whiteSpace: "nowrap" }}>{item}</span>
                {i < arr.length - 1 && <span className="header-meta-sep">·</span>}
              </React.Fragment>
            ))}
          </div>
          {(runMeta?.createdBy || runMeta?.createdOn) && (
            <div className="header-meta" style={{ marginTop: 2 }}>
              {runMeta?.createdBy && (
                <span style={{ whiteSpace: "nowrap" }}><span style={{ fontWeight: 600 }}>Created by:</span> {runMeta.createdBy}</span>
              )}
              {runMeta?.createdBy && runMeta?.createdOn && <span className="header-meta-sep">·</span>}
              {runMeta?.createdOn && (
                <span style={{ whiteSpace: "nowrap" }}><span style={{ fontWeight: 600 }}>Created on:</span> {new Date(runMeta.createdOn).toLocaleString("en-GB")}</span>
              )}
            </div>
          )}
        </div>
      </div>




        
                {/* AI disclaimer */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 14px", marginBottom: 2,
          background: "#f8fafc", borderRadius: 8,
          border: "1px solid #e2e8f0",
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            AI-generated content · Results may not be 100% accurate · Please verify before use
          </span>
        </div>

        {/* 🔥 PREMIUM TABS */}
                  <div className="premium-tabs">
                  {[
                      { key: "summary", label: "Overview", icon: <LayoutDashboard size={15} />, count: null },
                      { key: "fields", label: "Attribute Extraction", icon: <FileText size={15} />, count: attributes.length },
                      ...(attributes.some(hasValidAiInsight) ? [{ key: "ai", label: "AI Insight", icon: <Sparkles size={15} />, count: null }] : []),
                    ].map(tab => (
                    <div
                      key={tab.key}
                      onClick={() => { setActiveTab(tab.key as any); setAttrSearch(""); }}
                      className={`premium-tab${activeTab === tab.key ? " active" : ""}`}
                    >
                      {React.cloneElement(tab.icon, {
                        color: activeTab === tab.key ? "#F97316" : "#9ca3af"
                      })}
                      {tab.label}
                      {tab.count !== null && (
                        <span className="tab-count">{tab.count}</span>
                      )}
                    </div>
                  ))}
                </div>
      <div className="rr-content-split">
      <div className="rr-tab-area">











        {/* ============================= */
          /* OVERVIEW TAB               */
          /* ============================= */}

          {activeTab === "summary" && (
            <div className="rr-tab-scroll">
              {/* Stats Cards */}
              {insightRows.length > 0 && (
                <div className="ov-stats-grid">
                  <div className="ov-stat-card">
                    <div className="ov-stat-label">Profiles run</div>
                    <div className="ov-stat-value">{insightRows.length}</div>
                  </div>
                  <div className="ov-stat-card">
                    <div className="ov-stat-label">Total findings</div>
                    <div className="ov-stat-value">{totalFindings}</div>
                    <div className="ov-stat-sub">
                      {findingsHigh > 0 && <span style={{ color: "#ef4444" }}>{findingsHigh} high</span>}
                      {findingsMedium > 0 && <span style={{ color: "#f59e0b" }}>{findingsHigh > 0 ? " · " : ""}{findingsMedium} medium</span>}
                      {findingsLow > 0 && <span style={{ color: "#22c55e" }}>{(findingsHigh > 0 || findingsMedium > 0) ? " · " : ""}{findingsLow} low</span>}
                    </div>
                  </div>
                  <div className="ov-stat-card">
                    <div className="ov-stat-label">Fields extracted</div>
                    <div className="ov-stat-value">{extractedFields} <span style={{ fontSize: 14, fontWeight: 500, color: "#9ca3af" }}>of {totalFields}</span></div>
                    <div className="ov-stat-sub">{totalFields > 0 ? `${Math.round((extractedFields / totalFields) * 100)}% complete` : "—"}</div>
                  </div>
                  <div className="ov-stat-card">
                    <div className="ov-stat-label">Avg confidence</div>
                    <div className="ov-stat-value">{avgConfidence != null ? `${avgConfidence}%` : "—"}</div>
                    <div className="ov-stat-sub">across extracted fields</div>
                  </div>
                </div>
              )}

              {insightRows.length > 0 ? (
                <div className="results-card" style={{ padding: "0" }}>
                  {/* Profile Tab Bar */}
                  <div className="profile-tabs">
                    {insightRows.map((r, idx) => {
                      const parsed = normaliseInsightJson(r.aiSummaryJsonOutput);
                      const count = parsed?.keyInsights?.length ?? 0;
                      const dotColor = PROFILE_COLORS[idx % PROFILE_COLORS.length];
                      const isActive = r.profileName === selectedInsightProfileName;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          className={`profile-tab${isActive ? " active" : ""}`}
                          style={{ color: isActive ? dotColor : undefined, borderBottomColor: isActive ? dotColor : "transparent" }}
                          onClick={() => setSelectedInsightProfileName(r.profileName)}
                        >
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, display: "inline-block", flexShrink: 0 }} />
                          {r.profileName}
                          {count > 0 && (
                            <span style={{
                              background: isActive ? dotColor : "#e5e7eb",
                              color: isActive ? "white" : "#6b7280",
                              fontSize: 10, fontWeight: 700,
                              padding: "1px 6px", borderRadius: 10,
                            }}>{count}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {/* Profile Content */}
                  <div style={{ padding: "16px 18px" }}>
                    <AiInsightsSection
                      selectedInsight={selectedInsight}
                      selectedInsightRow={selectedInsightRow}
                    />
                  </div>
                </div>
              ) : (
                <div className="results-card ai-empty-state">
                  <div className="ai-empty-icon"><Sparkles size={28} strokeWidth={1.5} /></div>
                  <div className="ai-empty-title">No AI Profile Results</div>
                  <div className="ai-empty-body">
                    No AI profile insights were generated for this run.<br />
                    Make sure AI profiles are selected when starting a new insight.
                  </div>
                </div>
              )}
            </div>
          )}




{/* ============================= */
/* FIELDS / QUICK VIEW + PDF   */
/* ============================= */}
{activeTab === "fields" && (
<div ref={splitPaneContainerRef} className="split-pane-container">
  {connectorData && (
    <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 20, overflow: "visible" }} aria-hidden="true">
      <defs>
        <marker id="conn-arrow-s" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
          <polygon points="0 0, 7 2.5, 0 5" fill="#F97316" fillOpacity="0.75" />
        </marker>
      </defs>
      <path d={`M ${connectorData.x1} ${connectorData.y1} C ${connectorData.x1 + 80} ${connectorData.y1}, ${connectorData.x2 - 80} ${connectorData.y2}, ${connectorData.x2} ${connectorData.y2}`} stroke="#F97316" strokeWidth="1.5" strokeDasharray="5 3" fill="none" strokeOpacity="0.65" markerEnd="url(#conn-arrow-s)" />
      <circle cx={connectorData.x1} cy={connectorData.y1} r="3.5" fill="#F97316" fillOpacity="0.65" />
    </svg>
  )}
  <div className="split-pane-row">

    {/* LEFT: ATTRIBUTE LIST */}
    <div className="attr-list-panel">
      <div className="panel-header" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Extracted Attributes</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: "#9ca3af" }}>
            {filteredAttributes.length}{attrSearch ? ` of ${attributes.length}` : ""} fields
          </span>
        </div>
        <div style={{ position: "relative" }}>
          <Search size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", pointerEvents: "none" }} />
          <input
            type="text"
            placeholder="Search attributes…"
            value={attrSearch}
            onChange={e => setAttrSearch(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", paddingLeft: 26, paddingRight: attrSearch ? 26 : 8, paddingTop: 5, paddingBottom: 5, fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 6, outline: "none", background: "#f9fafb", color: "#374151" }}
          />
          {attrSearch && (
            <button onClick={() => setAttrSearch("")} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 0, display: "flex" }}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="panel-body" onScroll={computeConnector}>
        {filteredAttributes.length === 0 && attrSearch && (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
            No fields match "{attrSearch}"
          </div>
        )}
        {filteredAttributes.map((attr) => {
          const hasAiInsight = attr.values?.some(
            (v: any) =>
              v.attributeAiInsight &&
              v.attributeAiInsight.trim() !== "" &&
              v.attributeAiInsight !== "Not Found"
          );

          const isExpanded = expandedAttributes.includes(attr.attributeId);
          const isSelected = selectedAttrId === attr.attributeId;
          const insight = attr.values?.find((v: any) => v.attributeAiInsight)?.attributeAiInsight || null;

          return (
            <div
              key={attr.attributeId}
              onClick={() => {
                toggleAttribute(attr.attributeId);
                handleAttributeClick(attr);
              }}
              className={`attr-card${isSelected ? " selected" : ""}`}
            >
              {/* HEADER */}
              <div className="attr-card-header">
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {attr.attributeName}
                  </span>
                  {hasAiInsight && (
                    <Sparkles size={13} style={{ color: "#6366f1", flexShrink: 0 }} />
                  )}
                </div>
                <span className={`attr-card-chevron${isExpanded ? " expanded" : ""}`}>▾</span>
              </div>

              {/* VALUE — clean display, no filename label */}
              <div className="attr-values-preview">
                {attr.values.map((v: any, vIdx: number) => {
                  const isWinner = evaluations.find(
                    (e: any) => e.candidateId === v.candidateId &&
                      (e.attributeId === attr.attributeId || e.attributeName === attr.attributeName)
                  )?.isWinner;
                  return (
                    <span
                      key={v.documentId ?? v.candidateId ?? vIdx}
                      className={`attr-value-pill${isWinner ? " winner" : ""}`}
                      onClick={(e) => { e.stopPropagation(); handleAttributeRowClick(attr, v.candidateId, v.documentId, vIdx); }}
                    >
                      <FormatValue name={attr.attributeName} value={v.value} />
                    </span>
                  );
                })}
              </div>

              {/* META ROW */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                {attr.riskLevel && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                    <span style={{ color: "#6b7280", fontWeight: 600 }}>Risk:</span>
                    <span className={`badge badge-risk-${attr.riskLevel.toLowerCase()}`}>
                      {attr.riskLevel}
                    </span>
                  </div>
                )}
                {attr.values?.[0]?.confidenceScore !== undefined && (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, minWidth: 80 }}>
                    <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, flexShrink: 0 }}>Confidence:</span>
                    <div style={{ flex: 1, height: 3, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${Math.round(attr.values[0].confidenceScore * 100)}%`,
                        background: attr.riskLevel?.toLowerCase() === "high" ? "#ef4444"
                          : attr.riskLevel?.toLowerCase() === "medium" ? "#f59e0b"
                          : "#10b981",
                        borderRadius: 2,
                        transition: "width 0.3s ease",
                      }} />
                    </div>
                    <span style={{ fontSize: 10, color: "#94a3b8", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {Math.round(attr.values[0].confidenceScore * 100)}%
                    </span>
                  </div>
                )}
                {attr.values?.[0]?.pageNumber && (
                  <span style={{ fontSize: 12, color: "#6b7280" }}>
                    Pg {attr.values[0].pageNumber}
                  </span>
                )}
              </div>

              {/* EXPANDED AI INSIGHT */}
              {isExpanded && insight && (() => {
                const ai = safeParseInsight(insight);
                if (!ai) return null;
                return (
                  <div className="attribute-ai-box">
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                      <Sparkles size={13} style={{ color: "#6366f1" }} />
                      <strong style={{ fontSize: 12, color: "#4338ca" }}>AI Insight</strong>
                    </div>
                    {ai.title && <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{ai.title}</div>}
                    {ai.description && <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.5 }}>{ai.description}</div>}
                    {ai.impact && (
                      <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                        <strong>Impact:</strong> {ai.impact}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>

    {/* RIGHT: PDF VIEWER */}
    <div className="pdf-panel">
      {/* PDF HEADER */}
      <div className="pdf-header">
        <span className="pdf-filename">
          {documents.find((d: any) => d.id === selectedDocId)?.name || "Document"}
        </span>
        {selectedAttribute && (
          <span className="pdf-active-field">
            {"\u21b3"} {selectedAttribute.attributeName}
          </span>
        )}
        <span className="pdf-page-info">
          {pageNumber} / {numPages || "\u2014"}
        </span>
      </div>

      {/* PDF BODY */}
      <div ref={pdfContainerRef} className="pdf-body" onScroll={computeConnector}>
        {pdfUrl ? pdfViewer : (
          <div className="pdf-empty-state">
            <FileText size={32} style={{ color: "#d1d5db" }} />
            <span>Click a field to highlight it in the document</span>
          </div>
        )}
      </div>
    </div>

  </div>
</div>
)}

{activeTab === "ai" && (
  <div className="rr-tab-scroll">
  <div className="results-card" style={{ padding: 0 }}>
    <div className="panel-header">
      <span>Attribute AI Insights</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: "#9ca3af" }}>
        {attributes.filter(a => hasValidAiInsight(a)).length} fields
      </span>
    </div>

    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 16px" }}>
      {attributes.map(attr => {

        const insight = attr.values
          ?.map(v => v.attributeAiInsight)
          .find(v => v && v !== "Not Found");

        if (!insight) return null;

        const ai = safeParseInsight(insight);

        const confidenceScore = attr.values
          ?.map(v => v.confidenceScore)
          .find(s => s != null) ?? null;

        return (
          <div
            key={attr.attributeId}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 12,
              background: "#fff"
            }}
          >
            <div style={{ fontWeight: 600 }}>
              {attr.attributeName}
            </div>

            {ai?.title && (
              <div style={{ marginTop: 6, fontWeight: 600 }}>
                {ai.title}
              </div>
            )}

            {ai?.description && (
              <div style={{ marginTop: 4, fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
                {ai.description}
              </div>
            )}

            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {ai?.impact && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <span style={{ color: "#6b7280", fontWeight: 600 }}>Impact:</span>
                  <span className={`badge ${getRiskLevelClass(ai.impact)}`}>
                    {ai.impact}
                  </span>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <span style={{ color: "#6b7280", fontWeight: 600 }}>Confidence:</span>
                {confidenceScore != null ? (
                  <span style={{
                    fontWeight: 700,
                    color: confidenceScore >= 0.8 ? "#16a34a" : confidenceScore >= 0.5 ? "#d97706" : "#dc2626"
                  }}>
                    {Math.round(Number(confidenceScore) * 100)}%
                  </span>
                ) : (
                  <span style={{ color: "#9ca3af", fontWeight: 600 }}>N/A</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
  </div>
)}




















      </div>
      <div className="rr-chat-pane">
        <ChatTab
          suggestedPrompts={suggestedPrompts}
          chatMessages={chatMessages}
          chatInput={chatInput}
          setChatInput={setChatInput}
          sendChatQuestion={sendChatQuestion}
          chatLoading={chatLoading}
        />
      </div>
      </div>
      </div>

      {pdfExporting && (
        <div className="pdf-export-overlay">
          <div className="sr-processing-card">
            <div className="sr-processing-spinner" />
            <div className="app-loading-title">Generating PDF…</div>
            <div className="app-loading-hint">Your report will download automatically</div>
          </div>
        </div>
      )}
      </>
    );

  }

  /* =====================================================
     COMPARE MODE
  ===================================================== */

// ONLY showing the UPDATED Compare section (rest of your file remains SAME)

/* =====================================================
   COMPARE MODE
===================================================== */

const hasRealWinner = candidates.some(c => c.isWinner);
const winner = candidates.find(c => c.isWinner) || null;
const noRulesConfigured = mode === "Scoring" && candidates.length > 0 && evaluations.length === 0;


return (
  <>
    <div className="results-container">


      <PageBreadcrumb
        items={[
          { label: "Back", onClick: () => navigate(-1) },
          { label: "Comparison Results" },
        ]}
        actions={
          <button type="button" className="btn btn-secondary" onClick={handleExportPdf}
            title={isTrial ? "PDF export is not available on trial accounts" : "Export to PDF"}
            disabled={isTrial}>
            <Download size={15} />
            <span>Download PDF</span>
          </button>
        }
      />


  {exportError && (
    <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 14px", marginBottom: 12, fontSize: 13, color: "#b91c1c", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span>{exportError}</span>
      <button onClick={() => setExportError("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#b91c1c", fontSize: 18, lineHeight: 1 }}>×</button>
    </div>
  )}

  {/* ============================= */}
  {/* HEADER SECTION */}
  {/* ============================= */}
  <div className="comparison-header">

    <div className="header-left">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
        <span className={`mode-pill mode-pill-${mode === "Scoring" ? "compare-scoring" : mode.toLowerCase()}`}>{mode}</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{comparisonName || "Untitled Run"}</span>
      </div>
      <div className="header-meta">
        {[
          documentTypeName || null,
          templateName || null,
          `${documents.length || candidates.length} doc${(documents.length || candidates.length) !== 1 ? "s" : ""}`,
        ].filter(Boolean).map((item, i, arr) => (
          <React.Fragment key={i}>
            <span style={{ whiteSpace: "nowrap" }}>{item}</span>
            {i < arr.length - 1 && <span className="header-meta-sep">·</span>}
          </React.Fragment>
        ))}
      </div>
      {(runMeta?.createdBy || runMeta?.createdOn) && (
        <div className="header-meta" style={{ marginTop: 2 }}>
          {runMeta?.createdBy && (
            <span style={{ whiteSpace: "nowrap" }}><span style={{ fontWeight: 600 }}>Created by:</span> {runMeta.createdBy}</span>
          )}
          {runMeta?.createdBy && runMeta?.createdOn && <span className="header-meta-sep">·</span>}
          {runMeta?.createdOn && (
            <span style={{ whiteSpace: "nowrap" }}><span style={{ fontWeight: 600 }}>Created on:</span> {new Date(runMeta.createdOn).toLocaleString("en-GB")}</span>
          )}
        </div>
      )}
    </div>

    <div className="header-right">
      {winner && hasRealWinner && (
        <div className="winner-card">
          🏆 Winner: <strong>{winner.label}</strong>
        </div>
      )}
    </div>

  </div>









        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 14px", marginBottom: 2,
          background: "#f8fafc", borderRadius: 8,
          border: "1px solid #e2e8f0",
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            AI-generated content · Results may not be 100% accurate · Please verify before use
          </span>
        </div>

<div className="premium-tabs">
  {[
  { key: "summary", label: "Overview", icon: <LayoutDashboard size={15} />, count: null },
  { key: "fields", label: "Comparison", icon: <FileText size={15} />, count: attributes.length },
  ...(candidates.length > 0 ? [{ key: "scoring", label: "Scoring", icon: <BarChart2 size={15} />, count: null }] : []),
  ...(attributes.some(hasValidAiInsight) ? [{ key: "ai", label: "AI Insights", icon: <Sparkles size={15} />, count: null }] : []),
].map(tab => (
    <div
      key={tab.key}
      onClick={() => { setActiveTab(tab.key as any); setAttrSearch(""); }}
      className={`premium-tab${activeTab === tab.key ? " active" : ""}`}
    >
      {React.cloneElement(tab.icon, {
        color: activeTab === tab.key ? "#F97316" : "#9ca3af"
      })}
      {tab.label}
      {tab.count !== null && (
        <span className="tab-count">{tab.count}</span>
      )}
    </div>
  ))}
</div>
  <div className="rr-content-split">
  <div className="rr-tab-area">

    {/* ============================= */
    /* AI INSIGHTS */
    /* ============================= */}

          {activeTab === "summary" && (
          <div className="rr-tab-scroll">
            {insightRows.length > 0 ? (
              <div className="results-card" style={{ padding: "0" }}>
                <div className="profile-tabs">
                  {insightRows.map((r, idx) => {
                    const parsed = normaliseInsightJson(r.aiSummaryJsonOutput);
                    const count = parsed?.keyInsights?.length ?? 0;
                    const dotColor = PROFILE_COLORS[idx % PROFILE_COLORS.length];
                    const isActive = r.profileName === selectedInsightProfileName;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={`profile-tab${isActive ? " active" : ""}`}
                        style={{ color: isActive ? dotColor : undefined, borderBottomColor: isActive ? dotColor : "transparent" }}
                        onClick={() => setSelectedInsightProfileName(r.profileName)}
                      >
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, display: "inline-block", flexShrink: 0 }} />
                        {r.profileName}
                        {count > 0 && (
                          <span style={{
                            background: isActive ? dotColor : "#e5e7eb",
                            color: isActive ? "white" : "#6b7280",
                            fontSize: 10, fontWeight: 700,
                            padding: "1px 6px", borderRadius: 10,
                          }}>{count}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div style={{ padding: "16px 18px" }}>
                  <AiInsightsSection
                    selectedInsight={selectedInsight}
                    selectedInsightRow={selectedInsightRow}
                  />
                </div>
              </div>
            ) : (
              <div className="results-card ai-empty-state">
                <div className="ai-empty-icon"><Sparkles size={28} strokeWidth={1.5} /></div>
                <div className="ai-empty-title">No AI Profile Results</div>
                <div className="ai-empty-body">
                  No AI profile insights were generated for this run.<br />
                  Make sure AI profiles are selected when starting a new insight.
                </div>
              </div>
            )}
          </div>
        )}


    {/* ================================
        PARAMETER COMPARISON (FIXED)
    ================================= */}


      {activeTab === "ai" && (
      <div className="rr-tab-scroll">
      <div className="results-card">
        <h2>Attribute Comparison</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
         
        {attributes
  .filter(attr => hasValidAiInsight(attr))
  .map((attr) => {

  const isExpanded = expandedAiAttributes.includes(attr.attributeId);

  const rule =
    evaluations.find(
      (e) =>
        (e.attributeId === attr.attributeId ||
         e.attributeName === attr.attributeName) &&
        e.advisoryText &&
        e.advisoryText.trim() !== ""
    )?.advisoryText || null;

  return (
      <div
        key={attr.attributeId}
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          overflow: "hidden",
          marginBottom: 10,
          background: isExpanded ? "#fafafa" : "#ffffff", // ✅ subtle
          boxShadow: isExpanded ? "0 2px 6px rgba(0,0,0,0.05)" : "none"
        }}
      >

      {/* HEADER */}
        <div
          onClick={() => toggleAiAttribute(attr.attributeId)}
          style={{
            padding: "14px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            background: isExpanded ? "#f9fafb" : "#ffffff", // ✅ clean
            borderBottom: "1px solid #e5e7eb",
            transition: "all 0.2s ease"
          }}
        >
        <span style={{ fontWeight: 600 }}>{attr.attributeName}</span>

        <div
          style={{
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            background: isExpanded ? "#dcfce7" : "#f3f4f6",
            border: "1px solid #e5e7eb",
            transition: "all 0.2s ease"
          }}
        >
          <ChevronDown
            size={16}
            style={{
              transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
              color: isExpanded ? "#059669" : "#6b7280"
            }}
          />
        </div>
      </div>

      {/* EXPANDED */}
      {isExpanded && (
        <div style={{ padding: "12px 14px" }}>

          {/* MULTI VALUES */}
          {candidates.map((c) => {
            const match = attr.values.find(v => v.candidateId === c.id);

            const evaluation = evaluations.find(
              (e) =>
                e.candidateId === c.id &&
                (e.attributeId === attr.attributeId ||
                 e.attributeName === attr.attributeName)
            );

            const isWinner = evaluation?.isWinner;

            return (
              <div
                key={c.id}
                style={{
                  padding: "6px 0",
                  display: "flex",
                  justifyContent: "space-between",
                  borderBottom: "1px solid #f3f4f6",
                  background: isWinner ? "#ecfdf5" : "transparent",
                  fontWeight: isWinner ? 600 : 400
                }}
              >
                <span>{c.label}</span>

                <span>
                  <FormatValue name={attr.attributeName} value={match?.value} />

                  {isWinner && (
                    <span className="badge badge-positive" style={{ marginLeft: 6 }}>
                      Winner
                    </span>
                  )}
                </span>
              </div>
            );
          })}

          {/* EVALUATION */}
          {rule && (
            <div style={{
              marginTop: 8,
              padding: "8px 10px",
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              borderRadius: 6,
              fontSize: 13
            }}>
              <strong style={{ color: "#c2410c" }}>Evaluation Basis:</strong> {rule}
            </div>
          )}

          {/* AI */}
          {(() => {
            const insight =
              attr.values.find(v => v.attributeAiInsight)?.attributeAiInsight;

            const ai = safeParseInsight(insight);
            if (!ai) return null;

            return (
              <div style={{ marginTop: 10 }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 6
                }}>
                  <Sparkles size={16} style={{ color: "#6366f1" }} />
                  <span style={{ fontWeight: 700 }}>AI Insight</span>
                </div>

                {ai.title && <div style={{ fontWeight: 600 }}>{ai.title}</div>}
                {ai.description && <div>{ai.description}</div>}

                {ai.impact && (
                  <div>
                    <strong>Impact:</strong>{" "}
                    <span className={`badge ${getRiskLevelClass(ai.impact)}`}>
                      {ai.impact}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      )}
    </div>
  );
})}


        </div>
      </div>
      </div>
      )}



      {activeTab === "fields" && (
        <div ref={splitPaneContainerRef} className="split-pane-container">
          {connectorData && (
            <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 20, overflow: "visible" }} aria-hidden="true">
              <defs>
                <marker id="conn-arrow-c" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
                  <polygon points="0 0, 7 2.5, 0 5" fill="#F97316" fillOpacity="0.75" />
                </marker>
              </defs>
              <path d={`M ${connectorData.x1} ${connectorData.y1} C ${connectorData.x1 + 80} ${connectorData.y1}, ${connectorData.x2 - 80} ${connectorData.y2}, ${connectorData.x2} ${connectorData.y2}`} stroke="#F97316" strokeWidth="1.5" strokeDasharray="5 3" fill="none" strokeOpacity="0.65" markerEnd="url(#conn-arrow-c)" />
              <circle cx={connectorData.x1} cy={connectorData.y1} r="3.5" fill="#F97316" fillOpacity="0.65" />
            </svg>
          )}
          <div className="split-pane-row">

            {/* LEFT: ATTRIBUTE LIST */}
            <div className="attr-list-panel">
              <div className="panel-header" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Attribute Comparison</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#9ca3af" }}>
                    {filteredAttributes.length}{attrSearch ? ` of ${attributes.length}` : ""} fields
                  </span>
                </div>
                <div style={{ position: "relative" }}>
                  <Search size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", pointerEvents: "none" }} />
                  <input
                    type="text"
                    placeholder="Search attributes…"
                    value={attrSearch}
                    onChange={e => setAttrSearch(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box", paddingLeft: 26, paddingRight: attrSearch ? 26 : 8, paddingTop: 5, paddingBottom: 5, fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 6, outline: "none", background: "#f9fafb", color: "#374151" }}
                  />
                  {attrSearch && (
                    <button onClick={() => setAttrSearch("")} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 0, display: "flex" }}>
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              <div className="panel-body" onScroll={computeConnector}>
                {filteredAttributes.length === 0 && attrSearch && (
                  <div style={{ padding: "24px 16px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                    No fields match "{attrSearch}"
                  </div>
                )}
                {filteredAttributes.map((attr) => {
                  const isExpanded = expandedAttributes.includes(attr.attributeId);
                  const isSelected = selectedAttrId === attr.attributeId;

                  return (
                    <div
                      key={attr.attributeId}
                      onClick={() => {
                        toggleAttribute(attr.attributeId);
                        handleAttributeClick(attr);
                      }}
                      className={`attr-card${isSelected ? " selected" : ""}`}
                    >
                      {/* HEADER */}
                      <div className="attr-card-header">
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                          {attr.attributeName}
                        </span>
                        <span className={`attr-card-chevron${isExpanded ? " expanded" : ""}`}>▾</span>
                      </div>

                      {/* COLLAPSED: value-only preview, no filename noise */}
                      {!isExpanded && (
                        <div className="attr-values-preview">
                          {attr.values.map((v: any, vIdx: number) => {
                            const evaluation = evaluations.find(
                              (e: any) => e.candidateId === v.candidateId &&
                                (e.attributeId === attr.attributeId || e.attributeName === attr.attributeName)
                            );
                            const isWinner = evaluation?.isWinner;
                            return (
                              <span
                                key={v.documentId ?? v.candidateId ?? vIdx}
                                className={`attr-value-pill${isWinner ? " winner" : ""}`}
                                onClick={(e) => { e.stopPropagation(); handleAttributeRowClick(attr, v.candidateId, v.documentId, vIdx); }}
                              >
                                <FormatValue name={attr.attributeName} value={v.value} />
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* EXPANDED: clean per-document cards, no duplicate chips */}
                      {isExpanded && (
                        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                          {attr.values.map((v: any, vIdx: number) => {
                            const cand = candidates.find((c: any) => c.id === v.candidateId);
                            const doc = documents.find((d: any) => d.id === v.documentId) || documents[vIdx];
                            const fullLabel = cand?.label || doc?.name || `Document ${vIdx + 1}`;
                            const shortLabel = shortDocName(fullLabel);
                            const evaluation = evaluations.find(
                              (e) => e.candidateId === v.candidateId &&
                                (e.attributeId === attr.attributeId || e.attributeName === attr.attributeName)
                            );
                            const isWinner = evaluation?.isWinner;
                            return (
                              <div
                                key={v.documentId ?? v.candidateId}
                                onClick={(e) => { e.stopPropagation(); handleAttributeRowClick(attr, v.candidateId, v.documentId, vIdx); }}
                                className={`candidate-value-row${isWinner ? " winner" : ""}`}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                    {shortLabel}
                                  </span>
                                  {isWinner && <span className="badge badge-positive">Winner</span>}
                                </div>
                                <div style={{ fontSize: 13.5, fontWeight: 400, color: "#111827", lineHeight: 1.55 }}>
                                  <FormatValue name={attr.attributeName} value={v.value} />
                                </div>
                                {(v.confidenceScore !== undefined || v.pageNumber) && (
                                  <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
                                    {v.confidenceScore !== undefined && (
                                      <span style={{ fontSize: 11, color: "#9ca3af" }}>
                                        {Math.round(v.confidenceScore * 100)}% confidence
                                      </span>
                                    )}
                                    {v.pageNumber && (
                                      <span style={{ fontSize: 11, color: "#9ca3af" }}>Pg {v.pageNumber}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT: PDF VIEWER */}
            <div className="pdf-panel">
              {/* PDF HEADER */}
              <div className="pdf-header">
                <select
                  title="Select document"
                  aria-label="Select document"
                  value={selectedDocId || ""}
                  onChange={(e) => {
                    const doc = documents.find(d => d.id === e.target.value);
                    if (doc) {
                      setSelectedDocId(doc.id);
                      setPdfUrl(doc.url);
                      setPageNumber(1);
                    }
                  }}
                  style={{ height: 30, fontSize: 14, padding: "0 8px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff" }}
                >
                  {documents.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                {selectedAttribute && (
                  <span className="pdf-active-field">
                    {"\u21b3"} {selectedAttribute.attributeName}
                  </span>
                )}
                <span className="pdf-page-info">
                  {pageNumber} / {numPages || "\u2014"}
                </span>
              </div>

              {/* PDF BODY */}
              <div ref={pdfContainerRef} className="pdf-body" onScroll={computeConnector}>
                {pdfUrl ? pdfViewer : (
                  <div className="pdf-empty-state">
                    <FileText size={32} style={{ color: "#d1d5db" }} />
                    <span>Click a field to highlight it in the document</span>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

            {activeTab === "scoring" && (
  <div className="rr-tab-scroll">
  <div className="results-card">

          {/* No rules warning */}
          {noRulesConfigured && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "14px 16px", marginBottom: 20,
              background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10,
            }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                <path d="M10 2L2 17h16L10 2z" stroke="#d97706" strokeWidth="1.5" strokeLinejoin="round" fill="#fef3c7"/>
                <path d="M10 8v4M10 14.5v.5" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <div>
                <div style={{ fontWeight: 600, color: "#92400e", fontSize: 13, marginBottom: 3 }}>
                  No scoring rules configured
                </div>
                <div style={{ color: "#78350f", fontSize: 13, lineHeight: 1.5 }}>
                  Scoring requires rules to be set up for this template's attributes. Go to <strong>Admin → Rules</strong> and add rules with a comparison direction and weight for each attribute you want to score.
                </div>
              </div>
            </div>
          )}

          {/* Ranking */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
                Ranking
              </div>

              {/* Winner card — only when a real winner exists */}
              {winner && hasRealWinner && (
                <div style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: 10,
                  padding: "10px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 8,
                }}>
                  <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>🏆</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#16a34a", letterSpacing: "0.06em", textTransform: "uppercase" }}>Winner</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#14532d", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{winner.label}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#16a34a", lineHeight: 1 }}>{winner.totalScore}</div>
                    <div style={{ fontSize: 10, color: "#4ade80", fontWeight: 600 }}>pts</div>
                  </div>
                </div>
              )}

              {/* All candidates as ranked rows (winner at top when real winner exists, otherwise all equal) */}
              {sortedCandidates.filter(c => !hasRealWinner || c.id !== winner?.id).map((c, i) => (
                <div key={c.id} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  borderRadius: 10,
                  background: "#f9fafb",
                  border: "1px solid #e5e7eb",
                  marginBottom: 6
                }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: "#e5e7eb", color: "#6b7280",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700, flexShrink: 0
                  }}>{hasRealWinner ? i + 2 : i + 1}</div>
                  <span style={{ flex: 1, fontWeight: 500, color: "#374151", fontSize: 14 }}>{c.label}</span>
                  <span style={{ fontWeight: 700, color: "#6b7280", fontSize: 15 }}>{c.totalScore} <span style={{ fontSize: 11, fontWeight: 500 }}>pts</span></span>
                </div>
              ))}
            </div>





    <h2>Scoring Overview</h2>

    <div style={{ overflowX: "auto", marginTop: 10 }}>
      <div className="scoring-table-wrap">
      <table className="scoring-table">
        
        {/* HEADER */}
        <thead>
          <tr>
            <th>Attribute</th>

            {candidates.map((c) => (
              <th key={c.id} style={{ textAlign: "center" }}>
                {c.label}
              </th>
            ))}

            <th style={{ width: 50 }}></th>
          </tr>
        </thead>

        {/* BODY */}
        
      <tbody>
  {attributes.filter(attr => candidates.some(c => getEvaluationForAttributeCandidate(attr, c.id) != null)).map((attr) => {
    return (
      <React.Fragment key={attr.attributeId}>

        {/* ================= MAIN ROW ================= */}
        <tr
          onClick={() =>
            setExpandedScoreRow(
              expandedScoreRow === attr.attributeId
                ? null
                : attr.attributeId
            )
          }
          style={{
            cursor: "pointer",
            background:
              expandedScoreRow === attr.attributeId
                ? "#f9fafb"
                : "transparent"
          }}
        >

          {/* ATTRIBUTE NAME */}
          <td
            style={{
              padding: 10,
              fontWeight: 500,
              borderTop: "1px solid #e5e7eb"
            }}
          >
            {attr.attributeName}
          </td>

          {/* SCORE DOTS */}
          {candidates.map((c) => {
            const isWinner = getEvaluationForAttributeCandidate(attr, c.id)?.isWinner ?? false;

            return (
              <td
                key={c.id}
                style={{
                  textAlign: "center",
                  padding: "8px 10px",
                  borderTop: "1px solid #e5e7eb"
                }}
              >
                {isWinner ? (
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 24, height: 24, borderRadius: "50%",
                    background: "#16a34a",
                    boxShadow: "0 2px 6px rgba(22,163,74,0.35)"
                  }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l2.5 2.5L10 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                ) : (
                  <div style={{ width: 10, height: 10, borderRadius: "50%", margin: "0 auto", background: "#e5e7eb" }} />
                )}
              </td>
            );
          })}

          {/* EXPAND BUTTON */}
          <td style={{ textAlign: "center", padding: "10px 8px", borderTop: "1px solid #e5e7eb" }}>
            <span className={`attr-card-chevron${expandedScoreRow === attr.attributeId ? " expanded" : ""}`}>▾</span>
          </td>

        </tr>

        {/* ================= EXPANDED ROW ================= */}
        {expandedScoreRow === attr.attributeId && (
          <tr>
            <td colSpan={candidates.length + 2}>
              <div
                style={{
                  padding: 12,
                  background: "#f9fafb",
                  borderTop: "1px solid #e5e7eb"
                }}
              >
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {candidates.map((c) => {
                    const match = attr.values.find(
                      (v) => v.candidateId === c.id
                    );

                    const isWinner = getEvaluationForAttributeCandidate(attr, c.id)?.isWinner ?? false;

                    return (
                      <div
                        key={c.id}
                        style={{
                          flex: 1,
                          minWidth: 220,
                          border: `1px solid ${
                            isWinner ? "#bbf7d0" : "#e5e7eb"
                          }`,
                          background: isWinner ? "#f0fdf4" : "#ffffff",
                          borderRadius: 8,
                          padding: 10
                        }}
                      >
                        {/* HEADER */}
                        <div
                          style={{
                            fontWeight: 600,
                            marginBottom: 4,
                            display: "flex",
                            justifyContent: "space-between"
                          }}
                        >
                          {c.label}
                          {isWinner && (
                            <span className="badge badge-positive">
                              Winner
                            </span>
                          )}
                        </div>

                        {/* VALUE */}
                        <div style={{ marginBottom: 6 }}>
                          <FormatValue name={attr.attributeName} value={match?.value} />
                        </div>

                        {/* META */}
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          {match?.confidenceScore !== undefined && (
                            <div>
                              Confidence:{" "}
                              {Math.round(match.confidenceScore * 100)}%
                            </div>
                          )}

                          {match?.pageNumber && (
                            <div>Page: {match.pageNumber}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </td>
          </tr>
        )}

      </React.Fragment>
    );
  })}
</tbody>

      </table>
      </div>
    </div>
  </div>
  </div>
      )}

  </div>
  <div className="rr-chat-pane">
    <ChatTab
      suggestedPrompts={suggestedPrompts}
      chatMessages={chatMessages}
      chatInput={chatInput}
      setChatInput={setChatInput}
      sendChatQuestion={sendChatQuestion}
      chatLoading={chatLoading}
    />
  </div>
  </div>
  </div>

  {/* PDF export overlay */}
  {pdfExporting && (
    <div className="pdf-export-overlay">
      <div className="sr-processing-card">
        <div className="sr-processing-spinner" />
        <div className="app-loading-title">Generating PDF…</div>
        <div className="app-loading-hint">Your report will download automatically</div>
      </div>
    </div>
  )}
  </>
);

}
