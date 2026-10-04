import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  Sparkles,
  GraduationCap,
  Trash2,
  CheckCircle2,
  Layers,
  BarChart3,
  Users,
  Building2,
  UserCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
  onClearDb?: () => void;
}

export default function Sidebar({ onClearDb }: SidebarProps) {
  const location = useLocation();
  const { role } = useAuth();

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
    <>
      <aside className="app-sidebar no-print">
        {/* Brand Header */}
        <div className="sidebar-brand">
          <div className="sidebar-logo-icon">
            <img src="/logo.jpg" alt="Paatam AI logo" className="sidebar-logo-image" />
          </div>
          <div>
            <p className="sidebar-brand-name">PAATAM.AI</p>
            <p className="sidebar-brand-tagline">AI SCHOOL MANAGEMENT</p>
          </div>
        </div>

        {/* Main Navigation (Role-Based) */}
        <nav className="sidebar-nav">
          {/* 1. Overview (Admin & Teacher) */}
          {role !== 'STUDENT' && (
            <NavLink
              to="/"
              end
              className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive || isActive('/', 'overview') ? 'active' : ''}`}
            >
              <LayoutDashboard className="size-4 sidebar-nav-icon shrink-0" />
              <span>Overview</span>
            </NavLink>
          )}

          {/* 2. Analytics (All Roles - personalized for Student) */}
          <NavLink
            to="/analytics"
            className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive ? 'active' : ''}`}
          >
            <BarChart3 className="size-4 sidebar-nav-icon shrink-0" />
            <span>{role === 'STUDENT' ? 'My Progress Analytics' : 'Student Analytics'}</span>
          </NavLink>

          {/* 3. Campuses & Branches (Admin Only) */}
          {role === 'ADMIN' && (
            <NavLink
              to="/campuses"
              className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive ? 'active' : ''}`}
            >
              <Building2 className="size-4 sidebar-nav-icon shrink-0" />
              <span>Campuses & Branches</span>
            </NavLink>
          )}

          {/* 4. Faculty & Staff (Admin Only) */}
          {role === 'ADMIN' && (
            <NavLink
              to="/teachers"
              className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive ? 'active' : ''}`}
            >
              <UserCheck className="size-4 sidebar-nav-icon shrink-0" />
              <span>Faculty Directory</span>
            </NavLink>
          )}

          {/* 5. Classes & Sections (Admin & Teacher) */}
          {role !== 'STUDENT' && (
            <NavLink
              to="/classes"
              className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive ? 'active' : ''}`}
            >
              <Layers className="size-4 sidebar-nav-icon shrink-0" />
              <span>Classes & Sections</span>
            </NavLink>
          )}

          {/* 6. Student Roster & Bulk CSV (Admin & Teacher) */}
          {role !== 'STUDENT' && (
            <NavLink
              to="/students"
              className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive ? 'active' : ''}`}
            >
              <Users className="size-4 sidebar-nav-icon shrink-0" />
              <span>Students & Parents</span>
            </NavLink>
          )}

          {/* 7. Knowledge Base (Admin & Teacher) */}
          {role !== 'STUDENT' && (
            <NavLink
              to="/knowledge"
              className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive || isActive('/', 'knowledge') ? 'active' : ''}`}
            >
              <BookOpen className="size-4 sidebar-nav-icon shrink-0" />
              <span>Knowledge Base</span>
            </NavLink>
          )}

          {/* 8. Exam Generator (Admin & Teacher) */}
          {role !== 'STUDENT' && (
            <NavLink
              to="/generator"
              className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive || isActive('/', 'generator') ? 'active' : ''}`}
            >
              <Sparkles className="size-4 sidebar-nav-icon shrink-0" />
              <span>Exam Generator</span>
            </NavLink>
          )}

          {/* Student Portal (Shown ONLY to Student role) */}
          {role === 'STUDENT' && (
            <>
              <div className="sidebar-section-divider" />
              <div className="sidebar-section-title">Student Workspace</div>
              <NavLink
                to="/student"
                className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive ? 'active' : ''}`}
              >
                <GraduationCap className="size-4 sidebar-nav-icon shrink-0" />
                <span>Student Portal</span>
              </NavLink>
            </>
          )}
        </nav>

        {/* Footer info & DB reset (Admin Only - Hidden for Student and Teacher) */}
        {role === 'ADMIN' && (
          <div className="sidebar-footer">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#94A3B8' }}>
              <CheckCircle2 className="size-3.5 text-emerald-400" />
              <span>6 AI Agents Active</span>
            </div>
            {onClearDb && (
              <button
                onClick={onClearDb}
                title="Reset all database submissions"
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
        )}
      </aside>
    </>
  );
}
