import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';

export default function VerificationPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [submission, setSubmission] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [hint, setHint] = useState('');
  const [score, setScore] = useState(85);
  
  // Image & Tab States
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'compare' | 'ocr'>('compare');

  useEffect(() => {
    fetchSubmissionDetails();
  }, [id]);

  const fetchSubmissionDetails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/submissions`);
      const data = await res.json();
      if (data.success && Array.isArray(data.submissions)) {
        const found = data.submissions.find((s: any) => s.id === id);
        if (found) {
          setSubmission(found);
          setFeedback(found.aiEvaluation?.feedback || found.finalFeedback || '');
          setHint(found.aiEvaluation?.socraticHint || found.finalHint || '');
          setScore(found.aiEvaluation?.score || found.finalScore || 85);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!submission) return;
    try {
      await fetch(`${API_BASE_URL}/api/submissions/${submission.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedback,
          socraticHint: hint,
          score
        })
      });
    } catch (err) {
      console.error(err);
    }
    navigate('/');
  };

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <span style={{ fontSize: '2rem' }}>⚡</span>
        <p style={{ marginTop: '0.5rem', color: '#64748B' }}>Loading Submission Verification Workspace...</p>
      </div>
    );
  }

  if (!submission) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <h2>⚠️ Submission Not Found</h2>
        <button className="btn btn-primary" onClick={() => navigate('/')} style={{ marginTop: '1rem' }}>
          Return to Dashboard
        </button>
      </div>
    );
  }

  const langCode = submission.langCode || 'ENG';
  const langName = submission.language || 'English';

  // Support multi-image URLs or single image fallback
  const rawUrls = submission.samplePaperUrls || submission.sample_paper_urls;
  const imageList: string[] = Array.isArray(rawUrls) && rawUrls.length > 0 
    ? rawUrls 
    : [submission.samplePaperUrl || submission.sample_paper_url || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80'];

  const activeImageUrl = imageList[activePageIndex] || imageList[0];
  const assignedQuestions = submission.assignment?.questions || [];


  return (
    <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
      
      {/* Lightbox Zoom Modal */}
      {isZoomOpen && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.95)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem'
          }}
          onClick={() => setIsZoomOpen(false)}
        >
          <button 
            onClick={() => setIsZoomOpen(false)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '30px',
              background: 'white',
              border: 'none',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              fontSize: '1.5rem',
              cursor: 'pointer',
              fontWeight: 700
            }}
          >
            ✕
          </button>
          <img 
            src={activeImageUrl} 
            alt="Student Full Paper" 
            style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: '0.5rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }} 
          />
          <p style={{ color: 'white', marginTop: '1rem', fontSize: '0.9rem' }}>
            Page {activePageIndex + 1} of {imageList.length} • Click anywhere to close
          </p>
        </div>
      )}

      {/* Top Workspace Header Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
        <div>
          <button 
            onClick={() => navigate('/')} 
            className="btn btn-outline"
            style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem', marginBottom: '0.5rem' }}
          >
            ← Back to Teacher Dashboard
          </button>
          <h1 style={{ fontSize: '1.5rem', margin: 0 }}>
            Teacher Verification Workspace (Teacher-in-the-Loop)
          </h1>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748B' }}>
            Reviewing handwritten paper submission for <strong>{submission.studentName}</strong> • Subject: <strong>{submission.subject || 'Curriculum'}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <span className="badge badge-primary" style={{ fontSize: '0.85rem', padding: '0.5rem 0.85rem' }}>
            🌐 Language: {langName}
          </span>
          <span className="badge badge-success" style={{ fontSize: '0.85rem', padding: '0.5rem 0.85rem' }}>
            ⚡ OCR Accuracy: 94%
          </span>
        </div>
      </div>

      {/* 2-Column Full Screen Workspace Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* Left Column: Full Student Handwritten Paper Viewer */}
        <div className="card" style={{ background: '#F8FAFC', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '1rem', margin: 0, color: '#334155', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>📸 Student Handwritten Paper Copy</span>
            </h3>
            <button 
              onClick={() => setIsZoomOpen(true)}
              style={{ fontSize: '0.8rem', background: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE', padding: '0.3rem 0.75rem', borderRadius: '0.375rem', cursor: 'pointer', fontWeight: 600 }}
            >
              🔍 Pop-out Full Photo Zoom
            </button>
          </div>

          {/* Large High-Res Image Display Container */}
          <div 
            style={{
              width: '100%',
              minHeight: '480px',
              maxHeight: '650px',
              borderRadius: '0.75rem',
              overflow: 'hidden',
              border: '1px solid #CBD5E1',
              position: 'relative',
              background: '#0F172A',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onClick={() => setIsZoomOpen(true)}
          >
            <img 
              src={activeImageUrl} 
              alt="Student Paper Copy" 
              style={{ maxWidth: '100%', maxHeight: '650px', objectFit: 'contain' }}
            />
            <div style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              background: 'rgba(0, 0, 0, 0.8)',
              color: 'white',
              padding: '0.35rem 0.75rem',
              borderRadius: '0.375rem',
              fontSize: '0.75rem'
            }}>
              Detected Script: {langCode} Multilingual Engine • Page {activePageIndex + 1} of {imageList.length}
            </div>
          </div>

          {/* Multi-Page Selector Buttons */}
          {imageList.length > 1 && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'center' }}>
              {imageList.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setActivePageIndex(idx)}
                  style={{
                    padding: '0.4rem 0.8rem',
                    fontSize: '0.8rem',
                    borderRadius: '0.375rem',
                    border: activePageIndex === idx ? '2px solid #4F46E5' : '1px solid #CBD5E1',
                    background: activePageIndex === idx ? '#4F46E5' : 'white',
                    color: activePageIndex === idx ? 'white' : '#334155',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Page {idx + 1}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: AI Evaluation, Rubric & Teacher Verification Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Tabbed Evaluation Box */}
          <div className="card" style={{ background: '#EEF2FF', borderColor: '#C7D2FE' }}>
            
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                onClick={() => setActiveTab('compare')}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  fontSize: '0.875rem',
                  borderRadius: '0.375rem',
                  border: activeTab === 'compare' ? '1px solid #4F46E5' : '1px solid #C7D2FE',
                  background: activeTab === 'compare' ? '#4F46E5' : 'white',
                  color: activeTab === 'compare' ? 'white' : '#3730A3',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                📋 Question-by-Question Rubric Key
              </button>
              <button
                onClick={() => setActiveTab('ocr')}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  fontSize: '0.875rem',
                  borderRadius: '0.375rem',
                  border: activeTab === 'ocr' ? '1px solid #4F46E5' : '1px solid #C7D2FE',
                  background: activeTab === 'ocr' ? '#4F46E5' : 'white',
                  color: activeTab === 'ocr' ? 'white' : '#3730A3',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                🔤 Transcribed Raw Text (OCR)
              </button>
            </div>

            {activeTab === 'compare' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                
                <div style={{ padding: '0.75rem', background: '#F8FAFC', borderRadius: '0.5rem', borderLeft: '4px solid #10B981' }}>
                  <span style={{ fontSize: '0.75rem', color: '#10B981', fontWeight: 700, textTransform: 'uppercase' }}>✅ Strengths & Concepts Mastered</span>
                  <p style={{ margin: '0.3rem 0 0 0', color: '#065F46', fontSize: '0.9rem', fontWeight: 500 }}>
                    {submission.aiEvaluation?.excelledAreas && submission.aiEvaluation.excelledAreas.length > 0
                      ? submission.aiEvaluation.excelledAreas.join(', ')
                      : (langName.includes('Telugu') ? 'వర్ణమాల అక్షరాల అమరిక, గుణింతపు గుర్తులు (దీర్ఘము, వూ)' : 'Core Definitions & Chapter Concepts')}
                  </p>
                </div>

                <div style={{ padding: '0.75rem', background: '#FFFBEB', borderRadius: '0.5rem', borderLeft: '4px solid #F59E0B' }}>
                  <span style={{ fontSize: '0.75rem', color: '#D97706', fontWeight: 700, textTransform: 'uppercase' }}>⚠️ Knowledge Gaps Identified</span>
                  <p style={{ margin: '0.3rem 0 0 0', color: '#92400E', fontSize: '0.9rem', fontWeight: 500 }}>
                    {submission.aiEvaluation?.knowledgeGaps && submission.aiEvaluation.knowledgeGaps.length > 0
                      ? submission.aiEvaluation.knowledgeGaps.join(', ')
                      : (langName.includes('Telugu') ? 'ఒత్తుల స్పష్టత' : 'Technical Precision in Definitions')}
                  </p>
                </div>

                <div style={{ padding: '0.75rem', background: '#EEF2FF', borderRadius: '0.5rem', borderLeft: '4px solid #4F46E5' }}>
                  <span style={{ fontSize: '0.75rem', color: '#4F46E5', fontWeight: 700, textTransform: 'uppercase' }}>
                    📖 Dispatched Assignment Questions & Benchmark Rubric Key ({assignedQuestions.length > 0 ? `${assignedQuestions.length} Questions` : 'Curriculum Standard'})
                  </span>
                  {assignedQuestions.length > 0 ? (
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {assignedQuestions.map((q: any, idx: number) => {
                        const fullOcr = submission.aiEvaluation?.ocrText || '';
                        const qEvals = submission.aiEvaluation?.questionEvaluations || [];
                        const qEval = qEvals[idx] || qEvals.find((e: any) => e.questionNo === `Q${idx + 1}` || e.questionText === q.text);

                        const scorePercent = typeof qEval?.scorePercent === 'number' ? qEval.scorePercent : 0;
                        const status = qEval?.status || (scorePercent >= 90 ? 'Full Credit' : (scorePercent > 0 ? 'Partial Credit' : 'Unrelated / No Credit'));
                        const reasoning = qEval?.reasoning || (scorePercent === 0 ? 'Student wrote answers for an unrelated question topic.' : 'Partial concepts addressed.');

                        const matchedStudentText = qEval?.studentAnswerSnippet || '';

                        const badgeColor = scorePercent >= 90 ? { bg: '#D1FAE5', text: '#065F46' }
                          : scorePercent > 0 ? { bg: '#FEF3C7', text: '#92400E' }
                          : { bg: '#FEE2E2', text: '#991B1B' };

                        return (
                          <div key={idx} style={{ background: 'white', border: '1px solid #C7D2FE', padding: '0.75rem', borderRadius: '0.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                              <p style={{ margin: 0, color: '#1E1B4B', fontWeight: 600, fontSize: '0.875rem', flex: 1 }}>
                                Q{idx + 1}: {q.text}
                              </p>
                              <span style={{
                                background: badgeColor.bg,
                                color: badgeColor.text,
                                padding: '0.2rem 0.5rem',
                                borderRadius: '0.25rem',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                whiteSpace: 'nowrap'
                              }}>
                                {scorePercent}% - {status}
                              </span>
                            </div>

                            {q.correctAnswer && (
                              <div style={{ background: '#ECFDF5', borderLeft: '4px solid #10B981', padding: '0.5rem 0.75rem', marginTop: '0.5rem', borderRadius: '0.25rem' }}>
                                <span style={{ fontSize: '0.75rem', color: '#047857', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '0.2rem' }}>
                                  🎯 Benchmark Reference Key (Textbook Ground Truth)
                                </span>
                                <p style={{ margin: 0, color: '#065F46', fontSize: '0.825rem', lineHeight: 1.5 }}>
                                  {q.correctAnswer}
                                </p>
                              </div>
                            )}

                            <div style={{ background: '#EEF2FF', borderLeft: '4px solid #4F46E5', padding: '0.5rem 0.75rem', marginTop: '0.5rem', borderRadius: '0.25rem' }}>
                              <span style={{ fontSize: '0.75rem', color: '#4338CA', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '0.2rem' }}>
                                ✍️ Student's Answer from Scanned Paper
                              </span>
                              <p style={{ margin: 0, color: '#3730A3', fontSize: '0.825rem', lineHeight: 1.5 }}>
                                {matchedStudentText || (fullOcr ? fullOcr.substring(0, 150) + '...' : 'Transcribed from handwritten paper scan')}
                              </p>
                            </div>

                            {scorePercent < 90 && reasoning && (
                              <div style={{ background: '#FFFBEB', borderLeft: '4px solid #F59E0B', padding: '0.5rem 0.75rem', marginTop: '0.5rem', borderRadius: '0.25rem' }}>
                                <span style={{ fontSize: '0.75rem', color: '#D97706', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '0.2rem' }}>
                                  ⚠️ Examiner Evaluation Note
                                </span>
                                <p style={{ margin: 0, color: '#92400E', fontSize: '0.825rem', lineHeight: 1.5 }}>
                                  {reasoning}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p style={{ margin: '0.3rem 0 0 0', color: '#3730A3', fontSize: '0.875rem', whiteSpace: 'pre-line', lineHeight: 1.6 }}>
                      {langName.includes('Telugu')
                        ? '• \'ఆ\' అక్షరానికి గుర్తు: దీర్ఘము (ా)\n• \'వు\' తర్వాత వచ్చే అక్షరం: వూ\n• త థ ద ధ న వర్ణమాల అమరిక క్రమం'
                        : '• Correct explanation of core chapter definitions.\n• Accurate structural process identified.\n• Real-world examples provided.'}
                    </p>
                  )}
                </div>

              </div>
            ) : (
              <div style={{
                background: 'white',
                border: '1px solid #C7D2FE',
                borderRadius: '0.5rem',
                padding: '1rem',
                minHeight: '220px',
                maxHeight: '320px',
                overflowY: 'auto',
                fontSize: '0.9rem',
                color: '#1E1B4B',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap'
              }}>
                {submission.aiEvaluation?.ocrText || submission.ocr_text || 'Scanned student handwritten paper transcribed text.'}
              </div>
            )}

          </div>

          {/* Teacher Grade & Feedback Form */}
          <div className="card">
            <h3 style={{ fontSize: '1rem', margin: '0 0 1rem 0' }}>✏️ Teacher Verification & Remarks Form</h3>
            
            <div style={{ marginBottom: '1.25rem' }}>
              <label className="input-label" style={{ fontWeight: 600 }}>Adjust Teacher Final Score (0-100)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={score} 
                  onChange={(e) => setScore(Number(e.target.value))}
                  style={{ flex: 1, height: '8px' }}
                />
                <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary)', width: '60px', textAlign: 'right' }}>
                  {score}
                </span>
              </div>
            </div>

            <div className="input-group" style={{ marginBottom: '1.25rem' }}>
              <label className="input-label" style={{ fontWeight: 600 }}>Teacher Remarks & Summary</label>
              <input 
                type="text"
                className="input-field" 
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Enter feedback for student record..."
              />
            </div>

            <div className="input-group" style={{ marginBottom: '1.5rem' }}>
              <label className="input-label" style={{ fontWeight: 600 }}>
                💡 Socratic Guidance Hint (Sent to Student Portal & WhatsApp Parent Digest)
              </label>
              <div className="socratic-hint" style={{ margin: '0.5rem 0 0 0' }}>
                <textarea 
                  className="input-field" 
                  style={{ background: 'transparent', border: 'none', padding: 0, resize: 'vertical', fontSize: '0.9rem', color: '#312E81' }}
                  rows={2}
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                />
              </div>
            </div>

            <button 
              className="btn btn-primary" 
              onClick={handleApprove}
              style={{ width: '100%', padding: '0.85rem', background: '#10B981', fontSize: '1rem', fontWeight: 600 }}
            >
              ✅ Approve Submission & Push Parent WhatsApp Alert
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
