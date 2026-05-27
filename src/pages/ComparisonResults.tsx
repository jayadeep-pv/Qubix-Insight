import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { loginRequest } from "../authConfig";
import AiInsightsSection from "../components/AiInsightsSection";
import { useNavigate } from "react-router-dom";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { LayoutDashboard, FileText, Sparkles, ChevronDown, Download, BarChart2, MessageCircle } from "lucide-react";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import ChatTab from "../components/ChatTab";
import { configApi } from "../services/configApi";
import PageLoading from "../components/PageLoading";


pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

//const API_BASE = "https://hollis-document-comparison-hzhddjeuayebdwbf.uksouth-01.azurewebsites.net";

/* =====================================================
   Interfaces
===================================================== */

const API_BASE = "http://localhost:7071";


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
        .replace(/\\n/g, "")
        .replace(/\\"/g, '"')
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

  const [mode, setMode] = useState<"Compare" | "Scoring" | "Summarise">("Compare");
  const [runName, setRunName] = useState<string>("");
  const [comparisonName, setComparisonName] = useState<string>("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [attributes, setAttributes] = useState<AttributeValue[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [runMeta, setRunMeta] = useState<{
  createdBy?: string;
  createdOn?: string;
} | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [expandedAttributes, setExpandedAttributes] = useState<string[]>([]);
  const [expandedAiAttributes, setExpandedAiAttributes] = useState<string[]>([]);
  const [error, setError] = useState("");

  const [includeExecutiveSummary, setIncludeExecutiveSummary] = useState(true);

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
  try {
    setPdfExporting(true);
    const { blob } = await configApi.exportComparisonPdf(runId);
    const cleanName = (runName || runId)
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "_");
    const filename = `${mode}_${cleanName}.pdf`;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    alert("Export failed");
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
      console.warn("No coordinates found");
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

  const isLikelyRunMetaSummary = (obj: any) => {
    return (
      obj &&
      typeof obj === "object" &&
      (obj.mode || obj.Mode) &&
      (obj.documentsProcessed || obj.DocumentsProcessed || obj.documents)
    );
  };


const sendChatQuestion = async () => {
  if (!chatInput.trim()) return;

  const question = chatInput;

  // Add user message
  setChatMessages(prev => [...prev, { role: "user", text: question }]);
  setChatInput("");
  setChatLoading(true);

  try {
    const token = await instance.acquireTokenSilent({
      ...loginRequest,
      account: accounts[0],
    });

    const res = await fetch(`${API_BASE}/api/AskRunQuestion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.accessToken}`
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

        const token = await instance.acquireTokenSilent({
          ...loginRequest,
          account: accounts[0],
        });

        const response = await fetch(
          `${API_BASE}/api/GetComparisonRunResults?comparisonRunId=${runId}`,
          {
            headers: {
              Authorization: `Bearer ${token.accessToken}`,
            },
          }
        );

        
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

        setIncludeExecutiveSummary(raw.includeExecutiveSummary ?? true);

        setComparisonName(raw.InsightName || "");

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
          data.mode === "Summarise" || data.mode === 942870001
            ? "Summarise"
            : data.candidates.length > 0
              ? "Scoring"
              : "Compare"
        );

        setCandidates(data.candidates);
        setAttributes(data.attributes);
        setEvaluations(data.evaluations);

        if (data.summaryJson) {
          const parsed = data.summaryJson;

          if (isLikelyRunMetaSummary(parsed)) {
            setSummary(null);
          } else {
            setSummary({
              executiveSummary: parsed.ExecutiveSummary ?? parsed.executiveSummary,
              keyInsights: parsed.KeyInsights ?? parsed.keyInsights,
              confidenceLevel:
                parsed.ConfidenceLevel ?? parsed.confidenceLevel,
              winner: parsed.Winner ?? parsed.winner,
              totalRules: parsed.TotalRules ?? parsed.totalRules,
              documentsProcessed:
                parsed.DocumentsProcessed ?? parsed.documentsProcessed,
            });
          }
        } else {
          setSummary(null);
        }

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
      } catch (err) {
        console.error(err);
        setError("Unable to load comparison results.");
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
      function updateWidth() {
        if (pdfContainerRef.current) {
          setPdfWidth(pdfContainerRef.current.offsetWidth);
        }
      }

      updateWidth();

      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
}, []);

  useEffect(() => {
    if (!selectedAttrId || !highlight || activeTab !== "fields") { setConnectorData(null); return; }
    const timer = setTimeout(computeConnector, 400);
    return () => clearTimeout(timer);
  }, [selectedAttrId, highlight, pageNumber, activeTab, computeConnector]);


  /* =====================================================
     Helpers
  ===================================================== */

  const sortedCandidates = [...candidates].sort(
    (a, b) => b.totalScore - a.totalScore
  );

  const formatValue = (attributeName: string, value?: string) => {
    if (!value) return "-";

    const numeric = Number(value);

    if (!isNaN(numeric) && attributeName.toLowerCase().includes("price")) {
      return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        minimumFractionDigits: 0,
      }).format(numeric);
    }

    if (!isNaN(numeric)) {
      return new Intl.NumberFormat("en-GB").format(numeric);
    }

    return value;
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
                width={pdfWidth -24}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                onLoadSuccess={(page) => {
                setPageSizes(prev => ({
                  ...prev,
                  [currentPage]: {
                    width: page.width,
                    height: page.height
                  }
                }));
              }}
                              />

              
              {/* Highlight disabled temporarily until polygon accuracy is fixed */}

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

                    const renderedWidth = pdfWidth - 24;
                    const pageNaturalWidth = pageSizes[currentPage].width;
                    const scale = renderedWidth / pageNaturalWidth;
                    // PDF page.width from react-pdf is in points (72 pts = 1 inch).
                    // Azure OCR coords for PDFs are in inches from top-left.
                    const pxPerInch = 72 * scale;
                    const pad = 0.15; // inches of padding around the bounding box

                    console.log(
                      `[Highlight pg${currentPage}] coords:`, coords.map((v: number) => v.toFixed(3)),
                      `| pageNaturalWidth(pts): ${pageNaturalWidth.toFixed(0)}`,
                      `| renderedWidth(px): ${renderedWidth}`,
                      `| scale: ${scale.toFixed(4)} px/pt`,
                      `| pxPerInch: ${pxPerInch.toFixed(1)}`,
                      `| box: left=${((minX - pad) * pxPerInch).toFixed(0)} top=${((minY - pad) * pxPerInch).toFixed(0)} w=${((maxX - minX + pad * 2) * pxPerInch).toFixed(0)} h=${((maxY - minY + pad * 2) * pxPerInch).toFixed(0)}`
                    );

                    return (
                      <div
                        className="pdf-highlight-overlay"
                        style={{
                          position: "absolute",
                          left:   (minX - pad) * pxPerInch,
                          top:    (minY - pad) * pxPerInch,
                          width:  (maxX - minX + pad * 2) * pxPerInch,
                          height: (maxY - minY + pad * 2) * pxPerInch,
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
     SUMMARISE MODE
  ===================================================== */

  if (mode === "Summarise") {
    return (
      <>
      <div className="results-container">        

      <PageBreadcrumb
        items={[
          { label: "My Insights", onClick: () => navigate("/my-insights") },
          { label: "Summarise Results" },
        ]}
        actions={
          <button type="button" className="btn btn-secondary" onClick={handleExportPdf} title="Export to PDF">
            <Download size={15} />
            <span>Download PDF</span>
          </button>
        }
      />
        

      <div className="comparison-header">
          {/* LEFT */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {comparisonName || "Untitled Run"}
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span className="mode-pill mode-pill-summarise">{mode}</span>
              {summary?.documentType && (
                <span style={{ fontSize: 13, color: "#6b7280" }}><strong>Type:</strong> {summary.documentType}</span>
              )}
              {runMeta?.createdBy && (
                <span style={{ fontSize: 13, color: "#6b7280" }}><strong>By:</strong> {runMeta.createdBy}</span>
              )}
              {runMeta?.createdOn && (
                <span style={{ fontSize: 13, color: "#6b7280" }}>
                  <strong>On:</strong>{" "}
                  {new Date(runMeta.createdOn).toLocaleString("en-GB")}
                </span>
              )}
            </div>
          </div>
        </div>




        
                {/* 🔥 PREMIUM TABS */}
                  <div className="premium-tabs">
                  {[
                      { key: "summary", label: "Overview", icon: <LayoutDashboard size={15} />, count: null },
                      { key: "fields", label: "Attribute Extraction", icon: <FileText size={15} />, count: attributes.length },
                      ...(attributes.some(hasValidAiInsight) ? [{ key: "ai", label: "AI Insight", icon: <Sparkles size={15} />, count: null }] : []),
                      { key: "chat", label: "AI Q&A", icon: <MessageCircle size={15} />, count: null },
                    ].map(tab => (
                    <div
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key as any)}
                      className={`premium-tab${activeTab === tab.key ? " active" : ""}`}
                    >
                      {React.cloneElement(tab.icon, {
                        color: activeTab === tab.key ? "#FA4616" : "#9ca3af"
                      })}
                      {tab.label}
                      {tab.count !== null && (
                        <span className="tab-count">{tab.count}</span>
                      )}
                    </div>
                  ))}
                </div>











        {/* ============================= */
          /* AI INSIGHTS */
          /* ============================= */}

          {activeTab === "summary" && (
              <>
                {includeExecutiveSummary && insightRows.length > 0 ? (
                  <AiInsightsSection
                    insightRows={insightRows}
                    selectedInsightProfileName={selectedInsightProfileName}
                    setSelectedInsightProfileName={setSelectedInsightProfileName}
                    selectedInsight={selectedInsight}
                    selectedInsightRow={selectedInsightRow}
                  />
                ) : (
                  <div className="results-card ai-empty-state">
                    <div className="ai-empty-icon"><Sparkles size={28} strokeWidth={1.5} /></div>
                    <div className="ai-empty-title">No Executive Summary</div>
                    <div className="ai-empty-body">
                      Executive Summary was not selected for this run.<br />
                      Enable it via <strong>AI Options</strong> when starting a new insight.
                    </div>
                  </div>
                )}
              </>
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
          <polygon points="0 0, 7 2.5, 0 5" fill="#FA4616" fillOpacity="0.75" />
        </marker>
      </defs>
      <path d={`M ${connectorData.x1} ${connectorData.y1} C ${connectorData.x1 + 80} ${connectorData.y1}, ${connectorData.x2 - 80} ${connectorData.y2}, ${connectorData.x2} ${connectorData.y2}`} stroke="#FA4616" strokeWidth="1.5" strokeDasharray="5 3" fill="none" strokeOpacity="0.65" markerEnd="url(#conn-arrow-s)" />
      <circle cx={connectorData.x1} cy={connectorData.y1} r="3.5" fill="#FA4616" fillOpacity="0.65" />
    </svg>
  )}
  <div className="split-pane-row">

    {/* LEFT: ATTRIBUTE LIST */}
    <div className="attr-list-panel">
      <div className="panel-header">
        <span>Quick Field View</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: "#9ca3af" }}>
          {attributes.length} fields
        </span>
      </div>

      <div className="panel-body" onScroll={computeConnector}>
        {attributes.map((attr) => {
          const hasAiInsight = includeExecutiveSummary && attr.values?.some(
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

              {/* VALUE CHIPS — one per candidate */}
              <div className="attr-values-row">
                {attr.values.map((v: any, vIdx: number) => {
                  const cand = candidates.find((c: any) => c.id === v.candidateId);
                  const doc = documents.find((d: any) => d.id === v.documentId) || documents[vIdx];
                  const displayLabel = cand?.label || doc?.name || `Document ${vIdx + 1}`;
                  const isWinner = evaluations.find(
                    (e: any) => e.candidateId === v.candidateId &&
                      (e.attributeId === attr.attributeId || e.attributeName === attr.attributeName)
                  )?.isWinner;
                  return (
                    <span
                      key={v.documentId ?? v.candidateId}
                      className={`val-chip${isWinner ? " winner" : ""}`}
                      onClick={(e) => { e.stopPropagation(); handleAttributeRowClick(attr, v.candidateId, v.documentId, vIdx); }}
                      title={`${displayLabel}: ${v.value || "\u2014"}`}
                    >
                      <span className="val-chip-label">{displayLabel}:</span>
                      {formatValue(attr.attributeName, v.value) || "\u2014"}
                    </span>
                  );
                })}
              </div>

              {/* META ROW */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                {attr.riskLevel && (
                  <span className={`badge badge-risk-${attr.riskLevel.toLowerCase()}`}>
                    {attr.riskLevel} Risk
                  </span>
                )}
                {attr.values?.[0]?.confidenceScore !== undefined && (
                  <span style={{ fontSize: 12, color: "#6b7280" }}>
                    {Math.round(attr.values[0].confidenceScore * 100)}% confidence
                  </span>
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
  <div className="results-card">
    <h2>Attribute AI Insights</h2>

    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {attributes.map(attr => {

        const insight = attr.values
          ?.map(v => v.attributeAiInsight)
          .find(v => v && v !== "Not Found");

        if (!insight) return null;

        const ai = safeParseInsight(insight);

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
              <div style={{ marginTop: 4 }}>
                {ai.description}
              </div>
            )}

            {ai?.impact && (
              <div style={{ marginTop: 6 }}>
                <span className={`badge ${getRiskLevelClass(ai.impact)}`}>
                  {ai.impact}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  </div>
)}




















        {activeTab === "chat" && (
          <ChatTab
            chatMessages={chatMessages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            sendChatQuestion={sendChatQuestion}
            chatLoading={chatLoading}
          />
        )}

     
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

const winner = candidates.find(c => c.isWinner) || sortedCandidates[0] || null;


return (
  <>
    <div className="results-container">


      <PageBreadcrumb
        items={[
          { label: "My Insights", onClick: () => navigate("/my-insights") },
          { label: "Comparison Results" },
        ]}
        actions={
          <button type="button" className="btn btn-secondary" onClick={handleExportPdf} title="Export to PDF">
            <Download size={15} />
            <span>Download PDF</span>
          </button>
        }
      />


  {/* ============================= */}
  {/* HEADER SECTION */}
  {/* ============================= */}
  <div className="comparison-header">

    <div className="header-left">
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Comparison Results</h3>

      <div className="header-meta">
        <span className={`mode-pill mode-pill-${mode === "Scoring" ? "compare-scoring" : mode.toLowerCase()}`}>{mode}</span>
        <span><strong>Documents:</strong> {candidates.length}</span>

        {runMeta?.createdBy && (
          <span><strong>Run By:</strong> {runMeta.createdBy}</span>
        )}

        {runMeta?.createdOn && (
          <span>
            <strong>Run On:</strong>{" "}
            {new Date(runMeta.createdOn).toLocaleString("en-GB")}
          </span>
        )}
      </div>
    </div>

    <div className="header-right">
      {winner && (
        <div className="winner-card">
          🏆 Winner: <strong>{winner.label}</strong>
        </div>
      )}
    </div>

  </div>









<div className="premium-tabs">
  {[
  { key: "summary", label: "Overview", icon: <LayoutDashboard size={15} />, count: null },
  { key: "fields", label: "Comparison", icon: <FileText size={15} />, count: attributes.length },
  ...(candidates.length > 0 ? [{ key: "scoring", label: "Scoring", icon: <BarChart2 size={15} />, count: null }] : []),
  ...(attributes.some(hasValidAiInsight) ? [{ key: "ai", label: "AI Insights", icon: <Sparkles size={15} />, count: null }] : []),
  { key: "chat", label: "AI Q&A", icon: <MessageCircle size={15} />, count: null },
].map(tab => (
    <div
      key={tab.key}
      onClick={() => setActiveTab(tab.key as any)}
      className={`premium-tab${activeTab === tab.key ? " active" : ""}`}
    >
      {React.cloneElement(tab.icon, {
        color: activeTab === tab.key ? "#FA4616" : "#9ca3af"
      })}
      {tab.label}
      {tab.count !== null && (
        <span className="tab-count">{tab.count}</span>
      )}
    </div>
  ))}
</div>

    {/* ============================= */
    /* AI INSIGHTS */
    /* ============================= */}

          {activeTab === "summary" && (
          <>
            {includeExecutiveSummary && insightRows.length > 0 ? (
              <AiInsightsSection
                insightRows={insightRows}
                selectedInsightProfileName={selectedInsightProfileName}
                setSelectedInsightProfileName={setSelectedInsightProfileName}
                selectedInsight={selectedInsight}
                selectedInsightRow={selectedInsightRow}
              />
            ) : (
              <div className="results-card ai-empty-state">
                <div className="ai-empty-icon"><Sparkles size={28} strokeWidth={1.5} /></div>
                <div className="ai-empty-title">No Executive Summary</div>
                <div className="ai-empty-body">
                  Executive Summary was not selected for this run.<br />
                  Enable it via <strong>AI Options</strong> when starting a new insight.
                </div>
              </div>
            )}
          </>
        )}    
    

    {/* ================================
        PARAMETER COMPARISON (FIXED)
    ================================= */}


      {activeTab === "ai" && (
      <>
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
                  {formatValue(attr.attributeName, match?.value)}

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
      </>
      )}



      {activeTab === "fields" && (
        <div ref={splitPaneContainerRef} className="split-pane-container">
          {connectorData && (
            <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 20, overflow: "visible" }} aria-hidden="true">
              <defs>
                <marker id="conn-arrow-c" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
                  <polygon points="0 0, 7 2.5, 0 5" fill="#FA4616" fillOpacity="0.75" />
                </marker>
              </defs>
              <path d={`M ${connectorData.x1} ${connectorData.y1} C ${connectorData.x1 + 80} ${connectorData.y1}, ${connectorData.x2 - 80} ${connectorData.y2}, ${connectorData.x2} ${connectorData.y2}`} stroke="#FA4616" strokeWidth="1.5" strokeDasharray="5 3" fill="none" strokeOpacity="0.65" markerEnd="url(#conn-arrow-c)" />
              <circle cx={connectorData.x1} cy={connectorData.y1} r="3.5" fill="#FA4616" fillOpacity="0.65" />
            </svg>
          )}
          <div className="split-pane-row">

            {/* LEFT: ATTRIBUTE LIST */}
            <div className="attr-list-panel">
              <div className="panel-header">
                <span>Attribute Comparison</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: "#9ca3af" }}>
                  {attributes.length} fields
                </span>
              </div>

              <div className="panel-body" onScroll={computeConnector}>
                {attributes.map((attr) => {
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

                      {/* VALUE CHIPS — one per candidate */}
                      <div className="attr-values-row">
                        {attr.values.map((v: any, vIdx: number) => {
                          const cand = candidates.find((c: any) => c.id === v.candidateId);
                          const doc = documents.find((d: any) => d.id === v.documentId) || documents[vIdx];
                          const displayLabel = cand?.label || doc?.name || `Document ${vIdx + 1}`;
                          const evaluation = evaluations.find(
                            (e: any) => e.candidateId === v.candidateId &&
                              (e.attributeId === attr.attributeId || e.attributeName === attr.attributeName)
                          );
                          const isWinner = evaluation?.isWinner;
                          return (
                            <span
                              key={v.documentId ?? v.candidateId}
                              className={`val-chip${isWinner ? " winner" : ""}`}
                              onClick={(e) => { e.stopPropagation(); handleAttributeRowClick(attr, v.candidateId, v.documentId, vIdx); }}
                              title={`${displayLabel}: ${v.value || "\u2014"}`}
                            >
                              <span className="val-chip-label">{displayLabel}:</span>
                              {formatValue(attr.attributeName, v.value) || "\u2014"}
                            </span>
                          );
                        })}
                      </div>

                      {/* EXPANDED VIEW — iterates attr.values so data always shows correctly */}
                      {isExpanded && (
                        <div style={{ marginTop: 6 }}>
                          {attr.values.map((v: any, vIdx: number) => {
                            const cand = candidates.find((c: any) => c.id === v.candidateId);
                            const doc = documents.find((d: any) => d.id === v.documentId) || documents[vIdx];
                            const displayLabel = cand?.label || doc?.name || `Document ${vIdx + 1}`;
                            const evaluation = evaluations.find(
                              (e) =>
                                e.candidateId === v.candidateId &&
                                (e.attributeId === attr.attributeId ||
                                  e.attributeName === attr.attributeName)
                            );
                            const isWinner = evaluation?.isWinner;

                            return (
                              <div
                                key={v.documentId ?? v.candidateId}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAttributeRowClick(attr, v.candidateId, v.documentId, vIdx);
                                }}
                                className={`candidate-value-row${isWinner ? " winner" : ""}`}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <strong style={{ fontSize: 14 }}>{displayLabel}</strong>
                                  {isWinner && <span className="badge badge-positive">Winner</span>}
                                </div>
                                <div style={{ marginTop: 4, fontSize: 14 }}>
                                  {formatValue(attr.attributeName, v.value) || "—"}
                                </div>
                                <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                                  {v.confidenceScore !== undefined && (
                                    <span style={{ fontSize: 12, color: "#6b7280" }}>
                                      {Math.round(v.confidenceScore * 100)}% confidence
                                    </span>
                                  )}
                                  {v.pageNumber && (
                                    <span style={{ fontSize: 12, color: "#6b7280" }}>Pg {v.pageNumber}</span>
                                  )}
                                </div>
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
                    \u21b3 {selectedAttribute.attributeName}
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

        
  <div className="results-card">
        

          {/* Ranking */}
            <div
              style={{
                marginBottom: 16,
                paddingBottom: 12,
                borderBottom: "1px solid #e5e7eb"
              }}
            >
              <h2>Ranking</h2>

              {sortedCandidates.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    borderRadius: 6,
                    background: winner?.id === c.id ? "#f0fdf4" : "#f9fafb",
                    border: winner?.id === c.id ? "1px solid #bbf7d0" : "1px solid #e5e7eb",
                    fontWeight: winner?.id === c.id ? 600 : 500,
                    marginBottom: 6
                  }}
                >
                  <span>
                    {winner?.id === c.id ? "🏆 " : ""}
                    {c.label}
                  </span>
                  <span>{c.totalScore} pts</span>
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
  {attributes.map((attr) => {
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
              borderTop: "1px solid #f3f4f6"
            }}
          >
            {attr.attributeName}
          </td>

          {/* SCORE DOTS */}
          {candidates.map((c) => {
            const isWinner = getCompareWinnerForCandidate(attr, c.id);

            return (
              <td
                key={c.id}
                style={{
                  textAlign: "center",
                  padding: 10,
                  borderTop: "1px solid #f3f4f6"
                }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    margin: "0 auto",
                    background: isWinner ? "#10b981" : "#d1d5db"
                  }}
                />
              </td>
            );
          })}

          {/* EXPAND BUTTON (RIGHT MOST COLUMN) */}
          <td
            style={{
              textAlign: "center",
              padding: 10,
              borderTop: "1px solid #f3f4f6"
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background:
                  expandedScoreRow === attr.attributeId
                    ? "#e5e7eb"
                    : "#f3f4f6",
                color: "#374151",
                fontSize: 14,
                fontWeight: 600,
                transition: "all 0.2s ease"
              }}
            >
              {expandedScoreRow === attr.attributeId ? "−" : "+"}
            </div>
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

                    const isWinner = getCompareWinnerForCandidate(attr, c.id);

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
                          {formatValue(attr.attributeName, match?.value)}
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
      )}

    {activeTab === "chat" && (
      <ChatTab
        chatMessages={chatMessages}
        chatInput={chatInput}
        setChatInput={setChatInput}
        sendChatQuestion={sendChatQuestion}
        chatLoading={chatLoading}
      />
    )}

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