import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Mail, BookOpen, Zap, AlignLeft, GitCompare, Star, MessageSquare, CheckCircle } from "lucide-react";
import { PageBreadcrumb } from "../components/PageBreadcrumb";

/* ── FAQ data ── */
interface FaqItem {
  q: string;
  a: React.ReactNode;
}

const FAQS: FaqItem[] = [
  {
    q: "What are the different insight types and when should I use each?",
    a: (
      <div>
        <p>DocInsight AI offers four insight workflows:</p>
        <ul>
          <li><strong>Quick Scan</strong> — Upload any document with no template. The AI detects and extracts fields automatically. Best for exploring an unfamiliar document type for the first time.</li>
          <li><strong>Summarise Document</strong> — Upload a single document against a saved template. The AI extracts all template fields and produces an executive summary. Best for reviewing one document quickly.</li>
          <li><strong>Compare Documents</strong> — Upload two or more documents against a template. The AI extracts fields side-by-side so you can spot differences. No scoring or ranking is applied.</li>
          <li><strong>Scoring</strong> — Same as Compare but also runs your template's rule set to score each document and declare a ranked winner. Best for procurement or vendor evaluation.</li>
        </ul>
      </div>
    ),
  },
  {
    q: "What file types can I upload?",
    a: "DocInsight AI accepts PDF and Word documents (.pdf, .docx). For best results, upload text-based PDFs rather than scanned images. Scanned documents are supported via OCR but may have lower extraction accuracy.",
  },
  {
    q: "What is a Template and do I need one?",
    a: `A Template defines the fields the AI should look for inside your documents — for example "Contract Value", "Start Date", or "Penalty Clause". Templates are required for Summarise, Compare, and Scoring workflows. Only Quick Scan works without one. Your administrator sets up templates; if you cannot see one for your document type, ask them to create it.`,
  },
  {
    q: "How does the AI extract information from my documents?",
    a: "When you upload a document, DocInsight AI reads the full text content and applies a large-language-model prompt derived from your template. It looks for each template field by meaning, not just keyword matching — so a field named Total Contract Sum and one named Agreement Value would both match a Contract Value template field. Confidence scores are shown alongside each extracted value.",
  },
  {
    q: "What do the risk levels (High / Medium / Low) mean?",
    a: (
      <div>
        <p>Risk levels are calculated by the scoring engine (Scoring mode only) based on how documents perform against your template's rules:</p>
        <ul>
          <li><strong className="sp-risk--high">High</strong> — One or more critical rules were not met. Requires immediate attention before proceeding.</li>
          <li><strong className="sp-risk--medium">Medium</strong> — Some rules were partially met or advisory flags were raised. Review before proceeding.</li>
          <li><strong className="sp-risk--low">Low</strong> — All rules met or only minor advisory items raised. Document is in good standing.</li>
        </ul>
        <p>In Compare (no scoring) and Summarise modes, risk levels are not shown.</p>
      </div>
    ),
  },
  {
    q: "How many documents can I compare at once?",
    a: "There is no hard limit on the number of documents you can upload for Compare or Scoring, but for clarity and performance we recommend comparing no more than 10 documents in a single run. Summarise and Quick Scan only accept one document per run.",
  },
  {
    q: "Can I export or download my results?",
    a: "Yes. On any results page, use the Download PDF button in the header to export a formatted report. The PDF includes the extracted field values, AI insights, and (for scored runs) the scoring breakdown and winner declaration.",
  },
  {
    q: "I ran a comparison but the results look incorrect. What should I do?",
    a: "First, check that the correct template was selected — using the wrong template is the most common cause of missing or incorrect fields. If the template is correct, the document may contain scanned or image-based text that the OCR engine struggled with. Try a cleaner PDF. If the issue persists, contact support with your run ID (visible in the URL on the results page).",
  },
  {
    q: "Where can I find previous results?",
    a: 'All runs you have executed are listed under My Insights in the left navigation. Administrators can see runs from all users under All Insights. You can click any row to re-open the full results page.',
  },
];

