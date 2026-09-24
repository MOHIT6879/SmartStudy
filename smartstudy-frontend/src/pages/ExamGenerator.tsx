import React, { useEffect, useState } from 'react';
import { 
  Sparkles, 
  Printer, 
  Send, 
  Camera, 
  FileText, 
  Plus, 
  Trash2,
  Clock
} from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import LanguageSelect from '../components/LanguageSelect';

type SubjectOption = { id: string; name: string; grade?: string; board?: string; className?: string };

export default function ExamGenerator() {
  const [subject, setSubject] = useState('');
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [newSubject, setNewSubject] = useState('');
  const [newSubjectGrade, setNewSubjectGrade] = useState('');
  const [newSubjectBoard, setNewSubjectBoard] = useState('');
  const [paperTitle, setPaperTitle] = useState('');
  const [difficulty, setDifficulty] = useState('Medium');
  const [paperLanguage, setPaperLanguage] = useState('English');
  const [numQuestions, setNumQuestions] = useState(5);
  const [minutes, setMinutes] = useState(60);
  const [focusTopics, setFocusTopics] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [showAnswerKey, setShowAnswerKey] = useState(true);
  const [isExtractingPhoto, setIsExtractingPhoto] = useState(false);
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');

  // Questions List
  const [questions, setQuestions] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/subjects`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.subjects)) {
          setSubjects(data.subjects);
          if (data.subjects.length > 0) setSubject(data.subjects[0].name);
        }
      })
      .catch((err) => console.error('Unable to load subjects:', err));
  }, []);

  const handleAddSubject = async () => {
    const name = newSubject.trim();
    if (!name) return;
    if (!newSubjectGrade.trim()) {
      alert('Enter the grade / class for this subject so papers and knowledge base material can be matched to it.');
      return;
    }
    const res = await fetch(`${API_BASE_URL}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, grade: newSubjectGrade.trim(), board: newSubjectBoard.trim() })
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || 'Unable to add subject.');
      return;
    }
    setSubjects((current) => [...current.filter((item) => item.name !== data.subject.name), data.subject].sort((a, b) => a.name.localeCompare(b.name)));
    setSubject(data.subject.name);
    setNewSubject('');
    setNewSubjectGrade('');
    setNewSubjectBoard('');
  };

  const activeSubject = subjects.find((item) => item.name === subject);
  // Every request keys off the subject's own stored class, never a hardcoded grade.
  const activeClassName = activeSubject?.className || activeSubject?.name || subject;

  const handleGeneratePaper = async () => {
    if (!subject) {
      alert('Select or add a subject first.');
      return;
    }
    setIsGenerating(true);
    try {
      const formData = new FormData();
      formData.append('className', activeClassName);
      formData.append('topic', paperTitle || 'Mid-term Assessment');
      formData.append('subjectLanguage', paperLanguage);
      formData.append('numQuestions', numQuestions.toString());
      if (focusTopics) formData.append('subTopicScope', focusTopics);

      const res = await fetch(`${API_BASE_URL}/api/rag/generate`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.questions) && data.questions.length > 0) {
        setQuestions(data.questions.map((q: any, i: number) => ({
          id: `gen-${i}`,
          text: q.text || q.question || 'Explain the concept in detail.',
          marks: q.marks || 5,
          correctAnswer: q.correctAnswer || q.answerKey || 'Reference answer from indexed textbook.'
        })));
      } else {
        alert('Generated paper preview ready.');
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to AI Question Paper generator.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    setIsExtractingPhoto(true);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append('questionPaper', f));
      formData.append('subject', subject);
      formData.append('className', activeClassName);
      formData.append('subjectLanguage', paperLanguage);

      const res = await fetch(`${API_BASE_URL}/api/rag/extract-questions-from-image`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.questions) && data.questions.length > 0) {
        setQuestions(prev => [...prev, ...data.questions.map((q: any, i: number) => ({
          id: q.id || `photo-${Date.now()}-${i}`,
          text: q.text || q,
          marks: Number(q.marks) || 0,
          section: q.section || q.part || 'Questions',
          number: q.number,
          partLabel: q.partLabel,
          questionNo: q.questionNo,
          stem: q.stem,
          hasVisual: q.hasVisual,
          stimulus: q.stimulus,
          correctAnswer: q.correctAnswer || 'Extracted reference answer'
        }))]);
        alert(`✅ Extracted ${data.questions.length} question parts from the question paper!`);
      }
    } catch (err) {
      console.error(err);
      alert('Error extracting questions from photo.');
    } finally {
      setIsExtractingPhoto(false);
      e.target.value = '';
    }
  };

  const handleDispatch = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: paperTitle,
          className: activeClassName,
          subject,
          language: paperLanguage,
          difficulty,
          durationMinutes: minutes,
          questions
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('✅ Exam dispatched to Student Portal & WhatsApp alerts sent!');
      }
    } catch (err) {
      console.error(err);
      alert('Error dispatching assignment.');
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      
      {/* Sticky Top Header Banner */}
      <header className="page-top-bar no-print">
        <div className="page-top-bar-text">
          <h1>Exam paper generator</h1>
          <p>Build a fresh paper from your uploaded lesson material and past questions</p>
        </div>
        <div className="page-top-bar-actions">
          <button 
            className="btn btn-secondary"
            onClick={() => window.print()}
            disabled={questions.length === 0}
          >
            <Printer className="size-4" />
            <span>Print</span>
          </button>
          <button 
            className="btn btn-primary"
            onClick={handleDispatch}
            disabled={questions.length === 0}
          >
            <Send className="size-4" />
            <span>Dispatch to Students</span>
          </button>
        </div>
      </header>

      <div className="page-container">
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '1.5rem', alignItems: 'start' }}>
          
          {/* Left Column: Blueprint Form */}
          <div className="m-card no-print">
            <div className="m-card-header">
              <h3 className="m-card-title">Blueprint</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Subject</label>
                <select 
                  className="form-select"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                >
                  <option value="">Select a subject</option>
                  {subjects.map((item) => <option key={item.id} value={item.name}>{item.className || item.name}</option>)}
                </select>
                {subject && (
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: activeSubject?.grade ? '#475569' : '#B45309' }}>
                    {activeSubject?.grade
                      ? `Class key: ${activeClassName}${activeSubject?.board ? ` • ${activeSubject.board}` : ''}`
                      : 'This subject has no grade configured, so knowledge base matching may be unreliable. Re-add it with a grade.'}
                  </p>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    className="form-input"
                    style={{ flex: '2 1 10rem' }}
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    placeholder="Subject name"
                  />
                  <input
                    type="text"
                    className="form-input"
                    style={{ flex: '1 1 7rem' }}
                    value={newSubjectGrade}
                    onChange={(e) => setNewSubjectGrade(e.target.value)}
                    placeholder="Grade / class"
                  />
                  <input
                    type="text"
                    className="form-input"
                    style={{ flex: '1 1 7rem' }}
                    value={newSubjectBoard}
                    onChange={(e) => setNewSubjectBoard(e.target.value)}
                    placeholder="Board (optional)"
                  />
                  <button type="button" className="btn btn-secondary" onClick={handleAddSubject} disabled={!newSubject.trim() || !newSubjectGrade.trim()}>
                    <Plus className="size-4" />
                    <span>Add</span>
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Paper title</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Physics Mid-term 2025"
                  value={paperTitle}
                  onChange={(e) => setPaperTitle(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Question paper language</label>
                <LanguageSelect value={paperLanguage} onChange={setPaperLanguage} />
              </div>

              <div className="form-group">
                <label className="form-label">Difficulty</label>
                <select 
                  className="form-select"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Questions</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    min={1} 
                    max={20}
                    value={numQuestions}
                    onChange={(e) => setNumQuestions(Number(e.target.value))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Minutes</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    min={15} 
                    max={180}
                    value={minutes}
                    onChange={(e) => setMinutes(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Focus topics (optional)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Newton's laws, projectile motion"
                  value={focusTopics}
                  onChange={(e) => setFocusTopics(e.target.value)}
                />
              </div>

              <button 
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem' }}
                onClick={handleGeneratePaper}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <Clock className="size-4 animate-spin" />
                    <span>Synthesizing from Knowledge Base...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    <span>Generate paper</span>
                  </>
                )}
              </button>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                <label 
                  className="btn btn-outline btn-sm"
                  style={{ flex: 1, cursor: 'pointer', textAlign: 'center' }}
                >
                  <Camera className="size-3.5" />
                  <span>{isExtractingPhoto ? 'Extracting...' : 'Upload PDF / Photos'}</span>
                  <input 
                    type="file" 
                    accept="image/*,application/pdf" 
                    multiple
                    style={{ display: 'none' }}
                    onChange={handlePhotoUpload}
                    disabled={isExtractingPhoto}
                  />
                </label>

                <button 
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => setIsPasteModalOpen(true)}
                >
                  <FileText className="size-3.5" />
                  <span>Paste Text</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Paper Preview */}
          <div className="m-card">
            <div className="m-card-header">
              <h3 className="m-card-title">Paper preview</h3>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={showAnswerKey}
                    onChange={(e) => setShowAnswerKey(e.target.checked)}
                  />
                  <span>Answer key</span>
                </label>

                <button 
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    const newQ = {
                      id: `q-${Date.now()}`,
                      text: 'Type question here...',
                      marks: 5,
                      correctAnswer: 'Type expected answer key here...'
                    };
                    setQuestions([...questions, newQ]);
                  }}
                >
                  <Plus className="size-3.5" />
                  <span>Add Q</span>
                </button>
              </div>
            </div>

            {/* Print Header */}
            <div style={{ borderBottom: '2px solid #0F172A', paddingBottom: '0.75rem', marginBottom: '1.25rem', textAlign: 'center' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, textTransform: 'uppercase', margin: 0 }}>
                {paperTitle}
              </h2>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: '#64748B', marginTop: '0.35rem' }}>
                <span>Subject: {subject}</span>
                <span>Time Allowed: {minutes} Minutes</span>
                <span>Max Marks: {questions.reduce((a, b) => a + (b.marks || 5), 0)}</span>
              </div>
            </div>

            {/* Questions List */}
            {questions.length === 0 ? (
              <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#64748B' }}>
                <p style={{ margin: 0, fontWeight: 600 }}>Choose a subject and generate a paper</p>
                <p style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>
                  Questions are drawn from your uploaded lessons and RAG textbook knowledge base.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {questions.map((q, idx) => (
                  <div key={q.id || idx} style={{ padding: '1rem', background: '#F8FAFC', borderRadius: '0.5rem', border: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                      <span style={{ fontWeight: 800, color: '#2563EB', fontSize: '0.875rem' }}>
                        {q.questionNo ? `Question ${q.questionNo}` : `Question ${idx + 1}`} ({q.marks || 5} Marks)
                      </span>
                      <button 
                        style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}
                        onClick={() => setQuestions(questions.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>

                    {q.stem && q.stem !== questions[idx - 1]?.stem && (
                      <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', color: '#475569', whiteSpace: 'pre-wrap', maxHeight: '8rem', overflowY: 'auto', paddingLeft: '0.6rem', borderLeft: '3px solid #CBD5E1' }}>
                        {q.stem}
                      </p>
                    )}

                    {Array.isArray(q.stimulus) && q.stimulus.length > 0 && (
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                        {q.stimulus.filter((item: any) => item?.url).map((item: any, imageIndex: number) => (
                          <a key={item.url} href={item.url} target="_blank" rel="noreferrer">
                            <img src={item.url} alt={item.caption || `Reference ${imageIndex + 1}`} style={{ width: '110px', borderRadius: '0.375rem', border: '1px solid #CBD5E1' }} />
                          </a>
                        ))}
                      </div>
                    )}

                    <input 
                      type="text" 
                      className="form-input"
                      style={{ fontWeight: 600, background: 'white' }}
                      value={q.text}
                      onChange={(e) => {
                        const updated = [...questions];
                        updated[idx].text = e.target.value;
                        setQuestions(updated);
                      }}
                    />

                    {showAnswerKey && (
                      <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: '#EFF6FF', borderRadius: '0.375rem', border: '1px solid #BFDBFE' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#1E40AF' }}>
                          Answer Key & Rubric:
                        </span>
                        <input 
                          type="text" 
                          className="form-input" 
                          style={{ fontSize: '0.8125rem', marginTop: '0.25rem', background: 'white' }}
                          value={q.correctAnswer || ''}
                          onChange={(e) => {
                            const updated = [...questions];
                            updated[idx].correctAnswer = e.target.value;
                            setQuestions(updated);
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

          </div>

        </div>
      </div>

      {/* Paste Modal */}
      {isPasteModalOpen && (
        <div className="modal-overlay" onClick={() => setIsPasteModalOpen(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>Paste Custom Questions</h3>
            <p style={{ fontSize: '0.8125rem', color: '#64748B', marginBottom: '1rem' }}>
              Paste questions below. Each line starting with a number will be imported as a question.
            </p>
            <textarea 
              className="form-textarea"
              rows={6}
              placeholder="1. State Bohr's postulates of Hydrogen atom.&#10;2. Calculate the Rydberg constant."
              value={pastedText}
              onChange={e => setPastedText(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setIsPasteModalOpen(false)}>Cancel</button>
              <button 
                className="btn btn-primary"
                onClick={() => {
                  if (pastedText.trim()) {
                    const lines = pastedText.split('\n').filter(l => l.trim().length > 0);
                    const newQs = lines.map((line, i) => ({
                      id: `paste-${Date.now()}-${i}`,
                      text: line.replace(/^\d+[\.\)]\s*/, ''),
                      marks: 5,
                      correctAnswer: 'Benchmark answer reference'
                    }));
                    setQuestions(prev => [...prev, ...newQs]);
                    setPastedText('');
                    setIsPasteModalOpen(false);
                  }
                }}
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
