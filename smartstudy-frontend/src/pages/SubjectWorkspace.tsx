import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText, FileStack, Send, Plus, Upload, X, CheckCircle2, ChevronRight, Sparkles, Edit3 } from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import ReviewQueue from './ReviewQueue';

type Tab = 'papers' | 'queue';

type Assignment = {
  id: string;
  title: string;
  className: string;
  subject?: string;
  status?: string;
  createdAt?: string;
  answerKeyText?: string;
  questions?: any[];
};

export default function SubjectWorkspace() {
  const { classId, classSubjectId } = useParams();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>('papers');

  const [className, setClassName] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const [paperTitle, setPaperTitle] = useState('');
  const [questionPaperFiles, setQuestionPaperFiles] = useState<File[]>([]);
  const [answerKeyFiles, setAnswerKeyFiles] = useState<File[]>([]);
  const [deployStep, setDeployStep] = useState<1 | 2 | 3>(1);
  const [extractedQuestions, setExtractedQuestions] = useState<any[]>([]);
  const [extractedAnswerKeyText, setExtractedAnswerKeyText] = useState('');
  const [questionPaperUrl, setQuestionPaperUrl] = useState('');
  const [answerKeyUrl, setAnswerKeyUrl] = useState('');
  const [isUploadingStep, setIsUploadingStep] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [questionUploadPct, setQuestionUploadPct] = useState<number | null>(null);
  const [answerKeyUploadPct, setAnswerKeyUploadPct] = useState<number | null>(null);

  const effectiveClassName = useMemo(
    () => (className && subjectName ? `${className} ${subjectName}` : className || subjectName),
    [className, subjectName]
  );

  const fetchAssignments = () => {
    if (!classSubjectId) return;
    const qParams = new URLSearchParams({
      classSubjectId,
      ...(subjectName ? { subject: subjectName } : {}),
      ...(classId ? { classId } : {})
    });
    fetch(`${API_BASE_URL}/api/assignments?${qParams.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.assignments)) setAssignments(data.assignments);
      })
      .catch((err) => console.error('Unable to load question papers:', err));
  };

  useEffect(() => {
    if (!classId || !classSubjectId) return;

    fetch(`${API_BASE_URL}/api/classes`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const match = data.classes.find((c: any) => c.id === classId);
          if (match) {
            const secStr = typeof match.section === 'string' && match.section.trim()
              ? match.section.trim()
              : Array.isArray(match.sections) && match.sections.length > 0
              ? match.sections.map((s: any) => s.section_name).filter(Boolean).join(', ')
              : '';
            setClassName(secStr ? `${match.name} - ${secStr}` : match.name);
          }
        }
      })
      .catch(() => {});

    fetch(`${API_BASE_URL}/api/classes/${classId}/subjects`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const match = data.subjects.find((s: any) => s.id === classSubjectId);
          if (match) {
            setSubjectName(match.subjectName);
            // Embedded ScanGrade/ReviewQueue read the scope from the shared URL query string.
            setSearchParams(
              (prev) => {
                prev.set('classSubjectId', classSubjectId as string);
                prev.set('subject', match.subjectName);
                prev.set('subjectFilter', match.subjectName);
                return prev;
              },
              { replace: true }
            );
          }
        }
      })
      .catch(() => {});

    fetchAssignments();
  }, [classId, classSubjectId]);

  // Review queue requires a deployed paper to match against — fall back if none exist.
  useEffect(() => {
    if (assignments.length === 0 && activeTab !== 'papers') setActiveTab('papers');
  }, [assignments.length, activeTab]);

  // Deploying reads both files, transcribes them behind the scenes for grading only,
  // and never surfaces the raw OCR text back to the teacher.
  // Uploads via XHR (not fetch) so we can report real byte-level progress to the teacher.
  const uploadWithProgress = (url: string, formData: FormData, onProgress: (pct: number) => void): Promise<any> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) resolve(data);
          else reject(new Error(data.message || `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error('Invalid server response.'));
        }
      };
      xhr.onerror = () => reject(new Error('Network error during upload.'));
      xhr.send(formData);
    });
  };

  const resetDeployFlow = () => {
    setDeployStep(1);
    setPaperTitle('');
    setQuestionPaperFiles([]);
    setAnswerKeyFiles([]);
    setExtractedQuestions([]);
    setExtractedAnswerKeyText('');
    setQuestionPaperUrl('');
    setAnswerKeyUrl('');
    setQuestionUploadPct(null);
    setAnswerKeyUploadPct(null);
  };

  // Step 1: OCR the question paper, then unlock the answer key step.
  const handleUploadQuestionPaper = async () => {
    if (!paperTitle.trim()) {
      alert('Enter a title for this question paper.');
      return;
    }
    if (questionPaperFiles.length === 0) {
      alert('Attach the question paper (PDF or image).');
      return;
    }
    setIsUploadingStep(true);
    setQuestionUploadPct(0);
    try {
      const formData = new FormData();
      questionPaperFiles.forEach((f) => formData.append('questionPaper', f));
      formData.append('subject', subjectName);
      formData.append('className', effectiveClassName);
      const data = await uploadWithProgress(`${API_BASE_URL}/api/rag/extract-questions-from-image`, formData, setQuestionUploadPct);
      if (!data.success || !Array.isArray(data.questions) || data.questions.length === 0) {
        throw new Error(data.message || 'Could not read the question paper. Try a clearer scan.');
      }
      setExtractedQuestions(data.questions);
      setQuestionPaperUrl(data.questionPaperUrl || data.paperPageUrls?.[0] || '');
      setDeployStep(2);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error connecting to server.');
    } finally {
      setIsUploadingStep(false);
    }
  };

  // Step 2: OCR the answer key (or skip it), then unlock the review/deploy step.
  const handleUploadAnswerKey = async () => {
    if (answerKeyFiles.length === 0) {
      alert('Attach the answer key, or use Skip.');
      return;
    }
    setIsUploadingStep(true);
    setAnswerKeyUploadPct(0);
    try {
      const formData = new FormData();
      answerKeyFiles.forEach((f) => formData.append('answerKey', f));
      const data = await uploadWithProgress(`${API_BASE_URL}/api/rag/extract-answer-key`, formData, setAnswerKeyUploadPct);
      if (data.success && data.answerKeyText) setExtractedAnswerKeyText(data.answerKeyText);
      setAnswerKeyUrl(data.answerKeyUrl || '');
      setDeployStep(3);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error connecting to server.');
    } finally {
      setIsUploadingStep(false);
    }
  };

  const handleSkipAnswerKey = () => {
    const proceed = window.confirm('No answer key will be attached. Grading accuracy will rely only on the subject knowledge base. Continue?');
    if (!proceed) return;
    setAnswerKeyFiles([]);
    setExtractedAnswerKeyText('');
    setAnswerKeyUrl('');
    setDeployStep(3);
  };

  // Step 3: both files are already processed — just create the assignment record.
  const handleFinalizeDeploy = async () => {
    setIsFinalizing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: paperTitle,
          className: effectiveClassName,
          subject: subjectName,
          questions: extractedQuestions,
          classId,
          classSubjectId,
          answerKeyText: extractedAnswerKeyText,
          questionPaperUrl,
          answerKeyUrl
        })
      });
      const data = await res.json();
      if (data.success) {
        fetchAssignments();
        alert(`✅ Question paper deployed (${extractedQuestions.length} question(s) detected).`);
        resetDeployFlow();
      } else {
        alert(data.message || 'Unable to deploy question paper.');
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error connecting to server.');
    } finally {
      setIsFinalizing(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <header className="page-top-bar no-print">
        <div className="page-top-bar-text">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/classes/${classId}`)} style={{ marginBottom: '0.5rem' }}>
            <ArrowLeft className="size-4" />
            <span>{className || 'Back to class'}</span>
          </button>
          <h1>{subjectName || 'Subject'}</h1>
          <p>Deploy question papers with an answer key, then scan and grade student scripts against them</p>
        </div>
        <div className="page-top-bar-actions">
          <button 
            type="button"
            className="btn btn-primary"
            onClick={() => navigate(`/generator?classId=${classId}&classSubjectId=${classSubjectId}&subject=${encodeURIComponent(subjectName)}&className=${encodeURIComponent(className)}`)}
            title="Generate question paper for this subject"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Sparkles className="size-4" />
            <span>Generate Paper with AI</span>
          </button>
        </div>
      </header>

      <div className="page-container">
        {/* Sub-navigation tabs, scoped to this class + subject */}
        <div style={{ display: 'flex', gap: '0.35rem', background: '#F1F5F9', padding: '0.25rem', borderRadius: '0.5rem', border: '1px solid #E2E8F0', marginBottom: '1.25rem', width: 'fit-content' }}>
          <button
            onClick={() => setActiveTab('papers')}
            className={`btn btn-sm ${activeTab === 'papers' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <FileText className="size-4" />
            <span>Question papers</span>
          </button>
          <button
            onClick={() => assignments.length > 0 && setActiveTab('queue')}
            className={`btn btn-sm ${activeTab === 'queue' ? 'btn-primary' : 'btn-secondary'}`}
            disabled={assignments.length === 0}
            title={assignments.length === 0 ? 'Deploy a question paper first' : undefined}
            style={assignments.length === 0 ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >
            <FileStack className="size-4" />
            <span>Review queue</span>
          </button>
        </div>

        {activeTab === 'papers' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
            <div className="m-card">
              <div className="m-card-header">
                <h3 className="m-card-title">Deploy a question paper</h3>
              </div>

              <DeployStepper step={deployStep} />

              {deployStep === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Paper title</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Physics Mid-term 2026"
                      value={paperTitle}
                      onChange={(e) => setPaperTitle(e.target.value)}
                      disabled={isUploadingStep}
                    />
                  </div>

                  <FileDropField
                    label="Question paper (PDF or image)"
                    files={questionPaperFiles}
                    onChange={setQuestionPaperFiles}
                    inputId="question-paper-input"
                    disabled={isUploadingStep}
                  />
                  {questionUploadPct !== null && <UploadProgressBar label="Question paper" pct={questionUploadPct} />}

                  <button className="btn btn-primary" onClick={handleUploadQuestionPaper} disabled={isUploadingStep} style={{ width: '100%', padding: '0.75rem' }}>
                    <Send className="size-4" />
                    <span>{isUploadingStep ? (questionUploadPct !== null && questionUploadPct < 100 ? `Uploading… ${questionUploadPct}%` : 'Processing…') : 'Upload & continue'}</span>
                  </button>
                </div>
              )}

              {deployStep === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ padding: '0.6rem 0.85rem', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '0.5rem', fontSize: '0.8125rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <CheckCircle2 className="size-4 shrink-0" />
                    <span>Question paper uploaded — {extractedQuestions.length} question(s) detected.</span>
                  </div>

                  <FileDropField
                    label="Answer key / marking scheme (PDF or image)"
                    files={answerKeyFiles}
                    onChange={setAnswerKeyFiles}
                    inputId="answer-key-input"
                    disabled={isUploadingStep}
                  />
                  {answerKeyUploadPct !== null && <UploadProgressBar label="Answer key" pct={answerKeyUploadPct} />}
                  <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '-0.5rem' }}>
                    Used only to grade scanned answer sheets against this paper — never shown to students or teachers.
                  </p>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-secondary" onClick={() => setDeployStep(1)} disabled={isUploadingStep}>
                      <span>← Back</span>
                    </button>
                    <button className="btn btn-secondary" onClick={handleSkipAnswerKey} disabled={isUploadingStep}>
                      <span>Skip</span>
                    </button>
                    <button className="btn btn-primary" onClick={handleUploadAnswerKey} disabled={isUploadingStep} style={{ flex: 1 }}>
                      <Send className="size-4" />
                      <span>{isUploadingStep ? (answerKeyUploadPct !== null && answerKeyUploadPct < 100 ? `Uploading… ${answerKeyUploadPct}%` : 'Processing…') : 'Upload & continue'}</span>
                    </button>
                  </div>
                </div>
              )}

              {deployStep === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ padding: '0.85rem', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '0.5rem' }}>
                    <div style={{ fontWeight: 700, color: '#111827', marginBottom: '0.35rem' }}>{paperTitle}</div>
                    <div style={{ fontSize: '0.8125rem', color: '#64748B' }}>
                      {extractedQuestions.length} question(s) detected · {extractedAnswerKeyText ? 'Answer key attached' : 'No answer key'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-secondary" onClick={() => setDeployStep(2)} disabled={isFinalizing}>
                      <span>← Back</span>
                    </button>
                    <button className="btn btn-primary" onClick={handleFinalizeDeploy} disabled={isFinalizing} style={{ flex: 1, padding: '0.75rem' }}>
                      <Send className="size-4" />
                      <span>{isFinalizing ? 'Deploying…' : 'Deploy paper to this class'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="m-card">
              <div className="m-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="m-card-title">Subject Question Papers ({assignments.length})</h3>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => navigate(`/generator?classId=${classId}&classSubjectId=${classSubjectId}&subject=${encodeURIComponent(subjectName)}&className=${encodeURIComponent(className)}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem' }}
                >
                  <Plus className="size-3.5" />
                  <span>New Paper</span>
                </button>
              </div>
              {assignments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748B' }}>
                  <FileText className="size-8 text-slate-300 mx-auto" style={{ margin: '0 auto 0.5rem auto' }} />
                  <p style={{ fontWeight: 600, color: '#334155', margin: 0 }}>No question papers created or deployed yet.</p>
                  <p style={{ fontSize: '0.8125rem', color: '#94A3B8', marginTop: '0.25rem' }}>
                    Generate an aligned board paper using AI, or deploy your scanned question paper on the left.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => navigate(`/generator?classId=${classId}&classSubjectId=${classSubjectId}&subject=${encodeURIComponent(subjectName)}&className=${encodeURIComponent(className)}`)}
                    style={{ marginTop: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <Sparkles className="size-3.5" />
                    <span>Generate Question Paper with AI</span>
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {assignments.map((a) => {
                    const qCount = (a.questions || []).length;
                    const marks = (a.questions || []).reduce((s: number, q: any) => s + (Number(q.marks) || 1), 0);
                    const isDispatched = a.status === 'dispatched';

                    return (
                      <div
                        key={a.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.75rem',
                          padding: '0.75rem 1rem',
                          background: '#FFFFFF',
                          borderRadius: '0.5rem',
                          border: '1px solid #E2E8F0',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.925rem', color: '#111827' }}>{a.title}</div>
                            <span style={{ 
                              fontSize: '0.68rem', 
                              fontWeight: 700, 
                              padding: '0.1rem 0.45rem', 
                              borderRadius: '0.25rem',
                              background: isDispatched ? '#DCFCE7' : '#FEF3C7',
                              color: isDispatched ? '#166534' : '#92400E',
                              border: isDispatched ? '1px solid #BBF7D0' : '1px solid #FDE68A'
                            }}>
                              {isDispatched ? 'Dispatched' : 'Saved Draft'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.25rem' }}>
                            {qCount} question(s) • {marks} Total Marks • {a.answerKeyText ? 'Answer key attached' : 'Standard rubric'}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            title="Edit or review in Question Paper Generator"
                            onClick={() => navigate(`/generator?classId=${classId}&classSubjectId=${classSubjectId}&subject=${encodeURIComponent(subjectName)}&paperId=${a.id}`)}
                            style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                          >
                            <Edit3 className="size-3 text-blue-600" />
                            <span>Edit Paper</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            title="Open paper details and grading queue"
                            onClick={() => navigate(`/papers/${a.id}?classId=${classId}&classSubjectId=${classSubjectId}`)}
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                          >
                            <span>Open & Grade</span>
                            <ChevronRight className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'queue' && (
          <div style={{ margin: '-1.5rem -2rem' }}>
            <ReviewQueue onScanScript={() => setActiveTab('papers')} />
          </div>
        )}
      </div>
    </div>
  );
}

function DeployStepper({ step }: { step: 1 | 2 | 3 }) {
  const steps: Array<{ n: 1 | 2 | 3; label: string }> = [
    { n: 1, label: 'Question paper' },
    { n: 2, label: 'Answer key' },
    { n: 3, label: 'Review & deploy' }
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.25rem' }}>
      {steps.map((s, i) => (
        <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : '0 0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <div
              style={{
                width: '1.6rem',
                height: '1.6rem',
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                fontSize: '0.75rem',
                fontWeight: 700,
                flexShrink: 0,
                background: step > s.n ? '#22C55E' : step === s.n ? '#2563EB' : '#E2E8F0',
                color: step >= s.n ? 'white' : '#64748B'
              }}
            >
              {step > s.n ? '✓' : s.n}
            </div>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: step === s.n ? '#111827' : '#94A3B8', whiteSpace: 'nowrap' }}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: '2px', background: step > s.n ? '#22C55E' : '#E2E8F0', margin: '0 0.75rem' }} />
          )}
        </div>
      ))}
    </div>
  );
}

function UploadProgressBar({ label, pct }: { label: string; pct: number }) {
  const isProcessing = pct >= 100;
  return (
    <div style={{ marginTop: '-0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748B', marginBottom: '0.25rem' }}>
        <span>{label} {isProcessing ? '— processing on server…' : 'upload'}</span>
        <span>{isProcessing ? '' : `${pct}%`}</span>
      </div>
      <div style={{ width: '100%', height: '6px', background: '#E2E8F0', borderRadius: '9999px', overflow: 'hidden' }}>
        <div
          className={isProcessing ? 'upload-bar-processing' : undefined}
          style={{ width: `${pct}%`, height: '100%', background: '#2563EB', borderRadius: '9999px', transition: 'width 0.2s ease' }}
        />
      </div>
    </div>
  );
}

function FileDropField({
  label,
  files,
  onChange,
  inputId,
  disabled
}: {
  label: string;
  files: File[];
  onChange: (files: File[]) => void;
  inputId: string;
  disabled?: boolean;
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div
        className="scan-dropzone"
        style={{ padding: '1rem', cursor: disabled ? 'wait' : 'pointer' }}
        onClick={() => !disabled && document.getElementById(inputId)?.click()}
      >
        <input
          id={inputId}
          type="file"
          accept="image/*,.pdf,application/pdf"
          multiple
          style={{ display: 'none' }}
          disabled={disabled}
          onChange={(e) => e.target.files && onChange(Array.from(e.target.files))}
        />
        {files.length === 0 ? (
          <>
            <Upload className="size-5 text-blue-600" />
            <p style={{ fontSize: '0.8125rem', color: '#64748B', margin: 0 }}>Click to attach (JPG, PNG, WEBP or PDF)</p>
          </>
        ) : (
          <>
            <CheckCircle2 className="size-5 text-emerald-500" />
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827', margin: 0 }}>
              {files.length} file{files.length > 1 ? 's' : ''} attached
            </p>
          </>
        )}
      </div>
      {files.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }}>
          {files.map((f, i) => (
            <span key={i} className="badge badge-blue" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              {f.name}
              <X
                className="size-3"
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(files.filter((_, idx) => idx !== i));
                }}
              />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
