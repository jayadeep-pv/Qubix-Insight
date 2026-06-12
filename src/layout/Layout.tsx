import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  Home,
  List,
  Shield,
  FileText,
  Settings,
  HelpCircle,
  FolderTree,
  BrainCircuit,
  ListChecks,
  Layers,
  Power,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useUser } from "../context/UserContext";

import "./Layout.css";

interface LayoutProps {
  onLogout: () => void;
}

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/":                           { title: "Home",                 subtitle: "Your document intelligence workspace" },
  "/dashboard":                  { title: "My Insights",          subtitle: "Recent analysis runs" },
  "/all-insights":               { title: "All Insights",         subtitle: "Organisation-wide analysis" },
  "/document-types":             { title: "Document Types",       subtitle: "Manage document classifications" },
  "/comparison-templates":       { title: "Templates",            subtitle: "Manage analysis templates" },
  "/admin/template-attributes":  { title: "Template Attributes",  subtitle: "Configure template fields" },
  "/admin/rules":                { title: "Rules",                subtitle: "Compliance and scoring rules" },
  "/admin/ai-insight-profiles":  { title: "AI Insight Profiles",  subtitle: "Configure AI extraction profiles" },
  "/settings":                   { title: "Settings",             subtitle: "Tenant and account settings" },
  "/support":                    { title: "Support",              subtitle: "Help and resources" },
};

function initials(name: string, email: string): string {
  if (name) {
    const parts = name.trim().split(" ");
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email ? email[0].toUpperCase() : "U";
}

export default function Layout({ onLogout }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isTrial, userName, userEmail, tenantName } = useUser();
  const [search, setSearch] = useState("");
  const [iconOnly, setIconOnly] = useState(false);

  const page = PAGE_META[location.pathname] ?? { title: "Qubix Insight", subtitle: "" };

  return (
    <div className="app-layout">

      {/* ── Sidebar ── */}
      <aside className={`sidebar${iconOnly ? " icon-only" : ""}`}>
        <div className="sidebar-grid" />

        {/* Logo + collapse toggle */}
        <div className="logo" title={iconOnly ? "Qubix Insight" : undefined}>
          <div className="logo-icon"><Layers size={16} /></div>
          <div className="logo-text">
            <span className="logo-name">Qubix Insight</span>
            <span className="logo-sub">iLogix Global</span>
          </div>
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={() => setIconOnly(v => !v)}
            title={iconOnly ? "Expand sidebar" : "Collapse sidebar"}
          >
            {iconOnly ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
        </div>

        <nav>
          <NavLink to="/" end title={iconOnly ? "Home" : undefined}>
            <Home size={16} />
            <span>Home</span>
          </NavLink>
          <NavLink to="/dashboard" title={iconOnly ? "My Insights" : undefined}>
            <List size={16} />
            <span>My Insights</span>
          </NavLink>

          <div className="sidebar-group">
            <div className="sidebar-group-title">Administration</div>

            <NavLink to="all-insights" title={iconOnly ? "All Insights" : undefined}>
              <Shield size={16} />
              <span>All Insights</span>
            </NavLink>

            <NavLink to="/document-types" title={iconOnly ? "Document Types" : undefined}>
              <FolderTree size={16} />
              <span>Document Types</span>
            </NavLink>

            <NavLink to="/comparison-templates" title={iconOnly ? "Templates" : undefined}>
              <FileText size={16} />
              <span>Templates</span>
            </NavLink>

            <NavLink to="/admin/template-attributes" title={iconOnly ? "Template Attributes" : undefined}>
              <ListChecks size={16} />
              <span>Template Attributes</span>
            </NavLink>

            <NavLink to="/admin/rules" title={iconOnly ? "Rules" : undefined}>
              <Shield size={16} />
              <span>Rules</span>
            </NavLink>

            <NavLink to="/admin/ai-insight-profiles" title={iconOnly ? "AI Insight Profiles" : undefined}>
              <BrainCircuit size={16} />
              <span>AI Insight Profiles</span>
            </NavLink>
          </div>

          {!isTrial && (
            <div className="sidebar-group">
              <div className="sidebar-group-title">System</div>

              <NavLink to="/settings" title={iconOnly ? "Settings" : undefined}>
                <Settings size={16} />
                <span>Settings</span>
              </NavLink>
            </div>
          )}
        </nav>

        {/* Bottom section */}
        <div className="sidebar-bottom">
          {(userName || userEmail) && (
            <div className="sidebar-user" title={iconOnly ? (userName || userEmail) : undefined}>
              <div className="sidebar-avatar">{initials(userName, userEmail)}</div>
              <div className="sidebar-user-info">
                <span className="sidebar-user-name">{userName || userEmail}</span>
                {tenantName && <span className="sidebar-user-role">{tenantName}</span>}
              </div>
            </div>
          )}

          <NavLink to="/support" className="sidebar-support" title={iconOnly ? "Support" : undefined}>
            <HelpCircle size={16} />
            <span>Support</span>
          </NavLink>

          <button type="button" className="logout-btn" onClick={onLogout} title={iconOnly ? "Logout" : undefined}>
            <Power size={16} />
            <span>Logout</span>
          </button>

        </div>
      </aside>

      {/* ── Right column ── */}
      <div className="layout-right">

        {/* Topbar */}
        <header className="topbar">
          {/* Page title */}
          <div className="topbar-title-area">
            <span className="topbar-title">{page.title}</span>
            {page.subtitle && <span className="topbar-subtitle">{page.subtitle}</span>}
          </div>

          {/* Search */}
          <div className="topbar-search">
            <Search size={14} className="topbar-search-icon" />
            <input
              className="topbar-search-input"
              placeholder="Quick search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Right: company pill + user name */}
          <div className="topbar-right">
            {tenantName && (
              <div
                className="topbar-tenant"
                onClick={isTrial ? () => navigate("/support") : undefined}
                style={isTrial ? { cursor: "pointer" } : undefined}
                title={isTrial ? "Trial account — click to upgrade" : undefined}
              >
                {tenantName}
              </div>
            )}
            {(userName || userEmail) && (
              <span className="topbar-user">{userName || userEmail}</span>
            )}
          </div>
        </header>

        {/* Main content */}
        <main className="content">
          <Outlet />
          <footer className="layout-footer">
            <span className="layout-footer-logo">
              <Layers size={12} />
              Qubix Insight
            </span>
            <span className="layout-footer-sep">·</span>
            <span>Document intelligence platform</span>
            <span className="layout-footer-sep">·</span>
            <span>© {new Date().getFullYear()} All rights reserved</span>
          </footer>
        </main>
      </div>

    </div>
  );
}
