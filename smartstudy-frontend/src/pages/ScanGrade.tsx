import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Upload, 
  Sparkles,
  FileText, 
  Layers, 
  Clock, 
  X
} from 'lucide-react';
import AgentPipelineStatus from '../components/AgentPipelineStatus';
import { API_BASE_URL } from '../config/api';

export default function ScanGrade({
  lockAssignmentId,
  onBatchComplete
}: { lockAssignmentId?: string; onBatchComplete?: () => void } = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const classSubjectId = searchParams.get('classSubjectId') || '';

  // Form State
  const [studentName, setStudentName] = useState('');
  const [subject, setSubject] = useState(searchParams.get('subject') || '');
  const [markingScheme, setMarkingScheme] = useState('');
  const [markingSchemeFromPaper, setMarkingSchemeFromPaper] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [files, setFiles] = useState<File[]>([]);
  const [assignmentId, setAssignmentId] = useState('');
  const [assignments, setAssignments] = useState<Array<{ id: string; title: string; className: string; subject?: string; language?: string; answerKeyText?: string }>>([]);

  // Async Execution States
  const [isGrading, setIsGrading] = useState(false);
  const [pipelineStep, setPipelineStep] = useState<number>(1);
  const [pipelineLog, setPipelineLog] = useState<string>('Ready for input scan');

  // Bulk mode: same form, but accepts many scripts at once and grades them as one batch job
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkJobId, setBulkJobId] = useState<string | null>(null);
  const [batchJob, setBatchJob] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;

    const url = classSubjectId
      ? `${API_BASE_URL}/api/assignments?classSubjectId=${encodeURIComponent(classSubjectId)}`
      : `${API_BASE_URL}/api/assignments`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success && Array.isArray(data.assignments)) {
          setAssignments(data.assignments);
          if (lockAssignmentId) {
            const locked = data.assignments.find((item: any) => item.id === lockAssignmentId);
            if (locked) {
              setAssignmentId(locked.id);
              setSelectedLanguage(locked.language || 'English');
              if (locked.subject || locked.className) setSubject(locked.subject || locked.className);
              if (locked.answerKeyText) {
                setMarkingScheme(locked.answerKeyText);
                setMarkingSchemeFromPaper(true);
              }
            }
          }
        }
      })
      .catch(() => {
        // Scanning still works without a previously dispatched assignment.
      });

    return () => {
      isMounted = false;
    };
  }, [classSubjectId, lockAssignmentId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  // Poll batch job status while a bulk grading job is running
  useEffect(() => {
    if (!bulkJobId) return;
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/submissions/batch/${bulkJobId}`);
        const data = await res.json();
        if (data.success) {
          setBatchJob(data);
          if (data.status === 'completed' || data.status === 'failed') {
            setIsGrading(false);
          }
        }
      } catch (err) {
        console.error('Batch status polling error:', err);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, [bulkJobId]);

  // Once the whole batch (every student paper, not just the first) is graded, hand off to the caller
  // so the teacher lands straight on the results instead of staring at a finished progress bar.
  useEffect(() => {
    if (batchJob?.status !== 'completed' || !onBatchComplete) return;
    const timer = setTimeout(() => onBatchComplete(), 1200);
    return () => clearTimeout(timer);
  }, [batchJob?.status, onBatchComplete]);

  const handleRunGrading = async () => {
    if (files.length === 0) {
      alert('⚠️ Please attach at least 1 handwritten script image or PDF scan.');
      return;
    }
    if (!assignmentId) {
      alert('Select the dispatched assignment that matches this answer sheet.');
      return;
    }

    const selectedAssignment = assignments.find((item) => item.id === assignmentId);

    if (isBulkMode) {
      setIsGrading(true);
      setBulkJobId(null);
      setBatchJob(null);
      try {
        const formData = new FormData();
        files.forEach((f) => formData.append('submissions', f));
        formData.append('assignmentId', assignmentId);
        formData.append('selectedLanguage', selectedLanguage);
        formData.append('className', selectedAssignment?.className || subject);
        formData.append('subject', subject);
        formData.append('markingScheme', markingScheme);

        const res = await fetch(`${API_BASE_URL}/api/submissions/bulk`, {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (data.success && data.jobId) {
          setBulkJobId(data.jobId);
        } else {
          alert(data.message || 'Failed to start bulk batch job.');
          setIsGrading(false);
        }
      } catch (err: any) {
        console.error(err);
        alert('Error connecting to grading backend.');
        setIsGrading(false);
      }
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
      formData.append('className', selectedAssignment?.className || subject);
      formData.append('selectedLanguage', selectedLanguage);
      formData.append('markingScheme', markingScheme);
      formData.append('assignmentId', assignmentId);

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
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', cursor: 'pointer', padding: '0.5rem 0.75rem', border: '1px solid #E2E8F0', borderRadius: '0.5rem', background: isBulkMode ? '#EFF6FF' : 'white' }}>
            <input
              type="checkbox"
              checked={isBulkMode}
              onChange={(e) => {
                setIsBulkMode(e.target.checked);
                setFiles([]);
                setBulkJobId(null);
                setBatchJob(null);
              }}
            />
            <Layers className="size-4" />
            <span>Bulk upload (multiple scripts)</span>
          </label>
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
                  {isBulkMode
                    ? "Select every student's scan for this assignment \u2014 one file per student, graded as a batch"
                    : 'JPG, PNG, WEBP or PDF \u00b7 long PDFs are processed in ordered 10-page batches'}
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

            {/* Dispatched assignment: primary match key linking this scan to an exam */}
            <div className="form-group" style={{ marginTop: '1.25rem' }}>
              <label className="form-label">Dispatched assignment <span style={{ color: '#DC2626' }}>*</span></label>
              <select
                className="form-select"
                value={assignmentId}
                disabled={Boolean(lockAssignmentId)}
                style={lockAssignmentId ? { background: '#F8FAFC', color: '#475569', cursor: 'not-allowed' } : undefined}
                onChange={(e) => {
                  setAssignmentId(e.target.value);
                  const assignment = assignments.find((item) => item.id === e.target.value);
                  setSelectedLanguage(assignment?.language || 'English');
                  if (assignment?.subject || assignment?.className) setSubject(assignment.subject || assignment.className);
                  if (assignment?.answerKeyText) {
                    setMarkingScheme(assignment.answerKeyText);
                    setMarkingSchemeFromPaper(true);
                  } else {
                    setMarkingSchemeFromPaper(false);
                  }
                }}
              >
                <option value="" disabled>Select the matching assignment</option>
                {assignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.title} · {assignment.subject || assignment.className}
                  </option>
                ))}
              </select>
              <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.2rem' }}>
                {lockAssignmentId
                  ? 'Locked to this paper — scans uploaded here are always matched against it.'
                  : 'This is how the uploaded script is matched to an exam — required before grading.'}
              </p>
            </div>

            {/* Form Fields Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
              {!isBulkMode && (
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
              )}

              <div className="form-group" style={isBulkMode ? { gridColumn: '1 / -1' } : undefined}>
                <label className="form-label">Subject</label>
                <input
                  type="text"
                  className="form-input"
                  value={subject}
                  placeholder="Set by the selected assignment"
                  readOnly
                  style={{ background: '#F8FAFC', color: '#475569', cursor: 'not-allowed' }}
                />
              </div>
            </div>

            {isBulkMode && (
              <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.5rem' }}>
                Bulk mode: attach one scan per student — each student's name is transcribed individually from their script.
              </p>
            )}

            {/* Marking Scheme */}
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="form-label">Answer key / marking scheme (optional)</label>
              <textarea 
                className="form-textarea"
                rows={3}
                placeholder={`1. F = ma (2 marks)\n2. a = 5 m/s², s = 80 m (5 marks)`}
                value={markingScheme}
                onChange={(e) => {
                  setMarkingScheme(e.target.value);
                  setMarkingSchemeFromPaper(false);
                }}
              />
              <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.2rem' }}>
                {markingSchemeFromPaper
                  ? 'Loaded from the deployed question paper\'s answer key. Edit here to override just this batch.'
                  : 'Leave blank to grade purely from the subject knowledge base.'}
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
                    <span>{isBulkMode ? 'Running batch grading...' : 'Running multi-agent pipeline...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    <span>{isBulkMode ? `Run batch grading (${files.length})` : 'Run grading pipeline'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right Column: Agent Pipeline Execution Box, or batch progress while bulk mode is running */}
          <div>
            {isBulkMode && bulkJobId ? (
              <div className="m-card">
                <div className="m-card-header">
                  <h3 className="m-card-title">Batch progress</h3>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#334155' }}>
                    {batchJob?.processed || 0} / {batchJob?.total || files.length} graded
                  </span>
                  <span className={`badge ${batchJob?.status === 'completed' ? 'badge-green' : 'badge-blue'}`}>
                    {batchJob?.status === 'completed' ? '● Completed' : '● Processing'}
                  </span>
                </div>
                <div style={{ width: '100%', height: '8px', background: '#E2E8F0', borderRadius: '9999px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                  <div
                    style={{
                      width: `${batchJob?.progressPercent || 0}%`,
                      height: '100%',
                      background: '#2563EB',
                      borderRadius: '9999px',
                      transition: 'width 0.4s ease'
                    }}
                  />
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                  Progress: {batchJob?.progressPercent || 0}% · Successful: {batchJob?.successful || 0}
                </div>
                {batchJob?.status === 'completed' && (
                  <button className="btn btn-success" style={{ width: '100%', marginTop: '1rem' }} onClick={() => navigate('/submissions')}>
                    <span>Finished! View in queue</span>
                  </button>
                )}
              </div>
            ) : (
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
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

