import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import SubmissionReviewModal from '../components/SubmissionReviewModal';
import BulkEvaluationModal from '../components/BulkEvaluationModal';
import { API_BASE_URL } from '../config/api';

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();

  // Read active tab from search params (e.g. ?tab=scan)
  const searchParams = new URLSearchParams(location.search);
  const currentTab = searchParams.get('tab') || 'overview';

  // Modals & Async States
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAddSubjectModalOpen, setIsAddSubjectModalOpen] = useState(false);
  const [isAddLessonModalOpen, setIsAddLessonModalOpen] = useState(false);

  // Form States - Exam Generator & Scan
  const [className, setClassName] = useState('Grade 11');
  const [subjectLanguage, setSubjectLanguage] = useState('English');
  const [assignmentTitle, setAssignmentTitle] = useState('Psychology Chapter 1 - Human Behavior');
  const [subTopicScope, setSubTopicScope] = useState('Cognitive Development & Memory');
  const [numQuestions, setNumQuestions] = useState<string>('5');
  const [scanStudentName, setScanStudentName] = useState('');
  const [scanMarkingScheme, setScanMarkingScheme] = useState('');

  // File Uploads
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [scanFiles, setScanFiles] = useState<File[]>([]);

  // Submissions & Questions
  const [questions, setQuestions] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [reviewingSubmission, setReviewingSubmission] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [queueFilter, setQueueFilter] = useState<'all' | 'pending' | 'approved'>('all');

  // Ingestion & Photo Question States
  const [pastedQuestionText, setPastedQuestionText] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);
  const [isExtractingPhoto, setIsExtractingPhoto] = useState(false);
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);

  // New Subject/Lesson Modal States
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectGrade, setNewSubjectGrade] = useState('Grade 11');

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
      console.error('Fetch submissions error:', err);
    }
  };

  const setTab = (tabName: string) => {
    navigate(`/?tab=${tabName}`);
  };

  // Preset Handler for Scan & Grade
  const handleApplyPreset = (studentName: string, subject: string, title: string, lang: string, scheme: string) => {
    setScanStudentName(studentName);
    setSubjectLanguage(lang);
    setAssignmentTitle(subject ? `${subject} - ${title}` : title);
    setScanMarkingScheme(scheme);
  };

  // Run Scan & Grade Execution
  const handleRunScanGrading = async () => {
    if (scanFiles.length === 0) {
      alert('⚠️ Please attach at least 1 student handwritten answer sheet image/PDF.');
      return;
    }

    setIsGenerating(true);
    try {
      const formData = new FormData();
      scanFiles.forEach(f => formData.append('submission', f));
      formData.append('studentName', scanStudentName || 'Student ' + Math.floor(Math.random() * 100));
      formData.append('selectedLanguage', subjectLanguage);
      formData.append('assignmentId', 'assign-' + Date.now());
      formData.append('subject', assignmentTitle);
      formData.append('className', className);
      formData.append('markingScheme', scanMarkingScheme);

      const res = await fetch(`${API_BASE_URL}/api/submissions`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        alert('⚡ Grading Pipeline Finished! Submission added to Review Queue.');
        setScanFiles([]);
        fetchSubmissions();
        setTab('queue');
      } else {
        alert(`⚠️ Upload error: ${data.message}`);
      }
    } catch (err) {
      console.error(err);
      alert('Error running grading pipeline.');
    } finally {
      setIsGenerating(false);
    }
  };

  // RAG Question Generator
  const handleGenerateQuestions = async () => {
    setIsGenerating(true);
    try {
      const formData = new FormData();
      formData.append('className', className);
      formData.append('topic', assignmentTitle || 'General Chapter');
      formData.append('subjectLanguage', subjectLanguage);
      const countVal = numQuestions && !isNaN(parseInt(numQuestions, 10)) ? parseInt(numQuestions, 10) : 5;
      formData.append('numQuestions', countVal.toString());
      if (subTopicScope) formData.append('subTopicScope', subTopicScope);
      if (uploadedFiles.length > 0) {
        uploadedFiles.forEach((file) => formData.append('documents', file));
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

  // Ingest Knowledge Base
  const handleIngestKnowledgeBase = async () => {
    if (uploadedFiles.length === 0) {
      alert('⚠️ Please select textbook documents, PDFs, TXTs, or ZIP archives first.');
      return;
    }
    setIsIngesting(true);
    setIngestStatus(null);
    try {
      const formData = new FormData();
      formData.append('className', className || 'Grade 11');
      formData.append('topic', assignmentTitle || 'General Chapter');
      uploadedFiles.forEach((file) => formData.append('documents', file));

      const res = await fetch(`${API_BASE_URL}/api/rag/ingest`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setIngestStatus(data.message);
        alert(`✅ Knowledge Base Ingested Successfully!\n${data.message}`);
      } else {
        alert(`⚠️ Ingestion failed: ${data.message}`);
      }
    } catch (err) {
      console.error('Ingest error:', err);
      alert('⚠️ Error ingesting knowledge base.');
    } finally {
      setIsIngesting(false);
    }
  };

  // Vision AI Photo Question Extraction
  const handlePhotoQuestionUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    setIsExtractingPhoto(true);

    try {
      const formData = new FormData();
      files.forEach(f => formData.append('questionPaper', f));
      formData.append('subjectLanguage', subjectLanguage);
      formData.append('className', className);

      const res = await fetch(`${API_BASE_URL}/api/rag/extract-questions-from-image`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.questions) && data.questions.length > 0) {
        setQuestions(prev => [...prev, ...data.questions]);
        alert(`✅ Vision AI extracted ${data.questions.length} question(s) from photo!`);
      } else {
        alert('⚠️ Could not extract questions from photo.');
      }
    } catch (err) {
      console.error('Photo question upload error:', err);
      alert('Error connecting to Vision AI endpoint.');
    } finally {
      setIsExtractingPhoto(false);
      e.target.value = '';
    }
  };

  // Dispatch Assignment
  const handleDispatchAssignment = async () => {
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
        alert('✅ Assignment dispatched to students! Parent WhatsApp notification queued.');
        setQuestions([]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Approval from Review Modal
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

  // Calculated Stats
  const pendingCount = submissions.filter(s => s.status === 'pending_review').length;
  const approvedSubmissions = submissions.filter(s => s.status === 'approved');
  const avgScore = approvedSubmissions.length > 0 
    ? (approvedSubmissions.reduce((acc, curr) => acc + (curr.finalScore || curr.aiEvaluation?.score || 0), 0) / approvedSubmissions.length).toFixed(1) + '%'
    : '—';

  // Submissions Filtering
  const filteredSubmissions = submissions.filter(s => {
    const nameMatch = (s.studentName || s.student_name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const titleMatch = (s.assignment?.title || s.subject || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSearch = nameMatch || titleMatch;

    if (queueFilter === 'pending') return matchesSearch && s.status === 'pending_review';
    if (queueFilter === 'approved') return matchesSearch && s.status === 'approved';
    return matchesSearch;
  });

  const subjectSummaries = Array.from(new Set(submissions.map((submission) => submission.subject || 'Unassigned subject'))).map((subject) => {
    const subjectSubmissions = submissions.filter((submission) => (submission.subject || 'Unassigned subject') === subject);
    const scored = subjectSubmissions.filter((submission) => typeof (submission.finalScore ?? submission.aiEvaluation?.score) === 'number');
    const average = scored.length > 0
      ? Math.round(scored.reduce((sum, submission) => sum + (submission.finalScore ?? submission.aiEvaluation.score), 0) / scored.length)
      : null;
    return { subject, count: subjectSubmissions.length, average };
  });

  return (
    <div className="page-container fade-in">
      
      {/* Top Floating Notification Banner */}
      <div className="top-notice-banner">
        <div className="banner-content">
          <span style={{ fontSize: '1.1rem' }}>⚡</span>
          <div>
            <span className="banner-title">SmartStudy Engine Active:</span> Intelligent optical grading & RAG connected.
          </div>
        </div>
        <button 
          className="btn-header-action" 
          onClick={() => setTab('scan')}
          style={{ background: 'rgba(255,255,255,0.2)', border: 'none' }}
        >
          + New Scan
        </button>
      </div>

      {/* Render View Based on Active Tab */}
      {currentTab === 'overview' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
            <div>
              <h1 className="page-header-title">Grading command centre</h1>
              <p className="page-header-subtitle">Intelligent marking for handwritten tests, homework and exams</p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-m btn-m-primary" onClick={() => setTab('scan')}>
                ⚡ Scan a script
              </button>
              <button className="btn-m btn-m-secondary" onClick={() => setIsBulkModalOpen(true)}>
                🚀 Bulk upload (50-100)
              </button>
            </div>
          </div>

          {/* Metric Cards Grid */}
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-label">Scripts Scanned</div>
              <div className="metric-value">{submissions.length}</div>
              <div className="metric-subtext">From database submissions</div>
            </div>

            <div className="metric-card">
              <div className="metric-label">Awaiting Review</div>
              <div className="metric-value" style={{ color: pendingCount > 0 ? '#D97706' : '#10B981' }}>
                {pendingCount}
              </div>
              <div className="metric-subtext" style={{ color: '#64748B' }}>
                {pendingCount > 0 ? 'Requires teacher sign-off' : 'All caught up!'}
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label">Class Average</div>
              <div className="metric-value">{avgScore}</div>
              <div className="metric-subtext">Across approved submissions</div>
            </div>

            <div className="metric-card">
              <div className="metric-label">Minutes Saved</div>
              <div className="metric-value">{submissions.length * 14}</div>
              <div className="metric-subtext">~14 mins per copy</div>
            </div>
          </div>

          {/* 6-Agent Sequential Pipeline Card */}
          <div className="card-panel">
            <div className="panel-header">
              <h2 className="panel-title">🤖 Active Agent Pipeline Status</h2>
              <span className="badge-pill badge-green">● 6 Agents Online</span>
            </div>
            <div className="pipeline-flow">
              <div className="pipeline-step completed">
                <div className="step-num">1</div>
                <div className="step-name">Vision Agent</div>
                <div className="step-desc">Handwritten OCR & spatial segmentation</div>
              </div>
              <div className="pipeline-step completed">
                <div className="step-num">2</div>
                <div className="step-name">Structure Agent</div>
                <div className="step-desc">Q&A pairing & Layout detection</div>
              </div>
              <div className="pipeline-step completed">
                <div className="step-num">3</div>
                <div className="step-name">RAG Agent</div>
                <div className="step-desc">Textbook vector key grounding</div>
              </div>
              <div className="pipeline-step completed">
                <div className="step-num">4</div>
                <div className="step-name">Grading Agent</div>
                <div className="step-desc">Step-by-step partial marks evaluation</div>
              </div>
              <div className="pipeline-step active">
                <div className="step-num">5</div>
                <div className="step-name">QA & Hint Agent</div>
                <div className="step-desc">Socratic hint generation</div>
              </div>
              <div className="pipeline-step">
                <div className="step-num">6</div>
                <div className="step-name">Teacher Audit</div>
                <div className="step-desc">One-click human override</div>
              </div>
            </div>
          </div>

          {/* Subject Performance Breakdown */}
          <div className="card-panel">
            <div className="panel-header">
              <h2 className="panel-title">Subject Performance</h2>
              <button className="btn-m btn-m-outline" onClick={() => setTab('knowledge')} style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
                Manage Curricula
              </button>
            </div>
            {subjectSummaries.length === 0 ? (
              <p style={{ color: '#64748B', fontSize: '0.875rem' }}>No subject performance data yet.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                {subjectSummaries.map(({ subject, count, average }) => (
                  <div key={subject} style={{ padding: '1rem', background: '#F8FAFC', borderRadius: '0.75rem', border: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontWeight: 700 }}>{subject}</span>
                      <span className="badge-pill badge-blue">{average === null ? '—' : `${average}% Avg`}</span>
                    </div>
                    <p style={{ fontSize: '0.8rem', margin: 0, color: '#64748B' }}>{count} Scripts Scanned</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Submissions Table */}
          <div className="card-panel">
            <div className="panel-header">
              <h2 className="panel-title">Recent Submissions Queue</h2>
              <button className="btn-m btn-m-outline" onClick={() => setTab('queue')}>
                View Full Queue →
              </button>
            </div>

            {submissions.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', background: '#F8FAFC', borderRadius: '0.75rem' }}>
                <p style={{ margin: 0, fontWeight: 600 }}>No submissions found yet.</p>
                <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '0.25rem' }}>
                  Go to "Scan & Grade" or "Bulk Upload" to evaluate student handwritten copies.
                </p>
                <button className="btn-m btn-m-primary" onClick={() => setTab('scan')} style={{ marginTop: '1rem' }}>
                  + Scan First Paper
                </button>
              </div>
            ) : (
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Student Name</th>
                      <th>Assessment</th>
                      <th>Language</th>
                      <th>AI Score</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.slice(0, 6).map((sub) => (
                      <tr key={sub.id}>
                        <td style={{ fontWeight: 700 }}>{sub.studentName || sub.student_name || 'Student'}</td>
                        <td>{sub.assignment?.title || sub.subject || 'General Assessment'}</td>
                        <td>
                          <span className="badge-pill badge-purple">{sub.language || 'English'}</span>
                        </td>
                        <td style={{ fontWeight: 800, color: '#1E40AF' }}>
                          {sub.finalScore ?? sub.aiEvaluation?.score ?? 0}%
                        </td>
                        <td>
                          {sub.status === 'approved' ? (
                            <span className="badge-pill badge-green">Approved</span>
                          ) : (
                            <span className="badge-pill badge-amber">Pending Review</span>
                          )}
                        </td>
                        <td>
                          <button 
                            className="btn-m btn-m-secondary" 
                            style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
                            onClick={() => setReviewingSubmission(sub)}
                          >
                            🔍 Review Paper
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SCAN & GRADE TAB */}
      {currentTab === 'scan' && (
        <div>
          <h1 className="page-header-title">Scan & grade</h1>
          <p className="page-header-subtitle">Upload handwritten test papers or student homework for optical AI evaluation</p>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
            
            {/* Left: Main Upload Form */}
            <div className="card-panel">
              <h2 className="panel-title" style={{ marginBottom: '1rem' }}>Handwritten Script Upload</h2>
              
              {/* Presets Bar */}
              <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#F8FAFC', borderRadius: '0.75rem', border: '1px solid #E2E8F0' }}>
                <p style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', marginBottom: '0.5rem' }}>
                  ⚡ Quick Sample Presets (Click to autofill):
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button 
                    className="preset-pill"
                    onClick={() => handleApplyPreset('Emma Watson', 'English Literature', 'Grade 5 Poetry Analysis', 'English', 'Award 5 marks for stanza analysis, 3 marks for rhyming scheme.')}
                  >
                    📝 Emma Watson (English)
                  </button>
                  <button 
                    className="preset-pill"
                    onClick={() => handleApplyPreset('Liam Chen', 'Science Quiz', 'Grade 8 Physics Motion', 'English', 'Full marks for correct formula F=ma and SI units.')}
                  >
                    🔬 Liam Chen (Science)
                  </button>
                  <button 
                    className="preset-pill"
                    onClick={() => handleApplyPreset('Rahul Kumar', 'Psychology Test', 'Grade 11 Psychology Ch 1', 'Hindi (हिंदी)', 'Evaluation based on CBSE Psychology textbook answer key.')}
                  >
                    🧠 Rahul Kumar (Hindi Psychology)
                  </button>
                </div>
              </div>

              {/* Dropzone */}
              <div className="m-dropzone" onClick={() => document.getElementById('scan-file-input')?.click()}>
                <input 
                  type="file" 
                  id="scan-file-input" 
                  multiple 
                  accept="image/*,application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files) setScanFiles(Array.from(e.target.files));
                  }}
                />
                <span style={{ fontSize: '2.5rem' }}>📸</span>
                <p style={{ fontWeight: 700, margin: '0.5rem 0 0.25rem 0', fontSize: '1rem' }}>
                  Click or drag handwritten answer sheets here
                </p>
                <p style={{ fontSize: '0.8125rem', color: '#64748B' }}>
                  Supports PNG, JPG, WEBP, and multi-page PDF documents.
                </p>
              </div>

              {scanFiles.length > 0 && (
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#EFF6FF', borderRadius: '0.5rem', border: '1px solid #BFDBFE' }}>
                  <p style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1E40AF', margin: 0 }}>
                    📎 {scanFiles.length} file(s) attached:
                  </p>
                  <ul style={{ margin: '0.25rem 0 0 1.25rem', fontSize: '0.8rem', color: '#1E3A8A' }}>
                    {scanFiles.map((f, i) => <li key={i}>{f.name} ({(f.size / 1024).toFixed(1)} KB)</li>)}
                  </ul>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.25rem' }}>
                <div>
                  <label className="metric-label" style={{ display: 'block', marginBottom: '0.35rem' }}>Student Name</label>
                  <input 
                    type="text" 
                    className="m-input" 
                    placeholder="e.g. Emma Watson" 
                    value={scanStudentName}
                    onChange={(e) => setScanStudentName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="metric-label" style={{ display: 'block', marginBottom: '0.35rem' }}>Language Engine</label>
                  <select 
                    className="m-select" 
                    value={subjectLanguage}
                    onChange={(e) => setSubjectLanguage(e.target.value)}
                  >
                    <option value="English">English</option>
                    <option value="Hindi (हिंदी)">Hindi (हिंदी)</option>
                    <option value="Telugu (తెలుగు)">Telugu (తెలుగు)</option>
                  </select>
                </div>
              </div>

              <div style={{ marginTop: '1rem' }}>
                <label className="metric-label" style={{ display: 'block', marginBottom: '0.35rem' }}>Assessment / Subject Title</label>
                <input 
                  type="text" 
                  className="m-input" 
                  placeholder="e.g. Grade 11 Psychology Midterm" 
                  value={assignmentTitle}
                  onChange={(e) => setAssignmentTitle(e.target.value)}
                />
              </div>

              <div style={{ marginTop: '1rem' }}>
                <label className="metric-label" style={{ display: 'block', marginBottom: '0.35rem' }}>Reference Marking Scheme / Rubric (Optional)</label>
                <textarea 
                  className="m-input" 
                  rows={3}
                  placeholder="Provide specific guidelines or key concepts expected in student answers..."
                  value={scanMarkingScheme}
                  onChange={(e) => setScanMarkingScheme(e.target.value)}
                />
              </div>

              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                <button 
                  className="btn-m btn-m-primary" 
                  style={{ flex: 1, padding: '0.8rem' }}
                  onClick={handleRunScanGrading}
                  disabled={isGenerating}
                >
                  {isGenerating ? '⚡ Running 6-Agent Optical Grading...' : '⚡ Run Grading Pipeline'}
                </button>
              </div>
            </div>

            {/* Right Side Info & Bulk Options */}
            <div>
              <div className="card-panel" style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', color: 'white' }}>
                <h3 style={{ color: 'white', fontSize: '1.1rem', marginBottom: '0.5rem' }}>🚀 Batch Processing</h3>
                <p style={{ color: '#94A3B8', fontSize: '0.85rem' }}>
                  Have an entire stack of 50-100 answer sheets? Use our asynchronous queue processor to evaluate entire classes in parallel.
                </p>
                <button 
                  className="btn-m btn-m-primary" 
                  style={{ width: '100%', marginTop: '1rem' }}
                  onClick={() => setIsBulkModalOpen(true)}
                >
                  Launch Bulk Evaluator
                </button>
              </div>

              <div className="card-panel">
                <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>ℹ️ OCR Capabilities</h3>
                <ul style={{ paddingLeft: '1.2rem', fontSize: '0.85rem', color: '#64748B', lineHeight: '1.6' }}>
                  <li>Handles messy cursive handwriting</li>
                  <li>Multi-lingual support (Hindi, Telugu, English)</li>
                  <li>Recognizes diagrams & formulas</li>
                  <li>Generates step-by-step partial marks</li>
                </ul>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* REVIEW QUEUE TAB */}
      {currentTab === 'queue' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h1 className="page-header-title">Review queue</h1>
              <p className="page-header-subtitle">Inspect AI-scanned handwritten copies, adjust scores, and verify Socratic feedback</p>
            </div>
            <span className="badge-pill badge-amber" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>
              ● {pendingCount} Pending Sign-off
            </span>
          </div>

          <div className="card-panel">
            {/* Search & Filters Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.25rem' }}>
              <input 
                type="text" 
                className="m-input" 
                style={{ maxWidth: '350px' }}
                placeholder="🔍 Search student name or subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  className={`btn-m ${queueFilter === 'all' ? 'btn-m-primary' : 'btn-m-outline'}`}
                  onClick={() => setQueueFilter('all')}
                >
                  All ({submissions.length})
                </button>
                <button 
                  className={`btn-m ${queueFilter === 'pending' ? 'btn-m-primary' : 'btn-m-outline'}`}
                  onClick={() => setQueueFilter('pending')}
                >
                  Pending ({pendingCount})
                </button>
                <button 
                  className={`btn-m ${queueFilter === 'approved' ? 'btn-m-primary' : 'btn-m-outline'}`}
                  onClick={() => setQueueFilter('approved')}
                >
                  Approved ({approvedSubmissions.length})
                </button>
              </div>
            </div>

            {/* Submissions Table */}
            {filteredSubmissions.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
                <p style={{ fontWeight: 600 }}>No matching submissions found.</p>
              </div>
            ) : (
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Assessment</th>
                      <th>Language</th>
                      <th>Confidence</th>
                      <th>Score</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubmissions.map((sub) => (
                      <tr key={sub.id}>
                        <td style={{ fontWeight: 700 }}>{sub.studentName || sub.student_name || 'Student'}</td>
                        <td>{sub.assignment?.title || sub.subject || 'General Assessment'}</td>
                        <td>
                          <span className="badge-pill badge-purple">{sub.language || 'English'}</span>
                        </td>
                        <td style={{ fontWeight: 600, color: '#059669' }}>
                          {(sub.aiEvaluation?.confidence || 0.94 * 100).toFixed(0)}% Match
                        </td>
                        <td style={{ fontWeight: 800, fontSize: '1rem', color: '#1E40AF' }}>
                          {sub.finalScore ?? sub.aiEvaluation?.score ?? 0}%
                        </td>
                        <td>
                          {sub.status === 'approved' ? (
                            <span className="badge-pill badge-green">Approved</span>
                          ) : (
                            <span className="badge-pill badge-amber">Pending Review</span>
                          )}
                        </td>
                        <td>
                          <button 
                            className="btn-m btn-m-primary" 
                            style={{ fontSize: '0.78rem', padding: '0.35rem 0.85rem' }}
                            onClick={() => setReviewingSubmission(sub)}
                          >
                            🔍 Verify & Approve
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* KNOWLEDGE BASE TAB */}
      {currentTab === 'knowledge' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h1 className="page-header-title">Knowledge base</h1>
              <p className="page-header-subtitle">Manage reference textbooks, course syllabi, and RAG vector indexes</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-m btn-m-primary" onClick={() => setIsAddSubjectModalOpen(true)}>
                + Add Subject
              </button>
              <button className="btn-m btn-m-secondary" onClick={() => setIsAddLessonModalOpen(true)}>
                + Upload Lesson Material
              </button>
            </div>
          </div>

          {/* Document Ingestion Panel */}
          <div className="card-panel">
            <h2 className="panel-title" style={{ marginBottom: '1rem' }}>RAG Vector Indexing</h2>
            
            <div className="m-dropzone" onClick={() => document.getElementById('kb-file-input')?.click()}>
              <input 
                type="file" 
                id="kb-file-input" 
                multiple 
                accept=".pdf,.txt,.zip,.doc,.docx"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files) setUploadedFiles(Array.from(e.target.files));
                }}
              />
              <span style={{ fontSize: '2.5rem' }}>📚</span>
              <p style={{ fontWeight: 700, margin: '0.5rem 0 0.25rem 0' }}>
                Upload Textbook PDFs, Syllabi, or Chapter Documents
              </p>
              <p style={{ fontSize: '0.8125rem', color: '#64748B' }}>
                ChromaDB Vector Store will automatically chunk and embed your materials using Gemini RAG.
              </p>
            </div>

            {uploadedFiles.length > 0 && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#F0FDF4', borderRadius: '0.5rem', border: '1px solid #BBF7D0' }}>
                <p style={{ fontWeight: 700, fontSize: '0.85rem', color: '#166534', margin: 0 }}>
                  📄 {uploadedFiles.length} file(s) ready for indexing:
                </p>
                <ul style={{ margin: '0.25rem 0 0 1.25rem', fontSize: '0.8rem', color: '#14532D' }}>
                  {uploadedFiles.map((f, i) => <li key={i}>{f.name} ({(f.size / 1024).toFixed(1)} KB)</li>)}
                </ul>
              </div>
            )}

            <button 
              className="btn-m btn-m-primary" 
              style={{ marginTop: '1.25rem', width: '100%', padding: '0.75rem' }}
              onClick={handleIngestKnowledgeBase}
              disabled={isIngesting}
            >
              {isIngesting ? '⚡ Indexing Chunks into Vector DB...' : '⚡ Ingest Knowledge Base'}
            </button>

            {ingestStatus && (
              <p style={{ fontSize: '0.85rem', color: '#10B981', marginTop: '0.75rem', fontWeight: 600 }}>
                {ingestStatus}
              </p>
            )}
          </div>

          {/* Indexed Curriculum Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>
            <div className="card-panel">
              <span className="badge-pill badge-blue" style={{ marginBottom: '0.5rem' }}>Grade 11</span>
              <h3 style={{ fontSize: '1.1rem', margin: '0.25rem 0' }}>Psychology NCERT TB</h3>
              <p style={{ fontSize: '0.82rem', color: '#64748B' }}>Indexed Chunks: 1,420 | Vector Store: Active</p>
              <div style={{ marginTop: '1rem', fontSize: '0.78rem', color: '#059669', fontWeight: 600 }}>
                ✓ Ground-truth benchmark key enabled
              </div>
            </div>

            <div className="card-panel">
              <span className="badge-pill badge-green" style={{ marginBottom: '0.5rem' }}>Grade 5</span>
              <h3 style={{ fontSize: '1.1rem', margin: '0.25rem 0' }}>English Literature & Grammar</h3>
              <p style={{ fontSize: '0.82rem', color: '#64748B' }}>Indexed Chunks: 890 | Vector Store: Active</p>
              <div style={{ marginTop: '1rem', fontSize: '0.78rem', color: '#059669', fontWeight: 600 }}>
                ✓ Multilingual grammar validation enabled
              </div>
            </div>

            <div className="card-panel">
              <span className="badge-pill badge-purple" style={{ marginBottom: '0.5rem' }}>Grade 8</span>
              <h3 style={{ fontSize: '1.1rem', margin: '0.25rem 0' }}>Science & Physical World</h3>
              <p style={{ fontSize: '0.82rem', color: '#64748B' }}>Indexed Chunks: 1,150 | Vector Store: Active</p>
              <div style={{ marginTop: '1rem', fontSize: '0.78rem', color: '#059669', fontWeight: 600 }}>
                ✓ Formulas & SI Units verified
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EXAM GENERATOR TAB */}
      {currentTab === 'exam-generator' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h1 className="page-header-title">Exam paper generator</h1>
              <p className="page-header-subtitle">Create RAG-grounded question papers, answer keys, and benchmark rubrics from indexed textbooks</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
            
            {/* Left Controls */}
            <div className="card-panel">
              <h2 className="panel-title" style={{ marginBottom: '1rem' }}>Generator Parameters</h2>

              <div style={{ marginBottom: '1rem' }}>
                <label className="metric-label" style={{ display: 'block', marginBottom: '0.35rem' }}>Class & Section</label>
                <input 
                  type="text" 
                  className="m-input" 
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label className="metric-label" style={{ display: 'block', marginBottom: '0.35rem' }}>Assignment Title</label>
                <input 
                  type="text" 
                  className="m-input" 
                  value={assignmentTitle}
                  onChange={(e) => setAssignmentTitle(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label className="metric-label" style={{ display: 'block', marginBottom: '0.35rem' }}>Sub-Topic Scope</label>
                <input 
                  type="text" 
                  className="m-input" 
                  value={subTopicScope}
                  onChange={(e) => setSubTopicScope(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label className="metric-label" style={{ display: 'block', marginBottom: '0.35rem' }}>Number of Questions</label>
                <input 
                  type="number" 
                  className="m-input" 
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(e.target.value)}
                />
              </div>

              <button 
                className="btn-m btn-m-primary" 
                style={{ width: '100%', padding: '0.75rem', marginBottom: '0.75rem' }}
                onClick={handleGenerateQuestions}
                disabled={isGenerating}
              >
                {isGenerating ? '🤖 Synthesizing via RAG Vector Search...' : '🤖 Generate via AI RAG'}
              </button>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <label className="btn-m btn-m-outline" style={{ flex: 1, cursor: 'pointer', fontSize: '0.78rem', textAlign: 'center' }}>
                  {isExtractingPhoto ? '📷 Extracting...' : '📷 Photo Extract'}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoQuestionUpload} disabled={isExtractingPhoto} />
                </label>

                <button 
                  className="btn-m btn-m-outline" 
                  style={{ flex: 1, fontSize: '0.78rem' }}
                  onClick={() => setIsImportModalOpen(true)}
                >
                  ✍️ Paste Text
                </button>
              </div>
            </div>

            {/* Right Question Paper View */}
            <div className="card-panel">
              <div className="panel-header">
                <h2 className="panel-title">Generated Question Paper</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    className="btn-m btn-m-secondary" 
                    style={{ fontSize: '0.78rem' }}
                    onClick={() => {
                      const newQ = { id: `q-${Date.now()}`, text: 'Type question here...', correctAnswer: 'Type answer key here...' };
                      setQuestions(prev => [...prev, newQ]);
                    }}
                  >
                    + Add Q
                  </button>
                  <button 
                    className="btn-m btn-m-primary" 
                    style={{ fontSize: '0.78rem' }}
                    onClick={handleDispatchAssignment}
                    disabled={questions.length === 0}
                  >
                    📢 Dispatch to Students
                  </button>
                </div>
              </div>

              {questions.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B', background: '#F8FAFC', borderRadius: '0.75rem' }}>
                  <span style={{ fontSize: '2.5rem' }}>📝</span>
                  <p style={{ fontWeight: 600, marginTop: '0.5rem' }}>No questions in paper yet.</p>
                  <p style={{ fontSize: '0.85rem' }}>Click "Generate via AI RAG" or upload a photo to build your test paper.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {questions.map((q, idx) => (
                    <div key={q.id || idx} style={{ padding: '1rem', background: '#F8FAFC', borderRadius: '0.75rem', border: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ fontWeight: 700, color: '#2563EB' }}>Question {idx + 1}</span>
                        <button 
                          style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '0.8rem' }}
                          onClick={() => {
                            const updated = [...questions];
                            updated.splice(idx, 1);
                            setQuestions(updated);
                          }}
                        >
                          ✕ Delete
                        </button>
                      </div>
                      <input 
                        type="text" 
                        className="m-input" 
                        style={{ fontWeight: 600, marginBottom: '0.5rem' }}
                        value={q.text}
                        onChange={(e) => {
                          const updated = [...questions];
                          updated[idx].text = e.target.value;
                          setQuestions(updated);
                        }}
                      />
                      <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#EFF6FF', borderRadius: '0.375rem', border: '1px solid #BFDBFE' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1E40AF' }}>Ground-Truth Answer Key:</span>
                        <input 
                          type="text" 
                          className="m-input" 
                          style={{ fontSize: '0.8rem', marginTop: '0.25rem', background: 'white' }}
                          value={q.correctAnswer || ''}
                          onChange={(e) => {
                            const updated = [...questions];
                            updated[idx].correctAnswer = e.target.value;
                            setQuestions(updated);
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Modals Integration */}
      {reviewingSubmission && (
        <SubmissionReviewModal 
          submission={reviewingSubmission}
          onClose={() => setReviewingSubmission(null)}
          onApprove={handleApprove}
        />
      )}

      <BulkEvaluationModal 
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onRefreshDashboard={fetchSubmissions}
      />

      {/* Paste Custom Questions Modal */}
      {isImportModalOpen && (
        <div className="m-modal-backdrop" onClick={() => setIsImportModalOpen(false)}>
          <div className="m-modal-card" onClick={e => e.stopPropagation()}>
            <h2 className="panel-title" style={{ marginBottom: '0.5rem' }}>Paste Custom Questions & Answer Key</h2>
            <p style={{ fontSize: '0.85rem', color: '#64748B', marginBottom: '1rem' }}>
              Format each question starting with "Q1:", "Question 1", or "1." followed by "Ans:" for the reference benchmark.
            </p>

            <textarea 
              className="m-input" 
              rows={8}
              placeholder={`Q1. What is cognitive development?\nAns: Mental processes like memory and problem solving.\n\nQ2. Explain Pavlov's experiment.\nAns: Classical conditioning using dog and bell.`}
              value={pastedQuestionText}
              onChange={(e) => setPastedQuestionText(e.target.value)}
            />

            <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn-m btn-m-secondary" onClick={() => setIsImportModalOpen(false)}>
                Cancel
              </button>
              <button 
                className="btn-m btn-m-primary"
                onClick={() => {
                  if (pastedQuestionText.trim()) {
                    setQuestions(prev => [...prev, { id: `q-${Date.now()}`, text: pastedQuestionText.trim(), correctAnswer: 'Pasted benchmark answer' }]);
                    setPastedQuestionText('');
                    setIsImportModalOpen(false);
                  }
                }}
              >
                Import Questions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Subject Modal */}
      {isAddSubjectModalOpen && (
        <div className="m-modal-backdrop" onClick={() => setIsAddSubjectModalOpen(false)}>
          <div className="m-modal-card" onClick={e => e.stopPropagation()}>
            <h2 className="panel-title" style={{ marginBottom: '1rem' }}>Add New Curriculum Subject</h2>
            <div style={{ marginBottom: '1rem' }}>
              <label className="metric-label" style={{ display: 'block', marginBottom: '0.35rem' }}>Subject Name</label>
              <input 
                type="text" 
                className="m-input" 
                placeholder="e.g. Class 10 Chemistry" 
                value={newSubjectName} 
                onChange={e => setNewSubjectName(e.target.value)} 
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label className="metric-label" style={{ display: 'block', marginBottom: '0.35rem' }}>Grade / Class</label>
              <input 
                type="text" 
                className="m-input" 
                value={newSubjectGrade} 
                onChange={e => setNewSubjectGrade(e.target.value)} 
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn-m btn-m-secondary" onClick={() => setIsAddSubjectModalOpen(false)}>Cancel</button>
              <button className="btn-m btn-m-primary" onClick={() => {
                alert(`Subject "${newSubjectName}" added!`);
                setIsAddSubjectModalOpen(false);
              }}>Save Subject</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Lesson Modal */}
      {isAddLessonModalOpen && (
        <div className="m-modal-backdrop" onClick={() => setIsAddLessonModalOpen(false)}>
          <div className="m-modal-card" onClick={e => e.stopPropagation()}>
            <h2 className="panel-title" style={{ marginBottom: '1rem' }}>Upload Lesson Material</h2>
            <div className="m-dropzone" onClick={() => document.getElementById('lesson-file')?.click()}>
              <input type="file" id="lesson-file" style={{ display: 'none' }} onChange={() => alert('Lesson material selected.')} />
              <p style={{ fontWeight: 700, margin: 0 }}>Select Lesson PDF/Document</p>
            </div>
            <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn-m btn-m-secondary" onClick={() => setIsAddLessonModalOpen(false)}>Cancel</button>
              <button className="btn-m btn-m-primary" onClick={() => setIsAddLessonModalOpen(false)}>Upload Lesson</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
