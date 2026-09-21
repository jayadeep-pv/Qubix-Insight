import React from "react";

/**
 * The Discovery workflow's "how it works" explainer — shared so the copy
 * only lives in one place. Originally embedded directly in StartReview.tsx's
 * Discovery upload screen; also shown on Home next to the dropzone.
 *
 * `compact` trims it to fit next to Home's dropzone (shorter step wording,
 * no "Best for" section) without changing what the real steps are — the
 * full version on the Discovery screen itself is unaffected.
 */
export default function DiscoveryGuideCard({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="dc-card guidance-card guidance-compact" style={{ marginTop: 0, marginBottom: 0, padding: "13px 18px" }}>
        <p className="guide-about" style={{ fontSize: 13, marginBottom: 3 }}>How it works</p>
        <p className="guide-about-desc" style={{ fontSize: 12, lineHeight: 1.45, marginBottom: 8 }}>Upload any document — no template or setup required. The AI detects fields automatically.</p>
        <div className="guide-steps" style={{ gap: 6 }}>
          <div className="guide-step" style={{ fontSize: 12 }}><div className="guide-step-num">1</div><div>Upload a document</div></div>
          <div className="guide-step" style={{ fontSize: 12 }}><div className="guide-step-num">2</div><div>Choose which AI Insight Profiles to run</div></div>
          <div className="guide-step" style={{ fontSize: 12 }}><div className="guide-step-num">3</div><div>Review the detected fields — save as a template when ready</div></div>
        </div>
      </div>
    );
  }

  return (
    <div className="dc-card guidance-card" style={{ marginTop: 0, marginBottom: 0 }}>
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
  );
}
