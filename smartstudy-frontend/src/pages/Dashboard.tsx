import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SubmissionReviewModal from '../components/SubmissionReviewModal';
import BulkEvaluationModal from '../components/BulkEvaluationModal';
import { API_BASE_URL } from '../config/api';

export default function Dashboard() {
  const navigate = useNavigate();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  const [questions, setQuestions] = useState<any[]>([]);
  const [className, setClassName] = useState('');
  const [subjectLanguage, setSubjectLanguage] = useState('English');
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [subTopicScope, setSubTopicScope] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [reviewingSubmission, setReviewingSubmission] = useState<any>(null);

  const [questionModules, setQuestionModules] = useState<any[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');

  useEffect(() => {
    fetchSubmissions();
    fetchQuestionModules();
    const interval = setInterval(fetchSubmissions, 4000);
    return () => clearInterval(interval);
  }, []);

  const fetchQuestionModules = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/question-modules`);
      const data = await res.json();
      if (data.success) {
        setQuestionModules(data.modules || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleModuleSelect = (moduleId: string) => {
    setSelectedModuleId(moduleId);
    const selectedMod = questionModules.find((m) => m.id === moduleId);
    if (selectedMod) {
      if (selectedMod.className) setClassName(selectedMod.className);
      if (selectedMod.title) setAssignmentTitle(selectedMod.title);
      if (selectedMod.language) setSubjectLanguage(selectedMod.language);
      if (selectedMod.questions && selectedMod.questions.length > 0) {
        setQuestions(selectedMod.questions);
      }
    }
  };

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
      if (uploadedFiles.length > 0) {
        uploadedFiles.forEach((file) => {
          formData.append('documents', file);
        });
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

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [pastedQuestionText, setPastedQuestionText] = useState('');
  const [isExtractingPhoto, setIsExtractingPhoto] = useState(false);

  const handlePhotoQuestionUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    setIsExtractingPhoto(true);

    try {
      const formData = new FormData();
      files.forEach(f => formData.append('questionPaper', f));

      const res = await fetch(`${API_BASE_URL}/api/rag/extract-questions-from-image`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.questions) && data.questions.length > 0) {
        setQuestions(prev => [...prev, ...data.questions]);
        alert(`✅ Vision AI extracted ${data.questions.length} question(s) from your uploaded photo!`);
      } else {
        alert('⚠️ Could not extract questions from photo. Please upload a clearer image of your question paper.');
      }
    } catch (err) {
      console.error('Photo question upload error:', err);
      alert('Error connecting to Vision AI endpoint.');
    } finally {
      setIsExtractingPhoto(false);
      e.target.value = '';
    }
  };

  const handleQuestionTextChange = (index: number, newText: string) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], text: newText };
    setQuestions(updated);
  };

  const handleQuestionAnswerChange = (index: number, newAns: string) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], correctAnswer: newAns };
    setQuestions(updated);
  };

  const handleAddCustomQuestion = () => {
    const newQ = {
      id: `custom-q-${Date.now()}`,
      text: 'Type custom question here...',
      correctAnswer: 'Type reference ground-truth benchmark key here...'
    };
    setQuestions(prev => [...prev, newQ]);
  };

  const handleDeleteQuestion = (index: number) => {
    const updated = [...questions];
    updated.splice(index, 1);
    setQuestions(updated);
  };

  const handleImportPastedQuestions = () => {
    if (!pastedQuestionText || !pastedQuestionText.trim()) return;
    const lines = pastedQuestionText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const parsed: any[] = [];
    let currentQ: any = null;

    for (const line of lines) {
      if (/^(Q\d+|Question\s*\d+|\d+[\.\)])/i.test(line)) {
        if (currentQ) parsed.push(currentQ);
        currentQ = {
          id: `pasted-q-${Date.now()}-${parsed.length}`,
          text: line.replace(/^(Q\d+[:\.\)]|Question\s*\d+[:\.\)]|\d+[\.\)])\s*/i, ''),
          correctAnswer: ''
        };
      } else if (/^(Ans|Answer|Key|Benchmark)[:\.\)]/i.test(line)) {
        if (currentQ) {
          currentQ.correctAnswer = line.replace(/^(Ans|Answer|Key|Benchmark)[:\.\)]\s*/i, '');
        }
      } else if (currentQ) {
        if (!currentQ.correctAnswer) {
          currentQ.text += ' ' + line;
        } else {
          currentQ.correctAnswer += ' ' + line;
        }
      }
    }
    if (currentQ) parsed.push(currentQ);

    if (parsed.length > 0) {
      setQuestions(prev => [...prev, ...parsed]);
      alert(`✅ Successfully imported ${parsed.length} custom questions!`);
    } else {
      setQuestions(prev => [...prev, {
        id: `custom-q-${Date.now()}`,
        text: pastedQuestionText.trim(),
        correctAnswer: 'Custom benchmark answer'
      }]);
    }
    setPastedQuestionText('');
    setIsImportModalOpen(false);
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
          <button
            className="btn btn-primary"
            style={{ fontSize: '0.85rem', padding: '0.45rem 0.9rem', fontWeight: 600 }}
            onClick={() => setIsBulkModalOpen(true)}
          >
            🚀 Bulk Upload (50-100 Papers)
          </button>
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
            <span>📚 Textbook RAG Ingestion & Question Modules</span>
          </h2>
          <p style={{ fontSize: '0.85rem' }}>Select a pre-provided question module or upload textbook chapters to generate custom pools.</p>

          {/* Pre-Provided Question Modules Bar */}
          <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: '0.5rem', padding: '0.875rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#3730A3', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>📋 Select Pre-Provided Question Module</span>
              </label>
              {selectedModuleId && (
                <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>
                  {questions.length} Questions Loaded
                </span>
              )}
            </div>
            <select
              className="input-field"
              style={{ background: 'white', borderColor: '#818CF8', color: '#1E1B4B', fontWeight: 600 }}
              value={selectedModuleId}
              onChange={(e) => handleModuleSelect(e.target.value)}
            >
              <option value="">-- Choose Preset Curriculum Module or Dispatched Assignment --</option>
              {questionModules.map((mod: any) => (
                <option key={mod.id} value={mod.id}>
                  {mod.className} - {mod.title} ({mod.questions?.length || 0} Questions)
                </option>
              ))}
            </select>
          </div>
          
          <div 
            className="upload-area" 
            style={{ marginBottom: '1.25rem', padding: '1.5rem 1rem', cursor: 'pointer' }}
            onClick={() => document.getElementById('pdf-upload')?.click()}
          >
            <span style={{ fontSize: '2rem' }}>
              {uploadedFiles.length === 0 ? '📚' : (uploadedFiles.some(f => f.name.toLowerCase().endsWith('.zip')) ? '📦' : (uploadedFiles.some(f => f.type.startsWith('image/')) ? '🖼️' : '📄'))}
            </span>
            <h4 style={{ marginTop: '0.5rem', fontSize: '0.95rem', color: '#4F46E5' }}>
              {uploadedFiles.length > 0
                ? `${uploadedFiles.length} Chapter Document(s) / Image(s) Selected`
                : 'Click to select Images, PDFs, TXTs, or ZIP archives'}
            </h4>
            <p style={{ fontSize: '0.75rem', margin: 0, color: '#64748B' }}>
              {uploadedFiles.length > 0 
                ? '✅ Document(s) / Image(s) Ready for Vector RAG Ingestion' 
                : 'Upload textbook pages, handwritten notes, chapter photos, PDFs, or ZIP archives'}
            </p>
            <input 
              type="file" 
              id="pdf-upload" 
              multiple
              style={{ display: 'none' }} 
              accept="image/*,.pdf,.txt,.zip,.rar"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  const selectedList = Array.from(e.target.files);
                  setUploadedFiles(selectedList);
                  const firstFile = selectedList[0];
                  const cleanName = firstFile.name.replace(/\.[^/.]+$/, '').replace(/^Grade\d+_[^_]+_?/i, '').replace(/_/g, ' ');
                  if (cleanName) {
                    setAssignmentTitle(cleanName);
                  }
                }
              }}
            />

            {uploadedFiles.length > 0 && (
              <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem', justifyContent: 'center' }}>
                {uploadedFiles.slice(0, 10).map((f, idx) => {
                  const isImg = f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|bmp)$/i.test(f.name);
                  const isZip = f.name.toLowerCase().endsWith('.zip');
                  const icon = isZip ? '📦' : isImg ? '🖼️' : '📄';
                  return (
                    <span key={idx} style={{ background: '#E0E7FF', color: '#3730A3', padding: '0.15rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      <span>{icon}</span> {f.name}
                    </span>
                  );
                })}
                {uploadedFiles.length > 10 && (
                  <span style={{ fontSize: '0.7rem', color: '#64748B', alignSelf: 'center' }}>
                    + {uploadedFiles.length - 10} more files...
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="grid-3" style={{ gap: '0.75rem' }}>
            <div className="input-group">
              <label className="input-label">Target Class</label>
              <input 
                type="text"
                className="input-field" 
                placeholder="e.g. Grade 11 Psychology"
                list="class-name-suggestions"
                value={className} 
                onChange={(e) => setClassName(e.target.value)}
              />
              <datalist id="class-name-suggestions">
                {Array.from(new Set([
                  ...submissions.map(s => s.assignment?.className || s.subject).filter(Boolean),
                  ...questionModules.map(m => m.className).filter(Boolean)
                ])).map((cName, idx) => (
                  <option key={idx} value={cName} />
                ))}
              </datalist>
            </div>

            <div className="input-group">
              <label className="input-label">Chapter Topic</label>
              <input 
                className="input-field" 
                placeholder="e.g. CBSE Psychology TB" 
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>🎯 Question Pool & Custom Exam Creator</span>
              </h2>
              <p style={{ fontSize: '0.85rem', margin: 0, color: '#64748B' }}>Generate via AI RAG or add/import your own custom teacher questions.</p>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button 
                className="btn btn-outline" 
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem', borderColor: '#059669', color: '#059669' }}
                onClick={() => document.getElementById('photo-question-input')?.click()}
                disabled={isExtractingPhoto}
              >
                {isExtractingPhoto ? '🤖 Reading Photo...' : '📷 Photo of Question Paper'}
              </button>
              <input 
                id="photo-question-input" 
                type="file" 
                accept="image/*,.pdf" 
                multiple 
                style={{ display: 'none' }} 
                onChange={handlePhotoQuestionUpload} 
              />

              <button 
                className="btn btn-outline" 
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                onClick={handleAddCustomQuestion}
              >
                ➕ Add Question
              </button>
              <button 
                className="btn btn-outline" 
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem', borderColor: '#4F46E5', color: '#4F46E5' }}
                onClick={() => setIsImportModalOpen(true)}
              >
                📝 Import Question Paper
              </button>
            </div>
          </div>
          
          {questions.length === 0 && !isGenerating && (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: '2.5rem', opacity: 0.5 }}>🤖</span>
              <p style={{ marginTop: '0.75rem', fontSize: '0.875rem' }}>
                Click <strong>Generate Question Pool</strong>, or click <strong>➕ Add Question</strong> to type/import custom teacher questions.
              </p>
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
                    <button 
                      onClick={() => handleDeleteQuestion(idx)} 
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: '0.85rem' }}
                      title="Remove question"
                    >
                      🗑️ Remove
                    </button>
                  </div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>
                    Question Prompt:
                  </label>
                  <textarea 
                    className="input-field" 
                    rows={2} 
                    style={{ width: '100%', fontSize: '0.875rem', margin: '0 0 0.5rem 0', resize: 'vertical', background: 'white' }}
                    value={q.text || ''}
                    onChange={(e) => handleQuestionTextChange(idx, e.target.value)}
                  />

                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#059669', display: 'block', marginBottom: '0.2rem' }}>
                    🎯 Reference Ground-Truth Answer Key:
                  </label>
                  <textarea 
                    className="input-field" 
                    rows={2} 
                    style={{ width: '100%', fontSize: '0.825rem', margin: 0, resize: 'vertical', background: '#ECFDF5', borderColor: '#A7F3D0', color: '#065F46' }}
                    placeholder="Type ground-truth reference answer key for AI evaluation..."
                    value={q.correctAnswer || ''}
                    onChange={(e) => handleQuestionAnswerChange(idx, e.target.value)}
                  />
                </div>
              ))}
              
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={handleAddCustomQuestion}>
                  ➕ Add Another Question
                </button>
                <button className="btn btn-primary" style={{ flex: 2, background: '#10B981' }} onClick={handleDispatch}>
                  🚀 Dispatch to Google Classroom & Parent WhatsApp
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal: Import Custom Question Paper */}
        {isImportModalOpen && (
          <div className="modal-overlay" onClick={() => setIsImportModalOpen(false)}>
            <div className="modal-content" style={{ maxWidth: '600px', width: '90%' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>📝 Import Teacher Custom Question Paper</h3>
                <button onClick={() => setIsImportModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer' }}>&times;</button>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: 0 }}>
                Paste your question paper below. Format each line starting with <code>Q1: ...</code> and <code>Ans: ...</code> (or paste plain text questions).
              </p>
              <textarea 
                className="input-field"
                rows={8}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem', background: '#F8FAFC' }}
                placeholder={`Q1: Explain the etymological origin of psychology...\nAns: Etymologically derived from psyche (soul) and logos (study)...\n\nQ2: Distinguish between brain and mind activities...\nAns: Brain activities are neural events...`}
                value={pastedQuestionText}
                onChange={(e) => setPastedQuestionText(e.target.value)}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                <button className="btn btn-outline" onClick={() => setIsImportModalOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleImportPastedQuestions}>Parse & Import Questions</button>
              </div>
            </div>
          </div>
        )}

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

      <BulkEvaluationModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onRefreshDashboard={fetchSubmissions}
      />

      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

