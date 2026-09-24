import { useState, useEffect } from 'react';
import { 
  Upload, 
  CheckCircle2, 
  Clock, 
  Send
} from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import LanguageSelect from '../components/LanguageSelect';

export default function StudentPortal() {
  const [files, setFiles] = useState<File[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [studentName, setStudentName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [assignments, setAssignments] = useState<any[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('');

  useEffect(() => {
    fetchAssignments();
  }, []);

  const selectAssignment = (assignment: any) => {
    if (!assignment) return;
    setSelectedAssignmentId(assignment.id);

    setSelectedLanguage(assignment.language || 'English');
  };

  const fetchAssignments = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/assignments`);
      const data = await res.json();
      if (data.success && Array.isArray(data.assignments)) {
        setAssignments(data.assignments);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const activeAssignment = assignments.find(a => a.id === selectedAssignmentId) || null;

  const handleUpload = async () => {
    if (files.length === 0) {
      alert('Please upload photo(s) of your handwritten answer sheet.');
      return;
    }
    if (!selectedAssignmentId || !activeAssignment) {
      alert('Select the assignment that matches your answer sheet before submitting.');
      return;
    }

    setIsUploading(true);
    setUploadError('');
    const targetAssignmentId = selectedAssignmentId;
    const formData = new FormData();
    
    files.forEach((file) => {
      formData.append('submission', file);
    });

    formData.append('assignmentId', targetAssignmentId);
    formData.append('studentName', studentName);
    formData.append('selectedLanguage', selectedLanguage);
    formData.append('subject', activeAssignment?.subject || activeAssignment?.className || 'Class Test');
    formData.append('className', activeAssignment?.className || activeAssignment?.subject || '');

    try {
      const res = await fetch(`${API_BASE_URL}/api/submissions`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setUploadSuccess(true);
        setFiles([]);
      } else {
        throw new Error(data.message || 'Submission processing failed.');
      }
    } catch (err) {
      console.error(err);
      setUploadSuccess(false);
      setUploadError(err instanceof Error ? err.message : 'Unable to submit the assignment.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      
      {/* Sticky Top Header */}
      <header className="page-top-bar no-print">
        <div className="page-top-bar-text">
          <h1>Student assignment desk</h1>
          <p>Submit your handwritten homework or test papers for AI marking and instant teacher review</p>
        </div>
        <div className="page-top-bar-actions">
          <span className="badge badge-blue">● 24/7 Submission Gate</span>
        </div>
      </header>

      <div className="page-container">
        {uploadError && (
          <div className="badge badge-red" style={{ display: 'block', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
            {uploadError}
          </div>
        )}
        
        {uploadSuccess ? (
          <div className="m-card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem', maxWidth: '600px', margin: '2rem auto' }}>
            <div style={{ width: '4rem', height: '4rem', borderRadius: '50%', background: '#ECFDF5', color: '#059669', display: 'grid', placeItems: 'center', margin: '0 auto 1rem auto' }}>
              <CheckCircle2 className="size-8" />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#111827', margin: 0 }}>
              Assignment Submitted Successfully!
            </h2>
            <p style={{ color: '#64748B', marginTop: '0.5rem', fontSize: '0.9375rem' }}>
              Your handwritten pages have been received by the <strong>PAATAM.AI Optical AI Pipeline</strong>. Your teacher will verify the evaluated marks and a WhatsApp notification will be sent.
            </p>
            <button 
              className="btn btn-primary"
              style={{ marginTop: '1.5rem' }}
              onClick={() => setUploadSuccess(false)}
            >
              Submit Another Assignment
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
            
            {/* Left Upload Form */}
            <div className="m-card">
              <div className="m-card-header">
                <h3 className="m-card-title">Upload handwritten paper</h3>
              </div>

              {/* Assignment Selector */}
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Select Assigned Test / Homework</label>
                {assignments.length === 0 ? (
                  <div style={{ padding: '0.75rem', background: '#F8FAFC', borderRadius: '0.5rem', border: '1px solid #E2E8F0', fontSize: '0.85rem', color: '#64748B' }}>
                    No assigned tests are available. Ask your teacher to dispatch an assignment first.
                  </div>
                ) : (
                  <select 
                    className="form-select"
                    value={selectedAssignmentId}
                    onChange={(e) => {
                      const found = assignments.find(a => a.id === e.target.value);
                      selectAssignment(found);
                    }}
                  >
                    <option value="" disabled>Select the matching assignment</option>
                    {assignments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} · {a.subject || a.className || 'General'}
                      </option>
                    ))}
                  </select>
                )}
                {activeAssignment && (
                  <div style={{ marginTop: '0.65rem', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1E3A8A', fontSize: '0.8125rem' }}>
                    <strong>Submitting to:</strong> {activeAssignment.title} · {activeAssignment.subject || activeAssignment.className}
                    <span style={{ display: 'block', marginTop: '0.2rem' }}>{activeAssignment.questions?.length || 0} questions · {activeAssignment.questions?.reduce((sum: number, question: any) => sum + (Number(question.marks) || 0), 0) || 0} marks · {selectedLanguage}</span>
                  </div>
                )}
              </div>

              {/* Dropzone */}
              <div 
                className="scan-dropzone"
                onClick={() => document.getElementById('student-file-input')?.click()}
              >
                <input 
                  type="file" 
                  id="student-file-input" 
                  multiple 
                  accept="image/*,application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files) setFiles(Array.from(e.target.files));
                  }}
                />
                <div style={{ width: '3rem', height: '3rem', borderRadius: '50%', background: '#EFF6FF', display: 'grid', placeItems: 'center', color: '#2563EB' }}>
                  <Upload className="size-6" />
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: '1rem', color: '#111827', margin: 0 }}>
                    Click or drag your handwritten answer sheet photos here
                  </p>
                  <p style={{ fontSize: '0.8125rem', color: '#64748B', margin: '0.25rem 0 0 0' }}>
                    JPG, PNG, or PDF · Long PDFs are processed in ordered 10-page batches
                  </p>
                </div>
              </div>

              {files.length > 0 && (
                <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: '#EFF6FF', borderRadius: '0.5rem', border: '1px solid #BFDBFE', fontSize: '0.8125rem', color: '#1E40AF' }}>
                  📎 {files.length} paper page(s) selected: {files.map(f => f.name).join(', ')}
                </div>
              )}

              {/* Student Details Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.25rem' }}>
                <div className="form-group">
                  <label className="form-label">Your Full Name</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Emma Watson"
                    value={studentName}
                    onChange={e => setStudentName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Script Language</label>
                  <LanguageSelect value={selectedLanguage} onChange={setSelectedLanguage} />
                </div>
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <button 
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '0.75rem' }}
                  onClick={handleUpload}
                  disabled={isUploading || !selectedAssignmentId}
                >
                  {isUploading ? (
                    <>
                      <Clock className="size-4 animate-spin" />
                      <span>Transcribing & Uploading Script...</span>
                    </>
                  ) : (
                    <>
                      <Send className="size-4" />
                      <span>Submit Assignment</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right Instructions Box */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="m-card" style={{ background: 'linear-gradient(135deg, #0B132B 0%, #1C2541 100%)', color: 'white' }}>
                <h4 style={{ color: 'white', fontSize: '1.05rem', marginBottom: '0.5rem' }}>
                  📸 Scanning Tips for Best Marks
                </h4>
                <ul style={{ paddingLeft: '1.2rem', fontSize: '0.8125rem', color: '#94A3B8', lineHeight: '1.6' }}>
                  <li>Ensure good lighting and avoid shadows on paper</li>
                  <li>Number each question clearly (e.g. Q1, Q2)</li>
                  <li>Write mathematical formulas and diagrams clearly</li>
                  <li>If writing in regional language, ensure clear lettering</li>
                </ul>
              </div>

              {activeAssignment?.questions && (
                <div className="m-card">
                  <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                    Assigned Questions Preview:
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '320px', overflowY: 'auto' }}>
                    {activeAssignment.questions.map((q: any, i: number) => {
                      const previous = activeAssignment.questions[i - 1];
                      const showStem = q?.stem && q.stem !== previous?.stem;
                      const images = Array.isArray(q?.stimulus) ? q.stimulus.filter((item: any) => item?.url) : [];
                      return (
                        <div key={i} style={{ fontSize: '0.8125rem', padding: '0.5rem', background: '#F8FAFC', borderRadius: '0.375rem', border: '1px solid #E2E8F0' }}>
                          {showStem && (
                            <p style={{ margin: '0 0 0.4rem', fontSize: '0.75rem', color: '#475569', whiteSpace: 'pre-wrap', paddingLeft: '0.5rem', borderLeft: '3px solid #CBD5E1' }}>
                              {q.stem}
                            </p>
                          )}
                          {images.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                              {images.map((item: any, imageIndex: number) => (
                                <a key={item.url} href={item.url} target="_blank" rel="noreferrer">
                                  <img src={item.url} alt={item.caption || `Question reference ${imageIndex + 1}`} style={{ width: '120px', borderRadius: '0.375rem', border: '1px solid #CBD5E1' }} />
                                </a>
                              ))}
                            </div>
                          )}
                          <strong>{typeof q === 'string' ? `Q${i + 1}` : `Q${q.questionNo || i + 1}`}:</strong> {typeof q === 'string' ? q : q.text}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}


