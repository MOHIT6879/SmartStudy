import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  FileText, 
  Clock, 
  TrendingUp, 
  Zap, 
  ScanLine, 
  ArrowRight,
  Layers
} from 'lucide-react';
import AgentPipelineStatus from '../components/AgentPipelineStatus';
import BulkEvaluationModal from '../components/BulkEvaluationModal';
import { API_BASE_URL } from '../config/api';

export default function Overview() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [isBulkOpen, setIsBulkOpen] = useState(false);

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
      console.error('Fetch submissions error:', err);
    }
  };

  const pendingCount = submissions.filter(s => s.status === 'pending_review').length;
  const scoredSubmissions = submissions.filter((submission) =>
    typeof (submission.finalScore ?? submission.aiEvaluation?.score) === 'number'
  );
  const avgScore = scoredSubmissions.length > 0
    ? (scoredSubmissions.reduce((acc, curr) => acc + (curr.finalScore ?? curr.aiEvaluation.score), 0) / scoredSubmissions.length).toFixed(0) + '%'
    : '—';

  const minutesSaved = submissions.length * 14;

  // Derive latest submission for pipeline preview
  const latestSub = submissions.length > 0 ? submissions[0] : null;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      
      {/* Sticky Top Bar Banner */}
      <header className="page-top-bar no-print">
        <div className="page-top-bar-text">
          <h1>Grading command centre</h1>
          <p>Multi-agent marking for handwritten tests, homework and exams</p>
        </div>
        <div className="page-top-bar-actions">
          <button 
            className="btn btn-secondary" 
            onClick={() => setIsBulkOpen(true)}
          >
            <Layers className="size-4" />
            <span>Bulk Stack (50-100)</span>
          </button>
          <Link to="/upload" className="btn btn-primary">
            <ScanLine className="size-4" />
            <span>Scan a script</span>
          </Link>
        </div>
      </header>

      <div className="page-container">
        
        {/* 4 Metric Stats Cards Grid */}
        <div className="metrics-stat-grid">
          <div className="stat-box">
            <div className="stat-box-header">
              <span className="stat-box-title">Scripts scanned</span>
              <div className="stat-box-icon">
                <FileText className="size-4" />
              </div>
            </div>
            <div className="stat-box-value">{submissions.length}</div>
            <div className="stat-box-footer">Handwritten sheets ingested</div>
          </div>

          <div className="stat-box">
            <div className="stat-box-header">
              <span className="stat-box-title">Awaiting review</span>
              <div className="stat-box-icon" style={{ background: '#FEF3C7', color: '#D97706' }}>
                <Clock className="size-4" />
              </div>
            </div>
            <div className="stat-box-value" style={{ color: pendingCount > 0 ? '#D97706' : '#059669' }}>
              {pendingCount}
            </div>
            <div className="stat-box-footer">
              {pendingCount > 0 ? 'Pending teacher sign-off' : 'All caught up'}
            </div>
          </div>

          <div className="stat-box">
            <div className="stat-box-header">
              <span className="stat-box-title">Class average</span>
              <div className="stat-box-icon" style={{ background: '#ECFDF5', color: '#059669' }}>
                <TrendingUp className="size-4" />
              </div>
            </div>
            <div className="stat-box-value">{avgScore}</div>
            <div className="stat-box-footer">Calculated across verified tests</div>
          </div>

          <div className="stat-box">
            <div className="stat-box-header">
              <span className="stat-box-title">Minutes saved</span>
              <div className="stat-box-icon" style={{ background: '#F5F3FF', color: '#7C3AED' }}>
                <Zap className="size-4" />
              </div>
            </div>
            <div className="stat-box-value">{minutesSaved}</div>
            <div className="stat-box-footer">~14 minutes per student paper</div>
          </div>
        </div>

        {/* 2-Column Dashboard Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.1fr', gap: '1.5rem', alignItems: 'start' }}>
          
          {/* Left Column: Subject Performance & Recent Submissions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Subject Performance Card */}
            <div className="m-card">
              <div className="m-card-header">
                <h3 className="m-card-title">Subject performance</h3>
                <Link to="/knowledge" className="btn btn-outline btn-sm">
                  Knowledge Base
                </Link>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {scoredSubmissions.length === 0 ? (
                  <p style={{ color: '#64748B', fontSize: '0.875rem', margin: 0 }}>No scored submissions yet.</p>
                ) : Array.from(new Set(scoredSubmissions.map((submission) => submission.subject || 'Unassigned subject'))).map((subject) => {
                  const subjectSubmissions = scoredSubmissions.filter((submission) => (submission.subject || 'Unassigned subject') === subject);
                  const subjectAverage = Math.round(subjectSubmissions.reduce((sum, submission) => sum + (submission.finalScore ?? submission.aiEvaluation.score), 0) / subjectSubmissions.length);
                  return (
                    <div key={subject}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        <span>{subject}</span>
                        <span style={{ color: '#2563EB' }}>{subjectAverage}% Avg</span>
                      </div>
                      <div style={{ height: '8px', background: '#F1F5F9', borderRadius: '9999px', overflow: 'hidden' }}>
                        <div style={{ width: `${subjectAverage}%`, height: '100%', background: '#2563EB', borderRadius: '9999px' }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', fontSize: '0.75rem', color: '#94A3B8' }}>
                <span>0%</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Recent Submissions Card */}
            <div className="m-card">
              <div className="m-card-header">
                <h3 className="m-card-title">Recent submissions</h3>
                <Link to="/submissions" className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span>View queue</span>
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>

              {submissions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                  <p style={{ color: '#64748B', fontSize: '0.875rem', margin: 0 }}>
                    No scripts graded yet — upload a handwritten answer sheet to start.
                  </p>
                  <Link to="/upload" className="btn btn-primary btn-sm" style={{ marginTop: '0.75rem' }}>
                    Scan First Script
                  </Link>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {submissions.slice(0, 5).map((sub) => {
                    const scoreVal = sub.finalScore ?? sub.aiEvaluation?.score ?? 0;
                    const maxScore = sub.maxScore || (scoreVal > 20 ? 100 : 5);
                    const pctVal = Math.round((scoreVal / maxScore) * 100);
                    const isApproved = sub.status === 'approved';
                    const isProcessing = sub.status === 'processing';
                    const isFailed = sub.status === 'failed';

                    return (
                      <Link 
                        key={sub.id} 
                        to={`/review/${sub.id}`} 
                        className="submission-row-card"
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#111827' }}>
                            {sub.studentName || sub.student_name || 'Unnamed student'}
                          </div>
                          <div style={{ fontSize: '0.8125rem', color: '#64748B', marginTop: '0.1rem' }}>
                            {sub.subject || sub.assignment?.title || 'Unassigned subject'} · {sub.assignment?.className || 'Unassigned class'}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 800, fontSize: '0.9375rem', color: '#111827' }}>
                              {isProcessing ? 'Grading...' : isFailed ? 'Not graded' : <>{scoreVal}/{maxScore} <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>({pctVal}%)</span></>}
                            </div>
                          </div>

                          {isApproved ? (
                            <span className="badge badge-green">Approved</span>
                          ) : isProcessing ? (
                            <span className="badge badge-blue">Processing</span>
                          ) : isFailed ? (
                            <span className="badge badge-red">Failed</span>
                          ) : (
                            <span className="badge badge-amber">Needs review</span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* Right Column: 6-Agent Sequential Pipeline */}
          <div>
            <AgentPipelineStatus 
              currentStep={latestSub ? 6 : 5}
              subData={{
                imageName: latestSub?.samplePaperUrl ? 'Handwritten script scan' : 'No scan available',
                blocksTranscribed: latestSub?.aiEvaluation?.questionEvaluations?.length || 0,
                subject: latestSub?.subject || 'No subject',
                qaNote: latestSub?.aiEvaluation?.socraticHint || 'No QA note available.',
                status: latestSub?.status
              }}
            />
          </div>

        </div>

      </div>

      <BulkEvaluationModal 
        isOpen={isBulkOpen}
        onClose={() => setIsBulkOpen(false)}
        onRefreshDashboard={fetchSubmissions}
      />
    </div>
  );
}
