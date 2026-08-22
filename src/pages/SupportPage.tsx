import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ChevronDown, Mail, BookOpen, Zap, AlignLeft, GitCompare, Star,
  MessageSquare, CheckCircle, FileText, Settings, ShieldCheck,
  LayoutDashboard, Users, Brain, Database, ListChecks, Bot,
  Download, BarChart2, Eye,
} from "lucide-react";
import { PageBreadcrumb } from "../components/PageBreadcrumb";

/* ══════════════════════════════════════════════════
   MODULE DATA
══════════════════════════════════════════════════ */
const USER_MODULES = [
  {
    icon: <Zap size={18} />,
    iconCls: "sp-mod--orange",
    title: "Discovery",
    badge: "Any document",
    desc: "Upload any document without a template. The AI automatically detects and extracts all key fields, then lets you save the result as a reusable template.",
  },
  {
    icon: <AlignLeft size={18} />,
    iconCls: "sp-mod--teal",
    title: "Summarise",
    badge: "1 document",
    desc: "Upload a single document against a saved template. The AI extracts all configured fields and generates an executive summary with risk assessment.",
  },
  {
    icon: <GitCompare size={18} />,
    iconCls: "sp-mod--blue",
    title: "Compare",
    badge: "2+ documents",
    desc: "Upload two or more documents against the same template. Fields are extracted side-by-side so differences are immediately visible across all documents.",
  },
  {
    icon: <Star size={18} />,
    iconCls: "sp-mod--purple",
    title: "Scoring",
    badge: "2+ documents",
    desc: "Extends Compare by running your template's rule set to score and rank each document. A winner is declared with a full scoring breakdown per field.",
  },
  {
    icon: <LayoutDashboard size={18} />,
    iconCls: "sp-mod--indigo",
    title: "My Insights",
    badge: "Personal view",
    desc: "Personalised dashboard showing your analysis history, KPIs, token usage, and recent activity. Access any past run directly from the timeline.",
  },
  {
    icon: <Eye size={18} />,
    iconCls: "sp-mod--cyan",
    title: "Results Viewer",
    badge: "All modes",
    desc: "Interactive results page with a split document viewer (PDF and image, with field-level polygon highlighting), comparison table, scoring cards, and the Qubix Bot AI assistant.",
  },
  {
    icon: <Bot size={18} />,
    iconCls: "sp-mod--green",
    title: "Qubix Bot",
    badge: "AI assistant",
    desc: "Context-aware AI chatbot embedded in every results page. Ask natural-language questions about any document — answers are grounded in the document content.",
  },
  {
    icon: <Download size={18} />,
    iconCls: "sp-mod--slate",
    title: "PDF Export",
    badge: "All modes",
    desc: "Download a branded PDF report from any results page. Includes extracted field values, AI insights, risk summary, and (for Scoring) the full ranking table.",
  },
];

const ADMIN_MODULES = [
  {
    icon: <Database size={18} />,
    iconCls: "sp-mod--orange",
    title: "Document Types",
    desc: "Define the categories of documents your organisation analyses (e.g. Tenancy Agreement, Supplier Contract). Each document type acts as a container for its templates.",
  },
  {
    icon: <FileText size={18} />,
    iconCls: "sp-mod--blue",
    title: "Templates",
    desc: "Create and manage analysis templates that define which fields the AI should extract from a document type. Each template is linked to one document type.",
  },
  {
    icon: <ListChecks size={18} />,
    iconCls: "sp-mod--teal",
    title: "Template Attributes",
    desc: "Configure the individual fields within a template (e.g. Contract Value, Start Date, Penalty Clause). Each attribute includes a key, display name, and AI extraction hint.",
  },
  {
    icon: <ShieldCheck size={18} />,
    iconCls: "sp-mod--red",
    title: "Rules",
    desc: "Define scoring rules that evaluate extracted field values against thresholds or conditions. Rules determine the risk level and score contribution for each field in Scoring mode.",
  },
  {
    icon: <Brain size={18} />,
    iconCls: "sp-mod--purple",
    title: "AI Insight Profiles",
    desc: "Configure AI-powered analysis profiles (e.g. Executive Summary, Risk Assessment) that run alongside extraction. Profiles generate narrative insights attached to each result.",
  },
  {
    icon: <Users size={18} />,
    iconCls: "sp-mod--indigo",
    title: "All Insights",
    desc: "Organisation-wide view of every analysis run across all users. Filter, search, and open any run to review results. Includes token usage tracking per run.",
  },
  {
    icon: <BarChart2 size={18} />,
    iconCls: "sp-mod--green",
    title: "Insights Dashboard",
    desc: "Administrator dashboard with aggregated KPIs: total runs, token consumption, risk distribution, mode usage breakdown, and a live AI activity feed.",
  },
  {
    icon: <Settings size={18} />,
    iconCls: "sp-mod--slate",
    title: "Settings",
    desc: "Tenant-level configuration including organisation name, support contact, branding preferences, trial limits, and Azure infrastructure connection settings.",
  },
];

