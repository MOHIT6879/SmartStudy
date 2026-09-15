import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ScanLine, 
  FileStack, 
  BookOpen, 
  Sparkles, 
  GraduationCap, 
  MessageSquare,
  Trash2,
  CheckCircle2
} from 'lucide-react';

interface SidebarProps {
  onClearDb?: () => void;
}

export default function Sidebar({ onClearDb }: SidebarProps) {
  const location = useLocation();

  const isActive = (path: string, tab?: string) => {
    if (tab) {
      const searchParams = new URLSearchParams(location.search);
      return location.pathname === '/' && searchParams.get('tab') === tab;
    }
    if (path === '/' && (location.pathname === '/' && !location.search)) {
      return true;
    }
    return location.pathname === path || (location.pathname.startsWith(path) && path !== '/');
  };

  return (
    <aside className="app-sidebar no-print">
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div className="sidebar-logo-icon">
          <GraduationCap className="size-5 text-white" />
        </div>
        <div>
          <p className="sidebar-brand-name">MarkMate</p>
          <p className="sidebar-brand-tagline">AI GRADING DESK</p>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="sidebar-nav">
        <NavLink 
          to="/" 
          end
          className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive || isActive('/', 'overview') ? 'active' : ''}`}
        >
          <LayoutDashboard className="size-4 sidebar-nav-icon shrink-0" />
          <span>Overview</span>
        </NavLink>

        <NavLink 
          to="/upload" 
          className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive || isActive('/', 'scan') ? 'active' : ''}`}
        >
          <ScanLine className="size-4 sidebar-nav-icon shrink-0" />
          <span>Scan & Grade</span>
        </NavLink>

        <NavLink 
          to="/submissions" 
          className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive || isActive('/', 'queue') ? 'active' : ''}`}
        >
          <FileStack className="size-4 sidebar-nav-icon shrink-0" />
          <span>Review Queue</span>
        </NavLink>

        <NavLink 
          to="/knowledge" 
          className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive || isActive('/', 'knowledge') ? 'active' : ''}`}
        >
          <BookOpen className="size-4 sidebar-nav-icon shrink-0" />
          <span>Knowledge Base</span>
        </NavLink>

        <NavLink 
          to="/generator" 
          className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive || isActive('/', 'generator') ? 'active' : ''}`}
        >
          <Sparkles className="size-4 sidebar-nav-icon shrink-0" />
          <span>Exam Generator</span>
        </NavLink>

        <div className="sidebar-section-divider" />
        <div className="sidebar-section-title">Portals & Extras</div>

        <NavLink 
          to="/student" 
          className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive ? 'active' : ''}`}
        >
          <GraduationCap className="size-4 sidebar-nav-icon shrink-0" />
          <span>Student Portal</span>
        </NavLink>

        <NavLink 
          to="/parent" 
          className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive ? 'active' : ''}`}
        >
          <MessageSquare className="size-4 sidebar-nav-icon shrink-0" />
          <span>Parent WhatsApp</span>
        </NavLink>
      </nav>

      {/* Footer info & DB reset */}
      <div className="sidebar-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#94A3B8' }}>
          <CheckCircle2 className="size-3.5 text-emerald-400" />
          <span>6 Agents Online</span>
        </div>
        {onClearDb && (
          <button 
            onClick={onClearDb} 
            title="Clear all database submissions"
            style={{ 
              background: 'transparent', 
              border: 'none', 
              color: '#64748B', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center',
              padding: '0.3rem',
              borderRadius: '0.375rem'
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#EF4444')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#64748B')}
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </aside>
  );
}
