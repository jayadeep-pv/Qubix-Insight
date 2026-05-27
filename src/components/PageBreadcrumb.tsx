import React from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
  badge?: { text: string; color: string; bg: string };
  dot?: string;
}

interface PageBreadcrumbProps {
  items: BreadcrumbItem[];
  actions?: React.ReactNode;
}

export function PageBreadcrumb({ items, actions }: PageBreadcrumbProps) {
  return (
    <div className="app-breadcrumb">
      <nav className="bc-trail" aria-label="Breadcrumb">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight size={13} className="bc-sep" aria-hidden="true" />}
              {i === 0 ? (
                <button className="bc-back" onClick={item.onClick} type="button">
                  <ArrowLeft size={14} />
                  <span>{item.label}</span>
                </button>
              ) : isLast ? (
                <span className="bc-current">
                  {item.dot && (
                    <span className="bc-dot" style={{ background: item.dot }} aria-hidden="true" />
                  )}
                  {item.label}
                  {item.badge && (
                    <span
                      className="bc-badge"
                      style={{ color: item.badge.color, background: item.badge.bg }}
                    >
                      {item.badge.text}
                    </span>
                  )}
                </span>
              ) : (
                <button className="bc-link" onClick={item.onClick} type="button">
                  {item.label}
                </button>
              )}
            </React.Fragment>
          );
        })}
      </nav>
      {actions && <div className="bc-actions">{actions}</div>}
    </div>
  );
}