/* ══════════════════════════════════════════════════
   HOW-TO GUIDE DATA
══════════════════════════════════════════════════ */
const GUIDES = [
  {
    icon: <Zap size={20} />,
    iconCls: "sp-guide-icon--orange",
    title: "Discovery",
    badge: "No template needed",
    badgeCls: "sp-guide-badge--orange",
    steps: [
      "Go to New Insight → Discovery",
      "Upload any PDF, Word, or image document",
      "Click Scan Document",
      "Review and edit the AI-detected fields",
      "Optionally save as a reusable template",
    ],
  },
  {
    icon: <AlignLeft size={20} />,
    iconCls: "sp-guide-icon--teal",
    title: "Summarise",
    badge: "Template required",
    badgeCls: "sp-guide-badge--teal",
    steps: [
      "Go to New Insight → Summarise",
      "Select your Document Type and Template",
      "Upload the document",
      "Select AI Insight Profiles (optional)",
      "Click Start Analysis",
    ],
  },
  {
    icon: <GitCompare size={20} />,
    iconCls: "sp-guide-icon--blue",
    title: "Compare",
    badge: "Template required",
    badgeCls: "sp-guide-badge--blue",
    steps: [
      "Go to New Insight → Compare",
      "Select your Document Type and Template",
      "Upload 2 or more documents",
      "Select AI Insight Profiles (optional)",
      "Click Start Analysis",
    ],
  },
  {
    icon: <Star size={20} />,
    iconCls: "sp-guide-icon--purple",
    title: "Scoring",
    badge: "Template + Rules required",
    badgeCls: "sp-guide-badge--purple",
    steps: [
      "Go to New Insight → Scoring",
      "Select a Template that has Rules configured",
      "Upload 2 or more documents",
      "Select AI Insight Profiles for deeper analysis",
      "Click Start Analysis — scores are calculated automatically",
    ],
  },
];

/* ══════════════════════════════════════════════════
   FAQ DATA
══════════════════════════════════════════════════ */
interface FaqItem { q: string; a: React.ReactNode; }

