import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import {
  Home,
  List,
  Shield,
  FileText,
  Settings,
  HelpCircle,
  Mail,
  FolderTree,
  BrainCircuit,
  ListChecks,
  Layers,
  Power,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Bell,
  Search,
  ChevronsUpDown,
  MoreHorizontal,
  LayoutDashboard,
} from "lucide-react";
import { useUser } from "../context/UserContext";
import { useMyReminders } from "../hooks/useMyReminders";

import "./Layout.css";

interface LayoutProps {
  onLogout: () => void;
}

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/":                           { title: "Home",                 subtitle: "Your document intelligence workspace" },
  "/home":                       { title: "Home",                 subtitle: "Your document intelligence workspace" },
  "/dashboard":                  { title: "Dashboard",            subtitle: "Usage trends and analytics" },
  "/my-insights":                { title: "My Insights",          subtitle: "Every analysis run you've created" },
  "/my-reminders":               { title: "My Reminders",         subtitle: "Dates you've pinned across your documents" },
  "/all-insights":               { title: "All Insights",         subtitle: "Organisation-wide analysis" },
  "/document-types":             { title: "Document Types",       subtitle: "Manage document classifications" },
  "/comparison-templates":       { title: "Templates",            subtitle: "Manage analysis templates" },
  "/admin/template-attributes":  { title: "Template Attributes",  subtitle: "Configure template fields" },
  "/admin/rules":                { title: "Rules",                subtitle: "Compliance and scoring rules" },
  "/admin/ai-insight-profiles":  { title: "AI Insight Profiles",  subtitle: "Configure AI extraction profiles" },
  "/settings":                   { title: "Settings",             subtitle: "Tenant and account settings" },
  "/support":                    { title: "Support",              subtitle: "Help and resources" },
};

const PAGE_PREFIXES: [string, { title: string; subtitle: string }][] = [
  ["/document-types/",            { title: "Document Types",       subtitle: "Manage document classifications" }],
  ["/comparison/",                { title: "Templates",            subtitle: "Manage analysis templates" }],
  ["/admin/template-attributes/", { title: "Template Attributes",  subtitle: "Configure template fields" }],
  ["/admin/rules/",               { title: "Rules",                subtitle: "Compliance and scoring rules" }],
  ["/admin/ai-insight-profiles/", { title: "AI Insight Profiles",  subtitle: "Configure AI extraction profiles" }],
  ["/analysis",                   { title: "New Insight",          subtitle: "Start an analysis run" }],
  ["/results/",                   { title: "Insight Results",      subtitle: "" }],
  ["/runs/",                      { title: "Insight Results",      subtitle: "" }],
];

function getPageMeta(pathname: string): { title: string; subtitle: string } {
  if (PAGE_META[pathname]) return PAGE_META[pathname];
  for (const [prefix, meta] of PAGE_PREFIXES) {
    if (pathname.startsWith(prefix)) return meta;
  }
  return { title: "Qubix Insight", subtitle: "" };
}

function reminderWhenLabel(iso?: string): string {
  if (!iso) return "";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(iso).getTime() - today.getTime()) / 86400000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "due today";
  return `in ${days}d`;
}

