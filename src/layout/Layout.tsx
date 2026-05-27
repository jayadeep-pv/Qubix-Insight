import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Home,
  List,
  Shield,
  FileText,
  Sliders,
  Settings,
  HelpCircle,
  PlusCircle,
  FolderTree,
  BrainCircuit,
  ListChecks,
  Layers,
  Power
} from "lucide-react";
import { useUser } from "../context/UserContext";
import TrialBanner from "../components/TrialBanner";

interface LayoutProps {
  onLogout: () => void;
}

export default function Layout({ onLogout }: LayoutProps) {
  const navigate = useNavigate();
  const { isTrial } = useUser();

  return (
    <div className="app-layout">
      <aside className="sidebar">

        {/* Logo */}
        <div className="logo">
          <div className="logo-icon"><Layers size={16} /></div>
          <div className="logo-text">
            <span className="logo-name">DocInsight</span>
            <span className="logo-badge">AI</span>
          </div>
        </div>

        <nav>

          {/* Core */}
          <div className="nav-section">

            <NavLink to="/" end>
              <Home size={18} />
              <span>Home</span>
            </NavLink>

            <NavLink to="/dashboard">
              <List size={18} />
              <span>My Insights</span>
            </NavLink>

          </div>

          <div className="sidebar-divider" />

          {/* Administration — hidden for trial accounts */}
          {!isTrial && (
            <>
              <div className="sidebar-group">

                <div className="sidebar-group-title">
                  Administration
                </div>

                <NavLink to="all-insights">
                  <Shield size={18} />
                  <span>All Insights</span>
                </NavLink>

                <NavLink to="/document-types">
                  <FolderTree size={18} />
                  <span>Document Types</span>
                </NavLink>

                <NavLink to="/comparison-templates">
                  <FileText size={18} />
                  <span>Templates</span>
                </NavLink>

                <NavLink to="/admin/template-attributes">
                  <ListChecks size={18} />
                  <span>Template Attributes</span>
                </NavLink>

                <NavLink to="/admin/rules" className="nav-link">
                  <Shield size={18} />
                  <span>Rules</span>
                </NavLink>

                <NavLink to="/admin/ai-insight-profiles">
                  <BrainCircuit size={18} />
                  <span>AI Insight Profiles</span>
                </NavLink>

              </div>

              <div className="sidebar-divider" />

              <div className="sidebar-group">

                <div className="sidebar-group-title">
                  System
                </div>

                <NavLink to="/settings">
                  <Settings size={18} />
                  <span>Settings</span>
                </NavLink>

              </div>
            </>
          )}

        </nav>
        <div className="sidebar-divider"></div>
        {/* Bottom Section */}
       <div className="sidebar-bottom">
        <NavLink to="/support" className="sidebar-support">
          <HelpCircle size={16} />
          <span>Support</span>
        </NavLink>

        <button type="button" className="logout-btn" onClick={onLogout}>
          <Power size={18} />
          <span>Logout</span>
        </button>
      </div>

      </aside>

      <main className="content">
        {isTrial && <TrialBanner />}
        <Outlet />
      </main>
    </div>
  );
}