const FAQS: FaqItem[] = [
  {
    q: "What are the four analysis modes and when should I use each?",
    a: (
      <div>
        <p>Qubix Insight offers four analysis workflows:</p>
        <ul>
          <li><strong>Discovery</strong> — No template required. Best for exploring a new document type or one-off extractions. The AI discovers fields automatically.</li>
          <li><strong>Summarise</strong> — Requires a template. Extracts all configured fields from a single document and generates an executive summary.</li>
          <li><strong>Compare</strong> — Requires a template. Extracts the same fields from 2 or more documents side-by-side for easy comparison.</li>
          <li><strong>Scoring</strong> — Requires a template with rules. Same as Compare but also scores and ranks each document against your rule set.</li>
        </ul>
      </div>
    ),
  },
  {
    q: "What file types are supported?",
    a: (
      <div>
        <p>Qubix Insight accepts <strong>PDF</strong> (.pdf), <strong>Word</strong> (.docx), and common <strong>image</strong> formats (.png, .jpg/.jpeg, .gif, .bmp, .webp, .tiff) for every analysis mode.</p>
        <p>Text-based PDFs and images give the best extraction accuracy. Scanned or photographed documents are processed via OCR and may have slightly lower accuracy for complex layouts.</p>
        <p><strong>Note on field highlighting:</strong> clicking a field to highlight its exact position in the document viewer only works for PDFs and images. Word documents don't carry the positional data needed for that — extraction itself is just as accurate, but results show the fields without an on-document highlight.</p>
      </div>
    ),
  },
  {
    q: "What is a Template and who creates them?",
    a: `A Template defines the fields the AI should extract from your documents — for example "Contract Value", "Start Date", or "Termination Clause". Templates are created and managed by administrators under Admin → Document Types → Templates. If you cannot see a template for your document type, contact your System Administrator.`,
  },
  {
    q: "What are AI Insight Profiles?",
    a: "AI Insight Profiles are configurable AI analysis modules that run alongside field extraction. Examples include Executive Summary (a plain-English overview of the document) and Risk Assessment (identifies legal, financial, and operational risks). Profiles are set up by administrators and can be selected per run.",
  },
  {
    q: "How does field highlighting work in the document viewer?",
    a: "When you click a field in the results panel, Qubix Insight highlights the exact region of the source document where that value was found, using bounding-box coordinates returned by the Azure Document Intelligence OCR engine. This is available for PDF and image uploads. Word documents (.docx) don't carry that positional data, so their results show the extracted fields and a document preview without an on-document highlight.",
  },
  {
    q: "What is Qubix Bot?",
    a: "Qubix Bot is an AI assistant embedded in every results page. It has read the full content of the current document and can answer natural-language questions about it — for example \"What are the break clauses?\", \"Who are the parties?\", or \"Summarise Section 4\". It is document-scoped and does not access external data.",
  },
  {
    q: "What do the risk levels (High / Medium / Low) mean?",
    a: (
      <div>
        <p>Risk levels are applied per-field by the scoring engine (Scoring mode only) based on your template's rules:</p>
        <ul>
          <li><strong className="sp-risk--high">High</strong> — One or more critical rules were not met. Requires immediate attention.</li>
          <li><strong className="sp-risk--medium">Medium</strong> — Rules were partially met or advisory flags were raised. Review before proceeding.</li>
          <li><strong className="sp-risk--low">Low</strong> — All rules met. Document is in good standing.</li>
        </ul>
        <p>In Compare and Summarise modes, risk levels reflect field-level confidence and completeness rather than rule evaluation.</p>
      </div>
    ),
  },
  {
    q: "How many documents can I compare at once?",
    a: "There is no hard limit on the number of documents you can upload for Compare or Scoring. For performance and clarity, we recommend no more than 10 documents per run. Summarise and Discovery accept one document per run only.",
  },
  {
    q: "Can I export or download my results?",
    a: "Yes. On any results page, click the Download PDF button in the header to export a formatted report. The PDF includes extracted field values, AI insight narratives, and — for Scoring runs — the full scoring breakdown and winner declaration.",
  },
  {
    q: "How do I set up a new Document Type and Template?",
    a: (
      <div>
        <p>Administrators can set up new document types and templates as follows:</p>
        <ol>
          <li>Go to <strong>Admin → Document Types</strong> and create a new document type (e.g. "Supplier Contract").</li>
          <li>Inside the document type, create a <strong>Template</strong> and add <strong>Attributes</strong> for each field you want to extract.</li>
          <li>Optionally, add <strong>Rules</strong> to each attribute to enable Scoring.</li>
          <li>Link <strong>AI Insight Profiles</strong> to the template for narrative insights.</li>
          <li>Users can now select the template when starting a Summarise, Compare, or Scoring run.</li>
        </ol>
      </div>
    ),
  },
  {
    q: "Where can I find previous results?",
    a: "All runs you have executed appear under My Insights in the left navigation. Administrators can view runs from all users under All Insights. Click any row to re-open the full results page.",
  },
  {
    q: "A run produced incorrect or missing field values — what should I do?",
    a: "First verify the correct template was selected (wrong template is the most common cause). If the template is correct, the document may be scanned or image-based — try a cleaner text-based PDF. If the issue persists, note your Run ID from the results page URL and contact support.",
  },
];

