import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { 
  FileText, 
  Download, 
  ScanLine, 
  Search, 
  ChevronRight
} from 'lucide-react';
import { API_BASE_URL } from '../config/api';

export default function ReviewQueue({ onScanScript }: { onScanScript?: () => void } = {}) {
  const [searchParams] = useSearchParams();
  const subjectFilter = searchParams.get('subjectFilter') || '';
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'pending' | 'approved'>('all');

  useEffect(() => {
    fetchSubmissions();
    const interval = setInterval(fetchSubmissions, 4000);
    return () => clearInterval(interval);
  }, []);

  const fetchSubmissions = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/submissions`);
      const data = await res.json();
      if (data.success && Array.isArray(data.submissions)) {
        setSubmissions(data.submissions);
      }
    } catch (err) {
      console.error('Fetch queue error:', err);
    }
  };

  const handleExportCsv = () => {
    if (submissions.length === 0) {
      alert('No submission data to export.');
      return;
    }

    const headers = ['ID', 'Student Name', 'Subject', 'Assessment', 'Score', 'Status', 'Submitted At'];
    const rows = submissions.map(s => [
      s.id,
      `"${s.studentName || s.student_name || 'Student'}"`,
      `"${s.subject || 'General'}"`,
      `"${s.assignment?.title || 'Class Test'}"`,
      s.finalScore || s.aiEvaluation?.score || 85,
      s.status || 'pending_review',
      s.submittedAt || s.submitted_at || new Date().toISOString()
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `markmate_grades_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const pendingCount = submissions.filter(s => s.status === 'pending_review').length;
  const approvedCount = submissions.filter(s => s.status === 'approved').length;

  const filteredSubmissions = submissions.filter((s) => {
    if (subjectFilter && (s.subject || s.assignment?.subject || '') !== subjectFilter) return false;
    const nameMatch = (s.studentName || s.student_name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const subjectMatch = (s.subject || s.assignment?.title || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSearch = nameMatch || subjectMatch;

    if (filterTab === 'pending') return matchesSearch && s.status === 'pending_review';
    if (filterTab === 'approved') return matchesSearch && s.status === 'approved';
    return matchesSearch;
  });

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      
      {/* Sticky Top Header Banner */}
      <header className="page-top-bar no-print">
        <div className="page-top-bar-text">
          <h1>Review queue</h1>
          <p>Every graded script, ready for your approval</p>
        </div>
        <div className="page-top-bar-actions">
          <button className="btn btn-secondary" onClick={handleExportCsv}>
            <Download className="size-4" />
            <span>Export CSV</span>
          </button>
          {onScanScript ? (
            <button className="btn btn-primary" onClick={onScanScript}>
              <ScanLine className="size-4" />
              <span>Scan a script</span>
            </button>
          ) : (
            <Link to="/classes" className="btn btn-primary">
              <ScanLine className="size-4" />
              <span>Scan a script</span>
            </Link>
          )}
        </div>
      </header>

      <div className="page-container">
        <div className="m-card">
          
          {/* Search & Filter Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            
            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: '320px', flex: 1, maxWidth: '450px' }}>
              <Search className="size-4" style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input 
                type="text" 
                className="form-input" 
                style={{ paddingLeft: '2.4rem' }}
                placeholder="Search by student, subject or assessment…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Status Filter Buttons */}
            <div style={{ display: 'flex', gap: '0.35rem', background: '#F1F5F9', padding: '0.25rem', borderRadius: '0.5rem', border: '1px solid #E2E8F0' }}>
              <button 
                onClick={() => setFilterTab('all')}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  borderRadius: '0.375rem',
                  border: 'none',
                  background: filterTab === 'all' ? 'white' : 'transparent',
                  color: filterTab === 'all' ? '#111827' : '#64748B',
                  boxShadow: filterTab === 'all' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  cursor: 'pointer'
                }}
              >
                All ({submissions.length})
              </button>

              <button 
                onClick={() => setFilterTab('pending')}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  borderRadius: '0.375rem',
                  border: 'none',
                  background: filterTab === 'pending' ? 'white' : 'transparent',
                  color: filterTab === 'pending' ? '#D97706' : '#64748B',
                  boxShadow: filterTab === 'pending' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  cursor: 'pointer'
                }}
              >
                Needs review ({pendingCount})
              </button>

              <button 
                onClick={() => setFilterTab('approved')}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  borderRadius: '0.375rem',
                  border: 'none',
                  background: filterTab === 'approved' ? 'white' : 'transparent',
                  color: filterTab === 'approved' ? '#059669' : '#64748B',
                  boxShadow: filterTab === 'approved' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  cursor: 'pointer'
                }}
              >
                Approved ({approvedCount})
              </button>
            </div>

          </div>

          {/* Submissions List */}
          {filteredSubmissions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#64748B' }}>
              <FileText className="size-10 text-slate-300 mx-auto" style={{ margin: '0 auto 0.75rem auto' }} />
              <p style={{ fontWeight: 600, color: '#334155', margin: 0 }}>
                {submissions.length === 0 ? 'No submissions yet.' : 'No matching submissions found.'}
              </p>
              <p style={{ fontSize: '0.8125rem', color: '#94A3B8', marginTop: '0.25rem' }}>
                Upload a handwritten script to get started.
              </p>
              {onScanScript ? (
                <button className="btn btn-primary btn-sm" style={{ marginTop: '1rem' }} onClick={onScanScript}>
                  Scan a script
                </button>
              ) : (
                <Link to="/classes" className="btn btn-primary btn-sm" style={{ marginTop: '1rem' }}>
                  Scan a script
                </Link>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {filteredSubmissions.map((sub) => {
                const scoreVal = sub.finalScore ?? sub.aiEvaluation?.score ?? 5;
                const maxScore = sub.maxScore || sub.aiEvaluation?.maxScore || sub.assignment?.questions?.reduce((sum: number, question: any) => sum + (Number(question.marks) || 5), 0) || 5;
                const isApproved = sub.status === 'approved';

                return (
                  <Link 
                    key={sub.id} 
                    to={`/review/${sub.id}`} 
                    className="submission-row-card"
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>
                        {sub.studentName || sub.student_name || 'Unnamed student'}
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: '#64748B', marginTop: '0.15rem' }}>
                        {sub.subject || sub.assignment?.subject || 'Subject not set'} · {sub.assignment?.title || 'Untitled assessment'} · {sub.assignment?.className || 'Class not set'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, fontSize: '1rem', color: '#111827' }}>
                          {scoreVal}/{maxScore} marks
                        </div>
                      </div>

                      {isApproved ? (
                        <span className="badge badge-green">Approved</span>
                      ) : (
                        <span className="badge badge-amber">Needs review</span>
                      )}

                      <ChevronRight className="size-4 text-slate-400" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
