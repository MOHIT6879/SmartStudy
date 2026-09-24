import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ScanLine, FileStack, ChevronRight, FileText } from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import ScanGrade from './ScanGrade';

type Tab = 'results' | 'scan';

export default function PaperDetail() {
  const { assignmentId } = useParams();
  const [searchParams] = useSearchParams();
  const classId = searchParams.get('classId') || '';
  const classSubjectId = searchParams.get('classSubjectId') || '';
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>('results');
  const [assignment, setAssignment] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);

  useEffect(() => {
    if (!assignmentId) return;
    fetch(`${API_BASE_URL}/api/assignments`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.assignments)) {
          const match = data.assignments.find((a: any) => a.id === assignmentId);
          if (match) setAssignment(match);
        }
      })
      .catch(() => {});
  }, [assignmentId]);

  useEffect(() => {
    if (!assignmentId) return;
    const fetchSubmissions = () => {
      fetch(`${API_BASE_URL}/api/submissions`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.submissions)) {
            setSubmissions(data.submissions.filter((s: any) => s.assignmentId === assignmentId));
          }
        })
        .catch(() => {});
    };
    fetchSubmissions();
    const interval = setInterval(fetchSubmissions, 4000);
    return () => clearInterval(interval);
  }, [assignmentId]);

  const backUrl = classId && classSubjectId ? `/classes/${classId}/${classSubjectId}` : '/classes';

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <header className="page-top-bar no-print">
        <div className="page-top-bar-text">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(backUrl)} style={{ marginBottom: '0.5rem' }}>
            <ArrowLeft className="size-4" />
            <span>Back to subject</span>
          </button>
          <h1>{assignment?.title || 'Question paper'}</h1>
          <p>
            {assignment ? `${(assignment.questions || []).length} question(s) · ${assignment.answerKeyText ? 'Answer key attached' : 'No answer key'}` : 'Loading paper details…'}
          </p>
        </div>
      </header>

      <div className="page-container">
        <div style={{ display: 'flex', gap: '0.35rem', background: '#F1F5F9', padding: '0.25rem', borderRadius: '0.5rem', border: '1px solid #E2E8F0', marginBottom: '1.25rem', width: 'fit-content' }}>
          <button
            onClick={() => setActiveTab('results')}
            className={`btn btn-sm ${activeTab === 'results' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <FileStack className="size-4" />
            <span>Student results</span>
          </button>
          <button
            onClick={() => setActiveTab('scan')}
            className={`btn btn-sm ${activeTab === 'scan' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <ScanLine className="size-4" />
            <span>Scan again</span>
          </button>
        </div>

        {activeTab === 'results' && (
          <div className="m-card">
            <div className="m-card-header">
              <h3 className="m-card-title">Student results</h3>
            </div>
            {submissions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748B' }}>
                <FileText className="size-8 text-slate-300 mx-auto" style={{ margin: '0 auto 0.5rem auto' }} />
                <p style={{ fontWeight: 600, color: '#334155', margin: 0 }}>No scripts scanned yet for this paper.</p>
                <p style={{ fontSize: '0.8125rem', color: '#94A3B8', marginTop: '0.25rem' }}>
                  Switch to "Scan again" to upload student answer sheets.
                </p>
                <button className="btn btn-primary btn-sm" style={{ marginTop: '1rem' }} onClick={() => setActiveTab('scan')}>
                  Scan again
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {submissions.map((sub) => {
                  const scoreVal = sub.finalScore ?? sub.aiEvaluation?.score ?? 0;
                  const maxScore = sub.maxScore || sub.aiEvaluation?.maxScore || 0;
                  const isApproved = sub.status === 'approved';
                  return (
                    <button
                      key={sub.id}
                      onClick={() => navigate(`/review/${sub.id}`)}
                      className="submission-row-card"
                      style={{ width: '100%', border: '1px solid #E2E8F0', cursor: 'pointer', textAlign: 'left' }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>
                          {sub.studentName || sub.student_name || 'Unnamed student'}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: '#64748B', marginTop: '0.15rem' }}>
                          Submitted {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : 'recently'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ fontWeight: 800, fontSize: '1rem', color: '#111827' }}>
                          {scoreVal}/{maxScore} marks
                        </div>
                        {isApproved ? (
                          <span className="badge badge-green">Approved</span>
                        ) : (
                          <span className="badge badge-amber">Needs review</span>
                        )}
                        <ChevronRight className="size-4 text-slate-400" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'scan' && (
          <div style={{ margin: '-1.5rem -2rem' }}>
            <ScanGrade lockAssignmentId={assignmentId} onBatchComplete={() => setActiveTab('results')} />
          </div>
        )}
      </div>
    </div>
  );
}
