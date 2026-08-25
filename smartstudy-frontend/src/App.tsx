import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import StudentPortal from './pages/StudentPortal';
import ParentPortal from './pages/ParentPortal';
import VerificationPage from './pages/VerificationPage';


function TopClassroomHeader({ isEmbedded, toggleEmbedded }: { isEmbedded: boolean; toggleEmbedded: () => void }) {
  return (
    <header style={{
      background: '#1E293B',
      color: 'white',
      padding: '0.75rem 1.5rem',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottom: '1px solid #334155',
      fontSize: '0.875rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ background: '#4F46E5', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
          S
        </div>
        <span style={{ fontWeight: 600, letterSpacing: '0.025em' }}>Google Classroom Add-on Integration Console</span>
        <span className="badge badge-primary" style={{ background: 'rgba(79, 70, 229, 0.3)', color: '#A5B4FC', marginLeft: '0.5rem' }}>
          MySchoolAI Engine v1.0
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ color: '#94A3B8' }}>Grade 5 - Section A (International Curriculum)</span>
        <button 
          onClick={toggleEmbedded} 
          className="btn btn-outline" 
          style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', color: '#E2E8F0', borderColor: '#475569' }}
        >
          {isEmbedded ? '🖥️ Full Screen' : '🧩 Toggle Classroom Frame'}
        </button>
      </div>
    </header>
  );
}

function Sidebar() {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path ? 'active' : '';

  return (
    <aside className="sidebar">
      <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>🎓 SmartStudy</span>
      </div>
      
      <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF', marginBottom: '0.5rem', padding: '0 1rem' }}>
        Role Console Simulator
      </p>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <Link to="/" className={`nav-link ${isActive('/')}`}>
          <span style={{ fontSize: '1.25rem' }}>📊</span> Teacher Dashboard
        </Link>
        <Link to="/student" className={`nav-link ${isActive('/student')}`}>
          <span style={{ fontSize: '1.25rem' }}>✍️</span> Student Portal
        </Link>
        <Link to="/parent" className={`nav-link ${isActive('/parent')}`}>
          <span style={{ fontSize: '1.25rem' }}>📲</span> Parent WhatsApp Digest
        </Link>
      </nav>

      <div style={{ marginTop: 'auto', padding: '1rem', background: '#F8FAFC', borderRadius: '0.75rem', border: '1px solid #E2E8F0' }}>
        <p style={{ fontSize: '0.75rem', margin: 0, color: '#64748B', fontWeight: 600 }}>Multilingual OCR Engine</p>
        <p style={{ fontSize: '0.8125rem', margin: '0.25rem 0 0 0', color: '#334155' }}>
          🇮🇳 English | Hindi | Telugu
        </p>
        <span className="badge badge-success" style={{ display: 'inline-block', marginTop: '0.5rem', fontSize: '0.65rem' }}>
          ● Browser-Local Sandbox Mode
        </span>
      </div>
    </aside>
  );
}

function App() {
  const [isEmbedded, setIsEmbedded] = useState(true);

  return (
    <Router>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <TopClassroomHeader isEmbedded={isEmbedded} toggleEmbedded={() => setIsEmbedded(!isEmbedded)} />
        <div className="app-container" style={{ flex: 1, border: isEmbedded ? '8px solid #334155' : 'none', borderRadius: isEmbedded ? '0 0 12px 12px' : '0' }}>
          <Sidebar />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/verify/:id" element={<VerificationPage />} />
              <Route path="/student" element={<StudentPortal />} />
              <Route path="/parent" element={<ParentPortal />} />
            </Routes>

          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;