/* ── Workflow card data ── */
const GUIDES = [
  {
    icon: <Zap size={20} />,
    iconCls: "sp-guide-icon--orange",
    title: "Quick Scan",
    steps: ["Upload any document", "AI auto-detects fields", "Review extracted data", "Save as a reusable template"],
  },
  {
    icon: <AlignLeft size={20} />,
    iconCls: "sp-guide-icon--teal",
    title: "Summarise Document",
    steps: ["Select a document type & template", "Upload your document", "Click Upload Document", "Click Generate Report"],
  },
  {
    icon: <GitCompare size={20} />,
    iconCls: "sp-guide-icon--blue",
    title: "Compare Documents",
    steps: ["Select a document type & template", "Upload 2 or more documents", "Click Upload Documents", "Click Generate Report"],
  },
  {
    icon: <Star size={20} />,
    iconCls: "sp-guide-icon--purple",
    title: "Scoring",
    steps: ["Select a template with rules", "Upload 2 or more documents", "Click Upload Documents", "Click Generate Report — scores calculated automatically"],
  },
];

/* ── Accordion item ── */
function FaqRow({ item, open, onToggle }: { item: FaqItem; open: boolean; onToggle: () => void }) {
  return (
    <div className={`sp-faq-row${open ? " sp-faq-row--open" : ""}`}>
      <button type="button" className="sp-faq-q" onClick={onToggle}>
        <span>{item.q}</span>
        <ChevronDown size={16} className={`sp-faq-chevron${open ? " sp-faq-chevron--open" : ""}`} />
      </button>
      {open && (
        <div className="sp-faq-a">
          {typeof item.a === "string" ? <p>{item.a}</p> : item.a}
        </div>
      )}
    </div>
  );
}

/* ── Contact form state ── */
interface ContactForm {
  name: string;
  email: string;
  subject: string;
  message: string;
}

const EMPTY_FORM: ContactForm = { name: "", email: "", subject: "", message: "" };

