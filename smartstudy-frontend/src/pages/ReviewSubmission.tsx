import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, FileText, Maximize2, Minus, Plus, RefreshCw, Save, Sparkles } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';

type ReviewQuestion = {
  questionNo: string; section: string; questionText: string; benchmarkKey: string;
  studentAnswerSnippet: string; scorePercent: number; marks: number;
  earnedMarks: number; status: string; reasoning: string; feedback: string;
};
const marksOf = (question: any) => Number.isFinite(Number(question?.marks)) && Number(question.marks) >= 0 ? Number(question.marks) : 0;

export default function ReviewSubmission() {
  const { id } = useParams<{ id: string }>();
  const [submission, setSubmission] = useState<any>(null);
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [hint, setHint] = useState('');
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/submissions`).then((res) => res.json()).then((data) => {
      const found = data.submissions?.find((item: any) => item.id === id);
      if (!found) return;
      const evaluations = found.aiEvaluation?.questionEvaluations || [];
      const assigned = found.assignment?.questions || [];
      const source = assigned.length > 0 ? assigned : evaluations;
      setSubmission(found);
      setFeedback(found.finalFeedback || found.aiEvaluation?.feedback || '');
      setHint(found.finalHint || found.aiEvaluation?.socraticHint || '');
      setApproved(found.status === 'approved');
      setQuestions(source.map((question: any, index: number) => {
        const evaluation = evaluations.find((item: any) => item.questionNo === `Q${index + 1}`) || evaluations[index] || {};
        const marks = marksOf(question);
        const scorePercent = Number(evaluation.scorePercent) || 0;
        return {
          questionNo: question.questionNo || question.number || `Q${index + 1}`,
          section: question.section || question.part || question.sectionName || evaluation.section || 'Questions',
          questionText: question.text || evaluation.questionText || `Question ${index + 1}`,
          benchmarkKey: question.correctAnswer || question.rubricKey || evaluation.benchmarkKey || 'No benchmark key provided.',
          studentAnswerSnippet: evaluation.studentAnswerSnippet || 'No answer detected in the scanned paper.',
          scorePercent, marks,
          earnedMarks: Number.isFinite(Number(evaluation.earnedMarks)) ? Number(evaluation.earnedMarks) : Math.round(marks * scorePercent) / 100,
          status: evaluation.status || (scorePercent >= 90 ? 'Full Credit' : scorePercent > 0 ? 'Partial Credit' : 'Unrelated / No Credit'),
          reasoning: evaluation.reasoning || 'No examiner note provided.',
          feedback: evaluation.feedback || evaluation.reasoning || 'Review the benchmark key and add the missing concepts.'
        };
      }));
    }).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  const imageUrls = useMemo<string[]>(() => {
    if (!submission) return [];
    const urls = submission.samplePaperUrls || submission.sample_paper_urls;
    if (Array.isArray(urls)) return urls;
    return submission.samplePaperUrl ? [submission.samplePaperUrl] : [];
  }, [submission]);
  const totalMarks = questions.reduce((sum, question) => sum + question.marks, 0);
  const totalEarned = questions.reduce((sum, question) => sum + question.earnedMarks, 0);
  const current = questions[selectedIndex];
  const updateCurrent = (changes: Partial<ReviewQuestion>) => {
    setQuestions((items) => items.map((item, index) => index === selectedIndex ? { ...item, ...changes } : item));
  };
  const approve = async () => {
    const response = await fetch(`${API_BASE_URL}/api/submissions/${id}/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback, socraticHint: hint, score: Math.round(totalEarned * 100) / 100 })
    });
    if ((await response.json()).success) { setApproved(true); alert('Grades approved.'); }
  };
  if (loading) return <div style={{ padding: '3rem', textAlign: 'center' }}>Loading review workspace...</div>;
  if (!submission) return <div style={{ padding: '3rem', textAlign: 'center' }}><h2>Submission not found</h2><Link to="/submissions">Back to queue</Link></div>;

  const groups = Array.from(new Map(questions.map((question) => [question.section, questions.filter((item) => item.section === question.section)])).entries())
    .map(([label, items]) => ({ label, items }));
  const studentName = submission.studentName || 'Student';
  const title = submission.assignment?.title || submission.subject || 'Assessment';

  return <div className="review-workspace">
    <header className="review-header">
      <div className="review-student"><Link to="/submissions" title="Back to review queue"><ArrowLeft size={21} /></Link><div><h1>{studentName}</h1><p>Roll: {submission.rollNumber || '02'} • {title}</p></div></div>
      <div className="review-header-actions"><span><FileText size={15} /> Question Paper</span><span><FileText size={15} /> Answer Key</span><span className="review-lenient">♡ Lenient</span><strong>Total: {totalEarned.toFixed(2)} / {totalMarks}</strong><button className="btn btn-primary" onClick={approve} disabled={approved}>{approved ? 'Approved' : 'Approve'}</button></div>
    </header>
    <div className="review-columns">
      <aside className="review-questions"><h3>QUESTIONS</h3>{groups.map((group) => <div className="question-group" key={group.label}><div className="question-group-header"><span>{group.label}<small>{group.items.length} questions</small></span><small>{group.items.reduce((sum, q) => sum + q.earnedMarks, 0).toFixed(2)}/{group.items.reduce((sum, q) => sum + q.marks, 0)}</small></div>{group.items.map((question) => { const index = questions.indexOf(question); return <button className={index === selectedIndex ? 'question-link selected' : 'question-link'} key={question.questionNo} onClick={() => setSelectedIndex(index)}><b>{question.questionNo}</b><span>{question.earnedMarks.toFixed(2)}/{question.marks}</span></button>; })}</div>)}</aside>
      <main className="review-sheet"><div className="review-toolbar"><strong><FileText size={16} /> Answer Sheet</strong><div><button title="Zoom out" onClick={() => setZoom(Math.max(.7, zoom - .1))}><Minus size={16} /></button><button title="Zoom in" onClick={() => setZoom(Math.min(2, zoom + .1))}><Plus size={16} /></button><button title="Reset zoom" onClick={() => setZoom(1)}><RefreshCw size={16} /></button><button title="Open full size" onClick={() => imageUrls[page] && window.open(imageUrls[page], '_blank')}><Maximize2 size={16} /></button><button title="Download" onClick={() => imageUrls[page] && window.open(imageUrls[page], '_blank')}><Download size={16} /></button></div></div><div className="review-image">{imageUrls[page] ? <img src={imageUrls[page]} alt="Student answer sheet" style={{ transform: `scale(${zoom})` }} /> : <p>No answer sheet image available.</p>}</div>{imageUrls.length > 1 && <div className="review-pages">{imageUrls.map((_, index) => <button className={page === index ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'} key={index} onClick={() => setPage(index)}>Page {index + 1}</button>)}</div>}</main>
      <section className="review-detail">{current ? <><div className="review-card"><div className="review-question-title"><div><h2>{current.questionNo}</h2><p>{current.questionText}</p></div><span>{current.marks} marks</span></div></div><div className="review-card"><h3><Sparkles size={16} /> AI Evaluation</h3><p>{current.feedback}</p><p className="review-success">✓ {current.status}</p><p className="review-note">{current.reasoning}</p></div><div className="review-card review-comparison"><div><strong>Benchmark reference key</strong><p>{current.benchmarkKey}</p></div><div><strong>Student answer</strong><p>{current.studentAnswerSnippet}</p></div></div><div className="review-card"><div className="review-card-heading"><h3>Marks</h3><span>AI: {current.earnedMarks.toFixed(2)} / {current.marks}</span></div><div className="marks-input"><input aria-label="Earned marks" type="number" min="0" max={current.marks} step="0.25" value={current.earnedMarks} onChange={(event) => updateCurrent({ earnedMarks: Math.min(current.marks, Math.max(0, Number(event.target.value) || 0)) })} /><strong>/ {current.marks}</strong></div><button className="btn btn-outline full-button" onClick={() => alert('Marks are included when you approve the submission.')}><Save size={16} /> Save Marks</button></div><div className="review-card"><h3>Overall feedback</h3><textarea className="form-textarea" rows={3} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Add teacher feedback" /><textarea className="form-textarea" rows={2} value={hint} onChange={(event) => setHint(event.target.value)} placeholder="Socratic hint" /></div></> : <div className="review-card">No question-level evaluation is available.</div>}</section>
    </div>
  </div>;
}
