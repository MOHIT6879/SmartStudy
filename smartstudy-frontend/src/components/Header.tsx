import { useLocation, useNavigate } from 'react-router-dom';

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();

  const getActiveTab = () => {
    const path = location.pathname;
    if (path.startsWith('/student')) return 'student';
    if (path.startsWith('/parent')) return 'parent';
    if (path.startsWith('/verify')) return 'queue';
    
    // Read search param for active tab if on root dashboard
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get('tab') || 'overview';
  };

  const activeTab = getActiveTab();

  const handleTabClick = (tabKey: string) => {
    if (tabKey === 'student') {
      navigate('/student');
    } else if (tabKey === 'parent') {
      navigate('/parent');
    } else {
      navigate(`/?tab=${tabKey}`);
    }
  };

  const handleClearDatabase = async () => {
    if (confirm('Are you sure you want to clear all submission and evaluation data?')) {
      try {
        const res = await fetch('/api/clear', { method: 'DELETE' });
        const data = await res.json();
        alert(data.message || '✨ Database reset clean!');
        window.location.reload();
      } catch (err) {
        console.error(err);
        alert('Error resetting database.');
      }
    }
  };

  return (
    <header className="markmate-header">
      <div className="header-inner">
        {/* Brand Section */}
        <div className="brand-section">
          <div className="brand-icon">S</div>
          <div>
            <div className="brand-title">SmartStudy <span style={{ fontSize: '0.7rem', opacity: 0.7, fontWeight: 500 }}>AI Grading Desk</span></div>
            <div className="brand-subtitle">Intelligent marking for handwritten tests, homework & exams</div>
          </div>
        </div>

        {/* Floating Nav Pills */}
        <nav className="nav-pills">
          <button 
            className={`nav-pill-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => handleTabClick('overview')}
          >
            <span>📊 Overview</span>
          </button>

          <button 
            className={`nav-pill-item ${activeTab === 'scan' ? 'active' : ''}`}
            onClick={() => handleTabClick('scan')}
          >
            <span>⚡ Scan & Grade</span>
          </button>

          <button 
            className={`nav-pill-item ${activeTab === 'queue' ? 'active' : ''}`}
            onClick={() => handleTabClick('queue')}
          >
            <span>📋 Review Queue</span>
          </button>

          <button 
            className={`nav-pill-item ${activeTab === 'knowledge' ? 'active' : ''}`}
            onClick={() => handleTabClick('knowledge')}
          >
            <span>📚 Knowledge Base</span>
          </button>

          <button 
            className={`nav-pill-item ${activeTab === 'exam-generator' ? 'active' : ''}`}
            onClick={() => handleTabClick('exam-generator')}
          >
            <span>📝 Exam Generator</span>
          </button>

          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.15)', margin: '0 0.2rem' }} />

          <button 
            className={`nav-pill-item ${activeTab === 'student' ? 'active' : ''}`}
            onClick={() => handleTabClick('student')}
            title="Student Homework Submission Portal"
          >
            <span>✍️ Student Portal</span>
          </button>

          <button 
            className={`nav-pill-item ${activeTab === 'parent' ? 'active' : ''}`}
            onClick={() => handleTabClick('parent')}
            title="Parent WhatsApp AI Digest"
          >
            <span>💬 Parent Digest</span>
          </button>
        </nav>

        {/* Right Header Actions */}
        <div className="header-actions">
          <span className="badge-pill badge-blue" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#93C5FD', border: '1px solid rgba(147, 197, 253, 0.3)' }}>
            ● Grade 11 - Sec A
          </span>
          <button className="btn-header-action" onClick={handleClearDatabase} title="Reset database state">
            🧹 Clear DB
          </button>
        </div>
      </div>
    </header>
  );
}
