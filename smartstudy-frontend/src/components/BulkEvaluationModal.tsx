import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config/api';

interface BulkEvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshDashboard: () => void;
}

export default function BulkEvaluationModal({ isOpen, onClose, onRefreshDashboard }: BulkEvaluationModalProps) {
  const [className, setClassName] = useState('');
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
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem'
      }}
    >
      <div
        className="card animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'white',
          borderRadius: '1rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          padding: '2rem'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>🚀 Bulk Student Sheet Evaluation</span>
              <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>Direct Gemini API</span>
            </h2>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#64748B' }}>
              Upload batch student answer sheets (50 to 100 papers) for automated AI grading and RAG vector matching.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#64748B'
            }}
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div style={{ padding: '0.75rem 1rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {!jobId ? (
          /* Form Controls */
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>Target Class Name</label>
                <input
                  type="text"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="e.g. Grade 11 Psychology"
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>Evaluation Language</label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                >
                  <option value="English">English</option>
                  <option value="Telugu (తెలుగు)">Telugu (తెలుగు)</option>
                  <option value="Hindi (हिंदी)">Hindi (हिंदी)</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>Assignment Title / Chapter</label>
              <input
                type="text"
                value={assignmentTitle}
                onChange={(e) => setAssignmentTitle(e.target.value)}
                placeholder="e.g. Chapter Assessment"
                style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
              />
            </div>

            {/* Drop Zone */}
            <div
              style={{
                border: '2px dashed #818CF8',
                background: '#EEF2FF',
                borderRadius: '0.75rem',
                padding: '2rem 1.5rem',
                textAlign: 'center',
                cursor: 'pointer',
                marginBottom: '1.5rem'
              }}
              onClick={() => document.getElementById('bulk-file-input')?.click()}
            >
              <span style={{ fontSize: '2.5rem' }}>📁</span>
              <h3 style={{ margin: '0.5rem 0 0.25rem 0', fontSize: '1rem', color: '#4338CA' }}>
                {selectedFiles.length > 0 ? `${selectedFiles.length} File(s) / Bundles Selected` : 'Click or Drag & Drop Student Sheets'}
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#6366F1' }}>
                Support ZIP archives (with student folders), single/multiple PDFs, or images (JPG, PNG, WEBP)
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
              <div style={{ maxHeight: '120px', overflowY: 'auto', marginBottom: '1.5rem', padding: '0.5rem', background: '#F8FAFC', borderRadius: '0.5rem', border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>Selected Files & Archives:</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.35rem' }}>
                  {selectedFiles.slice(0, 15).map((f, i) => {
                    const isZip = f.name.toLowerCase().endsWith('.zip');
                    const isPdf = f.name.toLowerCase().endsWith('.pdf');
                    const icon = isZip ? '📦' : isPdf ? '📄' : '🖼️';
                    return (
                      <span key={i} style={{ background: isZip ? '#FEF3C7' : isPdf ? '#DBEAFE' : '#E0E7FF', color: isZip ? '#92400E' : isPdf ? '#1E40AF' : '#3730A3', padding: '0.15rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                        <span>{icon}</span> {f.name}
                      </span>
                    );
                  })}
                  {selectedFiles.length > 15 && (
                    <span style={{ fontSize: '0.7rem', color: '#64748B', alignSelf: 'center' }}>
                      + {selectedFiles.length - 15} more files...
                    </span>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={handleStartBulkEvaluation}
              disabled={isSubmitting || selectedFiles.length === 0}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '0.95rem',
                fontWeight: 600,
                opacity: isSubmitting || selectedFiles.length === 0 ? 0.6 : 1
              }}
            >
              {isSubmitting ? '⏳ Initializing & Unpacking Batch Job...' : `⚡ Evaluate ${selectedFiles.length} Uploaded File(s)`}
            </button>
          </div>
        ) : (
          /* Live Progress Monitor */
          <div>
            <div style={{ background: '#F1F5F9', borderRadius: '0.75rem', padding: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                  Processing Batch Status ({batchJob?.processed || 0} / {batchJob?.total || selectedFiles.length} Graded)
                </span>
                <span className={`badge ${batchJob?.status === 'completed' ? 'badge-success' : 'badge-primary'}`}>
                  {batchJob?.status === 'completed' ? '✅ Completed' : '⚡ Live Direct Gemini Worker Active'}
                </span>
              </div>

              {/* Progress Bar */}
              <div style={{ width: '100%', height: '14px', background: '#E2E8F0', borderRadius: '7px', overflow: 'hidden', marginBottom: '0.75rem' }}>
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #4F46E5 0%, #10B981 100%)',
                    transition: 'width 0.4s ease'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748B' }}>
                <span>Progress: {progressPercent}%</span>
                <span>Successful: {batchJob?.successful || 0} | Rate-Limit Safe (15 RPM)</span>
              </div>
            </div>

            {/* Live Cards Feed */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '0.9rem', color: '#334155', marginBottom: '0.5rem' }}>
                Live Evaluated Papers ({batchJob?.submissions?.length || 0}):
              </h4>

              <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {batchJob?.submissions?.map((sub: any, idx: number) => {
                  const scoreVal = sub.aiEvaluation?.score || 85;
                  const scoreColor = scoreVal >= 90 ? '#10B981' : scoreVal >= 70 ? '#3B82F6' : '#EF4444';
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.6rem 0.85rem',
                        background: '#F8FAFC',
                        borderRadius: '0.5rem',
                        border: '1px solid #E2E8F0'
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1E293B' }}>{sub.studentName}</span>
                        <span style={{ fontSize: '0.75rem', color: '#64748B', marginLeft: '0.5rem' }}>({sub.subject})</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: scoreColor }}>{scoreVal}%</span>
                        <span className="badge badge-outline" style={{ fontSize: '0.7rem' }}>Pending Review</span>
                      </div>
                    </div>
                  );
                })}

                {(!batchJob?.submissions || batchJob.submissions.length === 0) && (
                  <p style={{ fontSize: '0.8rem', color: '#94A3B8', textAlign: 'center', padding: '1rem' }}>
                    Worker is reading handwriting & vector matching textbook chunks...
                  </p>
                )}
              </div>
            </div>

            {batchJob?.status === 'completed' && (
              <button
                onClick={onClose}
                className="btn btn-success"
                style={{ width: '100%', padding: '0.75rem', fontWeight: 600 }}
              >
                ✅ Finished! Close & View All Graded Papers on Dashboard
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
