import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Save, 
  Check, 
  ShieldAlert
} from 'lucide-react';
import AgentPipelineStatus from '../components/AgentPipelineStatus';
import { API_BASE_URL } from '../config/api';

export default function ReviewSubmission() {
  const { id } = useParams<{ id: string }>();

  const [submission, setSubmission] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Editable fields
  const [feedback, setFeedback] = useState('');
  const [hint, setHint] = useState('');
  const [score, setScore] = useState(0);
  const [maxScore, setMaxScore] = useState(100);
  const [isApproved, setIsApproved] = useState(false);

  // Image zoom and lightbox
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [activePageIndex, setActivePageIndex] = useState(0);

  // Question evaluations state
  const [questionEvals, setQuestionEvals] = useState<any[]>([]);

  useEffect(() => {
    fetchSubmission();
  }, [id]);

  const fetchSubmission = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/submissions`);
      const data = await res.json();
      if (data.success && Array.isArray(data.submissions)) {
        const found = data.submissions.find((s: any) => s.id === id);
        if (found) {
          setSubmission(found);
          const currentScore = found.finalScore ?? found.aiEvaluation?.score ?? 0;
          setScore(currentScore);
          const max = found.maxScore || 100;
          setMaxScore(max);
          setFeedback(found.finalFeedback || found.aiEvaluation?.feedback || '');
          setHint(found.finalHint || found.aiEvaluation?.socraticHint || '');
          setIsApproved(found.status === 'approved');

          // Initialize question breakdown
          if (found.aiEvaluation?.questionEvaluations && Array.isArray(found.aiEvaluation.questionEvaluations)) {
            setQuestionEvals(found.aiEvaluation.questionEvaluations);
          } else {
            setQuestionEvals([]);
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveGrades = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/submissions/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedback,
          socraticHint: hint,
          score
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsApproved(true);
        alert('✅ Grades and feedback approved! Parent notification dispatched.');
      }
    } catch (err) {
      console.error(err);
      alert('Error approving submission.');
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <p style={{ color: '#64748B' }}>Loading submission…</p>
      </div>
    );
  }

  if (!submission) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <h2>Submission not found</h2>
        <Link to="/submissions" className="btn btn-primary" style={{ marginTop: '1rem' }}>
          Back to Queue
        </Link>
      </div>
    );
  }

  const rawUrls = submission.samplePaperUrls || submission.sample_paper_urls;
  const imageList: string[] = Array.isArray(rawUrls)
    ? rawUrls
    : (submission.samplePaperUrl || submission.sample_paper_url ? [submission.samplePaperUrl || submission.sample_paper_url] : []);

  const activeImageUrl = imageList[activePageIndex];
  const studentName = submission.studentName || submission.student_name || 'Unnamed student';
  const subjectName = submission.subject || 'Unassigned subject';
  const assessmentTitle = submission.assignment?.title || 'Untitled assessment';
  const assessmentType = submission.assignment?.className || 'Unassigned class';
  const percentScore = Math.round((score / maxScore) * 100);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      
      {/* Lightbox Fullscreen Modal */}
      {isLightboxOpen && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(11, 19, 43, 0.95)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem'
          }}
          onClick={() => setIsLightboxOpen(false)}
        >
          <button 
            onClick={() => setIsLightboxOpen(false)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '24px',
              background: 'white',
              border: 'none',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              cursor: 'pointer',
              fontWeight: 700
            }}
          >
            ✕
          </button>
          {activeImageUrl ? <img src={activeImageUrl} alt="Full scan view" style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: '0.5rem' }} /> : <p style={{ color: 'white' }}>No scan image available.</p>}
        </div>
      )}

      {/* Sticky Top Bar Banner */}
      <header className="page-top-bar no-print">
        <div className="page-top-bar-text">
          <h1>{studentName}</h1>
          <p>{subjectName} · {assessmentTitle} · {assessmentType}</p>
        </div>
        <div className="page-top-bar-actions">
          <Link to="/submissions" className="btn btn-secondary">
            <ArrowLeft className="size-4" />
            <span>Queue</span>
          </Link>
          <button 
            className="btn btn-success" 
            onClick={handleApproveGrades}
            disabled={isApproved}
          >
            <Check className="size-4" />
            <span>{isApproved ? 'Approved' : 'Approve grades'}</span>
          </button>
        </div>
      </header>

      <div className="page-container">
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.6fr', gap: '1.5rem', alignItems: 'start' }}>
          
          {/* Left Column: Original Scan & 6-Agent Pipeline Log */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Original Scan Card */}
            <div className="m-card">
              <div className="m-card-header" style={{ marginBottom: '0.75rem' }}>
                <h3 className="m-card-title" style={{ fontSize: '1rem' }}>Original scan</h3>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button 
                    className="btn btn-outline btn-sm"
                    onClick={() => setZoomLevel(prev => Math.max(0.7, prev - 0.2))}
                    title="Zoom out"
                  >
                    <ZoomOut className="size-3.5" />
                  </button>
                  <button 
                    className="btn btn-outline btn-sm"
                    onClick={() => setZoomLevel(prev => Math.min(2.5, prev + 0.2))}
                    title="Zoom in"
                  >
                    <ZoomIn className="size-3.5" />
                  </button>
                  <button 
                    className="btn btn-outline btn-sm"
                    onClick={() => setIsLightboxOpen(true)}
                    title="Fullscreen"
                  >
                    <Maximize2 className="size-3.5" />
                  </button>
                </div>
              </div>

              {/* Image Preview Box */}
              <div 
                style={{
                  height: '380px',
                  background: '#0F172A',
                  borderRadius: '0.5rem',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  border: '1px solid #E2E8F0',
                  cursor: 'pointer'
                }}
                onClick={() => setIsLightboxOpen(true)}
              >
                {activeImageUrl ? (
                  <img src={activeImageUrl} alt={`Scan of ${studentName}'s script`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', transform: `scale(${zoomLevel})`, transition: 'transform 0.15s ease' }} />
                ) : <p style={{ color: '#CBD5E1' }}>No scan image available.</p>}
              </div>

              {/* Multi-page Navigation */}
              {imageList.length > 1 && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', justifyContent: 'center' }}>
                  {imageList.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActivePageIndex(idx)}
                      className={`btn btn-sm ${activePageIndex === idx ? 'btn-primary' : 'btn-outline'}`}
                    >
                      Page {idx + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 6-Agent Pipeline Execution Card */}
            <AgentPipelineStatus 
              currentStep={isApproved ? 6 : 5}
              subData={{
                imageName: `Scan of ${studentName}'s script`,
                blocksTranscribed: questionEvals.length,
                subject: subjectName,
                qaNote: hint,
                status: isApproved ? 'approved' : 'pending_review'
              }}
            />

          </div>

          {/* Right Column: Total Score, Overall Feedback & Question Breakdowns */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* Total Score Banner Card */}
            <div className="m-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem' }}>
              <div>
                <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em', color: '#64748B', margin: 0 }}>
                  Total
                </p>
                <p style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 800, color: '#111827', margin: 0 }}>
                  {score} / {maxScore}
                </p>
              </div>

              <div>
                <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em', color: '#64748B', margin: 0 }}>
                  Percent
                </p>
                <p style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 800, color: '#2563EB', margin: 0 }}>
                  {percentScore} %
                </p>
              </div>

              <div>
                {isApproved ? (
                  <span className="badge badge-green" style={{ fontSize: '0.8125rem', padding: '0.35rem 0.85rem' }}>
                    ● Approved
                  </span>
                ) : (
                  <span className="badge badge-amber" style={{ fontSize: '0.8125rem', padding: '0.35rem 0.85rem' }}>
                    ● Needs review
                  </span>
                )}
              </div>
            </div>

            {/* Overall Feedback Card */}
            <div className="m-card">
              <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '0.625rem' }}>
                Overall feedback
              </h4>
              <textarea 
                className="form-textarea"
                rows={2}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                style={{ fontSize: '0.875rem' }}
              />

              {/* QA Agent Inspection Callout */}
              <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', background: '#F8FAFC', borderRadius: '0.5rem', border: '1px solid #E2E8F0', fontSize: '0.8125rem' }}>
                <strong style={{ color: '#1E293B', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.2rem' }}>
                  <ShieldAlert className="size-3.5 text-blue-600" />
                  <span>QA agent:</span>
                </strong>
                <p style={{ margin: 0, color: '#475569', lineHeight: 1.45 }}>
                  {hint}
                </p>
              </div>
            </div>

            {/* Question Breakdown Cards */}
            {questionEvals.map((q, idx) => (
              <div key={idx} className="m-card">
                
                {/* Question Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 800, color: '#2563EB', background: '#EFF6FF', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.8125rem' }}>
                      Q {q.questionNumber || idx + 1}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#111827' }}>
                      {q.questionText}
                    </span>
                  </div>
                  <span className="badge badge-green">
                    OCR {q.ocrConfidence || 98}%
                  </span>
                </div>

                {/* Extracted Handwriting Box */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748B', marginBottom: '0.35rem' }}>
                    Extracted handwriting
                  </p>
                  <div style={{ padding: '0.75rem 1rem', background: '#F8FAFC', borderRadius: '0.5rem', border: '1px solid #E2E8F0', fontSize: '0.8125rem', color: '#334155', lineHeight: 1.5, maxHeight: '160px', overflowY: 'auto' }}>
                    {q.ocrText}
                  </div>
                </div>

                {/* Knowledge Reference Match */}
                <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: '#EFF6FF', borderRadius: '0.375rem', border: '1px solid #BFDBFE', fontSize: '0.78rem', color: '#1E40AF' }}>
                  <strong>Reference Key: </strong> {q.referenceRubric}
                </div>

                {/* Score & Feedback Inputs */}
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.75rem', alignItems: 'center' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748B', marginBottom: '0.25rem' }}>
                      Mark / {q.maxMarks || 5}
                    </label>
                    <input 
                      type="number" 
                      className="form-input"
                      value={score}
                      onChange={(e) => setScore(Number(e.target.value))}
                      style={{ fontWeight: 700, fontSize: '1rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748B', marginBottom: '0.25rem' }}>
                      Feedback to student
                    </label>
                    <input 
                      type="text" 
                      className="form-input"
                      value={q.studentFeedback || feedback}
                      onChange={(e) => {
                        const updated = [...questionEvals];
                        updated[idx].studentFeedback = e.target.value;
                        setQuestionEvals(updated);
                        setFeedback(e.target.value);
                      }}
                    />
                  </div>
                </div>

                {/* Save Mark Button */}
                <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <button 
                    className="btn btn-secondary btn-sm"
                    onClick={() => alert(`Mark ${score}/${maxScore} updated for Question ${q.questionNumber || idx + 1}`)}
                  >
                    <Save className="size-3.5" />
                    <span>Save mark</span>
                  </button>
                </div>

              </div>
            ))}

          </div>

        </div>
      </div>
    </div>
  );
}