function daysLeft(trialExpiry?: string): number | null {
  if (!trialExpiry) return null;
  const ms = new Date(trialExpiry).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

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
  const { isTrial, trialExpired, isAdmin, userName, userEmail, tenantName, trialExpiry } = useUser();
  const trialDaysLeft = isTrial ? daysLeft(trialExpiry) : null;
  const [iconOnly, setIconOnly] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { overdue, thisWeek, upcoming, reload: reloadReminders } = useMyReminders();
  const reminderCount = overdue.length + thisWeek.length;
  const bellPreview = [...overdue, ...thisWeek, ...upcoming].slice(0, 5);

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Layout mounts once for the whole session, so its reminders never refetch on
  // their own — re-pull on every navigation so the badge doesn't go stale after
  // pinning something on another page (My Reminders/Home refetch naturally since
  // they remount on each visit; Layout doesn't).
  useEffect(() => { reloadReminders(); }, [location.pathname, reloadReminders]);

  // Close the reminders dropdown on route change or on an outside click
  useEffect(() => { setBellOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!bellOpen) return;
    const onClick = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [bellOpen]);

  // Same pattern for the sidebar user menu (Help / Contact / Logout)
  useEffect(() => { setUserMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!userMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [userMenuOpen]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const page = getPageMeta(location.pathname);

  return (
    <div className="app-layout">

      {/* ── Mobile backdrop ── */}
      {mobileOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`sidebar${iconOnly ? " icon-only" : ""}${mobileOpen ? " mobile-open" : ""}`}>
        <div className="sidebar-grid" />

        {/* Brand logo — workspace name + trial status now shown as the
            secondary line underneath, not in place of the product name */}
        <div className="logo" title={iconOnly ? "Qubix Insight" : undefined}>
          <div className="logo-icon"><Layers size={16} /></div>
          <div className="logo-text">
            <span className="logo-name">Qubix Insight</span>
            {(tenantName || isTrial) && (
              <span className="logo-sub">
                {[tenantName, isTrial ? `Trial${trialDaysLeft != null ? ` · ${trialDaysLeft}d left` : ""}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
          </div>
          {!iconOnly && <ChevronsUpDown size={14} className="logo-switcher" />}
        </div>

        {/* Collapse toggle — desktop only */}
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={() => setIconOnly(v => !v)}
          title={iconOnly ? "Expand sidebar" : "Collapse sidebar"}
        >
          {iconOnly ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>

        {/* Mobile close button */}
        <button
          type="button"
          className="sidebar-close-btn"
          onClick={() => setMobileOpen(false)}
          title="Close menu"
        >
          <X size={16} />
        </button>

        <nav>
          <NavLink to="/" end title={iconOnly ? "Home" : undefined}>
            <Home size={16} />
            <span>Home</span>
          </NavLink>
          <NavLink to="/my-insights" title={iconOnly ? "My Insights" : undefined}>
            <List size={16} />
            <span>My Insights</span>
          </NavLink>
          <NavLink to="/dashboard" title={iconOnly ? "Dashboard" : undefined}>
            <LayoutDashboard size={16} />
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/my-reminders" title={iconOnly ? "My Reminders" : undefined}>
            <Bell size={16} />
            <span>My Reminders</span>
            {reminderCount > 0 && <span className="sidebar-nav-badge">{reminderCount}</span>}
          </NavLink>

          <div className="sidebar-group">
            <div className="sidebar-group-title">Configure</div>

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

            <NavLink to="all-insights" title={iconOnly ? "All Insights" : undefined}>
              <Shield size={16} />
              <span>All Insights</span>
            </NavLink>
          </div>
        </nav>

        {/* Settings + user card pushed down together as one unit, so Settings
            sits snug above the card instead of floating in the middle. */}
        <div className="sidebar-footer-group">
          {!isTrial && (
            <div className="sidebar-group sidebar-settings-group">
              <NavLink to="/settings" title={iconOnly ? "Settings" : undefined}>
                <Settings size={16} />
                <span>Settings</span>
              </NavLink>
            </div>
          )}

        {/* Bottom section */}
        <div className="sidebar-bottom" ref={userMenuRef}>
          {(userName || userEmail) && (
            <div
              className="sidebar-user"
              title={iconOnly ? (userName || userEmail) : undefined}
              onClick={() => setUserMenuOpen(v => !v)}
              role="button"
              tabIndex={0}
            >
              <div className="sidebar-avatar">{initials(userName, userEmail)}</div>
              <div className="sidebar-user-info">
                <span className="sidebar-user-name">{userName || userEmail}</span>
                <span className="sidebar-user-role">{isTrial ? "Trial user" : isAdmin ? "Workspace admin" : "Member"}</span>
              </div>
              {!iconOnly && <MoreHorizontal size={15} className="sidebar-user-more" />}
            </div>
          )}

          {userMenuOpen && (
            <div className="sidebar-user-menu">
              <NavLink to="/support" state={{ scrollToTop: true }} className="sidebar-support">
                <HelpCircle size={16} />
                <span>Help</span>
              </NavLink>
              <NavLink to="/support" state={{ scrollToContact: true }} className="sidebar-support">
                <Mail size={16} />
                <span>Contact</span>
              </NavLink>
              <button type="button" className="logout-btn" onClick={onLogout}>
                <Power size={16} />
                <span>Logout</span>
              </button>
            </div>
          )}

        </div>
        </div>
      </aside>

      {/* ── Right column ── */}
      <div className="layout-right">

        {/* Topbar */}
        <header className="topbar">
          {/* Hamburger — mobile only */}
          <button
            type="button"
            className="topbar-hamburger"
            onClick={() => setMobileOpen(v => !v)}
            title="Open menu"
          >
            <Menu size={20} />
          </button>

          {/* Page title */}
          <div className="topbar-title-area">
            <span className="topbar-title">{page.title}</span>
            {page.subtitle && <span className="topbar-subtitle">{page.subtitle}</span>}
          </div>

          {/* Global search — jumps to My Insights with the query pre-filled;
              searches insight/run names today, not document or template content. */}
          <form
            className="topbar-search"
            onSubmit={(e) => {
              e.preventDefault();
              if (searchQuery.trim()) navigate("/my-insights", { state: { query: searchQuery.trim() } });
            }}
          >
            <Search size={14} className="topbar-search-icon" />
            <input
              className="topbar-search-input"
              placeholder="Search runs, documents, templates"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <kbd className="topbar-search-kbd">⌘K</kbd>
          </form>

          {/* Right: company pill + user name */}
          <div className="topbar-right">
            {isTrial ? (
              <div className="topbar-trial-pill" onClick={() => navigate("/support")} title="Trial account — click to upgrade">
                <span>Trial{trialDaysLeft != null ? ` · ${trialDaysLeft} days left` : ""}</span>
                <span className="topbar-trial-billing">Add billing</span>
              </div>
            ) : (
              tenantName && <div className="topbar-tenant">{tenantName}</div>
            )}
            <div className="topbar-bell" ref={bellRef}>
              <button
                type="button"
                className="topbar-icon-btn topbar-bell-btn"
                onClick={() => setBellOpen(v => {
                  const next = !v;
                  if (next) reloadReminders();
                  return next;
                })}
                title="Reminders"
              >
                <Bell size={16} />
                {reminderCount > 0 && <span className="topbar-bell-dot">{reminderCount > 9 ? "9+" : reminderCount}</span>}
              </button>

              {bellOpen && (
                <div className="reminder-dropdown">
                  <div className="reminder-dropdown-hd">
                    <span>Reminders</span>
                    <button type="button" onClick={() => navigate("/my-reminders")}>View all</button>
                  </div>
                  {bellPreview.length === 0 ? (
                    <div className="reminder-dropdown-empty">Nothing pinned right now.</div>
                  ) : (
                    bellPreview.map(r => (
                      <button
                        key={r.id}
                        type="button"
                        className="reminder-dropdown-row"
                        onClick={() => { setBellOpen(false); if (r.runId) navigate(`/runs/${r.runId}`); else navigate("/my-reminders"); }}
                      >
                        <span className={`reminder-dropdown-pip${overdue.includes(r) ? " od" : thisWeek.includes(r) ? " wk" : " up"}`} />
                        <span className="reminder-dropdown-txt">
                          <span className="reminder-dropdown-ti">{r.title}</span>
                          <span className="reminder-dropdown-me">
                            {[reminderWhenLabel(r.reminderDate), r.runName, r.documentName].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <button type="button" className="topbar-icon-btn" onClick={() => navigate("/support")} title="Help">
              <HelpCircle size={16} />
            </button>
            {(userName || userEmail) && (
              <span className="topbar-user">{userName || userEmail}</span>
            )}
          </div>
        </header>

        {/* Main content */}
        <main className="content">
          {isTrial && trialExpired && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
              padding: "8px 14px", marginBottom: 14,
            }}>
              <span style={{ fontSize: 14 }}>🚫</span>
              <span style={{ fontSize: 12.5, color: "#b91c1c", flex: 1 }}>
                <strong>Your trial has expired.</strong> Contact{" "}
                <a href="mailto:support@qubixinsight.com" style={{ color: "#b91c1c", fontWeight: 600 }}>
                  support@qubixinsight.com
                </a>{" "}
                to upgrade and keep using Qubix Insight.
              </span>
            </div>
          )}
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
