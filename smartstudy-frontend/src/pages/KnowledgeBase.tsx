import { useEffect, useState } from 'react';
import { 
  BookOpen, 
  Upload, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  Sparkles,
  Layers
} from 'lucide-react';
import { API_BASE_URL } from '../config/api';

interface SubjectRecord {
  id: string;
  name: string;
  grade: string;
  board: string;
  className: string;
  lessonsCount: number;
  chunks: string;
  status: string;
}

export interface CurriculumChapter {
  id?: string;
  class_name: string;
  subject_name: string;
  chapter_number: number;
  chapter_title: string;
  subtopics: string[];
  chunk_count?: number;
  created_at?: string;
}

export default function KnowledgeBase() {
  const [activeSubject, setActiveSubject] = useState('All subjects');
  const [subjectsList, setSubjectsList] = useState<SubjectRecord[]>([]);

  // Chapter Ingestion State
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [chapterNumberInput, setChapterNumberInput] = useState<number>(1);
  const [chapterTitleInput, setChapterTitleInput] = useState<string>('');
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);

  // Chapter Library State
  const [chapters, setChapters] = useState<CurriculumChapter[]>([]);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);

  // Add Subject Modal
  const [isAddSubjectOpen, setIsAddSubjectOpen] = useState(false);
  const [newSubjectTitle, setNewSubjectTitle] = useState('');
  const [newSubjectGrade, setNewSubjectGrade] = useState('');
  const [newSubjectBoard, setNewSubjectBoard] = useState('');

  // 1. Fetch Subjects on Mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/subjects`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.success || !Array.isArray(data.subjects)) return;
        const subjects: SubjectRecord[] = data.subjects.map((subject: any) => ({
          id: subject.id,
          name: subject.name,
          grade: subject.grade || '',
          board: subject.board || '',
          className: subject.className || subject.class_name || subject.name,
          lessonsCount: 0,
          chunks: 'Indexed',
          status: subject.grade ? 'Configured' : 'Missing grade'
        }));
        setSubjectsList(subjects);
        if (subjects.length > 0) {
          setActiveSubject((curr) => (curr === 'All subjects' ? subjects[0].name : curr));
        }
      })
      .catch(() => setSubjectsList([]));
  }, []);

  const activeSubjectObj = subjectsList.find((s) => s.name === activeSubject);
  const activeClassName = activeSubjectObj?.className || activeSubjectObj?.name || (activeSubject !== 'All subjects' ? activeSubject : '');

  // 2. Fetch Chapters when active subject changes
  const fetchChaptersForSubject = async (clsName: string, subjName: string) => {
    if (!clsName || subjName === 'All subjects') {
      setChapters([]);
      return;
    }
    setIsLoadingChapters(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/rag/chapters?className=${encodeURIComponent(clsName)}&subjectName=${encodeURIComponent(subjName)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.chapters)) {
        setChapters(data.chapters);
        // Set default next chapter number
        setChapterNumberInput(data.chapters.length + 1);
      } else {
        setChapters([]);
        setChapterNumberInput(1);
      }
    } catch (err) {
      console.warn('Could not fetch chapters:', err);
      setChapters([]);
    } finally {
      setIsLoadingChapters(false);
    }
  };

  useEffect(() => {
    if (activeClassName && activeSubject !== 'All subjects') {
      fetchChaptersForSubject(activeClassName, activeSubject);
    } else {
      setChapters([]);
    }
  }, [activeClassName, activeSubject]);

  // 3. Handle Add New Subject
  const handleAddSubject = async () => {
    const name = newSubjectTitle.trim();
    if (!name) return;
    if (!newSubjectGrade.trim()) {
      alert('Please enter the grade/class for this subject.');
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/subjects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, grade: newSubjectGrade.trim(), board: newSubjectBoard.trim() })
      });
      const data = await response.json();
      if (!data.success) {
        alert(data.message || 'Unable to save subject.');
        return;
      }
      const newSubj: SubjectRecord = {
        id: data.subject.id,
        name: data.subject.name,
        grade: data.subject.grade || newSubjectGrade.trim(),
        board: data.subject.board || newSubjectBoard.trim(),
        className: data.subject.className || data.subject.class_name || `${newSubjectGrade.trim()} ${data.subject.name}`,
        lessonsCount: 0,
        chunks: 'Indexed',
        status: 'Configured'
      };
      setSubjectsList((current) => [...current.filter((item) => item.name !== data.subject.name), newSubj].sort((a, b) => a.name.localeCompare(b.name)));
      setActiveSubject(data.subject.name);
      setNewSubjectTitle('');
      setNewSubjectGrade('');
      setNewSubjectBoard('');
      setIsAddSubjectOpen(false);
    } catch (err) {
      alert('Error creating subject.');
    }
  };

  // 4. Handle Chapter Ingestion (Sequential, Cumulative)
  const handleIngestChapter = async () => {
    if (uploadedFiles.length === 0) {
      alert('⚠️ Please select a Chapter PDF document to upload.');
      return;
    }
    if (!activeSubjectObj) {
      alert('Please choose a specific subject before uploading.');
      return;
    }

    setIsIngesting(true);
    setIngestStatus('Extracting text and identifying subtopics with AI...');

    try {
      const formData = new FormData();
      formData.append('className', activeClassName);
      formData.append('subjectName', activeSubject);
      if (chapterTitleInput.trim()) {
        formData.append('chapterTitle', chapterTitleInput.trim());
      }
      formData.append('chapterNumber', String(chapterNumberInput || 1));
      uploadedFiles.forEach((file) => formData.append('documents', file));

      const res = await fetch(`${API_BASE_URL}/api/rag/chapter/ingest`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.success) {
        setIngestStatus(`✅ ${data.message || 'Chapter indexed successfully!'}`);
        alert(`✅ ${data.message || 'Chapter ingested successfully!'}`);
        setUploadedFiles([]);
        setChapterTitleInput('');

        // Refresh chapter list
        await fetchChaptersForSubject(activeClassName, activeSubject);
      } else {
        alert(`⚠️ Ingestion note: ${data.message}`);
        setIngestStatus(`Error: ${data.message}`);
      }
    } catch (err: any) {
      console.error(err);
      alert('Failed to connect to chapter ingestion service.');
      setIngestStatus('Connection error during chapter ingestion.');
    } finally {
      setIsIngesting(false);
    }
  };

  // 5. Handle Delete Chapter
  const handleDeleteChapter = async (chapter: CurriculumChapter) => {
    const title = chapter.chapter_title;
    if (!window.confirm(`Are you sure you want to delete Chapter ${chapter.chapter_number}: "${title}"? This will only remove this chapter's vector chunks without affecting other chapters.`)) {
      return;
    }

    try {
      const idOrTitle = chapter.id || title;
      const res = await fetch(`${API_BASE_URL}/api/rag/chapters/${encodeURIComponent(idOrTitle)}?className=${encodeURIComponent(activeClassName)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setChapters((prev) => prev.filter((c) => c.chapter_title !== title && c.id !== chapter.id));
        alert(`🗑️ Chapter ${chapter.chapter_number} deleted successfully.`);
      } else {
        alert(`Could not delete chapter: ${data.message}`);
      }
    } catch (err) {
      console.error('Delete chapter error:', err);
      alert('Error connecting to delete endpoint.');
    }
  };

  const totalChunks = chapters.reduce((acc, c) => acc + (c.chunk_count || 0), 0);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      
      {/* Top Banner Header */}
      <header className="page-top-bar no-print">
        <div className="page-top-bar-text">
          <h1>Knowledge Base & Chapter Library</h1>
          <p>Upload chapter-by-chapter PDFs. AI automatically extracts core subtopics and vectorizes content cumulatively for exam generation.</p>
        </div>
      </header>

      <div className="page-container">
        
        {/* Subject Filter & Quick Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.875rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <label htmlFor="kb-subject-filter" style={{ fontSize: '0.875rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>Target Subject:</span>
            </label>
            <select
              id="kb-subject-filter"
              value={activeSubject}
              onChange={(e) => setActiveSubject(e.target.value)}
              style={{
                padding: '0.45rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                borderRadius: '0.5rem',
                border: '1.5px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#0F172A',
                cursor: 'pointer',
                minWidth: '240px',
                outline: 'none',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
              }}
            >
              <option value="All subjects">-- Select a Subject --</option>
              {subjectsList.map((subj) => (
                <option key={subj.id} value={subj.name}>
                  {subj.name} {subj.grade ? `(${subj.grade})` : ''}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              onClick={() => setIsAddSubjectOpen(true)}
            >
              <Plus className="size-4" />
              <span>Add Subject</span>
            </button>
          </div>

          {activeSubject !== 'All subjects' && activeSubjectObj && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#64748B' }}>
              <span>Class: <strong style={{ color: '#0F172A' }}>{activeClassName}</strong></span>
              <span>•</span>
              <span>{chapters.length} Chapter(s) Indexed</span>
              <span>•</span>
              <span className="badge badge-success">{totalChunks} Vector Chunks</span>
            </div>
          )}
        </div>

        {activeSubject === 'All subjects' ? (
          <div className="m-card" style={{ padding: '3rem 2rem', textAlign: 'center', color: '#64748B' }}>
            <BookOpen className="size-12 mx-auto mb-3 text-blue-500 opacity-60" />
            <h3 style={{ fontSize: '1.15rem', color: '#1E293B', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Select a Subject to Begin</h3>
            <p style={{ maxWidth: '480px', margin: '0 auto', fontSize: '0.875rem' }}>
              Choose a subject from the dropdown above to view its chapters, extract subtopics from chapter PDFs, and prepare materials for question papers.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* CARD 1: CHAPTER-WISE PDF UPLOADER */}
            <div className="m-card">
              <div className="m-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 className="m-card-title" style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Upload className="size-4 text-blue-600" />
                  <span>Upload Chapter PDF for {activeSubject} ({activeClassName})</span>
                </h3>
                <span style={{ fontSize: '0.75rem', background: '#EFF6FF', color: '#1D4ED8', padding: '0.2rem 0.6rem', borderRadius: '1rem', fontWeight: 600 }}>
                  Cumulative Mode: Adds to library without deleting other chapters
                </span>
              </div>

              {/* Dropzone */}
              <div 
                className="scan-dropzone"
                onClick={() => document.getElementById('chapter-upload-input')?.click()}
                style={{ border: '2px dashed #93C5FD', background: '#F8FAFC', cursor: 'pointer', padding: '1.5rem', textAlign: 'center' }}
              >
                <input 
                  type="file" 
                  id="chapter-upload-input" 
                  accept=".pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      const file = e.target.files[0];
                      setUploadedFiles([file]);
                      // Clean default title from filename
                      if (!chapterTitleInput) {
                        const cleanName = file.name.replace(/\.pdf$/i, '').replace(/^[0-9\s_-]+/, '').replace(/[_-]/g, ' ');
                        setChapterTitleInput(cleanName);
                      }
                    }
                  }}
                />
                <div style={{ width: '3rem', height: '3rem', borderRadius: '50%', background: '#EFF6FF', display: 'grid', placeItems: 'center', color: '#2563EB', margin: '0 auto 0.75rem auto' }}>
                  <Upload className="size-6" />
                </div>
                <p style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111827', margin: 0 }}>
                  {uploadedFiles.length > 0 ? uploadedFiles[0].name : 'Drop Chapter PDF here or Click to Browse'}
                </p>
                <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '0.25rem 0 0 0' }}>
                  Upload each chapter PDF (e.g. Chapter 1, Chapter 2). AI extracts the subtopics and indexes the text into Supabase.
                </p>
              </div>

              {/* Chapter Metadata Form (Enabled once file chosen or manual) */}
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: '0.75rem', marginTop: '1rem', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Chapter No.</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    className="form-input"
                    value={chapterNumberInput}
                    onChange={(e) => setChapterNumberInput(Math.max(1, Number(e.target.value)))}
                    style={{ fontSize: '0.85rem', fontWeight: 700, textAlign: 'center' }}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    Chapter Title <span style={{ color: '#64748B', fontWeight: 400 }}>(or leave blank to auto-detect with AI)</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Chemical Reactions and Equations"
                    value={chapterTitleInput}
                    onChange={(e) => setChapterTitleInput(e.target.value)}
                    style={{ fontSize: '0.85rem' }}
                  />
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleIngestChapter}
                  disabled={isIngesting || uploadedFiles.length === 0}
                  style={{ height: '38px', padding: '0 1.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}
                >
                  {isIngesting ? (
                    <>
                      <Clock className="size-4 animate-spin" />
                      <span>Ingesting Chapter...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" />
                      <span>Ingest Chapter</span>
                    </>
                  )}
                </button>
              </div>

              {/* Status Note */}
              {ingestStatus && (
                <div style={{ marginTop: '0.75rem', padding: '0.65rem 0.85rem', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '0.375rem', fontSize: '0.8rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle2 className="size-4 text-green-600 flex-shrink-0" />
                  <span>{ingestStatus}</span>
                </div>
              )}
            </div>

            {/* CARD 2: CHAPTER LIBRARY & SUBTOPICS REPOSITORY */}
            <div className="m-card">
              <div className="m-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 className="m-card-title" style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Layers className="size-4 text-blue-600" />
                  <span>Chapter Library for {activeSubject} ({chapters.length} Chapters)</span>
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                  Chapters and subtopics are loaded directly in the <strong>Exam Generator</strong>
                </span>
              </div>

              {isLoadingChapters ? (
                <div style={{ padding: '2.5rem', textAlign: 'center', color: '#64748B' }}>
                  <Clock className="size-6 animate-spin mx-auto mb-2 text-blue-600" />
                  <p style={{ margin: 0, fontSize: '0.875rem' }}>Loading chapters from knowledge base...</p>
                </div>
              ) : chapters.length === 0 ? (
                <div style={{ padding: '2.5rem', textAlign: 'center', background: '#F8FAFC', borderRadius: '0.5rem', border: '1px dashed #CBD5E1' }}>
                  <BookOpen className="size-8 mx-auto mb-2 text-slate-400" />
                  <p style={{ margin: '0 0 0.25rem 0', fontWeight: 700, color: '#334155' }}>No chapters uploaded yet for this subject.</p>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B' }}>
                    Upload your Chapter 1 PDF using the uploader above. You can upload as many chapters as you need!
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {chapters.map((ch, idx) => (
                    <div 
                      key={ch.id || idx}
                      style={{
                        padding: '1rem',
                        background: '#FFFFFF',
                        border: '1.5px solid #E2E8F0',
                        borderRadius: '0.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.6rem',
                        transition: 'all 0.15s ease',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <span style={{ 
                            background: '#EFF6FF', 
                            color: '#1D4ED8', 
                            fontSize: '0.75rem', 
                            fontWeight: 800, 
                            padding: '0.25rem 0.6rem', 
                            borderRadius: '0.375rem', 
                            border: '1px solid #BFDBFE' 
                          }}>
                            Chapter {ch.chapter_number}
                          </span>
                          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0F172A' }}>
                            {ch.chapter_title}
                          </h4>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          {ch.chunk_count !== undefined && (
                            <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>
                              {ch.chunk_count} vector chunks
                            </span>
                          )}
                          <button
                            type="button"
                            className="btn btn-outline btn-sm text-red-600 hover:bg-red-50"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderColor: '#FECACA' }}
                            onClick={() => handleDeleteChapter(ch)}
                            title="Delete this chapter"
                          >
                            <Trash2 className="size-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>

                      {/* Subtopics pill chips */}
                      {Array.isArray(ch.subtopics) && ch.subtopics.length > 0 && (
                        <div>
                          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Extracted Subtopics & Concepts:
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                            {ch.subtopics.map((st, sIdx) => (
                              <span 
                                key={sIdx}
                                style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 500,
                                  background: '#F1F5F9',
                                  color: '#334155',
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: '0.25rem',
                                  border: '1px solid #E2E8F0'
                                }}
                              >
                                {st}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

      </div>

      {/* Add Subject Modal */}
      {isAddSubjectOpen && (
        <div className="modal-backdrop" onClick={() => setIsAddSubjectOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Add New Subject</h3>
              <button type="button" className="btn-close" onClick={() => setIsAddSubjectOpen(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="form-group">
                <label className="form-label">Subject Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Physics, Chemistry, Mathematics"
                  value={newSubjectTitle}
                  onChange={(e) => setNewSubjectTitle(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Grade / Class</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Class 10, Grade 11"
                  value={newSubjectGrade}
                  onChange={(e) => setNewSubjectGrade(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Curriculum / Board (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. CBSE, ICSE, State Board"
                  value={newSubjectBoard}
                  onChange={(e) => setNewSubjectBoard(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setIsAddSubjectOpen(false)}>Cancel</button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleAddSubject}
                disabled={!newSubjectTitle.trim() || !newSubjectGrade.trim()}
              >
                Save Subject
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
