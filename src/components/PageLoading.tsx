import React from "react";

interface Props {
  title?: string;
  hint?: string;
  error?: string;
}

export default function PageLoading({ title = "Loading…", hint = "Please wait", error }: Props) {
  return (
    <div className="app-page-loading">
      <div className="loading-card">
        {error ? (
          <div className="app-loading-error">{error}</div>
        ) : (
          <>
            <div className="app-loading-spinner" />
            <div className="app-loading-title">{title}</div>
            {hint && <div className="app-loading-hint">{hint}</div>}
          </>
        )}
      </div>
    </div>
  );
}
