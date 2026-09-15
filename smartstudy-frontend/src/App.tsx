import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Overview from './pages/Overview';
import ScanGrade from './pages/ScanGrade';
import ReviewQueue from './pages/ReviewQueue';
import ReviewSubmission from './pages/ReviewSubmission';
import KnowledgeBase from './pages/KnowledgeBase';
import ExamGenerator from './pages/ExamGenerator';
import StudentPortal from './pages/StudentPortal';
import ParentPortal from './pages/ParentPortal';
import { API_BASE_URL } from './config/api';

// Route dispatcher that handles both path routing (/upload, /submissions) and legacy search params (?tab=scan)
function MainRouteDispatcher() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const tab = searchParams.get('tab');

  if (location.pathname === '/') {
    if (tab === 'scan') return <ScanGrade />;
    if (tab === 'queue') return <ReviewQueue />;
    if (tab === 'knowledge') return <KnowledgeBase />;
    if (tab === 'generator' || tab === 'exam-generator') return <ExamGenerator />;
    return <Overview />;
  }

  return null;
}

function App() {
  const handleClearDb = async () => {
    if (window.confirm('⚠️ Are you sure you want to clear all submissions and database records?')) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/clear`, { method: 'DELETE' });
        const data = await res.json();
        alert(data.message || 'Database reset clean!');
        window.location.reload();
      } catch (err) {
        console.error(err);
        alert('Error resetting database.');
      }
    }
  };

  return (
    <Router>
      <div className="app-shell-container">
        {/* MarkMate Left Navigation Sidebar */}
        <Sidebar onClearDb={handleClearDb} />

        {/* Main Workspace Area */}
        <div className="app-main-content">
          <Routes>
            <Route path="/" element={<MainRouteDispatcher />} />
            <Route path="/upload" element={<ScanGrade />} />
            <Route path="/submissions" element={<ReviewQueue />} />
            <Route path="/knowledge" element={<KnowledgeBase />} />
            <Route path="/generator" element={<ExamGenerator />} />
            <Route path="/review/:id" element={<ReviewSubmission />} />
            <Route path="/verify/:id" element={<ReviewSubmission />} />
            <Route path="/student" element={<StudentPortal />} />
            <Route path="/parent" element={<ParentPortal />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
