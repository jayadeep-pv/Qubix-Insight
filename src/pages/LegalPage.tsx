import { Link } from "react-router-dom";
import { Layers } from "lucide-react";
import "./LegalPage.css";

type LegalKind = "privacy" | "terms" | "security";

const UPDATED = "21 September 2026";

const CONTENT: Record<LegalKind, { title: string; sections: { heading: string; body: string[] }[] }> = {
  privacy: {
    title: "Privacy Policy",
    sections: [
      {
        heading: "What we collect",
        body: [
          "Account details you give us when signing up for the trial: name, work email address, company name and job title.",
          "The documents you upload for analysis, and the attributes, findings and scores our AI generates from them.",
          "Basic usage data (pages visited, features used) to help us understand how the trial is used.",
        ],
      },
      {
        heading: "How we use it",
        body: [
          "To provide the Service — running your uploaded documents through extraction, comparison and AI insight profiles, and showing you the results.",
          "To manage your trial account, including trial length and any communication about your trial.",
          "To improve the product. We do not use your uploaded documents to train shared or public AI models.",
        ],
      },
      {
        heading: "Where it's processed",
        body: [
          "Your data is hosted on Microsoft Azure infrastructure and stored in Microsoft Dataverse, with each trial account's data kept logically separate from other accounts.",
          "We use Microsoft Entra External ID to handle sign-in — we never see or store your password.",
        ],
      },
      {
        heading: "Your rights",
        body: [
          "Under UK GDPR you can ask us what personal data we hold about you, ask us to correct it, or ask us to delete your account and its data. Contact us at the address below and we'll action this within a reasonable time.",
          "Trial data is deleted a reasonable period after a trial ends unless you convert to a paid plan.",
        ],
      },
      {
        heading: "Contact",
        body: ["Questions about this policy: support@qubixinsight.com"],
      },
    ],
  },
  terms: {
    title: "Terms of Service",
    sections: [
      {
        heading: "The trial",
        body: [
          "This trial gives you time-limited, no-cost access to Qubix Insight so you can evaluate whether it's right for your organisation. We may end or extend a trial at our discretion.",
          "The trial is provided \"as is\" without warranty of any kind, and our liability arising from your use of the trial is limited to the fullest extent permitted by law.",
        ],
      },
      {
        heading: "Your content",
        body: [
          "You keep ownership of any documents you upload and any output generated from them. We don't claim any rights over your content beyond what's needed to run the Service for you.",
          "You're responsible for having the right to upload the documents you submit, and for not using the Service for anything unlawful.",
        ],
      },
      {
        heading: "Acceptable use",
        body: [
          "Don't attempt to disrupt the Service, reverse-engineer it, or use it to process another party's confidential documents without their consent.",
          "We may suspend access if we reasonably believe these terms are being breached.",
        ],
      },
      {
        heading: "Ending the trial",
        body: [
          "You can stop using the Service at any time. If you'd like your trial data deleted, contact us and we'll remove it.",
        ],
      },
      {
        heading: "Governing law",
        body: ["These terms are governed by the laws of England and Wales."],
      },
    ],
  },
  security: {
    title: "Security",
    sections: [
      {
        heading: "Infrastructure",
        body: [
          "Qubix Insight runs on Microsoft Azure. Data is encrypted in transit (TLS) and at rest.",
          "Each tenant's records are isolated at the data layer — one organisation cannot query or see another's documents, runs or findings.",
        ],
      },
      {
        heading: "Access control",
        body: [
          "Sign-in is handled by Microsoft Entra ID / Entra External ID — we don't store passwords ourselves.",
          "Access within the product is scoped to your organisation and, where roles are configured, to specific permission levels.",
        ],
      },
      {
        heading: "AI processing",
        body: [
          "Documents are sent to our AI processing pipeline solely to generate the extraction, comparison and insight results you see in the product — not to train shared or public models.",
        ],
      },
      {
        heading: "Reporting a concern",
        body: [
          "If you believe you've found a security issue, please email support@qubixinsight.com and we'll investigate promptly.",
        ],
      },
    ],
  },
};

export default function LegalPage({ kind }: { kind: LegalKind }) {
  const { title, sections } = CONTENT[kind];

  return (
    <div className="legal-root">
      <div className="legal-bg" />
      <nav className="legal-nav">
        <Link to="/" className="legal-logo">
          <div className="legal-logo-icon"><Layers size={18} /></div>
          <span className="legal-logo-name">Qubix Insight</span>
        </Link>
      </nav>

      <div className="legal-content">
        <p className="legal-notice">
          Trial-stage policy — a fuller version will apply ahead of general availability.
        </p>
        <h1 className="legal-title">{title}</h1>
        <p className="legal-updated">Last updated {UPDATED}</p>

        {sections.map(s => (
          <section key={s.heading} className="legal-section">
            <h2 className="legal-heading">{s.heading}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="legal-body">{p}</p>
            ))}
          </section>
        ))}

        <Link to="/" className="legal-back">← Back to Qubix Insight</Link>
      </div>
    </div>
  );
}
