import { useState } from 'react';

interface SubmissionReviewModalProps {
  submission: any;
  onClose: () => void;
  onApprove: (id: string, feedback: string, socraticHint: string, score: number) => void;
}

export default function SubmissionReviewModal({ submission, onClose, onApprove }: SubmissionReviewModalProps) {
  const [feedback, setFeedback] = useState(submission.aiEvaluation?.feedback || submission.finalFeedback || '');
  const [hint, setHint] = useState(submission.aiEvaluation?.socraticHint || submission.finalHint || '');
  const [score, setScore] = useState(submission.aiEvaluation?.score || submission.finalScore || 85);
  
  // Page Carousel & Fullscreen Zoom states
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'compare' | 'ocr'>('compare');

  if (!submission) return null;

  const langCode = submission.langCode || 'ENG';
  const langName = submission.language || 'English';

  // Support multi-image URLs or single image fallback
  const rawUrls = submission.samplePaperUrls || submission.sample_paper_urls;
  const imageList: string[] = Array.isArray(rawUrls) && rawUrls.length > 0 
    ? rawUrls 
    : [submission.samplePaperUrl || submission.sample_paper_url || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80'];

  const activeImageUrl = imageList[activePageIndex] || imageList[0];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '1000px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        
        {/* Fullscreen Image Zoom Lightbox Modal */}
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

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.35rem' }}>Teacher Verification Console (Teacher-in-the-Loop)</h2>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Review AI-scanned handwritten copy & score for <strong>{submission.studentName}</strong> ({submission.subject || 'Science'})
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748B' }}>&times;</button>
        </div>

        {/* Script & Confidence Badges */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="badge badge-primary" style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
            🌐 Language: {langName}
          </span>
          <span className="badge badge-success" style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
            ⚡ OCR Accuracy: {(submission.aiEvaluation?.metrics?.accuracy * 100 || 94).toFixed(0)}%
          </span>
          <span className="badge badge-warning" style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
            🎯 Status: {submission.status === 'approved' ? 'Approved by Teacher' : 'Pending Teacher Gatekeeper'}
          </span>
          {imageList.length > 1 && (
            <span className="badge" style={{ background: '#6366F1', color: 'white', fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
              📄 Multi-Page Submission ({imageList.length} Pages)
            </span>
          )}
        </div>

        {/* Side-by-Side OCR & Question Comparison Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
          
          {/* Left Side: Original Student Handwritten Answer Sheet */}
          <div style={{ background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h4 style={{ fontSize: '0.875rem', margin: 0, color: '#334155', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>📸 Scanned Student Paper</span>
              </h4>
              <button 
                onClick={() => setIsZoomOpen(true)}
                style={{ fontSize: '0.75rem', background: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', cursor: 'pointer', fontWeight: 600 }}
              >
                🔍 Expand Full Photo
              </button>
            </div>

            {/* Image Box */}
            <div style={{
              width: '100%',
              height: '260px',
              borderRadius: '0.5rem',
              overflow: 'hidden',
              border: '1px solid #CBD5E1',
              position: 'relative',
              background: '#0F172A',
              cursor: 'pointer'
            }}
            onClick={() => setIsZoomOpen(true)}
            >
              <img 
                src={activeImageUrl} 
                alt="Student Handwritten Paper" 
                style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.95 }}
              />
              <div style={{
                position: 'absolute',
                bottom: 8,
                left: 8,
                background: 'rgba(0, 0, 0, 0.75)',
                color: 'white',
                padding: '0.25rem 0.5rem',
                borderRadius: '0.25rem',
                fontSize: '0.7rem'
              }}>
                Detected Script: {langCode} Multilingual Engine
              </div>
            </div>

            {/* Page Selector Tabs for Multi-Page Submissions */}
            {imageList.length > 1 && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', justifyContent: 'center' }}>
                {imageList.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActivePageIndex(idx)}
                    style={{
                      padding: '0.25rem 0.6rem',
                      fontSize: '0.75rem',
                      borderRadius: '0.25rem',
                      border: activePageIndex === idx ? '1px solid #4F46E5' : '1px solid #CBD5E1',
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

          {/* Right Side: Tabbed Evaluation (Question-by-Question Comparison vs Raw OCR) */}
          <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: '0.75rem', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
            
            {/* View Mode Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <button
                onClick={() => setActiveTab('compare')}
                style={{
                  flex: 1,
                  padding: '0.4rem',
                  fontSize: '0.8rem',
                  borderRadius: '0.375rem',
                  border: activeTab === 'compare' ? '1px solid #4F46E5' : '1px solid #C7D2FE',
                  background: activeTab === 'compare' ? '#4F46E5' : 'white',
                  color: activeTab === 'compare' ? 'white' : '#3730A3',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                📋 Question Comparison
              </button>
              <button
                onClick={() => setActiveTab('ocr')}
                style={{
                  flex: 1,
                  padding: '0.4rem',
                  fontSize: '0.8rem',
                  borderRadius: '0.375rem',
                  border: activeTab === 'ocr' ? '1px solid #4F46E5' : '1px solid #C7D2FE',
                  background: activeTab === 'ocr' ? '#4F46E5' : 'white',
                  color: activeTab === 'ocr' ? 'white' : '#3730A3',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                🔤 Transcribed Raw Text
              </button>
            </div>

            {/* Tab 1: Question-by-Question Benchmark Comparison */}
            {activeTab === 'compare' ? (
              <div style={{
                background: 'white',
                border: '1px solid #C7D2FE',
                borderRadius: '0.5rem',
                padding: '0.75rem',
                height: '240px',
                overflowY: 'auto',
                fontSize: '0.85rem'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ padding: '0.5rem', background: '#F8FAFC', borderRadius: '0.375rem', borderLeft: '3px solid #10B981' }}>
                    <span style={{ fontSize: '0.7rem', color: '#10B981', fontWeight: 700, textTransform: 'uppercase' }}>✅ Strengths & Concepts Mastered</span>
                    <p style={{ margin: '0.2rem 0 0 0', color: '#065F46', fontSize: '0.8rem' }}>
                      {submission.aiEvaluation?.excelledAreas && submission.aiEvaluation.excelledAreas.length > 0
                        ? submission.aiEvaluation.excelledAreas.join(', ')
                        : (langName.includes('Telugu') ? 'వర్ణమాల అక్షరాల అమరిక, గుణింతపు గుర్తులు (దీర్ఘము, వూ)' : 'Core Definitions & Chapter Concepts')}
                    </p>
                  </div>

                  <div style={{ padding: '0.5rem', background: '#FFFBEB', borderRadius: '0.375rem', borderLeft: '3px solid #F59E0B' }}>
                    <span style={{ fontSize: '0.7rem', color: '#D97706', fontWeight: 700, textTransform: 'uppercase' }}>⚠️ Knowledge Gaps Identified</span>
                    <p style={{ margin: '0.2rem 0 0 0', color: '#92400E', fontSize: '0.8rem' }}>
                      {submission.aiEvaluation?.knowledgeGaps && submission.aiEvaluation.knowledgeGaps.length > 0
                        ? submission.aiEvaluation.knowledgeGaps.join(', ')
                        : (langName.includes('Telugu') ? 'ఒత్తుల స్పష్టత' : 'Technical Precision in Definitions')}
                    </p>
                  </div>

                  <div style={{ padding: '0.5rem', background: '#EEF2FF', borderRadius: '0.375rem', borderLeft: '3px solid #4F46E5' }}>
                    <span style={{ fontSize: '0.7rem', color: '#4F46E5', fontWeight: 700, textTransform: 'uppercase' }}>📖 Benchmark Answer Rubric Key</span>
                    <p style={{ margin: '0.2rem 0 0 0', color: '#3730A3', fontSize: '0.8rem', whiteSpace: 'pre-line' }}>
                      {langName.includes('Telugu')
                        ? '• \'ఆ\' అక్షరానికి గుర్తు: దీర్ఘము (ా)\n• \'వు\' తర్వాత వచ్చే అక్షరం: వూ\n• త థ ద ధ న వర్ణమాల అమరిక క్రమం'
                        : '• Correct explanation of core chapter definitions.\n• Accurate structural process identified.\n• Real-world examples provided.'}
                    </p>
                  </div>
                </div>
              </div>

            ) : (
              /* Tab 2: Raw OCR Transcribed Text */
              <div style={{
                background: 'white',
                border: '1px solid #C7D2FE',
                borderRadius: '0.5rem',
                padding: '0.875rem',
                height: '240px',
                overflowY: 'auto',
                fontSize: '0.85rem',
                color: '#1E1B4B',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap'
              }}>
                {submission.aiEvaluation?.ocrText || submission.ocr_text || 'Scanned student handwritten paper transcribed text.'}
              </div>
            )}

          </div>

        </div>


        {/* Teacher Edit Form */}
        <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '1.25rem' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label className="input-label" style={{ fontWeight: 600 }}>Adjust Teacher Score (0-100)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={score} 
                  onChange={(e) => setScore(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)', width: '50px', textAlign: 'right' }}>
                  {score}
                </span>
              </div>
            </div>

            <div>
              <label className="input-label" style={{ fontWeight: 600 }}>Teacher Remarks & Knowledge Gap Analysis</label>
              <input 
                type="text"
                className="input-field" 
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Enter feedback for student record..."
              />
            </div>
          </div>

          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label" style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>💡 Socratic Guidance Hint (Sent to Student & WhatsApp Parent Feed)</span>
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

        </div>

        {/* Modal Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
            🔒 Guardrailed to Grade 5 Curriculum | Teacher-in-the-Loop Active
          </span>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button 
              className="btn btn-primary" 
              onClick={() => onApprove(submission.id, feedback, hint, score)}
              style={{ background: '#10B981' }}
            >
              ✅ Approve & Send Parent WhatsApp Alert
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

