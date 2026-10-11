import React, { useState, useEffect } from 'react';
import { Layers, Upload, X, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import LanguageSelect from './LanguageSelect';

interface BulkEvaluationModalProps {
  isOpen: boolean;
  assignmentId?: string;
  onClose: () => void;
  onRefreshDashboard: () => void;
}

export default function BulkEvaluationModal({ isOpen, assignmentId = '', onClose, onRefreshDashboard }: BulkEvaluationModalProps) {
  const [className, setClassName] = useState('Grade 11');
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [markingScheme, setMarkingScheme] = useState('');
  const [bulkMode, setBulkMode] = useState<'single_per_student' | 'combined_pdf'>('single_per_student');
  const [isFixedPageCount, setIsFixedPageCount] = useState(false);
  const [fixedPageCount, setFixedPageCount] = useState<number>(4);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [batchJob, setBatchJob] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Poll batch status when jobId exists
  useEffect(() => {
    if (!jobId) return;

    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/submissions/batch/${jobId}`);
        const data = await res.json();
        if (data.success) {
          setBatchJob(data);
          if (data.status === 'completed' || data.status === 'failed') {
            setIsSubmitting(false);
            onRefreshDashboard();
          }
        }
      } catch (err) {
        console.error('Batch status polling error:', err);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, [jobId]);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setSelectedFiles(filesArray);
      if (filesArray.length > 1) {
        setBulkMode('single_per_student');
      }
    }
  };

  const handleStartBulkEvaluation = async () => {
    if (selectedFiles.length === 0) {
      setErrorMsg('Please select at least 1 student answer sheet image or PDF to evaluate.');
      return;
    }
    if (!assignmentId) {
      setErrorMsg('Select the dispatched assignment in Scan & Grade before starting bulk evaluation.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    setJobId(null);
    setBatchJob(null);

    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => {
        formData.append('submissions', file);
      });
      formData.append('assignmentId', assignmentId);
      formData.append('selectedLanguage', selectedLanguage);
      formData.append('className', className);
      formData.append('subject', assignmentTitle);
      formData.append('markingScheme', markingScheme);
      formData.append('bulkMode', bulkMode);
      formData.append('autoSplitPdf', bulkMode === 'combined_pdf' ? 'true' : 'false');
      if (bulkMode === 'combined_pdf' && isFixedPageCount && fixedPageCount > 0) {
        formData.append('fixedPageCount', String(fixedPageCount));
      }

      const res = await fetch(`${API_BASE_URL}/api/submissions/bulk`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (data.success && data.jobId) {
        setJobId(data.jobId);
      } else {
        setErrorMsg(data.message || 'Failed to initialize bulk batch job.');
        setIsSubmitting(false);
      }
    } catch (err: any) {
      console.error('Bulk submission fetch error:', err);
      setErrorMsg(err.message || 'Error connecting to server.');
      setIsSubmitting(false);
    }
  };

  const progressPercent = batchJob ? batchJob.progressPercent : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#111827', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Layers className="size-5 text-blue-600" />
              <span>Bulk Script Evaluation</span>
            </h2>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8125rem', color: '#64748B' }}>
              Process entire class stacks of handwritten papers through the evaluation pipeline.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#64748B'
            }}
          >
            <X className="size-5" />
          </button>
        </div>

        {errorMsg && (
          <div style={{ padding: '0.75rem 1rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {!jobId ? (
          /* Form Controls */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Target Class / Grade</label>
                <input
                  type="text"
                  className="form-input"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="e.g. Grade 11 Physics"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Evaluation Language</label>
                <LanguageSelect value={selectedLanguage} onChange={setSelectedLanguage} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Assessment Title / Topic</label>
              <input
                type="text"
                className="form-input"
                value={assignmentTitle}
                onChange={(e) => setAssignmentTitle(e.target.value)}
                placeholder="e.g. Physics Mid-term"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Answer key / marking scheme (optional)</label>
              <textarea
                className="form-input"
                rows={3}
                value={markingScheme}
                onChange={(e) => setMarkingScheme(e.target.value)}
                placeholder="1. F = ma (2 marks)\n2. a = 5 m/s², s = 80 m (5 marks)"
              />
              <p style={{ fontSize: '0.75rem', color: '#64748B', margin: '0.35rem 0 0 0' }}>
                Applies to every sheet in this batch and takes priority over the assignment's stored benchmark key.
              </p>
            </div>

            {/* Bulk Upload Mode: 2 Clear Options */}
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>Upload Organization Mode</span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                
                {/* Option 1: Single PDF per Student */}
                <div
                  onClick={() => setBulkMode('single_per_student')}
                  style={{
                    border: bulkMode === 'single_per_student' ? '2px solid #2563EB' : '1px solid #E2E8F0',
                    background: bulkMode === 'single_per_student' ? '#EFF6FF' : '#FFFFFF',
                    borderRadius: '0.625rem',
                    padding: '0.875rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: bulkMode === 'single_per_student' ? '0 1px 3px rgba(37, 99, 235, 0.15)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <input
                        type="radio"
                        name="bulkMode"
                        checked={bulkMode === 'single_per_student'}
                        onChange={() => setBulkMode('single_per_student')}
                        style={{ cursor: 'pointer', accentColor: '#2563EB' }}
                      />
                      <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#1E293B' }}>Single PDF per Student</span>
                    </div>
                    <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: '9999px', background: '#DBEAFE', color: '#1E40AF', textTransform: 'uppercase' }}>
                      Recommended
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748B', lineHeight: 1.35, paddingLeft: '1.25rem' }}>
                    Each uploaded file is 1 student's complete paper. Directly evaluates without boundary checking or splitting.
                  </p>
                </div>

                {/* Option 2: Multiple Students in 1 PDF */}
                <div
                  onClick={() => setBulkMode('combined_pdf')}
                  style={{
                    border: bulkMode === 'combined_pdf' ? '2px solid #16A34A' : '1px solid #E2E8F0',
                    background: bulkMode === 'combined_pdf' ? '#F0FDF4' : '#FFFFFF',
                    borderRadius: '0.625rem',
                    padding: '0.875rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: bulkMode === 'combined_pdf' ? '0 1px 3px rgba(22, 163, 74, 0.15)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <input
                        type="radio"
                        name="bulkMode"
                        checked={bulkMode === 'combined_pdf'}
                        onChange={() => setBulkMode('combined_pdf')}
                        style={{ cursor: 'pointer', accentColor: '#16A34A' }}
                      />
                      <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#1E293B' }}>Multiple Students in 1 PDF</span>
                    </div>
                    <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: '9999px', background: '#DCFCE7', color: '#15803D', textTransform: 'uppercase' }}>
                      AI Splitter
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748B', lineHeight: 1.35, paddingLeft: '1.25rem' }}>
                    Single combined master scan. AI detects student names & roll numbers to segregate each student's pages.
                  </p>
                </div>
              </div>

              {/* Fixed Booklet Size Option */}
              {bulkMode === 'combined_pdf' && (
                <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', background: '#F8FAFC', borderRadius: '0.5rem', border: '1px solid #E2E8F0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600, color: '#334155' }}>
                    <input
                      type="checkbox"
                      checked={isFixedPageCount}
                      onChange={(e) => setIsFixedPageCount(e.target.checked)}
                      style={{ accentColor: '#2563EB', cursor: 'pointer' }}
                    />
                    <span>Fixed Booklet Size (Instant 0-Second Splitting)</span>
                  </label>
                  <p style={{ margin: '0.25rem 0 0.5rem 1.45rem', fontSize: '0.75rem', color: '#64748B', lineHeight: 1.3 }}>
                    Check this if every student receives the exact same number of pages (e.g. exactly 4 pages per test booklet).
                  </p>
                  {isFixedPageCount && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginLeft: '1.45rem', marginTop: '0.35rem' }}>
                      <span style={{ fontSize: '0.8125rem', color: '#475569', fontWeight: 500 }}>Pages per student booklet:</span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={fixedPageCount}
                        onChange={(e) => setFixedPageCount(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{ width: '70px', padding: '0.25rem 0.5rem', borderRadius: '0.375rem', border: '1px solid #CBD5E1', fontSize: '0.8125rem', fontWeight: 700 }}
                      />
                      <span style={{ fontSize: '0.75rem', color: '#16A34A', fontWeight: 700 }}>⚡ 0s AI Splitting Active</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Drop Zone */}
            <div
              className="scan-dropzone"
              onClick={() => document.getElementById('bulk-file-input')?.click()}
            >
              <Upload className="size-6 text-blue-600" />
              <p style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#111827', margin: 0 }}>
                {selectedFiles.length > 0 ? `${selectedFiles.length} File(s) / Archives Selected` : 'Click to Attach Batch Zip / Multi-page Scans'}
              </p>
              <p style={{ fontSize: '0.75rem', color: '#64748B', margin: 0 }}>
                Supports ZIP archives (with student folders), PDFs, and JPG/PNG images
              </p>
              <input
                id="bulk-file-input"
                type="file"
                multiple
                accept="image/*,.pdf,.zip,application/zip,application/x-zip-compressed"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </div>

            {selectedFiles.length > 0 && (
              <div style={{ maxHeight: '100px', overflowY: 'auto', padding: '0.5rem', background: '#F8FAFC', borderRadius: '0.5rem', border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>Files ready for queue ({selectedFiles.length}):</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.35rem' }}>
                  {selectedFiles.slice(0, 10).map((f, i) => (
                    <span key={i} className="badge badge-blue">
                      {f.name}
                    </span>
                  ))}
                  {selectedFiles.length > 10 && (
                    <span style={{ fontSize: '0.75rem', color: '#64748B' }}>+ {selectedFiles.length - 10} more</span>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button
                onClick={handleStartBulkEvaluation}
                disabled={isSubmitting || selectedFiles.length === 0}
                className="btn btn-primary"
              >
                {isSubmitting ? (
                  <>
                    <Clock className="size-4 animate-spin" />
                    <span>Initializing Queue...</span>
                  </>
                ) : (
                  <>
                    <Layers className="size-4" />
                    <span>Start Batch Evaluation ({selectedFiles.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Live Progress Monitor */
          <div>
            <div style={{ background: '#F8FAFC', borderRadius: '0.5rem', padding: '1rem', border: '1px solid #E2E8F0', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#1E293B' }}>
                  {batchJob?.stage === 'splitting' ? (
                    'Stage 1: Page Slicing & Boundary Detection'
                  ) : batchJob?.status === 'completed' ? (
                    `Evaluation Completed (${batchJob?.successful || 0} / ${batchJob?.total || 0} Graded)`
                  ) : (
                    `Stage 2: Parallel AI Grading (${batchJob?.processed || 0} / ${batchJob?.total || selectedFiles.length} Students)`
                  )}
                </span>
                <span className={`badge ${
                  batchJob?.status === 'completed'
                    ? 'badge-green'
                    : batchJob?.stage === 'splitting'
                    ? 'badge-blue'
                    : 'badge-blue'
                }`}>
                  {batchJob?.status === 'completed' ? '● Completed' : batchJob?.stage === 'splitting' ? '● Slicing Document' : '● Grading In Parallel'}
                </span>
              </div>

              {/* Status Message */}
              {batchJob?.statusMessage && (
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.75rem', color: '#475569', fontStyle: 'italic' }}>
                  {batchJob.statusMessage}
                </p>
              )}

              {/* Progress Bar */}
              <div style={{ width: '100%', height: '8px', background: '#E2E8F0', borderRadius: '9999px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: '100%',
                    background: batchJob?.status === 'completed' ? '#16A34A' : '#2563EB',
                    borderRadius: '9999px',
                    transition: 'width 0.4s ease'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748B' }}>
                <span>Progress: {progressPercent}%</span>
                <span>
                  {batchJob?.stage === 'splitting' && batchJob?.splitProgress
                    ? `Page ${batchJob.splitProgress.current} of ${batchJob.splitProgress.total}`
                    : `Successful: ${batchJob?.successful || 0} | Failed: ${batchJob?.failed || 0}`}
                </span>
              </div>
            </div>

            {/* Live Cards Feed */}
            <div style={{ marginBottom: '1.25rem' }}>
              <h4 style={{ fontSize: '0.875rem', color: '#334155', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Evaluated Papers ({batchJob?.submissions?.length || 0}):</span>
                {batchJob?.status === 'processing' && (
                  <span style={{ fontSize: '0.75rem', color: '#2563EB', fontWeight: 500 }}>
                    ⚡ Updating live...
                  </span>
                )}
              </h4>

              <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {(!batchJob?.submissions || batchJob.submissions.length === 0) ? (
                  <div style={{ padding: '1rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.8125rem', background: '#F8FAFC', borderRadius: '0.375rem', border: '1px dashed #CBD5E1' }}>
                    {batchJob?.stage === 'splitting'
                      ? 'Analyzing and segregating student booklets...'
                      : 'Grading student submissions in parallel... Results will appear live here.'}
                  </div>
                ) : (
                  batchJob.submissions.map((sub: any, idx: number) => {
                    const scoreVal = sub.aiEvaluation?.score ?? sub.finalScore ?? 0;
                    const maxScore = sub.aiEvaluation?.maxScore ?? 100;
                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.5rem 0.75rem',
                          background: '#F8FAFC',
                          borderRadius: '0.375rem',
                          border: '1px solid #E2E8F0'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <CheckCircle2 className="size-4 text-green-600" />
                          <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#111827' }}>{sub.studentName}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.75rem', color: '#64748B' }}>{scoreVal}/{maxScore} pts</span>
                          <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: '#2563EB' }}>
                            {Math.round((scoreVal / (maxScore || 1)) * 100)}%
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {batchJob?.status === 'completed' && (
              <button
                onClick={onClose}
                className="btn btn-success"
                style={{ width: '100%', padding: '0.65rem' }}
              >
                <CheckCircle2 className="size-4" />
                <span>Finished! View in Queue</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

