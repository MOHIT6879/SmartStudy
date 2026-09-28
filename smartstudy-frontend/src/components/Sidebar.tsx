import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  Sparkles,
  GraduationCap,
  MessageSquare,
  Trash2,
  CheckCircle2,
  Layers,
  BarChart3,
  Users,
  Building2,
  UserCheck,
  ScanLine,
  FileCheck2,
  Repeat
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import LoginModal from './LoginModal';

interface SidebarProps {
  onClearDb?: () => void;
}

export default function Sidebar({ onClearDb }: SidebarProps) {
  const location = useLocation();
  const { currentUser, role, branches, currentBranchId, setCurrentBranchId } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

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

        {/* Active Persona Banner & Switcher */}
        <div style={{
          margin: '0.5rem 0.875rem 0.875rem 0.875rem',
          padding: '0.625rem 0.75rem',
          background: 'rgba(28, 37, 65, 0.7)',
          borderRadius: '0.625rem',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.875rem' }}>
                {role === 'ADMIN' ? '👑' : role === 'TEACHER' ? '👨‍🏫' : '🎓'}
              </span>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#F8FAFC' }}>
                  {role === 'ADMIN' ? 'Dean / Principal' : role === 'TEACHER' ? 'Faculty Teacher' : 'Student Learner'}
                </div>
                <div style={{ fontSize: '0.6875rem', color: '#94A3B8' }}>{currentUser.name}</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsLoginModalOpen(true)}
              title="Switch between Admin, Teacher and Student personas"
              style={{
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                color: '#60A5FA',
                borderRadius: '4px',
                padding: '0.2rem 0.4rem',
                fontSize: '0.6875rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              <Repeat className="size-3" />
              <span>Switch</span>
            </button>
          </div>

          {/* Campus Switcher (for Admins & Teachers) */}
          {role !== 'STUDENT' && branches.length > 0 && (
            <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '0.4rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.6875rem', color: '#94A3B8' }}>
                <Building2 className="size-3 text-blue-400" />
                <select
                  value={currentBranchId}
                  onChange={(e) => setCurrentBranchId(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#CBD5E1',
                    fontSize: '0.6875rem',
                    cursor: 'pointer',
                    width: '100%',
                    outline: 'none'
                  }}
                >
                  {branches.map(b => (
                    <option key={b.id} value={b.id} style={{ background: '#0B132B', color: '#FFFFFF' }}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
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

          {/* 7. Knowledge Base (All Roles) */}
          <NavLink
            to="/knowledge"
            className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive || isActive('/', 'knowledge') ? 'active' : ''}`}
          >
            <BookOpen className="size-4 sidebar-nav-icon shrink-0" />
            <span>Knowledge Base</span>
          </NavLink>

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

          {/* Portals & Evaluation Section */}
          <div className="sidebar-section-divider" />
          <div className="sidebar-section-title">
            {role === 'STUDENT' ? 'Student Workspace' : 'Evaluation & Alerts'}
          </div>

          {/* Teacher Grading Tabs */}
          {role === 'TEACHER' && (
            <>
              <NavLink
                to="/upload"
                className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive ? 'active' : ''}`}
              >
                <ScanLine className="size-4 sidebar-nav-icon shrink-0" />
                <span>Scan & Grade</span>
              </NavLink>

              <NavLink
                to="/submissions"
                className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive ? 'active' : ''}`}
              >
                <FileCheck2 className="size-4 sidebar-nav-icon shrink-0" />
                <span>Review Queue</span>
              </NavLink>
            </>
          )}

          {/* Student Portal (Shown prominently to Student, and as extra to Admin/Teacher) */}
          <NavLink
            to="/student"
            className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive ? 'active' : ''}`}
          >
            <GraduationCap className="size-4 sidebar-nav-icon shrink-0" />
            <span>Student Portal</span>
          </NavLink>

          {/* Parent WhatsApp Alert Center (Admin & Teacher) */}
          {role !== 'STUDENT' && (
            <NavLink
              to="/parent"
              className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive ? 'active' : ''}`}
            >
              <MessageSquare className="size-4 sidebar-nav-icon shrink-0" />
              <span>Parent WhatsApp</span>
            </NavLink>
          )}
        </nav>

        {/* Footer info & DB reset */}
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
      </aside>

      {/* Login / Persona Switcher Modal */}
      <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />
    </>
  );
}
