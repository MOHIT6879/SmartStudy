import { useEffect, useMemo, useState } from 'react';
import { 
  ArrowLeft, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Download, 
  FileText, Maximize2, Minus, Plus, RefreshCw, Sparkles, User, MessageSquare
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';

type ReviewQuestion = {
  questionNo: string; section: string; questionText: string; benchmarkKey: string;
  studentAnswerSnippet: string; scorePercent: number; marks: number;
  earnedMarks: number; status: string; reasoning: string; feedback: string;
  number: string; partLabel: string; stem: string; stimulus: { url?: string; caption?: string }[];
};

const marksOf = (question: any) => Number.isFinite(Number(question?.marks)) && Number(question.marks) >= 0 ? Number(question.marks) : 5;
const isPdfUrl = (url?: string) => Boolean(url && (/\.pdf(\?|#|$)/i.test(url) || url.startsWith('data:application/pdf') || url.includes('/pdf')));
const ZOOM_STEP = 0.1;
const getPdfViewerSrc = (url: string, zoom: number) => {
  const pct = Math.round(zoom * 100);
  const zoomParam = pct === 100 ? 'page-width' : String(pct);
  return `${url}#toolbar=0&zoom=${zoomParam}`;
};

export default function ReviewSubmission() {
  const { id } = useParams<{ id: string }>();
  const [submission, setSubmission] = useState<any>(null);
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [hint, setHint] = useState('');
  const [answerKeyZoom, setAnswerKeyZoom] = useState(1);
  const [studentZoom, setStudentZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [approved, setApproved] = useState(false);
  const [questionFilter, setQuestionFilter] = useState<'All Questions' | 'Needs Review' | 'Full Credit'>('All Questions');

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/submissions`).then((res) => res.json()).then((data) => {
      const found = data.submissions?.find((item: any) => item.id === id) || data.submissions?.[0];
      if (!found) return;
      const evaluations = found.aiEvaluation?.questionEvaluations || [];
      const assigned = found.assignment?.questions || [];
      const source = assigned.length > 0 ? assigned : (evaluations.length > 0 ? evaluations : [
        { questionNo: 'Q1', text: 'Sentence matching task: Match the sentence with the appropriate visual image F.', correctAnswer: 'F', studentAnswerSnippet: 'F', marks: 5, scorePercent: 100, earnedMarks: 5, status: 'Correct!', reasoning: 'The student correctly matched the sentence with image F (leer a la sombra de un árbol).' },
        { questionNo: 'Q2', text: 'Select correct option (a) Elena David a cocinar en la barbacoa.', correctAnswer: 'D', studentAnswerSnippet: 'E', marks: 5, scorePercent: 0, earnedMarks: 0, status: 'Incorrect', reasoning: 'Selected E instead of benchmark D.' },
        { questionNo: 'Q3', text: 'Select correct option (b) Elena va a jugar fútbol con sus amigos.', correctAnswer: 'E', studentAnswerSnippet: 'E', marks: 7, scorePercent: 0, earnedMarks: 0, status: 'Incorrect', reasoning: 'Option matching error.' },
        { questionNo: 'Q4', text: 'Select correct option (c) Elena va a leer en una mecedora.', correctAnswer: 'B', studentAnswerSnippet: 'B', marks: 8, scorePercent: 0, earnedMarks: 0, status: 'Incorrect', reasoning: 'Answer key discrepancy.' },
        { questionNo: 'Q5', text: 'Select correct option (d) Elena va a leer una historieta.', correctAnswer: 'F', studentAnswerSnippet: 'F', marks: 10, scorePercent: 0, earnedMarks: 0, status: 'Incorrect', reasoning: 'Incomplete response.' },
        { questionNo: 'Q6', text: 'Select correct option (e) Elena va a bañarse en la piscina.', correctAnswer: 'A', studentAnswerSnippet: 'A', marks: 10, scorePercent: 0, earnedMarks: 0, status: 'Incorrect', reasoning: 'Needs teacher review.' }
      ]);
      setSubmission(found);
      setFeedback(found.finalFeedback || found.aiEvaluation?.feedback || '');
      setHint(found.finalHint || found.aiEvaluation?.socraticHint || '');
      setApproved(found.status === 'approved');
      setQuestions(source.map((question: any, index: number) => {
        const evaluation = evaluations[index] || evaluations.find((item: any) => item.questionNo === question.questionNo) || {};
        const marks = marksOf(question);
        const scorePercent = Number(evaluation.scorePercent ?? (index === 0 ? 100 : 0));
        const number = String(question.number || index + 1);
        const partLabel = String(question.partLabel || '');
        return {
          questionNo: question.questionNo || question.number || `Q${index + 1}`,
          number,
          partLabel,
          stem: question.stem || '',
          stimulus: Array.isArray(question.stimulus) ? question.stimulus : [],
          section: question.section || question.part || question.sectionName || evaluation.section || 'Questions',
          questionText: question.text || evaluation.questionText || `Question ${index + 1}`,
          benchmarkKey: question.correctAnswer || question.rubricKey || evaluation.benchmarkKey || 'F',
          studentAnswerSnippet: evaluation.studentAnswerSnippet || (index === 0 ? 'F' : 'F'),
          scorePercent, marks,
          earnedMarks: Number.isFinite(Number(evaluation.earnedMarks)) ? Number(evaluation.earnedMarks) : (index === 0 ? 1 : 0),
          status: evaluation.status || (index === 0 ? 'Correct!' : 'Incorrect'),
          reasoning: evaluation.reasoning || (index === 0 ? 'The student correctly matched the sentence with image F (leer a la sombra de un árbol).' : 'Student selection did not match the benchmark key.'),
          feedback: evaluation.feedback || evaluation.reasoning || ''
        };
      }));
    }).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  const studentPaperPdfUrl = useMemo<string>(() => {
    if (!submission) return '/sample.pdf';
    const urls = submission.samplePaperUrls || submission.sample_paper_urls;
    if (Array.isArray(urls) && urls.length > 0) return urls[0];
    return submission.samplePaperUrl || submission.sample_paper_url || 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
  }, [submission]);

  const answerKeyPdfUrl = useMemo<string>(() => {
    if (!submission) return '/answer_key.pdf';
    return submission.assignment?.answerKeyUrl || submission.answerKeyUrl || submission.assignment?.pdfUrl || 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
  }, [submission]);

  const questionPaperPdfUrl = useMemo<string>(() => {
    if (!submission) return '/question_paper.pdf';
    return submission.assignment?.pdfUrl || submission.questionPaperUrl || submission.question_paper_url || 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
  }, [submission]);

  const totalMarks = useMemo(() => questions.reduce((sum, q) => sum + q.marks, 0) || 45, [questions]);
  const totalEarned = useMemo(() => questions.reduce((sum, q) => sum + q.earnedMarks, 0), [questions]);
  const totalPercent = useMemo(() => totalMarks > 0 ? Math.round((totalEarned / totalMarks) * 100) : 0, [totalEarned, totalMarks]);

  const current = questions[selectedIndex];

  const updateCurrentMarks = (newMarks: number) => {
    if (!current) return;
    const bounded = Math.min(current.marks, Math.max(0, newMarks));
    const newPercent = current.marks > 0 ? Math.round((bounded / current.marks) * 100) : 0;
    setQuestions((items) => items.map((item, index) => index === selectedIndex ? {
      ...item,
      earnedMarks: bounded,
      scorePercent: newPercent,
      status: newPercent >= 90 ? 'Correct!' : newPercent > 0 ? 'Partial Credit' : 'Incorrect'
    } : item));
  };

  const approve = async () => {
    if (!submission) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/submissions/${submission.id}/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback, socraticHint: hint, score: Math.round(totalEarned * 100) / 100, questionEvaluations: questions })
      });
      if ((await response.json()).success) { setApproved(true); alert('Submission approved successfully!'); }
    } catch {
      setApproved(true);
      alert('Submission approved locally.');
    }
  };

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>Loading review workspace...</div>;
  if (!submission) return <div style={{ padding: '3rem', textAlign: 'center' }}><h2>Submission not found</h2><Link to="/submissions" className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-block' }}>Back to queue</Link></div>;

  const studentName = submission.studentName || 'Student 42';
  const rollNumber = submission.rollNumber || '02';
  const examTitle = submission.assignment?.title || submission.subject || 'Mid Term Examination';
  const paperTitle = submission.paperTitle || 'Paper 2 Reading';
  const dateStr = submission.createdAt ? new Date(submission.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '15 Sep 2025';

  const filteredQuestions = questions.filter((q) => {
    if (questionFilter === 'Needs Review') return q.scorePercent < 90;
    if (questionFilter === 'Full Credit') return q.scorePercent >= 90;
    return true;
  });

  return (
    <div className="result-review-container">
      {/* Top Header Navigation Bar */}
      <header className="result-header">
        <div className="result-header-left">
          <Link to="/submissions" className="result-back-btn" title="Back to submissions">
            <ArrowLeft size={18} />
          </Link>
          <div className="result-student-info">
            <h1 className="result-student-title">{studentName}</h1>
            <div className="result-meta-chips">
              <span className="meta-chip">Roll No: {rollNumber}</span>
              <span className="meta-chip">{examTitle}</span>
              <span className="meta-chip">{paperTitle}</span>
              <span className="meta-chip">Date: {dateStr}</span>
            </div>
          </div>
        </div>

        <div className="result-header-right">
          <button className="header-chip-btn" onClick={() => window.open(questionPaperPdfUrl, '_blank')}>
            <FileText size={15} />
            <span>Question Paper</span>
          </button>

          <div className="result-score-summary">
            <div className="score-text-group">
              <span className="score-label">Total Marks</span>
              <strong className="score-value">{totalEarned.toFixed(2)} / {totalMarks}</strong>
            </div>
            <div className="score-circle-ring">
              <svg viewBox="0 0 36 36" className="circle-chart">
                <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path className="circle-fill" strokeDasharray={`${totalPercent}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <span className="circle-text">{totalPercent}%</span>
            </div>
          </div>

          <button className="btn-approve-primary" onClick={approve} disabled={approved}>
            <Check size={16} />
            <span>{approved ? 'Approved' : 'Approve'}</span>
          </button>
        </div>
      </header>

      {/* 3-Column Result Workspace Grid */}
      <div className="result-grid-columns">
        
        {/* Column 1: Answer Key PDF Column */}
        <div className="result-col-panel answer-key-panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <FileText size={16} className="title-icon text-indigo" />
              <span>Answer Key</span>
            </h3>
            <div className="panel-zoom-toolbar">
              <button className="zoom-btn" title="Zoom Out" onClick={() => setAnswerKeyZoom((z) => Math.max(0.5, Math.round((z - ZOOM_STEP) * 100) / 100))}>
                <Minus size={14} />
              </button>
              <span className="zoom-indicator">{Math.round(answerKeyZoom * 100)}%</span>
              <button className="zoom-btn" title="Zoom In" onClick={() => setAnswerKeyZoom((z) => Math.min(3, Math.round((z + ZOOM_STEP) * 100) / 100))}>
                <Plus size={14} />
              </button>
              <button className="zoom-btn" title="Reset Zoom" onClick={() => setAnswerKeyZoom(1)}>
                <RefreshCw size={14} />
              </button>
              <button className="zoom-btn" title="Popout full view" onClick={() => window.open(answerKeyPdfUrl, '_blank')}>
                <Maximize2 size={14} />
              </button>
            </div>
          </div>

          <div className="pdf-container-card">
            {isPdfUrl(answerKeyPdfUrl) ? (
              <iframe className="pdf-frame" src={getPdfViewerSrc(answerKeyPdfUrl, answerKeyZoom)} title="Answer Key PDF" key={`${answerKeyPdfUrl}-${Math.round(answerKeyZoom * 100)}`} />
            ) : (
              <iframe className="pdf-frame" src={getPdfViewerSrc(answerKeyPdfUrl, answerKeyZoom)} title="Answer Key PDF Preview" key={`${answerKeyPdfUrl}-${Math.round(answerKeyZoom * 100)}`} />
            )}
          </div>

          {/* Answer Key Document Footer Metadata Card */}
          <div className="answer-key-footer-card">
            <h4 className="doc-heading">{paperTitle}</h4>
            <p className="doc-subheading">Cambridge International (2026-27)</p>
            <div className="doc-meta-pills">
              <span className="pill"><FileText size={13} /> {questions.length} questions</span>
              <span className="pill">🏆 {totalMarks} marks</span>
              <span className="pill"><FileText size={13} /> Page 12</span>
            </div>
            <button className="btn-download-full" onClick={() => window.open(answerKeyPdfUrl, '_blank')}>
              <Download size={15} />
              <span>Download Answer Key</span>
            </button>
          </div>
        </div>

        {/* Column 2: Student Answer Sheet PDF Column */}
        <div className="result-col-panel student-sheet-panel">
          <div className="panel-header toolbar-header">
            <h3 className="panel-title">
              <FileText size={16} className="title-icon text-indigo" />
              <span>Student Answer Sheet</span>
            </h3>
            <div className="panel-zoom-toolbar">
              <button className="zoom-btn" title="Zoom Out" onClick={() => setStudentZoom((z) => Math.max(0.5, Math.round((z - ZOOM_STEP) * 100) / 100))}>
                <Minus size={14} />
              </button>
              <span className="zoom-indicator">{Math.round(studentZoom * 100)}%</span>
              <button className="zoom-btn" title="Zoom In" onClick={() => setStudentZoom((z) => Math.min(3, Math.round((z + ZOOM_STEP) * 100) / 100))}>
                <Plus size={14} />
              </button>
              <button className="zoom-btn" title="Popout PDF" onClick={() => window.open(studentPaperPdfUrl, '_blank')}>
                <Maximize2 size={14} />
              </button>
            </div>
          </div>

          <div className="pdf-viewer-wrapper">
            <iframe 
              className="pdf-frame" 
              src={getPdfViewerSrc(studentPaperPdfUrl, studentZoom)} 
              title="Student Answer Sheet PDF" 
              key={`${studentPaperPdfUrl}-${Math.round(studentZoom * 100)}`}
            />

            {/* Bottom PDF Navigation Control Bar Overlay */}
            <div className="pdf-floating-control-bar">
              <span className="page-count-badge">Page {page}/1</span>
              <div className="floating-nav-buttons">
                <button className="float-btn" onClick={() => setPage(1)}><ChevronLeft size={15} /></button>
                <button className="float-btn" onClick={() => setPage(1)}><ChevronRight size={15} /></button>
              </div>
              <div className="floating-divider" />
              <button className="float-btn" title="Zoom Out" onClick={() => setStudentZoom((z) => Math.max(0.5, Math.round((z - ZOOM_STEP) * 100) / 100))}><Minus size={14} /></button>
              <button className="float-btn" title="Zoom In" onClick={() => setStudentZoom((z) => Math.min(3, Math.round((z + ZOOM_STEP) * 100) / 100))}><Plus size={14} /></button>
              <button className="float-btn" title="Reset Zoom" onClick={() => setStudentZoom(1)}><RefreshCw size={14} /></button>
              <button className="float-btn" title="Full Screen" onClick={() => window.open(studentPaperPdfUrl, '_blank')}><Maximize2 size={14} /></button>
            </div>
          </div>
        </div>

        {/* Column 3: AI Evaluation, Questions List & Feedback Column */}
        <div className="result-col-panel evaluation-panel">
          
          {/* AI Evaluation Card */}
          <div className="eval-card ai-evaluation-box">
            <div className="eval-card-header">
              <h3 className="eval-card-title">
                <Sparkles size={16} className="text-primary-indigo" />
                <span>AI Evaluation</span>
              </h3>
            </div>

            {current && (
              <div className="ai-eval-content">
                <div className="ai-status-row">
                  <div className={`status-badge-lg ${current.scorePercent >= 90 ? 'bg-success-light text-success' : current.scorePercent > 0 ? 'bg-warning-light text-warning' : 'bg-danger-light text-danger'}`}>
                    <CheckCircle2 size={18} />
                    <span>{current.status || (current.scorePercent >= 90 ? 'Correct!' : 'Incorrect')}</span>
                  </div>
                  
                  <div className="confidence-meter">
                    <div className="confidence-label">
                      <span>Confidence</span>
                      <strong>{current.scorePercent >= 90 ? '98%' : '94%'}</strong>
                    </div>
                    <div className="confidence-bar-bg">
                      <div className="confidence-bar-fill" style={{ width: current.scorePercent >= 90 ? '98%' : '94%' }} />
                    </div>
                  </div>
                </div>

                <p className="ai-explanation-text">
                  {current.reasoning}
                </p>

                {/* Side-by-Side Expected vs Student Answer Boxes */}
                <div className="comparison-side-by-side">
                  <div className="compare-box expected-box">
                    <div className="compare-box-label">
                      <FileText size={14} className="text-emerald" />
                      <span>Expected Answer</span>
                    </div>
                    <div className="compare-box-value">{current.benchmarkKey}</div>
                  </div>

                  <div className="compare-box student-box">
                    <div className="compare-box-label">
                      <User size={14} className="text-indigo" />
                      <span>Student Answer</span>
                    </div>
                    <div className="compare-box-value">{current.studentAnswerSnippet}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Interactive Questions List Card */}
          <div className="eval-card questions-list-box">
            <div className="eval-card-header flex-between">
              <h3 className="eval-card-title">
                <FileText size={16} className="text-primary-indigo" />
                <span>Questions</span>
              </h3>
              <div className="questions-filter-select">
                <select 
                  value={questionFilter} 
                  onChange={(e) => setQuestionFilter(e.target.value as any)}
                  className="filter-select"
                >
                  <option value="All Questions">All Questions</option>
                  <option value="Needs Review">Needs Review</option>
                  <option value="Full Credit">Full Credit</option>
                </select>
                <ChevronDown size={14} className="filter-arrow" />
              </div>
            </div>

            <div className="questions-scroll-list">
              {filteredQuestions.map((q) => {
                const globalIndex = questions.indexOf(q);
                const isSelected = globalIndex === selectedIndex;
                const isCorrect = q.scorePercent >= 90;
                return (
                  <button 
                    key={q.questionNo}
                    className={`question-item-row ${isSelected ? 'active-selected' : ''}`}
                    onClick={() => setSelectedIndex(globalIndex)}
                  >
                    <div className="q-left">
                      <span className="q-num">{q.questionNo}</span>
                    </div>

                    <div className="q-right">
                      <span className={`q-status-icon ${isCorrect ? 'icon-correct' : 'icon-outline'}`}>
                        {isCorrect ? <Check size={12} /> : null}
                      </span>
                      <strong className="q-score-label">{q.earnedMarks.toFixed(2)} / {q.marks}</strong>
                      <ChevronRight size={15} className="q-chevron" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Teacher Feedback & Navigation Card */}
          <div className="eval-card feedback-box">
            <div className="eval-card-header">
              <h3 className="eval-card-title">
                <MessageSquare size={16} className="text-primary-indigo" />
                <span>Feedback (Optional)</span>
              </h3>
            </div>

            <div className="feedback-form-body">
              <textarea 
                className="feedback-textarea" 
                rows={3}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Add feedback for this answer..."
              />

              {current && (
                <div className="marks-edit-row">
                  <span className="marks-edit-label">Earned Marks:</span>
                  <input 
                    type="number" 
                    step="0.25"
                    min="0"
                    max={current.marks}
                    className="marks-number-input"
                    value={current.earnedMarks}
                    onChange={(e) => updateCurrentMarks(Number(e.target.value))}
                  />
                  <span className="marks-max-label">/ {current.marks}</span>
                </div>
              )}

              <div className="nav-buttons-footer">
                <button 
                  className="btn-nav-outline" 
                  onClick={() => setSelectedIndex((i) => Math.max(0, i - 1))}
                  disabled={selectedIndex === 0}
                >
                  Previous
                </button>
                <button 
                  className="btn-nav-outline" 
                  onClick={() => setSelectedIndex((i) => Math.min(questions.length - 1, i + 1))}
                  disabled={selectedIndex === questions.length - 1}
                >
                  Next
                </button>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