/* ══════════════════════════════════════════════════
   FAQ ROW COMPONENT
══════════════════════════════════════════════════ */
function FaqRow({ item, open, onToggle }: { item: FaqItem; open: boolean; onToggle: () => void }) {
  return (
    <div className={`sp-faq-row${open ? " sp-faq-row--open" : ""}`}>
      <button type="button" className="sp-faq-q" onClick={onToggle}>
        <span>{item.q}</span>
        <ChevronDown size={15} className={`sp-faq-chevron${open ? " sp-faq-chevron--open" : ""}`} />
      </button>
      {open && (
        <div className="sp-faq-a">
          {typeof item.a === "string" ? <p>{item.a}</p> : item.a}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   CONTACT FORM
══════════════════════════════════════════════════ */
interface ContactForm { name: string; email: string; subject: string; message: string; }
const EMPTY_FORM: ContactForm = { name: "", email: "", subject: "", message: "" };

/* ══════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════ */
const SupportPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const contactRef = useRef<HTMLDivElement>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);

  // Handle sidebar navigation scroll targets
  useEffect(() => {
    const state = location.state as any;
    if (state?.scrollToContact && contactRef.current) {
      setTimeout(() => contactRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } else if (state?.scrollToTop) {
      setTimeout(() => {
        const el = document.querySelector(".content") as HTMLElement | null;
        if (el) el.scrollTop = 0;
      }, 50);
    }
  }, [location.state]);

  const setField = (k: keyof ContactForm, v: string) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) return;
    setSubmitted(true);
    setForm(EMPTY_FORM);
  };

  return (
    <div className="sp-root">

      <PageBreadcrumb
        items={[{ label: "Back", onClick: () => navigate(-1) }, { label: "Help & Support" }]}
      />

      {/* ── Hero ── */}
      <div className="sp-hero">
        <div className="sp-hero-inner">
          <div className="sp-hero-eyebrow">Qubix Insight · Documentation</div>
          <h1 className="sp-hero-title">Help &amp; Support Centre</h1>
          <p className="sp-hero-sub">
            Everything you need to get the most out of Qubix Insight — module guides,
            step-by-step workflows, FAQs, and direct support.
          </p>
          <div className="sp-hero-stats">
            <div className="sp-hero-stat"><span className="sp-hero-stat-num">4</span><span>Analysis Modes</span></div>
            <div className="sp-hero-stat-div" />
            <div className="sp-hero-stat"><span className="sp-hero-stat-num">8</span><span>User Modules</span></div>
            <div className="sp-hero-stat-div" />
            <div className="sp-hero-stat"><span className="sp-hero-stat-num">8</span><span>Admin Modules</span></div>
            <div className="sp-hero-stat-div" />
            <div className="sp-hero-stat"><span className="sp-hero-stat-num">12</span><span>FAQs Answered</span></div>
          </div>
        </div>
        <div className="sp-hero-deco" />
      </div>

      {/* ── User Modules ── */}
      <section className="sp-section">
        <div className="sp-section-hd">
          <h2 className="sp-section-title"><Eye size={18} />User Modules</h2>
          <p className="sp-section-sub">Features available to all users of Qubix Insight.</p>
        </div>
        <div className="sp-mod-grid">
          {USER_MODULES.map(m => (
            <div key={m.title} className="sp-mod-card">
              <div className="sp-mod-card-top">
                <div className={`sp-mod-icon ${m.iconCls}`}>{m.icon}</div>
                <span className={`sp-mod-badge ${m.iconCls}`}>{m.badge}</span>
              </div>
              <div className="sp-mod-title">{m.title}</div>
              <p className="sp-mod-desc">{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Admin Modules ── */}
      <section className="sp-section">
        <div className="sp-section-hd">
          <h2 className="sp-section-title"><Settings size={18} />Administrator Modules</h2>
          <p className="sp-section-sub">Configuration and management tools available to System Administrators.</p>
        </div>
        <div className="sp-mod-grid">
          {ADMIN_MODULES.map(m => (
            <div key={m.title} className="sp-mod-card sp-mod-card--admin">
              <div className="sp-mod-card-top">
                <div className={`sp-mod-icon ${m.iconCls}`}>{m.icon}</div>
              </div>
              <div className="sp-mod-title">{m.title}</div>
              <p className="sp-mod-desc">{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How-to Guides ── */}
      <section className="sp-section">
        <div className="sp-section-hd">
          <h2 className="sp-section-title"><BookOpen size={18} />Step-by-Step Guides</h2>
          <p className="sp-section-sub">Follow these steps to run each type of analysis.</p>
        </div>
        <div className="sp-guides-grid">
          {GUIDES.map(g => (
            <div key={g.title} className="sp-guide-card">
              <div className="sp-guide-card-top">
                <div className={`sp-guide-icon ${g.iconCls}`}>{g.icon}</div>
                <span className={`sp-guide-badge ${g.badgeCls}`}>{g.badge}</span>
              </div>
              <div className="sp-guide-title">{g.title}</div>
              <ol className="sp-guide-steps">
                {g.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ + Contact ── */}
      <div className="sp-split">

        <section className="sp-section sp-faq-section">
          <div className="sp-section-hd">
            <h2 className="sp-section-title"><MessageSquare size={18} />Frequently Asked Questions</h2>
            <p className="sp-section-sub">Answers to the most common questions about Qubix Insight.</p>
          </div>
          <div className="sp-faq-list">
            {FAQS.map((item, i) => (
              <FaqRow
                key={i}
                item={item}
                open={openFaq === i}
                onToggle={() => setOpenFaq(openFaq === i ? null : i)}
              />
            ))}
          </div>
        </section>

        <aside className="sp-aside">

          {/* Contact card */}
          <div className="sp-contact-card" ref={contactRef}>
            <div className="sp-contact-header">
              <div className="sp-contact-icon"><Mail size={20} /></div>
              <div>
                <h3 className="sp-contact-title">Contact Support</h3>
                <p className="sp-contact-sub">We respond within one business day.</p>
              </div>
            </div>

            {submitted ? (
              <div className="sp-submitted">
                <CheckCircle size={32} className="sp-submitted-icon" />
                <p className="sp-submitted-title">Message sent!</p>
                <p className="sp-submitted-sub">We'll respond to your email within one business day.</p>
                <button type="button" className="sp-submit-btn" onClick={() => setSubmitted(false)}>
                  Send another message
                </button>
              </div>
            ) : (
              <form className="sp-form" onSubmit={handleSubmit} noValidate>
                <div className="sp-form-row">
                  <div className="sp-field">
                    <label className="sp-label">Your name</label>
                    <input className="sp-input" type="text" placeholder="Jane Smith"
                      value={form.name} onChange={e => setField("name", e.target.value)} required />
                  </div>
                  <div className="sp-field">
                    <label className="sp-label">Email address</label>
                    <input className="sp-input" type="email" placeholder="jane@example.com"
                      value={form.email} onChange={e => setField("email", e.target.value)} required />
                  </div>
                </div>
                <div className="sp-field">
                  <label className="sp-label">Subject</label>
                  <input className="sp-input" type="text" placeholder="Brief description of your issue"
                    value={form.subject} onChange={e => setField("subject", e.target.value)} />
                </div>
                <div className="sp-field">
                  <label className="sp-label">Message</label>
                  <textarea className="sp-input sp-textarea"
                    placeholder="Describe your question or issue in detail. Include your Run ID if reporting a specific result problem."
                    value={form.message} onChange={e => setField("message", e.target.value)} required />
                </div>
                <button type="submit" className="sp-submit-btn">Send Message</button>
              </form>
            )}
          </div>

          {/* Quick Tips */}
          <div className="sp-tips-card">
            <h3 className="sp-tips-title">Quick Tips</h3>
            <ul className="sp-tips-list">
              <li>Use <strong>Discovery</strong> to auto-generate a template from any new document type in minutes.</li>
              <li>Templates, attributes, and rules must be configured by a <strong>System Administrator</strong> before Summarise, Compare, or Scoring can be used.</li>
              <li>Click any field value in the results panel to highlight its exact position in the document viewer (PDF and image files only — Word documents don't support highlighting).</li>
              <li>Ask <strong>Qubix Bot</strong> on the results page to answer questions about the document content.</li>
              <li>Include your <strong>Run ID</strong> (from the results page URL) when contacting support — it speeds up diagnosis significantly.</li>
              <li>PDF reports can be downloaded from any results page using the <strong>Download PDF</strong> button in the header.</li>
            </ul>
          </div>

          {/* Admin Guide */}
          <div className="sp-admin-card">
            <div className="sp-admin-card-header">
              <Settings size={15} />
              <h3 className="sp-admin-card-title">Administrator Quick Reference</h3>
            </div>
            <div className="sp-admin-steps">
              <div className="sp-admin-step">
                <div className="sp-admin-step-num">1</div>
                <div><strong>Document Types</strong> — Create the category (e.g. Tenancy Agreement)</div>
              </div>
              <div className="sp-admin-step">
                <div className="sp-admin-step-num">2</div>
                <div><strong>Templates</strong> — Add a template under the document type</div>
              </div>
              <div className="sp-admin-step">
                <div className="sp-admin-step-num">3</div>
                <div><strong>Attributes</strong> — Define the fields to extract</div>
              </div>
              <div className="sp-admin-step">
                <div className="sp-admin-step-num">4</div>
                <div><strong>Rules</strong> — Add scoring rules per attribute (Scoring mode)</div>
              </div>
              <div className="sp-admin-step">
                <div className="sp-admin-step-num">5</div>
                <div><strong>AI Profiles</strong> — Link insight profiles for narrative output</div>
              </div>
            </div>
          </div>

        </aside>
      </div>

      <style>{`
        .sp-root {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 0 56px;
        }

        /* ── Hero ── */
        .sp-hero {
          background: linear-gradient(135deg, #0b1b33 0%, #172e52 60%, #1e3a6e 100%);
          border-radius: 18px;
          padding: 36px 44px;
          margin-bottom: 40px;
          position: relative;
          overflow: hidden;
        }
        .sp-hero-deco {
          position: absolute;
          right: -80px; top: -80px;
          width: 340px; height: 340px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(249,115,22,0.15) 0%, transparent 70%);
          pointer-events: none;
        }
        .sp-hero-inner { position: relative; z-index: 1; }
        .sp-hero-eyebrow {
          font-size: 11px; font-weight: 700; letter-spacing: 0.1em;
          text-transform: uppercase; color: #F97316; margin-bottom: 10px;
        }
        .sp-hero-title {
          font-size: 32px; font-weight: 800; color: #ffffff;
          margin: 0 0 12px; letter-spacing: -0.03em; line-height: 1.2;
        }
        .sp-hero-sub {
          font-size: 15px; color: #94a3b8;
          margin: 0 0 28px; max-width: 580px; line-height: 1.7;
        }
        .sp-hero-stats {
          display: flex; align-items: center; gap: 20px;
          flex-wrap: wrap;
        }
        .sp-hero-stat {
          display: flex; flex-direction: column; gap: 2px;
        }
        .sp-hero-stat-num {
          font-size: 22px; font-weight: 800; color: #F97316; display: block; line-height: 1;
        }
        .sp-hero-stat span:last-child {
          font-size: 11px; color: #64748b; letter-spacing: 0.03em;
        }
        .sp-hero-stat-div {
          width: 1px; height: 32px; background: rgba(255,255,255,0.1);
        }

        /* ── Section ── */
        .sp-section { margin-bottom: 44px; }
        .sp-section-hd { margin-bottom: 20px; }
        .sp-section-title {
          display: flex; align-items: center; gap: 8px;
          font-size: 17px; font-weight: 700; color: #111827; margin: 0 0 4px;
        }
        .sp-section-title svg { color: #F97316; flex-shrink: 0; }
        .sp-section-sub { font-size: 13px; color: #6b7280; margin: 0; }

        /* ── Module grid ── */
        .sp-mod-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }
        .sp-mod-card {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 18px;
          display: flex; flex-direction: column; gap: 8px;
          transition: box-shadow 0.15s, border-color 0.15s;
        }
        .sp-mod-card:hover {
          box-shadow: 0 4px 16px rgba(0,0,0,0.08);
          border-color: #d1d5db;
        }
        .sp-mod-card--admin {
          background: #fafafa;
        }
        .sp-mod-card-top {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
        }
        .sp-mod-icon {
          width: 34px; height: 34px; border-radius: 9px;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .sp-mod-badge {
          font-size: 10px; font-weight: 600; padding: 2px 7px;
          border-radius: 999px; white-space: nowrap; opacity: 0.85;
        }
        .sp-mod--orange { background: #FAECE7; color: #993C1D; }
        .sp-mod--teal   { background: #E1F5EE; color: #0F6E56; }
        .sp-mod--blue   { background: #E6F1FB; color: #185FA5; }
        .sp-mod--purple { background: #EDE9FE; color: #5B21B6; }
        .sp-mod--indigo { background: #EEF2FF; color: #3730a3; }
        .sp-mod--cyan   { background: #ECFEFF; color: #0e7490; }
        .sp-mod--green  { background: #F0FDF4; color: #166534; }
        .sp-mod--slate  { background: #F1F5F9; color: #334155; }
        .sp-mod--red    { background: #FEF2F2; color: #991B1B; }
        .sp-mod-title   { font-size: 13px; font-weight: 700; color: #111827; }
        .sp-mod-desc    { font-size: 12px; color: #6b7280; line-height: 1.55; margin: 0; }

        /* ── How-to guides ── */
        .sp-guides-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        .sp-guide-card {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 20px;
          display: flex; flex-direction: column; gap: 10px;
        }
        .sp-guide-card-top {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
        }
        .sp-guide-icon {
          width: 38px; height: 38px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .sp-guide-icon--orange { background: #FAECE7; color: #993C1D; }
        .sp-guide-icon--teal   { background: #E1F5EE; color: #0F6E56; }
        .sp-guide-icon--blue   { background: #E6F1FB; color: #185FA5; }
        .sp-guide-icon--purple { background: #EDE9FE; color: #5B21B6; }
        .sp-guide-badge {
          font-size: 10px; font-weight: 600; padding: 2px 7px;
          border-radius: 999px; white-space: nowrap;
        }
        .sp-guide-badge--orange { background: #FAECE7; color: #993C1D; }
        .sp-guide-badge--teal   { background: #E1F5EE; color: #0F6E56; }
        .sp-guide-badge--blue   { background: #E6F1FB; color: #185FA5; }
        .sp-guide-badge--purple { background: #EDE9FE; color: #5B21B6; }
        .sp-guide-title { font-size: 14px; font-weight: 700; color: #111827; }
        .sp-guide-steps {
          margin: 0; padding-left: 18px;
          display: flex; flex-direction: column; gap: 5px;
          counter-reset: step;
        }
        .sp-guide-steps li { font-size: 12.5px; color: #4b5563; line-height: 1.5; }

        /* ── Split ── */
        .sp-split {
          display: grid;
          grid-template-columns: 1fr 360px;
          gap: 28px;
          align-items: start;
        }

        /* ── FAQ ── */
        .sp-faq-section { margin-bottom: 0; }
        .sp-faq-list {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          overflow: hidden;
        }
        .sp-faq-row { border-bottom: 1px solid #f3f4f6; }
        .sp-faq-row:last-child { border-bottom: none; }
        .sp-faq-row--open { background: #fafafa; }
        .sp-faq-q {
          width: 100%; display: flex; justify-content: space-between;
          align-items: center; gap: 12px;
          padding: 15px 20px; background: none; border: none;
          cursor: pointer; text-align: left;
          font-size: 13.5px; font-weight: 600; color: #111827; line-height: 1.45;
          transition: background 0.15s;
        }
        .sp-faq-q:hover { background: #f9fafb; }
        .sp-faq-chevron { flex-shrink: 0; color: #9ca3af; transition: transform 0.2s ease; }
        .sp-faq-chevron--open { transform: rotate(180deg); color: #F97316; }
        .sp-faq-a {
          padding: 4px 20px 16px;
          font-size: 13.5px; color: #4b5563; line-height: 1.7;
          border-top: 1px solid #f0f0f0;
        }
        .sp-faq-a p { margin: 0 0 8px; }
        .sp-faq-a p:last-child { margin-bottom: 0; }
        .sp-faq-a ul, .sp-faq-a ol {
          margin: 8px 0; padding-left: 20px;
          display: flex; flex-direction: column; gap: 5px;
        }

        /* ── Aside ── */
        .sp-aside { display: flex; flex-direction: column; gap: 18px; }

        /* ── Contact card ── */
        .sp-contact-card {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 22px;
        }
        .sp-contact-header {
          display: flex; align-items: center; gap: 12px; margin-bottom: 18px;
        }
        .sp-contact-icon {
          width: 42px; height: 42px; border-radius: 11px;
          background: #FAECE7; color: #993C1D;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .sp-contact-title { font-size: 15px; font-weight: 700; color: #111827; margin: 0 0 2px; }
        .sp-contact-sub   { font-size: 12px; color: #6b7280; margin: 0; }

        .sp-form { display: flex; flex-direction: column; gap: 10px; }
        .sp-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .sp-field { display: flex; flex-direction: column; gap: 4px; }
        .sp-label { font-size: 12px; font-weight: 600; color: #374151; }
        .sp-input {
          padding: 8px 11px; border: 1px solid #d1d5db; border-radius: 8px;
          font-size: 13px; color: #111827; background: #f9fafb;
          transition: border-color 0.15s, background 0.15s;
          outline: none; width: 100%; box-sizing: border-box;
          height: 36px;
        }
        .sp-input:focus { border-color: #F97316; background: #ffffff; box-shadow: 0 0 0 3px rgba(249,115,22,0.08); }
        .sp-textarea { height: 84px; resize: vertical; font-family: inherit; }
        .sp-submit-btn {
          background: linear-gradient(145deg, #F97316, #EA580C);
          color: #ffffff; border: none; padding: 10px 18px; border-radius: 8px;
          font-size: 13px; font-weight: 600; cursor: pointer;
          transition: opacity 0.15s; width: 100%; margin-top: 2px;
        }
        .sp-submit-btn:hover { opacity: 0.92; }

        .sp-submitted {
          display: flex; flex-direction: column; align-items: center;
          text-align: center; padding: 16px 0; gap: 8px;
        }
        .sp-submitted-icon { color: #16a34a; }
        .sp-submitted-title { font-size: 15px; font-weight: 700; color: #111827; margin: 0; }
        .sp-submitted-sub   { font-size: 13px; color: #6b7280; margin: 0 0 8px; }

        /* ── Risk colours ── */
        .sp-risk--high   { color: #dc2626; }
        .sp-risk--medium { color: #d97706; }
        .sp-risk--low    { color: #16a34a; }

        /* ── Tips card ── */
        .sp-tips-card {
          background: #f0fdf4; border: 1px solid #bbf7d0;
          border-radius: 14px; padding: 18px 20px;
        }
        .sp-tips-title {
          font-size: 11px; font-weight: 700; color: #15803d;
          text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 12px;
        }
        .sp-tips-list {
          margin: 0; padding-left: 16px;
          display: flex; flex-direction: column; gap: 7px;
        }
        .sp-tips-list li { font-size: 12.5px; color: #166534; line-height: 1.55; }

        /* ── Admin quick ref card — matches StartReview guidance panel ── */
        .sp-admin-card {
          background: #ffffff; border: 1px solid #e5e7eb;
          border-radius: 14px; padding: 18px 20px;
        }
        .sp-admin-card-header {
          display: flex; align-items: center; gap: 7px; margin-bottom: 14px;
          color: #374151;
        }
        .sp-admin-card-title {
          font-size: 12px; font-weight: 700; color: #374151;
          text-transform: uppercase; letter-spacing: 0.06em; margin: 0;
        }
        .sp-admin-steps { display: flex; flex-direction: column; gap: 10px; }
        .sp-admin-step { display: flex; align-items: flex-start; gap: 10px; }
        .sp-admin-step-num {
          width: 20px; height: 20px; border-radius: 50%;
          background: #ECFDF5; color: #059669;
          border: 1.5px solid #6EE7B7;
          font-size: 10px; font-weight: 700;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .sp-admin-step div { font-size: 12.5px; color: #6b7280; line-height: 1.5; }
        .sp-admin-step strong { color: #374151; }

        /* ── Responsive ── */
        @media (max-width: 1100px) {
          .sp-mod-grid { grid-template-columns: repeat(2, 1fr); }
          .sp-guides-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 860px) {
          .sp-split { grid-template-columns: 1fr; }
          .sp-aside { order: -1; }
          .sp-form-row { grid-template-columns: 1fr; }
        }
        @media (max-width: 600px) {
          .sp-hero { padding: 28px 24px; }
          .sp-hero-title { font-size: 24px; }
          .sp-mod-grid { grid-template-columns: 1fr; }
          .sp-guides-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
};

export default SupportPage;
