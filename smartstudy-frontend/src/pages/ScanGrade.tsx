import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Upload, 
  Sparkles,
  FileText, 
  Layers, 
  Clock, 
  X
} from 'lucide-react';
import AgentPipelineStatus from '../components/AgentPipelineStatus';
import BulkEvaluationModal from '../components/BulkEvaluationModal';
import { API_BASE_URL } from '../config/api';

export default function ScanGrade() {
  const navigate = useNavigate();

  // Form State
  const [studentName, setStudentName] = useState('');
  const [subject, setSubject] = useState('Physics');
  const [assessmentTitle, setAssessmentTitle] = useState('');
  const [assessmentType, setAssessmentType] = useState('Class Test');
  const [markingScheme, setMarkingScheme] = useState('');
  const selectedLanguage = 'English';
  const [files, setFiles] = useState<File[]>([]);
  const [assignmentId, setAssignmentId] = useState('');
  const [assignments, setAssignments] = useState<Array<{ id: string; title: string; className: string }>>([]);

  // Async Execution States
  const [isGrading, setIsGrading] = useState(false);
  const [pipelineStep, setPipelineStep] = useState<number>(1);
  const [pipelineLog, setPipelineLog] = useState<string>('Ready for input scan');
  const [isBulkOpen, setIsBulkOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    fetch(`${API_BASE_URL}/api/assignments`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success && Array.isArray(data.assignments)) {
          setAssignments(data.assignments);
        }
      })
      .catch(() => {
        // Scanning still works without a previously dispatched assignment.
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleRunGrading = async () => {
    if (files.length === 0) {
      alert('⚠️ Please attach at least 1 handwritten script image or PDF scan.');
      return;
    }

    setIsGrading(true);
    setPipelineStep(1);
    setPipelineLog(`Ingesting ${files[0].name}...`);

    // Simulated step progression for visual feedback while awaiting server response
    const stepTimer1 = setTimeout(() => {
      setPipelineStep(2);
      setPipelineLog('Transcribing handwriting & bounding boxes via OCR Agent...');
    }, 1500);

    const stepTimer2 = setTimeout(() => {
      setPipelineStep(3);
      setPipelineLog('Verifying transcribed responses against answer rubric...');
    }, 3500);

    const stepTimer3 = setTimeout(() => {
      setPipelineStep(4);
      setPipelineLog(`Evaluating partial marks against ${subject} knowledge base...`);
    }, 5500);

    const stepTimer4 = setTimeout(() => {
      setPipelineStep(5);
      setPipelineLog('QA Agent checking reasoning accuracy and feedback clarity...');
    }, 7500);

    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('submission', f));
      formData.append('studentName', studentName || 'Student ' + Math.floor(Math.random() * 100));
      formData.append('subject', subject);
      formData.append('className', `Grade 11 ${subject}`);
      formData.append('selectedLanguage', selectedLanguage);
      formData.append('markingScheme', markingScheme);
      if (assignmentId) formData.append('assignmentId', assignmentId);

      const res = await fetch(`${API_BASE_URL}/api/submissions`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (data.success) {
        setPipelineStep(6);
        setPipelineLog('Grading pipeline complete! Ready for teacher review.');
        const submissionId = data.submission?.id;
        setTimeout(() => {
          if (submissionId) {
            navigate(`/review/${submissionId}`);
          } else {
            navigate('/submissions');
          }
        }, 1200);
      } else {
        alert(`Grading failed: ${data.message}`);
      }
    } catch (err: any) {
      console.error(err);
      alert('Error connecting to grading backend.');
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearTimeout(stepTimer3);
      clearTimeout(stepTimer4);
      setIsGrading(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      
      {/* Sticky Top Header Banner */}
      <header className="page-top-bar no-print">
        <div className="page-top-bar-text">
          <h1>Scan & grade</h1>
          <p>Upload a handwritten script — the agents transcribe, verify and mark it against your knowledge base</p>
        </div>
        <div className="page-top-bar-actions">
          <button className="btn btn-secondary" onClick={() => setIsBulkOpen(true)}>
            <Layers className="size-4" />
            <span>Bulk Stack (50-100)</span>
          </button>
        </div>
      </header>

      <div className="page-container">
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.1fr', gap: '1.5rem', alignItems: 'start' }}>
          
          {/* Left Column: Submission Details Form */}
          <div className="m-card">
            <div className="m-card-header">
              <h3 className="m-card-title">Submission details</h3>
            </div>

            {/* Dropzone */}
            <div 
              className="scan-dropzone"
              onClick={() => document.getElementById('scan-upload-input')?.click()}
            >
              <input 
                type="file" 
                id="scan-upload-input" 
                multiple 
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <div style={{ width: '3rem', height: '3rem', borderRadius: '50%', background: '#EFF6FF', display: 'grid', placeItems: 'center', color: '#2563EB' }}>
                <Upload className="size-6" />
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: '1rem', color: '#111827', margin: 0 }}>
                  Click to attach a scan
                </p>
                <p style={{ fontSize: '0.8125rem', color: '#64748B', margin: '0.25rem 0 0 0' }}>
                  JPG, PNG, WEBP or PDF · max ~8MB
                </p>
              </div>
            </div>

            {/* Attached Files List */}
            {files.length > 0 && (
              <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {files.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: '#F8FAFC', borderRadius: '0.5rem', border: '1px solid #E2E8F0', fontSize: '0.8125rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <FileText className="size-4 text-blue-600" />
                      <span style={{ fontWeight: 600 }}>{f.name}</span>
                      <span style={{ color: '#94A3B8' }}>({(f.size / 1024).toFixed(0)} KB)</span>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setFiles(files.filter((_, idx) => idx !== i));
                      }}
                      style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Form Fields Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.25rem' }}>
              <div className="form-group">
                <label className="form-label">Student name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Emma Watson"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Subject</label>
                <select 
                  className="form-select"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                >
                  <option value="Physics">Physics</option>
                  <option value="Psychology">Psychology</option>
                  <option value="Mathematics">Mathematics</option>
                  <option value="General Science">General Science</option>
                  <option value="English Literature">English Literature</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Assessment title</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Physics Test 4"
                  value={assessmentTitle}
                  onChange={(e) => setAssessmentTitle(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Assessment type</label>
                <select 
                  className="form-select"
                  value={assessmentType}
                  onChange={(e) => setAssessmentType(e.target.value)}
                >
                  <option value="Class Test">Class Test</option>
                  <option value="Homework">Homework</option>
                  <option value="Mid-term">Mid-term</option>
                  <option value="Final Exam">Final Exam</option>
                </select>
              </div>

              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Dispatched assignment (optional)</label>
                <select
                  className="form-select"
                  value={assignmentId}
                  onChange={(e) => setAssignmentId(e.target.value)}
                >
                  <option value="">Grade from subject knowledge base</option>
                  {assignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>
                      {assignment.title} · {assignment.className}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Marking Scheme */}
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="form-label">Answer key / marking scheme (optional)</label>
              <textarea 
                className="form-textarea"
                rows={3}
                placeholder={`1. F = ma (2 marks)\n2. a = 5 m/s², s = 80 m (5 marks)`}
                value={markingScheme}
                onChange={(e) => setMarkingScheme(e.target.value)}
              />
              <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.2rem' }}>
                Leave blank to grade purely from the subject knowledge base.
              </p>
            </div>

            {/* Run Button */}
            <div style={{ marginTop: '1.5rem' }}>
              <button 
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.75rem' }}
                onClick={handleRunGrading}
                disabled={isGrading}
              >
                {isGrading ? (
                  <>
                    <Clock className="size-4 animate-spin" />
                    <span>Running multi-agent pipeline...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    <span>Run grading pipeline</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right Column: Agent Pipeline Execution Box */}
          <div>
            <AgentPipelineStatus 
              currentStep={isGrading ? pipelineStep : 1}
              subData={{
                imageName: files.length > 0 ? files[0].name : undefined,
                blocksTranscribed: files.length,
                subject,
                qaNote: isGrading ? pipelineLog : 'Ready for grading execution',
                status: isGrading ? 'processing' : 'ready'
              }}
            />
          </div>

        </div>
      </div>

      <BulkEvaluationModal 
        isOpen={isBulkOpen}
        onClose={() => setIsBulkOpen(false)}
        onRefreshDashboard={() => navigate('/submissions')}
      />
    </div>
  );
}
