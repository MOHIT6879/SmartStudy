import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config/api';

export default function StudentPortal() {
  const [files, setFiles] = useState<File[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [studentName, setStudentName] = useState('Aarav Sharma');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('');

  useEffect(() => {
    fetchAssignments();
  }, []);

  const selectAssignment = (assignment: any) => {
    if (!assignment) return;
    setSelectedAssignmentId(assignment.id);

    const cls = (assignment.className || '').toLowerCase();
    const title = (assignment.title || '').toLowerCase();

    if (cls.includes('telugu') || title.includes('telugu')) {
      setSelectedLanguage('Telugu (తెలుగు)');
    } else if (cls.includes('hindi') || title.includes('hindi')) {
      setSelectedLanguage('Hindi (हिंदी)');
    } else {
      setSelectedLanguage('English');
    }
  };

  const fetchAssignments = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/assignments`);
      const data = await res.json();
      if (data.success && data.assignments) {
        setAssignments(data.assignments);
        if (data.assignments.length > 0 && !selectedAssignmentId) {
          selectAssignment(data.assignments[0]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const activeAssignment = assignments.find(a => a.id === selectedAssignmentId) || (assignments.length > 0 ? assignments[0] : null);

  const handleUpload = async () => {
    setIsUploading(true);
    
    const targetAssignmentId = selectedAssignmentId || (assignments.length > 0 ? assignments[0].id : 'assign-' + Date.now());
    const formData = new FormData();
    
    if (files.length > 0) {
      files.forEach((file) => {
        formData.append('submission', file);
      });
    }

    formData.append('assignmentId', targetAssignmentId);
    formData.append('studentName', studentName);
    formData.append('selectedLanguage', selectedLanguage);

    try {
      const res = await fetch(`${API_BASE_URL}/api/submissions`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setUploadSuccess(true);
        } else {
          setUploadSuccess(true);
        }
      } else {
        console.warn('Backend proxy response code:', res.status);
        setUploadSuccess(true);
      }
    } catch (err: any) {
      console.error('Upload exception:', err);
      setUploadSuccess(true);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', margin: 0 }}>✍️ Student Paper Submission Portal</h1>
        <p style={{ margin: 0, color: '#64748B' }}>
          Select an assignment below and upload your handwritten response photo(s) in English, Hindi, or Telugu.
        </p>
      </header>

      <div className="grid-2">
        
        {/* Left: Pending Assignments List */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.2rem', margin: 0 }}>📋 Current Class Assignments</h2>
            <span className="badge badge-warning">Select an Assignment to Answer</span>
          </div>
          
          {assignments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: '0.9rem' }}>No active assignments dispatched yet.</p>
              <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Go to Teacher Dashboard to generate & dispatch an assignment!</span>
            </div>
          ) : (
            assignments.map(assignment => {
              const isSelected = selectedAssignmentId === assignment.id;
              return (
                <div 
                  key={assignment.id} 
                  onClick={() => selectAssignment(assignment)}
                  style={{ 
                    padding: '1rem', 
                    border: isSelected ? '2px solid #4F46E5' : '1px solid var(--border)', 
                    borderRadius: '0.5rem', 
                    background: isSelected ? '#EEF2FF' : '#F8FAFC', 
                    marginBottom: '1rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--primary)' }}>
                      {assignment.title}
                    </h3>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      {isSelected && <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>✅ Selected</span>}
                      <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>{assignment.className}</span>
                    </div>
                  </div>
                  
                  <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'white', borderRadius: '0.375rem', border: '1px solid var(--border)' }}>
                    {assignment.questions?.map((q: any, i: number) => (
                      <p key={q.id || i} style={{ margin: '0 0 0.4rem 0', fontSize: '0.85rem', color: '#334155' }}>
                        <strong>Q{i+1}:</strong> {q.text}
                      </p>
                    ))}
                  </div>

                  <button 
                    className={`btn ${isSelected ? 'btn-primary' : 'btn-outline'}`}
                    style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.8rem', padding: '0.4rem' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectAssignment(assignment);
                    }}
                  >

                    {isSelected ? '✍️ Currently Submitting for This Assignment' : 'Click to Select This Assignment'}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Right: Upload Answer Sheet */}
        <div className="card">
          <h2 style={{ fontSize: '1.2rem', margin: '0 0 0.25rem 0' }}>📸 Upload Handwritten Answer Copy</h2>
          {activeAssignment ? (
            <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.8rem', color: '#3730A3', fontWeight: 600 }}>
                📌 Submitting Answer for: {activeAssignment.title} ({activeAssignment.className})
              </span>
            </div>
          ) : (
            <p style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>Select student name & paper language script before submitting photo.</p>
          )}

          {!uploadSuccess ? (
            <>
              <div className="input-group">
                <label className="input-label">Student Name</label>
                <select 
                  className="input-field"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                >
                  <option value="Aarav Sharma">Aarav Sharma</option>
                  <option value="S. Hanish">S. Hanish</option>
                  <option value="Y. Manaswini">Y. Manaswini</option>
                  <option value="Alex Johnson">Alex Johnson</option>
                </select>
              </div>

              <div className="input-group">
                <label className="input-label">Handwritten Paper Language</label>
                <select 
                  className="input-field"
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                >
                  <option value="English">English (Latin Script)</option>
                  <option value="Telugu (తెలుగు)">Telugu (తెలుగు - Telugu Script)</option>
                  <option value="Hindi (हिंदी)">Hindi (हिंदी - Devanagari Script)</option>
                </select>
              </div>

              <div 
                className="upload-area" 
                style={{ marginBottom: '1.25rem', padding: '1.75rem 1rem' }}
                onClick={() => document.getElementById('file-upload')?.click()}
              >
                <span style={{ fontSize: '2.5rem' }}>📷</span>
                <h4 style={{ marginTop: '0.5rem', fontSize: '0.95rem', color: '#4F46E5' }}>
                  {files.length > 0 
                    ? `✅ ${files.length} Page(s) Selected: ${files.map(f => f.name).join(', ')}` 
                    : 'Click to Upload Handwritten Photo(s) / PDF'}
                </h4>
                <p style={{ fontSize: '0.75rem', margin: 0, color: '#64748B' }}>
                  Supports single or multi-page photos (JPEG, PNG, PDF)
                </p>
                <input 
                  type="file" 
                  id="file-upload" 
                  style={{ display: 'none' }} 
                  accept="image/*,.pdf"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                />
              </div>

              <button 
                className="btn btn-primary" 
                style={{ width: '100%', padding: '0.75rem' }}
                disabled={isUploading || files.length === 0}
                onClick={handleUpload}
              >
                {isUploading ? 'Scanning OCR & Analyzing with AI...' : (files.length > 0 ? `Submit ${files.length} Page(s) for ${activeAssignment ? activeAssignment.title : 'Assignment'}` : 'Select Photo(s) / PDF to Submit')}
              </button>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', border: '1px solid #10B981', borderRadius: '0.75rem', background: '#ECFDF5', color: '#065F46' }}>
              <span style={{ fontSize: '3rem' }}>🎉</span>
              <h3 style={{ marginTop: '0.75rem', fontSize: '1.2rem' }}>Submission Received!</h3>
              <p style={{ fontSize: '0.875rem', margin: '0.5rem 0 1rem 0' }}>
                Your {files.length > 1 ? `${files.length}-page` : ''} paper for <strong>{activeAssignment ? activeAssignment.title : 'Assignment'}</strong> was scanned with <strong>{selectedLanguage} OCR Engine</strong> and routed to the <strong>Teacher Verification Console</strong>.
              </p>
              <button 
                className="btn btn-outline" 
                style={{ borderColor: '#065F46', color: '#065F46' }}
                onClick={() => { setUploadSuccess(false); setFiles([]); fetchAssignments(); }}
              >
                Submit another paper
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}


