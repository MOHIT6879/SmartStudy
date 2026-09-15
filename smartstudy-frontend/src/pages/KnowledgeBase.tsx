import { useEffect, useState } from 'react';
import { 
  BookOpen, 
  Upload, 
  Plus, 
  FileText, 
  FolderPlus
} from 'lucide-react';
import { API_BASE_URL } from '../config/api';

interface SubjectRecord {
  id: string;
  name: string;
  grade: string;
  lessonsCount: number;
  chunks: string;
  status: string;
  topics: string[];
}

export default function KnowledgeBase() {
  const [activeSubject, setActiveSubject] = useState('All subjects');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);

  // Modals
  const [isAddSubjectOpen, setIsAddSubjectOpen] = useState(false);
  const [isAddLessonOpen, setIsAddLessonOpen] = useState(false);
  const [newSubjectTitle, setNewSubjectTitle] = useState('');
  const [newLessonTitle, setNewLessonTitle] = useState('');

  const [subjectsList, setSubjectsList] = useState<SubjectRecord[]>([]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/subjects`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.success || !Array.isArray(data.subjects)) return;
        const subjects: SubjectRecord[] = data.subjects.map((subject: any) => ({
          id: subject.id,
          name: subject.name,
          grade: subject.name,
          lessonsCount: 0,
          chunks: 'Indexed chunk count unavailable',
          status: 'Configured',
          topics: []
        }));
        setSubjectsList(subjects);
      })
      .catch(() => setSubjectsList([]));
  }, []);

  const handleAddSubject = async () => {
    const name = newSubjectTitle.trim();
    if (!name) return;
    const response = await fetch(`${API_BASE_URL}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await response.json();
    if (!data.success) {
      alert(data.message || 'Unable to save subject.');
      return;
    }
    setSubjectsList((current) => [...current.filter((item) => item.name !== data.subject.name), {
      id: data.subject.id,
      name: data.subject.name,
      grade: data.subject.name,
      lessonsCount: 0,
      chunks: 'Indexed chunk count unavailable',
      status: 'Configured',
      topics: []
    }].sort((a, b) => a.name.localeCompare(b.name)));
    setActiveSubject(data.subject.name);
    setNewSubjectTitle('');
    setIsAddSubjectOpen(false);
  };

  const handleIngest = async () => {
    if (uploadedFiles.length === 0) {
      alert('⚠️ Please select at least 1 document or PDF textbook to ingest.');
      return;
    }

    setIsIngesting(true);
    setIngestStatus(null);
    try {
      const formData = new FormData();
      formData.append('className', activeSubject === 'All subjects' ? 'Grade 11 Physics' : activeSubject);
      formData.append('topic', newLessonTitle || 'NCERT Textbook Material');
      uploadedFiles.forEach(f => formData.append('documents', f));

      const res = await fetch(`${API_BASE_URL}/api/rag/ingest`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setIngestStatus(data.message || 'Successfully vectorized and ingested into RAG knowledge base!');
        alert(`✅ Knowledge Base Ingested Successfully!\n${data.message}`);
        setUploadedFiles([]);
        setIsAddLessonOpen(false);
      } else {
        alert(`⚠️ Ingestion notice: ${data.message}`);
      }
    } catch (err: any) {
      console.error(err);
      alert('Error connecting to RAG ingestion endpoint.');
    } finally {
      setIsIngesting(false);
    }
  };

  const filteredSubjects = activeSubject === 'All subjects' 
    ? subjectsList 
    : subjectsList.filter(s => s.name.toLowerCase() === activeSubject.toLowerCase());

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      
      {/* Sticky Top Header Banner */}
      <header className="page-top-bar no-print">
        <div className="page-top-bar-text">
          <h1>Knowledge base</h1>
          <p>The lesson material the grading agent marks against</p>
        </div>
        <div className="page-top-bar-actions">
          <button className="btn btn-secondary" onClick={() => setIsAddSubjectOpen(true)}>
            <FolderPlus className="size-4" />
            <span>Subject</span>
          </button>
          <button className="btn btn-primary" onClick={() => setIsAddLessonOpen(true)}>
            <Plus className="size-4" />
            <span>Lesson</span>
          </button>
        </div>
      </header>

      <div className="page-container">
        
        {/* Subject Filter Pills */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
          {['All subjects', 'Physics', 'Psychology', 'General Science'].map((s) => (
            <button
              key={s}
              onClick={() => setActiveSubject(s)}
              style={{
                padding: '0.4rem 0.85rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                borderRadius: '0.5rem',
                border: 'none',
                background: activeSubject === s ? '#1E293B' : '#F1F5F9',
                color: activeSubject === s ? 'white' : '#475569',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Dropzone for RAG Vector Indexing */}
        <div className="m-card">
          <div className="m-card-header">
            <h3 className="m-card-title" style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BookOpen className="size-4 text-blue-600" />
              <span>Ingest Lesson Materials into RAG Vector Store</span>
            </h3>
          </div>

          <div 
            className="scan-dropzone"
            onClick={() => document.getElementById('kb-upload-input')?.click()}
          >
            <input 
              type="file" 
              id="kb-upload-input" 
              multiple 
              accept=".pdf,.txt,.zip,.doc,.docx"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files) setUploadedFiles(Array.from(e.target.files));
              }}
            />
            <div style={{ width: '3rem', height: '3rem', borderRadius: '50%', background: '#EFF6FF', display: 'grid', placeItems: 'center', color: '#2563EB' }}>
              <Upload className="size-6" />
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: '1rem', color: '#111827', margin: 0 }}>
                Upload Textbook PDFs, Syllabi, or Chapter Notes
              </p>
              <p style={{ fontSize: '0.8125rem', color: '#64748B', margin: '0.25rem 0 0 0' }}>
                Files will be parsed, chunked, and vectorized for zero-hallucination marking.
              </p>
            </div>
          </div>

          {uploadedFiles.length > 0 && (
            <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#F0FDF4', borderRadius: '0.5rem', border: '1px solid #BBF7D0' }}>
              <p style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#166534', margin: 0 }}>
                📎 {uploadedFiles.length} document(s) ready for vectorization:
              </p>
              <ul style={{ margin: '0.25rem 0 0 1.25rem', fontSize: '0.75rem', color: '#14532D' }}>
                {uploadedFiles.map((f, i) => <li key={i}>{f.name} ({(f.size / 1024).toFixed(0)} KB)</li>)}
              </ul>
              <button 
                className="btn btn-primary btn-sm"
                style={{ marginTop: '0.5rem' }}
                onClick={handleIngest}
                disabled={isIngesting}
              >
                {isIngesting ? 'Vectorizing and Indexing...' : 'Start RAG Ingestion'}
              </button>
            </div>
          )}

          {ingestStatus && (
            <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: '#ECFDF5', color: '#065F46', borderRadius: '0.375rem', fontSize: '0.8125rem', fontWeight: 600 }}>
              ✓ {ingestStatus}
            </div>
          )}
        </div>

        {/* Curricula Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1.25rem' }}>
          {filteredSubjects.map((subj) => (
            <div key={subj.id} className="m-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span className="badge badge-blue">{subj.grade}</span>
                  <span className="badge badge-green">● {subj.status}</span>
                </div>
                <h4 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', margin: '0.25rem 0' }}>
                  {subj.name}
                </h4>
                <p style={{ fontSize: '0.8125rem', color: '#64748B', margin: '0 0 0.75rem 0' }}>
                  {subj.chunks} · {subj.lessonsCount} lessons
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', borderTop: '1px solid #F1F5F9', paddingTop: '0.75rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748B' }}>
                    Active Chapters:
                  </span>
                  {subj.topics.map((t, idx) => (
                    <div key={idx} style={{ fontSize: '0.8125rem', color: '#334155', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ color: '#2563EB', fontWeight: 700 }}>•</span>
                      <span>{t}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>
                  ✓ Ground truth enabled
                </span>
                <button 
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setNewLessonTitle(`${subj.name} Chapter`);
                    setIsAddLessonOpen(true);
                  }}
                >
                  + Add Lesson
                </button>
              </div>
            </div>
          ))}
        </div>

      </div>

      {/* Add Subject Modal */}
      {isAddSubjectOpen && (
        <div className="modal-overlay" onClick={() => setIsAddSubjectOpen(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>Add New Curriculum Subject</h3>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Subject Name</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="e.g. Chemistry"
                value={newSubjectTitle}
                onChange={e => setNewSubjectTitle(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={() => setIsAddSubjectOpen(false)}>Cancel</button>
              <button 
                className="btn btn-primary"
                onClick={handleAddSubject}
              >
                Save Subject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Lesson Modal */}
      {isAddLessonOpen && (
        <div className="modal-overlay" onClick={() => setIsAddLessonOpen(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>Upload Lesson Material</h3>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Lesson / Chapter Title</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="e.g. Chapter 4 - Atomic Physics & Spectra"
                value={newLessonTitle}
                onChange={e => setNewLessonTitle(e.target.value)}
              />
            </div>

            <div 
              className="scan-dropzone"
              onClick={() => document.getElementById('lesson-modal-file')?.click()}
            >
              <input 
                type="file" 
                id="lesson-modal-file" 
                accept=".pdf,.txt,.doc,.docx"
                style={{ display: 'none' }}
                onChange={e => {
                  if (e.target.files) setUploadedFiles(Array.from(e.target.files));
                }}
              />
              <FileText className="size-6 text-blue-600" />
              <p style={{ fontWeight: 600, margin: 0 }}>Select Lesson PDF / Document</p>
            </div>

            {uploadedFiles.length > 0 && (
              <p style={{ fontSize: '0.8125rem', color: '#166534', marginTop: '0.5rem', fontWeight: 600 }}>
                Selected: {uploadedFiles[0].name}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button className="btn btn-secondary" onClick={() => setIsAddLessonOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleIngest} disabled={isIngesting}>
                {isIngesting ? 'Ingesting...' : 'Upload Lesson'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
