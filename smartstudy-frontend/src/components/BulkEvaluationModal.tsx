import React, { useState, useEffect } from 'react';
import { Layers, Upload, X, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { API_BASE_URL } from '../config/api';

interface BulkEvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshDashboard: () => void;
}

export default function BulkEvaluationModal({ isOpen, onClose, onRefreshDashboard }: BulkEvaluationModalProps) {
  const [className, setClassName] = useState('Grade 11');
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [assignmentTitle, setAssignmentTitle] = useState('');
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
    }
  };

  const handleStartBulkEvaluation = async () => {
    if (selectedFiles.length === 0) {
      setErrorMsg('Please select at least 1 student answer sheet image to evaluate.');
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
      formData.append('selectedLanguage', selectedLanguage);
      formData.append('className', className);
      formData.append('subject', assignmentTitle);

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
              <span>Bulk Script Evaluation (50-100)</span>
            </h2>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8125rem', color: '#64748B' }}>
              Process entire class stacks of handwritten papers in parallel through the 6-agent pipeline.
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
                <select
                  className="form-select"
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                >
                  <option value="English">English</option>
                  <option value="Telugu (తెలుగు)">Telugu (తెలుగు)</option>
                  <option value="Hindi (हिंदी)">Hindi (हिंदी)</option>
                </select>
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
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#334155' }}>
                  Processing Batch ({batchJob?.processed || 0} / {batchJob?.total || selectedFiles.length} Graded)
                </span>
                <span className={`badge ${batchJob?.status === 'completed' ? 'badge-green' : 'badge-blue'}`}>
                  {batchJob?.status === 'completed' ? '● Completed' : '● Processing'}
                </span>
              </div>

              {/* Progress Bar */}
              <div style={{ width: '100%', height: '8px', background: '#E2E8F0', borderRadius: '9999px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: '100%',
                    background: '#2563EB',
                    borderRadius: '9999px',
                    transition: 'width 0.4s ease'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748B' }}>
                <span>Progress: {progressPercent}%</span>
                <span>Successful: {batchJob?.successful || 0}</span>
              </div>
            </div>

            {/* Live Cards Feed */}
            <div style={{ marginBottom: '1.25rem' }}>
              <h4 style={{ fontSize: '0.875rem', color: '#334155', marginBottom: '0.5rem' }}>
                Evaluated Papers ({batchJob?.submissions?.length || 0}):
              </h4>

              <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {batchJob?.submissions?.map((sub: any, idx: number) => {
                  const scoreVal = sub.aiEvaluation?.score ?? sub.finalScore ?? 0;
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
                      <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#111827' }}>{sub.studentName}</span>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: '#2563EB' }}>{scoreVal}%</span>
                    </div>
                  );
                })}
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

