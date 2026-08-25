import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SubmissionReviewModal from '../components/SubmissionReviewModal';
import { API_BASE_URL } from '../config/api';

export default function Dashboard() {
  const navigate = useNavigate();
  const [isGenerating, setIsGenerating] = useState(false);

  const [questions, setQuestions] = useState<any[]>([]);
  const [className, setClassName] = useState('Grade 5 General Science');
  const [subjectLanguage, setSubjectLanguage] = useState('English');
  const [assignmentTitle, setAssignmentTitle] = useState('Plant Reproduction');
  const [subTopicScope, setSubTopicScope] = useState('');
  const [uploadedPdf, setUploadedPdf] = useState<File | null>(null);
  const [uploadedPdfName, setUploadedPdfName] = useState<string>('');
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [reviewingSubmission, setReviewingSubmission] = useState<any>(null);

  useEffect(() => {
    fetchSubmissions();
    const interval = setInterval(fetchSubmissions, 4000);
    return () => clearInterval(interval);
  }, []);

  const fetchSubmissions = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/submissions`);
      const data = await res.json();
      if (data.success) {
        setSubmissions(data.submissions || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const formData = new FormData();
      formData.append('className', className);
      formData.append('topic', assignmentTitle || 'General Chapter');
      formData.append('subjectLanguage', subjectLanguage);
      if (subTopicScope) {
        formData.append('subTopicScope', subTopicScope);
      }
      if (uploadedPdf) {
        formData.append('document', uploadedPdf);
      }

      const res = await fetch(`${API_BASE_URL}/api/rag/generate`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setQuestions(data.questions);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleQuestionTextChange = (index: number, newText: string) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], text: newText };
    setQuestions(updated);
  };

  const handleDispatch = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: assignmentTitle || 'Daily Learning Assignment',
          className,
          questions
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('✅ Assignment dispatched to students! WhatsApp parent notification triggered.');
        setQuestions([]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleApprove = async (id: string, feedback: string, socraticHint: string, score: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/submissions/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback, socraticHint, score })
      });
      const data = await res.json();
      if (data.success) {
        setReviewingSubmission(null);
        fetchSubmissions();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetData = async () => {
    if (confirm('Are you sure you want to clear all data and start 100% clean?')) {
      try {
        await fetch(`${API_BASE_URL}/api/clear`, { method: 'DELETE' });
        setSubmissions([]);
        setQuestions([]);
        alert('✨ Database cleared clean! You can now test with fresh uploads.');
      } catch (err) {
        console.error(err);
      }
    }
  };

  const pendingCount = submissions.filter(s => s.status === 'pending_review').length;
  const approvedSubmissions = submissions.filter(s => s.status === 'approved');
  const avgScore = approvedSubmissions.length > 0 
    ? (approvedSubmissions.reduce((acc, curr) => acc + (curr.finalScore || curr.aiEvaluation?.score || 0), 0) / approvedSubmissions.length).toFixed(1) + '%'
    : 'N/A';

  return (
    <div className="animate-fade-in">
      
      {/* Top Welcome Banner */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', margin: 0 }}>Teacher Verification Dashboard</h1>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748B' }}>
            Welcome back, Prof. Smith! Review AI-scanned handwritten student copies before parent dispatch.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className="badge badge-primary" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>
            🏫 Class: Grade 5 Section A
          </span>
          <button 
            className="btn btn-outline" 
            style={{ fontSize: '0.75rem', borderColor: '#EF4444', color: '#EF4444' }}
            onClick={handleResetData}
          >
            🧹 Clear DB Data
          </button>
        </div>
      </header>

      {/* Metric Cards */}
      <div className="grid-3" style={{ marginBottom: '2rem' }}>
        <div className="card" style={{ borderLeft: '5px solid #4F46E5' }}>
          <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Submissions</h3>
          <p style={{ fontSize: '2.25rem', fontWeight: 700, color: 'var(--text-main)', margin: '0.25rem 0 0 0' }}>{submissions.length} Papers</p>
          <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Real Student Uploads</span>
        </div>

        <div className="card" style={{ borderLeft: '5px solid #10B981' }}>
          <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Approved Score</h3>
          <p style={{ fontSize: '2.25rem', fontWeight: 700, color: '#10B981', margin: '0.25rem 0 0 0' }}>{avgScore}</p>
          <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Based on teacher reviews</span>
        </div>

        <div className="card" style={{ borderLeft: '5px solid #F59E0B' }}>
          <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending Teacher Reviews</h3>
          <p style={{ fontSize: '2.25rem', fontWeight: 700, color: '#D97706', margin: '0.25rem 0 0 0' }}>
            {pendingCount} Papers
          </p>
          <span style={{ fontSize: '0.75rem', color: '#D97706', fontWeight: 600 }}>
            {pendingCount > 0 ? '⚠️ Pending Teacher Review Gatekeeper' : 'All paper reviews completed!'}
          </span>
        </div>
      </div>

      {/* RAG Question Generator & Pool */}
      <div className="grid-2" style={{ marginBottom: '2rem' }}>
        
        {/* Left: Curriculum Ingestion */}
        <div className="card">
          <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>📚 Textbook RAG Ingestion</span>
          </h2>
          <p style={{ fontSize: '0.85rem' }}>Upload textbook chapter PDF or TXT to generate curriculum-aligned question pools.</p>
          
          <div 
            className="upload-area" 
            style={{ marginBottom: '1.25rem', padding: '1.5rem 1rem' }}
            onClick={() => document.getElementById('pdf-upload')?.click()}
          >
            <span style={{ fontSize: '2rem' }}>📄</span>
            <h4 style={{ marginTop: '0.5rem', fontSize: '0.95rem', color: '#4F46E5' }}>
              {uploadedPdfName || 'No document uploaded yet'}
            </h4>
            <p style={{ fontSize: '0.75rem', margin: 0, color: '#64748B' }}>
              {uploadedPdfName ? '✅ Custom Document Selected & Vector RAG Ready' : 'Click to select your PDF/TXT file or drag & drop here'}
            </p>
            <input 
              type="file" 
              id="pdf-upload" 
              style={{ display: 'none' }} 
              accept=".pdf,.txt"
              onChange={(e) => {
                const selectedFile = e.target.files?.[0];
                if (selectedFile) {
                  setUploadedPdf(selectedFile);
                  setUploadedPdfName(selectedFile.name);
                  // Clean filename to auto-set chapter topic if empty/default
                  const cleanName = selectedFile.name.replace(/\.[^/.]+$/, '').replace(/^Grade\d+_[^_]+_?/i, '').replace(/_/g, ' ');
                  if (cleanName) {
                    setAssignmentTitle(cleanName);
                  }
                }
              }}
            />
          </div>

          <div className="grid-3" style={{ gap: '0.75rem' }}>
            <div className="input-group">
              <label className="input-label">Target Class</label>
              <select 
                className="input-field" 
                value={className} 
                onChange={(e) => setClassName(e.target.value)}
              >
                <option value="Grade 5 General Science">Grade 5 General Science</option>
                <option value="Grade 4 English Literature">Grade 4 English Literature</option>
                <option value="Grade 3 Telugu (తెలుగు)">Grade 3 Telugu (తెలుగు)</option>
              </select>
            </div>

            <div className="input-group">
              <label className="input-label">Chapter Topic</label>
              <input 
                className="input-field" 
                placeholder="e.g. Plant Reproduction" 
                value={assignmentTitle}
                onChange={(e) => setAssignmentTitle(e.target.value)}
              />
            </div>

            <div className="input-group">
              <label className="input-label">📌 Sub-Topic / Days Scope (Optional)</label>
              <input 
                className="input-field" 
                placeholder="e.g. Days 1-3: Seed Structure & Dispersal" 
                value={subTopicScope}
                onChange={(e) => setSubTopicScope(e.target.value)}
              />
            </div>

            <div className="input-group">
              <label className="input-label">Instruction Language</label>
              <select 
                className="input-field" 
                value={subjectLanguage} 
                onChange={(e) => setSubjectLanguage(e.target.value)}
              >
                <option value="English">English</option>
                <option value="Hindi (हिंदी)">Hindi (हिंदी)</option>
                <option value="Telugu (తెలుగు)">Telugu (తెలుగు)</option>
              </select>
            </div>
          </div>


          <button 
            className="btn btn-primary" 
            style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem' }}
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? 'Extracting RAG Vectors & Generating...' : '✨ Generate Guardrailed Question Pool'}
          </button>
        </div>

        {/* Right: Question Pool Preview */}
        <div className="card">
          <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🎯 Generated Question Pool</span>
          </h2>
          <p style={{ fontSize: '0.85rem' }}>Review and edit AI-generated questions before dispatching to students.</p>
          
          {questions.length === 0 && !isGenerating && (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: '2.5rem', opacity: 0.5 }}>🤖</span>
              <p style={{ marginTop: '0.75rem', fontSize: '0.875rem' }}>Click <strong>Generate Question Pool</strong> to extract textbook questions.</p>
            </div>
          )}

          {isGenerating && (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
              <div style={{ width: '36px', height: '36px', border: '3px solid #E5E7EB', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }}></div>
              <p style={{ marginTop: '1rem', fontSize: '0.875rem' }}>Analyzing chapter vectors & formatting rubrics...</p>
            </div>
          )}

          {questions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {questions.map((q, idx) => (
                <div key={q.id || idx} style={{ padding: '0.875rem', border: '1px solid var(--border)', borderRadius: '0.5rem', background: '#F8FAFC' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', alignItems: 'center' }}>
                    <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>Question {idx + 1} (Editable)</span>
                    <input type="checkbox" defaultChecked />
                  </div>
                  <textarea 
                    className="input-field" 
                    rows={2} 
                    style={{ width: '100%', fontSize: '0.875rem', margin: '0.25rem 0 0 0', resize: 'vertical', background: 'white' }}
                    value={q.text}
                    onChange={(e) => handleQuestionTextChange(idx, e.target.value)}
                  />
                </div>
              ))}
              <button className="btn btn-primary" style={{ marginTop: '0.5rem', background: '#10B981' }} onClick={handleDispatch}>
                🚀 Dispatch to Google Classroom & Parent WhatsApp
              </button>
            </div>
          )}
        </div>

      </div>


      {/* Submissions & Teacher Review Table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>📊 Student Paper Reviews (Multilingual OCR Engine)</h2>
            <p style={{ margin: 0, fontSize: '0.85rem' }}>Click <strong>Review & Verify</strong> on any paper to inspect side-by-side OCR scan.</p>
          </div>
          <span className="badge badge-primary" style={{ fontSize: '0.8rem' }}>
            Script Engine: English / Hindi / Telugu
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', background: '#F8FAFC' }}>
                <th style={{ padding: '0.875rem' }}>Student Name</th>
                <th style={{ padding: '0.875rem' }}>Paper Language</th>
                <th style={{ padding: '0.875rem' }}>Status</th>
                <th style={{ padding: '0.875rem' }}>AI Draft Score</th>
                <th style={{ padding: '0.875rem' }}>OCR Accuracy</th>
                <th style={{ padding: '0.875rem', textAlign: 'right' }}>Teacher Action</th>
              </tr>
            </thead>
            <tbody>
              {submissions.length === 0 && (
                <tr><td colSpan={6} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>No student submissions yet.</td></tr>
              )}
              {submissions.map((sub) => (
                <tr key={sub.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                  <td style={{ padding: '0.875rem', fontWeight: 600 }}>{sub.studentName}</td>
                  <td style={{ padding: '0.875rem' }}>
                    <span className="badge badge-primary" style={{ background: '#EEF2FF', color: '#3730A3' }}>
                      {sub.language || 'English'}
                    </span>
                  </td>
                  <td style={{ padding: '0.875rem' }}>
                    {sub.status === 'pending_review' 
                      ? <span className="badge badge-warning">⚠️ Needs Teacher Approval</span> 
                      : <span className="badge badge-success">✅ Approved & Sent</span>}
                  </td>
                  <td style={{ padding: '0.875rem', fontWeight: 700, color: sub.status === 'approved' ? '#10B981' : '#4F46E5' }}>
                    {sub.status === 'approved' ? sub.finalScore : sub.aiEvaluation?.score}/100
                  </td>
                  <td style={{ padding: '0.875rem' }}>
                    {(sub.aiEvaluation?.metrics?.accuracy * 100 || 94).toFixed(0)}% Confidence
                  </td>
                  <td style={{ padding: '0.875rem', textAlign: 'right' }}>
                    <button 
                      className={`btn ${sub.status === 'pending_review' ? 'btn-primary' : 'btn-outline'}`}
                      style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                      onClick={() => navigate(`/verify/${sub.id}`)}
                    >
                      {sub.status === 'pending_review' ? 'Review & Verify' : 'View Verified Copy'}
                    </button>

                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {reviewingSubmission && (
        <SubmissionReviewModal 
          submission={reviewingSubmission}
          onClose={() => setReviewingSubmission(null)}
          onApprove={handleApprove}
        />
      )}

      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