/* ══════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════ */
const SupportPage: React.FC = () => {
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);

  const setField = (k: keyof ContactForm, v: string) => setForm(prev => ({ ...prev, [k]: v }));

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
          <h1 className="sp-hero-title">Help &amp; Support</h1>
          <p className="sp-hero-sub">
            Step-by-step guides, answers to common questions, and a direct line to our support team.
          </p>
        </div>
      </div>

      {/* ── Workflow Guides ── */}
      <section className="sp-section">
        <h2 className="sp-section-title">
          <BookOpen size={18} />
          How-to Guides
        </h2>
        <div className="sp-guides-grid">
          {GUIDES.map((g) => (
            <div key={g.title} className="sp-guide-card">
              <div className={`sp-guide-icon ${g.iconCls}`}>{g.icon}</div>
              <div className="sp-guide-title">{g.title}</div>
              <ol className="sp-guide-steps">
                {g.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ + Contact split ── */}
      <div className="sp-split">

        {/* FAQ */}
        <section className="sp-section sp-faq-section">
          <h2 className="sp-section-title">
            <MessageSquare size={18} />
            Frequently Asked Questions
          </h2>
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

        {/* Contact + Tip */}
        <aside className="sp-aside">

          {/* Contact card */}
          <div className="sp-contact-card">
            <div className="sp-contact-icon"><Mail size={22} /></div>
            <h3 className="sp-contact-title">Contact Support</h3>
            <p className="sp-contact-sub">
              Can't find what you need? Send us a message and we'll get back to you.
            </p>

            {submitted ? (
              <div className="sp-submitted">
                <CheckCircle size={28} className="sp-submitted-icon" />
                <p className="sp-submitted-title">Message sent!</p>
                <p className="sp-submitted-sub">We'll respond to your email within one business day.</p>
                <button type="button" className="sp-submit-btn" onClick={() => setSubmitted(false)}>
                  Send another
                </button>
              </div>
            ) : (
              <form className="sp-form" onSubmit={handleSubmit} noValidate>
                <div className="sp-field">
                  <label className="sp-label">Your name</label>
                  <input
                    className="sp-input"
                    type="text"
                    placeholder="Jane Smith"
                    value={form.name}
                    onChange={e => setField("name", e.target.value)}
                    required
                  />
                </div>
                <div className="sp-field">
                  <label className="sp-label">Email address</label>
                  <input
                    className="sp-input"
                    type="email"
                    placeholder="jane@example.com"
                    value={form.email}
                    onChange={e => setField("email", e.target.value)}
                    required
                  />
                </div>
                <div className="sp-field">
                  <label className="sp-label">Subject</label>
                  <input
                    className="sp-input"
                    type="text"
                    placeholder="Brief description of your issue"
                    value={form.subject}
                    onChange={e => setField("subject", e.target.value)}
                  />
                </div>
                <div className="sp-field">
                  <label className="sp-label">Message</label>
                  <textarea
                    className="sp-input sp-textarea"
                    placeholder="Describe your question or issue in detail…"
                    value={form.message}
                    onChange={e => setField("message", e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="sp-submit-btn">Send Message</button>
              </form>
            )}
          </div>

          {/* Tips card */}
          <div className="sp-tips-card">
            <h3 className="sp-tips-title">Quick Tips</h3>
            <ul className="sp-tips-list">
              <li>Use <strong>Quick Scan</strong> on a new document type to auto-generate a template in minutes.</li>
              <li>Templates must be set up by an administrator before you can run Summarise or Compare.</li>
              <li>Include your <strong>Run ID</strong> (from the results page URL) when contacting support — it speeds up diagnosis.</li>
              <li>PDF results can be downloaded from any results page using the <strong>Download PDF</strong> button.</li>
            </ul>
          </div>

        </aside>
      </div>

      <style>{`
        /* ── Root ── */
        .sp-root {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 0 48px;
        }

        /* ── Hero ── */
        .sp-hero {
          background: linear-gradient(135deg, #0b1b33 0%, #172e52 100%);
          border-radius: 16px;
          padding: 18px 40px;
          margin-bottom: 36px;
          position: relative;
          overflow: hidden;
        }
        .sp-hero::after {
          content: "";
          position: absolute;
          right: -60px;
          top: -60px;
          width: 280px;
          height: 280px;
          border-radius: 50%;
          background: rgba(250,70,22,0.07);
          pointer-events: none;
        }
        .sp-hero-inner { position: relative; z-index: 1; }
        .sp-hero-title {
          font-size: 28px;
          font-weight: 700;
          color: #ffffff;
          margin: 0 0 10px;
          letter-spacing: -0.02em;
        }
        .sp-hero-sub {
          font-size: 15px;
          color: #94a3b8;
          margin: 0;
          max-width: 520px;
          line-height: 1.6;
        }

        /* ── Section ── */
        .sp-section { margin-bottom: 36px; }
        .sp-section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 16px;
          font-weight: 700;
          color: #111827;
          margin: 0 0 18px;
        }
        .sp-section-title svg { color: #FA4616; flex-shrink: 0; }

        /* ── Guides ── */
        .sp-guides-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 18px;
        }
        .sp-guide-card {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .sp-guide-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .sp-guide-icon--orange { background: #FAECE7; color: #993C1D; }
        .sp-guide-icon--teal   { background: #E1F5EE; color: #0F6E56; }
        .sp-guide-icon--blue   { background: #E6F1FB; color: #185FA5; }
        .sp-guide-icon--purple { background: #EDE9FE; color: #5B21B6; }

        .sp-guide-title {
          font-size: 14px;
          font-weight: 700;
          color: #111827;
        }
        .sp-guide-steps {
          margin: 0;
          padding-left: 18px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .sp-guide-steps li {
          font-size: 13px;
          color: #4b5563;
          line-height: 1.5;
        }

        /* ── Split layout ── */
        .sp-split {
          display: grid;
          grid-template-columns: 1fr 340px;
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
        .sp-faq-row {
          border-bottom: 1px solid #f3f4f6;
        }
        .sp-faq-row:last-child { border-bottom: none; }
        .sp-faq-row--open { background: #fafafa; }

        .sp-faq-q {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          background: none;
          border: none;
          cursor: pointer;
          text-align: left;
          font-size: 14px;
          font-weight: 600;
          color: #111827;
          line-height: 1.4;
          transition: background 0.15s;
        }
        .sp-faq-q:hover { background: #f9fafb; }

        .sp-faq-chevron {
          flex-shrink: 0;
          color: #9ca3af;
          transition: transform 0.2s ease;
        }
        .sp-faq-chevron--open {
          transform: rotate(180deg);
          color: #FA4616;
        }

        .sp-faq-a {
          padding: 4px 20px 18px;
          font-size: 14px;
          color: #4b5563;
          line-height: 1.7;
          border-top: 1px solid #f0f0f0;
        }
        .sp-faq-a p { margin: 0 0 8px; }
        .sp-faq-a p:last-child { margin-bottom: 0; }
        .sp-faq-a ul, .sp-faq-a ol {
          margin: 8px 0;
          padding-left: 20px;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        /* ── Aside ── */
        .sp-aside {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* ── Contact card ── */
        .sp-contact-card {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 24px;
        }
        .sp-contact-icon {
          width: 44px;
          height: 44px;
          border-radius: 11px;
          background: #FAECE7;
          color: #993C1D;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 14px;
        }
        .sp-contact-title {
          font-size: 15px;
          font-weight: 700;
          color: #111827;
          margin: 0 0 6px;
        }
        .sp-contact-sub {
          font-size: 13px;
          color: #6b7280;
          margin: 0 0 18px;
          line-height: 1.5;
        }

        /* ── Form ── */
        .sp-form { display: flex; flex-direction: column; gap: 12px; }
        .sp-field { display: flex; flex-direction: column; gap: 5px; }
        .sp-label { font-size: 12px; font-weight: 600; color: #374151; }
        .sp-input {
          padding: 9px 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 13px;
          color: #111827;
          background: #f9fafb;
          transition: border-color 0.15s, background 0.15s;
          outline: none;
          width: 100%;
          box-sizing: border-box;
        }
        .sp-input:focus {
          border-color: #FA4616;
          background: #ffffff;
        }
        .sp-textarea {
          height: 96px;
          resize: vertical;
          font-family: inherit;
        }
        .sp-submit-btn {
          background: #FA4616;
          color: #ffffff;
          border: none;
          padding: 10px 18px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
          width: 100%;
          margin-top: 4px;
        }
        .sp-submit-btn:hover { background: #e23f12; }

        /* ── Submitted state ── */
        .sp-submitted {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 16px 0;
          gap: 8px;
        }
        .sp-submitted-icon { color: #16a34a; }
        .sp-submitted-title { font-size: 15px; font-weight: 700; color: #111827; margin: 0; }
        .sp-submitted-sub { font-size: 13px; color: #6b7280; margin: 0 0 8px; }

        /* ── Risk label colours (FAQ) ── */
        .sp-risk--high   { color: #dc2626; }
        .sp-risk--medium { color: #d97706; }
        .sp-risk--low    { color: #16a34a; }

        /* ── Tips card ── */
        .sp-tips-card {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 14px;
          padding: 20px 24px;
        }
        .sp-tips-title {
          font-size: 13px;
          font-weight: 700;
          color: #15803d;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin: 0 0 12px;
        }
        .sp-tips-list {
          margin: 0;
          padding-left: 18px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .sp-tips-list li {
          font-size: 13px;
          color: #166534;
          line-height: 1.55;
        }

        /* ── Responsive ── */
        @media (max-width: 1024px) {
          .sp-guides-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 860px) {
          .sp-split { grid-template-columns: 1fr; }
          .sp-aside { order: -1; }
        }
        @media (max-width: 600px) {
          .sp-hero { padding: 28px 24px; }
          .sp-guides-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
};

export default SupportPage;
