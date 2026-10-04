import { useEffect, useState } from 'react';
import { 
  Sparkles, 
  Printer, 
  Send, 
  FileText, 
  Clock, 
  Layers, 
  BookOpen, 
  CheckSquare, 
  Square,
  Plus,
  Minus,
  CheckCircle2,
  RotateCcw,
  FolderOpen,
  Save,
  Trash2,
  Search,
  X,
  Check
} from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import LanguageSelect from '../components/LanguageSelect';

type SubjectOption = { id: string; name: string; grade?: string; board?: string; className?: string };

export interface CurriculumChapter {
  id?: string;
  class_name: string;
  subject_name: string;
  chapter_number: number;
  chapter_title: string;
  subtopics: string[];
  chunk_count?: number;
}

export interface ChapterBlueprintState {
  mcq: number;   // 1m
  vsa: number;   // 2m
  sa: number;    // 3m
  long: number;  // 5m
}

export default function ExamGenerator() {
  // 1. Exam Configuration
  const [subject, setSubject] = useState('');
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [paperTitle, setPaperTitle] = useState('');
  const [targetExamMarks, setTargetExamMarks] = useState<number>(40);
  const [difficulty, setDifficulty] = useState('Standard');
  const [paperLanguage, setPaperLanguage] = useState('English');
  const [minutes, setMinutes] = useState(90);

  // 2. Chapters & Subtopics Loaded from DB
  const [chapters, setChapters] = useState<CurriculumChapter[]>([]);
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [selectedSubtopics, setSelectedSubtopics] = useState<string[]>([]);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);

  // 3. Topic Blueprint Allocations (MCQ 1m, VSA 2m, SA 3m, Long 5m per chapter)
  const [chapterBlueprints, setChapterBlueprints] = useState<Record<string, ChapterBlueprintState>>({});

  // 4. Generation & Questions State
  const [isGenerating, setIsGenerating] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);
  const [showAnswerKey, setShowAnswerKey] = useState(true);

  // 5. Saved Exam Papers & Printing State
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
  const [savedPapers, setSavedPapers] = useState<any[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [paperSearchTerm, setPaperSearchTerm] = useState('');
  const [includeAnswerKeyInPrint, setIncludeAnswerKeyInPrint] = useState(false);
  const [isSavingPaper, setIsSavingPaper] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // Derived 2D Summary Matrix Totals
  const totalMcq = selectedChapters.reduce((sum, ch) => sum + (chapterBlueprints[ch]?.mcq || 0), 0);
  const totalVsa = selectedChapters.reduce((sum, ch) => sum + (chapterBlueprints[ch]?.vsa || 0), 0);
  const totalSa = selectedChapters.reduce((sum, ch) => sum + (chapterBlueprints[ch]?.sa || 0), 0);
  const totalLong = selectedChapters.reduce((sum, ch) => sum + (chapterBlueprints[ch]?.long || 0), 0);

  const calculatedTotalMarks = (totalMcq * 1) + (totalVsa * 2) + (totalSa * 3) + (totalLong * 5);
  const totalQuestionsCount = totalMcq + totalVsa + totalSa + totalLong;

  // Auto-Distribute blueprint allocations across selected chapters to match target marks exactly
  const autoDistributeBlueprint = (target: number, selChapters: string[] = selectedChapters) => {
    if (!selChapters || selChapters.length === 0) {
      setChapterBlueprints({});
      return;
    }

    let qAlloc: { mcq: number; vsa: number; sa: number; long: number };
    if (target === 25) {
      qAlloc = { mcq: 5, vsa: 3, sa: 3, long: 1 }; // 5 + 6 + 9 + 5 = 25m
    } else if (target === 40) {
      qAlloc = { mcq: 10, vsa: 5, sa: 5, long: 1 }; // 10 + 10 + 15 + 5 = 40m
    } else if (target === 50) {
      qAlloc = { mcq: 10, vsa: 6, sa: 6, long: 2 }; // 10 + 12 + 18 + 10 = 50m
    } else if (target === 80) {
      qAlloc = { mcq: 20, vsa: 8, sa: 8, long: 4 }; // 20 + 16 + 24 + 20 = 80m
    } else if (target === 100) {
      qAlloc = { mcq: 25, vsa: 10, sa: 10, long: 5 }; // 25 + 20 + 30 + 25 = 100m
    } else {
      let rem = target;
      const long = rem >= 15 ? Math.max(1, Math.floor(rem / 20)) : 0;
      rem -= long * 5;
      const sa = rem >= 9 ? Math.max(1, Math.floor(rem / 6)) : 0;
      rem -= sa * 3;
      const vsa = rem >= 4 ? Math.max(1, Math.floor(rem / 4)) : 0;
      rem -= vsa * 2;
      const mcq = Math.max(0, rem);
      qAlloc = { mcq, vsa, sa, long };
    }

    const newBlueprints: Record<string, ChapterBlueprintState> = {};
    selChapters.forEach((title) => {
      newBlueprints[title] = { mcq: 0, vsa: 0, sa: 0, long: 0 };
    });

    const n = selChapters.length;
    for (let i = 0; i < qAlloc.long; i++) {
      newBlueprints[selChapters[i % n]].long += 1;
    }
    for (let i = 0; i < qAlloc.sa; i++) {
      newBlueprints[selChapters[(i + 1) % n]].sa += 1;
    }
    for (let i = 0; i < qAlloc.vsa; i++) {
      newBlueprints[selChapters[(i + 2) % n]].vsa += 1;
    }
    for (let i = 0; i < qAlloc.mcq; i++) {
      newBlueprints[selChapters[i % n]].mcq += 1;
    }

    setChapterBlueprints(newBlueprints);

    if (target <= 25) setMinutes(45);
    else if (target <= 40) setMinutes(90);
    else if (target <= 60) setMinutes(120);
    else setMinutes(180);
  };

  // Fetch subjects on mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/subjects`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.subjects)) {
          setSubjects(data.subjects);
          if (data.subjects.length > 0) {
            setSubject(data.subjects[0].name);
          }
        }
      })
      .catch((err) => console.error('Unable to load subjects:', err));
  }, []);

  const activeSubject = subjects.find((item) => item.name === subject);
  const activeClassName = activeSubject?.className || activeSubject?.name || subject;

  // Set default title when subject changes
  useEffect(() => {
    if (subject) {
      setPaperTitle(`${activeClassName} Examination`);
    }
  }, [subject, activeClassName]);

  // Load chapters & subtopics whenever subject changes
  useEffect(() => {
    if (!activeClassName || !subject) {
      setChapters([]);
      setSelectedChapters([]);
      setSelectedSubtopics([]);
      setChapterBlueprints({});
      return;
    }

    setIsLoadingChapters(true);
    fetch(`${API_BASE_URL}/api/rag/chapters?className=${encodeURIComponent(activeClassName)}&subjectName=${encodeURIComponent(subject)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.chapters) && data.chapters.length > 0) {
          setChapters(data.chapters);
          // Auto-select all chapters and subtopics by default
          const allChapterTitles = data.chapters.map((c: CurriculumChapter) => c.chapter_title);
          setSelectedChapters(allChapterTitles);
          const allSubs = data.chapters.flatMap((c: CurriculumChapter) => c.subtopics || []);
          setSelectedSubtopics(allSubs);
          // Populate initial balanced distribution for all chapters
          autoDistributeBlueprint(targetExamMarks, allChapterTitles);
        } else {
          setChapters([]);
          setSelectedChapters([]);
          setSelectedSubtopics([]);
          setChapterBlueprints({});
        }
      })
      .catch(() => {
        setChapters([]);
        setSelectedChapters([]);
        setSelectedSubtopics([]);
        setChapterBlueprints({});
      })
      .finally(() => setIsLoadingChapters(false));
  }, [activeClassName, subject]);

  // Stepper handlers
  const updateChapterQuestion = (chapterTitle: string, type: 'mcq' | 'vsa' | 'sa' | 'long', delta: number) => {
    setChapterBlueprints((prev) => {
      const current = prev[chapterTitle] || { mcq: 0, vsa: 0, sa: 0, long: 0 };
      const newVal = Math.max(0, (current[type] || 0) + delta);
      return {
        ...prev,
        [chapterTitle]: {
          ...current,
          [type]: newVal
        }
      };
    });
  };

  const setChapterQuestionCount = (chapterTitle: string, type: 'mcq' | 'vsa' | 'sa' | 'long', value: number) => {
    setChapterBlueprints((prev) => {
      const current = prev[chapterTitle] || { mcq: 0, vsa: 0, sa: 0, long: 0 };
      return {
        ...prev,
        [chapterTitle]: {
          ...current,
          [type]: Math.max(0, value)
        }
      };
    });
  };

  const resetAllBlueprints = () => {
    const cleared: Record<string, ChapterBlueprintState> = {};
    selectedChapters.forEach((title) => {
      cleared[title] = { mcq: 0, vsa: 0, sa: 0, long: 0 };
    });
    setChapterBlueprints(cleared);
  };

  // Toggle chapter selection
  const toggleChapter = (title: string, subtopics: string[] = []) => {
    if (selectedChapters.includes(title)) {
      setSelectedChapters((prev) => prev.filter((t) => t !== title));
      setSelectedSubtopics((prev) => prev.filter((st) => !subtopics.includes(st)));
    } else {
      setSelectedChapters((prev) => [...prev, title]);
      setSelectedSubtopics((prev) => Array.from(new Set([...prev, ...subtopics])));
      setChapterBlueprints((prev) => ({
        ...prev,
        [title]: prev[title] || { mcq: 0, vsa: 0, sa: 0, long: 0 }
      }));
    }
  };

  // Toggle subtopic selection
  const toggleSubtopic = (subtopic: string) => {
    if (selectedSubtopics.includes(subtopic)) {
      setSelectedSubtopics((prev) => prev.filter((s) => s !== subtopic));
    } else {
      setSelectedSubtopics((prev) => [...prev, subtopic]);
    }
  };

  // Select all / Deselect all
  const selectAllChapters = () => {
    const allTitles = chapters.map((c) => c.chapter_title);
    setSelectedChapters(allTitles);
    const allSubs = chapters.flatMap((c) => c.subtopics || []);
    setSelectedSubtopics(allSubs);
    autoDistributeBlueprint(targetExamMarks, allTitles);
  };

  const deselectAllChapters = () => {
    setSelectedChapters([]);
    setSelectedSubtopics([]);
  };

  const setTargetPreset = (target: number) => {
    setTargetExamMarks(target);
    autoDistributeBlueprint(target, selectedChapters);
  };

  // Single-Mode Unified Exam Generator Call with Blueprint payload
  const handleGenerateExamPaper = async () => {
    if (!subject) {
      alert('Please select a subject first.');
      return;
    }
    if (selectedChapters.length === 0) {
      alert('Please select at least 1 chapter/topic for the exam.');
      return;
    }
    if (totalQuestionsCount === 0 || calculatedTotalMarks === 0) {
      alert('Please configure at least 1 question in the blueprint or click "⚡ Auto-Fill Blueprint".');
      return;
    }

    setIsGenerating(true);
    try {
      const formattedBlueprint = selectedChapters.map((chTitle) => {
        const ch = chapters.find((c) => c.chapter_title === chTitle);
        const bp = chapterBlueprints[chTitle] || { mcq: 0, vsa: 0, sa: 0, long: 0 };
        const chSubs = ch?.subtopics ? ch.subtopics.filter((st) => selectedSubtopics.includes(st)) : [];
        return {
          topic: chTitle,
          chapterTitle: chTitle,
          chapterNumber: ch?.chapter_number,
          subtopics: chSubs,
          mcq: bp.mcq,
          mcqCount: bp.mcq,
          vsa: bp.vsa,
          veryShortCount: bp.vsa,
          sa: bp.sa,
          shortCount: bp.sa,
          long: bp.long,
          descriptiveCount: bp.long
        };
      });

      const payload = {
        examTitle: paperTitle || `${activeClassName} Examination`,
        targetMarks: calculatedTotalMarks,
        className: activeClassName,
        subjectName: subject,
        chapterTitles: selectedChapters,
        subtopics: selectedSubtopics,
        blueprint: formattedBlueprint,
        questionCounts: {
          mcqCount: totalMcq,
          veryShortCount: totalVsa,
          shortCount: totalSa,
          descriptiveCount: totalLong
        },
        language: paperLanguage,
        difficulty
      };

      console.log('📡 [EXAM GENERATOR UI] Requesting unified question paper generation:', payload);

      const res = await fetch(`${API_BASE_URL}/api/rag/generate-exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      console.log('📥 [EXAM GENERATOR UI] Response received:', data);

      if (data.success && Array.isArray(data.questions) && data.questions.length > 0) {
        setQuestions(data.questions);
        // Automatically save newly generated paper to history
        savePaperToStorage(data.questions, payload.examTitle);
        alert(`✅ Examination Paper Generated Successfully! (${data.totalQuestions} Questions, ${data.totalMarks} Marks)`);
      } else {
        alert(data.message || 'Error generating question paper.');
      }
    } catch (err) {
      console.error('❌ [EXAM GENERATOR UI] Request failed:', err);
      alert('Error connecting to Exam Generator endpoint.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Fetch saved exam papers from Supabase and LocalStorage
  const fetchSavedPapers = async () => {
    setIsLoadingSaved(true);
    try {
      let dbPapers: any[] = [];
      try {
        const res = await fetch(`${API_BASE_URL}/api/assignments`);
        const data = await res.json();
        if (data.success && Array.isArray(data.assignments)) {
          dbPapers = data.assignments.filter((a: any) => Array.isArray(a.questions) && a.questions.length > 0);
        }
      } catch (err) {
        console.warn('Unable to fetch assignments from API:', err);
      }

      let localPapers: any[] = [];
      try {
        const raw = localStorage.getItem('smartstudy_saved_exam_papers');
        if (raw) {
          localPapers = JSON.parse(raw);
        }
      } catch (e) {
        console.warn('Unable to parse localStorage saved papers:', e);
      }

      const seenIds = new Set<string>();
      const combined: any[] = [];

      // Local papers first (most recent)
      if (Array.isArray(localPapers)) {
        localPapers.forEach((p) => {
          if (p && p.id && !seenIds.has(p.id)) {
            seenIds.add(p.id);
            combined.push(p);
          }
        });
      }

      // Supabase DB papers next
      if (Array.isArray(dbPapers)) {
        dbPapers.forEach((p) => {
          if (p && p.id && !seenIds.has(p.id)) {
            seenIds.add(p.id);
            const totalM = (p.questions || []).reduce((s: number, q: any) => s + (Number(q.marks) || 1), 0);
            combined.push({
              id: p.id,
              title: p.title || 'Untitled Exam Paper',
              className: p.className || '',
              subject: p.subject || '',
              language: p.language || 'English',
              difficulty: p.difficulty || 'Standard',
              durationMinutes: p.durationMinutes || 90,
              targetMarks: totalM,
              totalQuestions: (p.questions || []).length,
              questions: p.questions || [],
              createdAt: p.createdAt || new Date().toISOString(),
              status: p.status || 'saved'
            });
          }
        });
      }

      setSavedPapers(combined);
    } catch (err) {
      console.error('Error fetching saved papers:', err);
    } finally {
      setIsLoadingSaved(false);
    }
  };

  // Run on mount to discover saved papers
  useEffect(() => {
    fetchSavedPapers();
  }, []);

  // Save paper to LocalStorage and backend
  const savePaperToStorage = async (customQuestions?: any[], customTitle?: string) => {
    const qList = customQuestions || questions;
    const tTitle = customTitle || paperTitle || `${activeClassName} Examination`;
    if (!qList || qList.length === 0) return;

    const paperId = 'paper-' + Date.now();
    const newPaperRecord = {
      id: paperId,
      title: tTitle,
      className: activeClassName,
      subject,
      language: paperLanguage,
      difficulty,
      durationMinutes: minutes,
      targetMarks: calculatedTotalMarks || qList.reduce((s: number, q: any) => s + (Number(q.marks) || 1), 0),
      totalQuestions: qList.length,
      questions: qList,
      blueprint: chapterBlueprints,
      selectedChapters,
      createdAt: new Date().toISOString(),
      status: 'saved'
    };

    // 1. Local storage save
    try {
      const existingRaw = localStorage.getItem('smartstudy_saved_exam_papers');
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      const updated = [newPaperRecord, ...existing.filter((p: any) => p.title !== tTitle)];
      localStorage.setItem('smartstudy_saved_exam_papers', JSON.stringify(updated.slice(0, 50)));
    } catch (e) {
      console.warn('localStorage error:', e);
    }

    // 2. Persist to backend without sending notifications
    try {
      await fetch(`${API_BASE_URL}/api/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: tTitle,
          className: activeClassName,
          subject,
          language: paperLanguage,
          difficulty,
          durationMinutes: minutes,
          questions: qList,
          status: 'saved'
        })
      });
    } catch (e) {
      console.warn('Backend save notice:', e);
    }

    setSavedPapers((prev) => [newPaperRecord, ...prev.filter((p) => p.title !== tTitle)]);
  };

  const handleSavePaper = async () => {
    if (!questions || questions.length === 0) {
      alert('No questions to save. Please generate or load questions first.');
      return;
    }
    setIsSavingPaper(true);
    await savePaperToStorage(questions, paperTitle);
    setIsSavingPaper(false);
    setSaveSuccessMsg(`💾 Question paper "${paperTitle || 'Examination'}" saved successfully!`);
    setTimeout(() => setSaveSuccessMsg(''), 4000);
  };

  const handleLoadPaper = (paper: any) => {
    if (!paper || !Array.isArray(paper.questions) || paper.questions.length === 0) {
      alert('Selected paper has no questions.');
      return;
    }

    setQuestions(paper.questions);
    if (paper.title) setPaperTitle(paper.title);
    if (paper.subject) setSubject(paper.subject);
    if (paper.targetMarks) setTargetExamMarks(paper.targetMarks);
    if (paper.durationMinutes) setMinutes(paper.durationMinutes);
    if (paper.difficulty) setDifficulty(paper.difficulty);
    if (paper.language) setPaperLanguage(paper.language);

    if (paper.blueprint && typeof paper.blueprint === 'object') {
      setChapterBlueprints(paper.blueprint);
    }
    if (Array.isArray(paper.selectedChapters) && paper.selectedChapters.length > 0) {
      setSelectedChapters(paper.selectedChapters);
    }

    setIsLoadModalOpen(false);
    setSaveSuccessMsg(`✅ Loaded "${paper.title}" with ${paper.questions.length} questions!`);
    setTimeout(() => setSaveSuccessMsg(''), 4000);
  };

  const handleDeleteSavedPaper = async (paperId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to remove this saved paper?')) return;

    try {
      const existingRaw = localStorage.getItem('smartstudy_saved_exam_papers');
      if (existingRaw) {
        const existing = JSON.parse(existingRaw);
        const updated = existing.filter((p: any) => p.id !== paperId);
        localStorage.setItem('smartstudy_saved_exam_papers', JSON.stringify(updated));
      }
    } catch (e) {}

    try {
      await fetch(`${API_BASE_URL}/api/assignments/${paperId}`, { method: 'DELETE' });
    } catch (e) {}

    setSavedPapers((prev) => prev.filter((p) => p.id !== paperId));
  };

  // Dispatch Assignment
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
          questions,
          status: 'dispatched'
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('✅ Exam dispatched to Student Portal & WhatsApp notification sent!');
      }
    } catch (err) {
      console.error(err);
      alert('Error dispatching assignment.');
    }
  };

  // Group questions by section for structured display
  const sectionsMap: Record<string, any[]> = questions.reduce((acc: Record<string, any[]>, q: any) => {
    const sec = q.section || 'General Questions';
    if (!acc[sec]) acc[sec] = [];
    acc[sec].push(q);
    return acc;
  }, {});

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      
      {/* Top Banner Header */}
      <header className="page-top-bar no-print">
        <div className="page-top-bar-text">
          <h1>Exam Question Paper Generator</h1>
          <p>Single streamlined mode: select class, subject, chapters & subtopics, configure question counts, and generate aligned question papers.</p>
        </div>
        <div className="page-top-bar-actions">
          <button 
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setIsLoadModalOpen(true);
              fetchSavedPapers();
            }}
            title="Load previously created or generated question papers"
          >
            <FolderOpen className="size-4 text-amber-600" />
            <span>Load Saved Papers {savedPapers.length > 0 ? `(${savedPapers.length})` : ''}</span>
          </button>
          <button 
            type="button"
            className="btn btn-secondary"
            onClick={() => window.print()}
            disabled={questions.length === 0}
            title={questions.length === 0 ? "Generate or load a question paper first" : "Print Board Examination Paper"}
          >
            <Printer className="size-4 text-blue-600" />
            <span>Print Paper</span>
          </button>
          <button 
            type="button"
            className="btn btn-secondary"
            onClick={handleSavePaper}
            disabled={questions.length === 0 || isSavingPaper}
            title="Save current question paper to history"
          >
            <Save className="size-4 text-emerald-600" />
            <span>{isSavingPaper ? 'Saving...' : 'Save Paper'}</span>
          </button>
          <button 
            type="button"
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
        
        {/* MAIN WORKFLOW GRID */}
        <div className="exam-grid-container" style={{ display: 'grid', gridTemplateColumns: 'minmax(420px, 520px) 1fr', gap: '1.5rem', alignItems: 'start' }}>
          
          {/* LEFT PANEL: CONFIGURATION & TOPIC SELECTOR */}
          <div className="exam-left-panel no-print" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* CARD 1: EXAM DETAILS */}
            <div className="m-card">
              <div className="m-card-header">
                <h3 className="m-card-title" style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileText className="size-4 text-blue-600" />
                  <span>1. Examination Details</span>
                </h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {/* Subject Selector */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Select Subject & Class</label>
                  <select 
                    className="form-select"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  >
                    <option value="">-- Choose Subject --</option>
                    {subjects.map((item) => (
                      <option key={item.id} value={item.name}>
                        {item.name} {item.grade ? `(${item.grade})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Exam Title */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Exam Title</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Class 10 Science Mid-Term Assessment"
                    value={paperTitle}
                    onChange={(e) => setPaperTitle(e.target.value)}
                  />
                </div>

                {/* Target Marks & Quick Presets */}
                <div className="form-group" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, margin: 0 }}>Target Exam Marks</label>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1D4ED8' }}>{targetExamMarks} Marks</span>
                  </div>
                  
                  {/* Preset Pills */}
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                    {[25, 40, 50, 80, 100].map((m) => (
                      <button
                        key={m}
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{
                          padding: '0.2rem 0.5rem',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: targetExamMarks === m ? '#EFF6FF' : 'white',
                          borderColor: targetExamMarks === m ? '#3B82F6' : '#CBD5E1',
                          color: targetExamMarks === m ? '#1D4ED8' : '#475569'
                        }}
                        onClick={() => setTargetPreset(m)}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>

                  <input 
                    type="number"
                    min={5}
                    max={200}
                    className="form-input"
                    value={targetExamMarks}
                    onChange={(e) => {
                      const val = Math.max(1, Number(e.target.value));
                      setTargetExamMarks(val);
                    }}
                    style={{ fontSize: '0.85rem', fontWeight: 700 }}
                  />
                </div>

                {/* Language, Difficulty, Duration */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Language</label>
                    <LanguageSelect value={paperLanguage} onChange={setPaperLanguage} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Difficulty</label>
                    <select 
                      className="form-select"
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value)}
                    >
                      <option value="Standard">Standard Board</option>
                      <option value="Easy">Foundational / Easy</option>
                      <option value="Hard">Advanced / HOTS</option>
                    </select>
                  </div>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Duration (Minutes)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    min={15} 
                    max={240}
                    value={minutes}
                    onChange={(e) => setMinutes(Number(e.target.value))}
                    style={{ fontSize: '0.85rem' }}
                  />
                </div>

              </div>
            </div>

            {/* CARD 2: TOPIC & CHAPTER BLUEPRINT CARDS */}
            <div className="m-card">
              <div className="m-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                <h3 className="m-card-title" style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Layers className="size-4 text-blue-600" />
                  <span>2. Topic Blueprint Cards</span>
                </h3>

                {chapters.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      onClick={() => autoDistributeBlueprint(targetExamMarks, selectedChapters)}
                      title="Auto-distribute marks across selected topics"
                    >
                      <Sparkles className="size-3.5 text-blue-600" />
                      <span>⚡ Auto-Fill</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem' }}
                      onClick={selectAllChapters}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem' }}
                      onClick={deselectAllChapters}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {isLoadingChapters ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748B' }}>
                  <Clock className="size-5 animate-spin mx-auto mb-1 text-blue-600" />
                  <span style={{ fontSize: '0.8rem' }}>Loading chapters from Knowledge Base...</span>
                </div>
              ) : chapters.length === 0 ? (
                <div style={{ padding: '1rem', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '0.375rem', fontSize: '0.8rem', color: '#92400E' }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>⚠️ No chapters uploaded yet for this subject.</p>
                  <p style={{ margin: '0.25rem 0 0 0' }}>
                    Visit the <strong>Knowledge Base</strong> tab to upload your Chapter PDFs. You can still generate questions using default board curriculum.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '480px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                  {chapters.map((ch, idx) => {
                    const isSelected = selectedChapters.includes(ch.chapter_title);
                    const bp = chapterBlueprints[ch.chapter_title] || { mcq: 0, vsa: 0, sa: 0, long: 0 };
                    const topicTotal = (bp.mcq * 1) + (bp.vsa * 2) + (bp.sa * 3) + (bp.long * 5);

                    return (
                      <div 
                        key={ch.id || idx}
                        style={{
                          padding: '0.75rem',
                          background: isSelected ? '#FFFFFF' : '#F8FAFC',
                          border: isSelected ? '1.5px solid #93C5FD' : '1px solid #E2E8F0',
                          borderRadius: '0.5rem',
                          boxShadow: isSelected ? '0 1px 3px rgba(37, 99, 235, 0.08)' : 'none',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem'
                        }}
                      >
                        {/* Top row: Checkbox + Title + Topic Total Badge */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                          <div 
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', flex: 1 }}
                            onClick={() => toggleChapter(ch.chapter_title, ch.subtopics)}
                          >
                            {isSelected ? (
                              <CheckSquare className="size-4 text-blue-600 flex-shrink-0" />
                            ) : (
                              <Square className="size-4 text-slate-400 flex-shrink-0" />
                            )}
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isSelected ? '#1E3A8A' : '#64748B' }}>
                              📘 {ch.chapter_number ? `${ch.chapter_number}. ` : ''}{ch.chapter_title}
                            </span>
                          </div>

                          {isSelected && (
                            <div style={{
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              background: topicTotal > 0 ? '#EFF6FF' : '#F1F5F9',
                              color: topicTotal > 0 ? '#1D4ED8' : '#94A3B8',
                              padding: '0.2rem 0.55rem',
                              borderRadius: '9999px',
                              border: topicTotal > 0 ? '1px solid #BFDBFE' : '1px solid #E2E8F0',
                              whiteSpace: 'nowrap'
                            }}>
                              Topic Total: {topicTotal}m
                            </div>
                          )}
                        </div>

                        {/* Steppers: MCQ (1m), VSA (2m), SA (3m), Long (5m) */}
                        {isSelected && (
                          <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.35rem', marginTop: '0.2rem' }}>
                              
                              {/* MCQ (1m) */}
                              <div style={{ background: '#F8FAFC', padding: '0.4rem 0.25rem', borderRadius: '0.375rem', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
                                  MCQ (1m)
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.15rem' }}>
                                  <button
                                    type="button"
                                    onClick={() => updateChapterQuestion(ch.chapter_title, 'mcq', -1)}
                                    style={{
                                      width: '22px',
                                      height: '22px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      borderRadius: '0.25rem',
                                      border: '1px solid #CBD5E1',
                                      background: '#FFFFFF',
                                      cursor: 'pointer',
                                      fontWeight: 700,
                                      color: '#475569'
                                    }}
                                  >
                                    <Minus className="size-3 text-slate-600" />
                                  </button>
                                  <input
                                    type="number"
                                    min={0}
                                    max={30}
                                    value={bp.mcq}
                                    onChange={(e) => setChapterQuestionCount(ch.chapter_title, 'mcq', parseInt(e.target.value) || 0)}
                                    style={{
                                      width: '28px',
                                      textAlign: 'center',
                                      border: 'none',
                                      background: 'transparent',
                                      fontWeight: 800,
                                      fontSize: '0.8rem',
                                      color: bp.mcq > 0 ? '#1D4ED8' : '#64748B',
                                      padding: 0
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateChapterQuestion(ch.chapter_title, 'mcq', 1)}
                                    style={{
                                      width: '22px',
                                      height: '22px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      borderRadius: '0.25rem',
                                      border: '1px solid #93C5FD',
                                      background: '#EFF6FF',
                                      cursor: 'pointer',
                                      fontWeight: 700,
                                      color: '#1D4ED8'
                                    }}
                                  >
                                    <Plus className="size-3 text-blue-600" />
                                  </button>
                                </div>
                                <div style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '0.2rem', fontWeight: 600 }}>
                                  = {bp.mcq * 1} Marks
                                </div>
                              </div>

                              {/* VSA (2m) */}
                              <div style={{ background: '#F8FAFC', padding: '0.4rem 0.25rem', borderRadius: '0.375rem', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
                                  VSA (2m)
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.15rem' }}>
                                  <button
                                    type="button"
                                    onClick={() => updateChapterQuestion(ch.chapter_title, 'vsa', -1)}
                                    style={{
                                      width: '22px',
                                      height: '22px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      borderRadius: '0.25rem',
                                      border: '1px solid #CBD5E1',
                                      background: '#FFFFFF',
                                      cursor: 'pointer',
                                      fontWeight: 700,
                                      color: '#475569'
                                    }}
                                  >
                                    <Minus className="size-3 text-slate-600" />
                                  </button>
                                  <input
                                    type="number"
                                    min={0}
                                    max={30}
                                    value={bp.vsa}
                                    onChange={(e) => setChapterQuestionCount(ch.chapter_title, 'vsa', parseInt(e.target.value) || 0)}
                                    style={{
                                      width: '28px',
                                      textAlign: 'center',
                                      border: 'none',
                                      background: 'transparent',
                                      fontWeight: 800,
                                      fontSize: '0.8rem',
                                      color: bp.vsa > 0 ? '#1D4ED8' : '#64748B',
                                      padding: 0
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateChapterQuestion(ch.chapter_title, 'vsa', 1)}
                                    style={{
                                      width: '22px',
                                      height: '22px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      borderRadius: '0.25rem',
                                      border: '1px solid #93C5FD',
                                      background: '#EFF6FF',
                                      cursor: 'pointer',
                                      fontWeight: 700,
                                      color: '#1D4ED8'
                                    }}
                                  >
                                    <Plus className="size-3 text-blue-600" />
                                  </button>
                                </div>
                                <div style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '0.2rem', fontWeight: 600 }}>
                                  = {bp.vsa * 2} Marks
                                </div>
                              </div>

                              {/* SA (3m) */}
                              <div style={{ background: '#F8FAFC', padding: '0.4rem 0.25rem', borderRadius: '0.375rem', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
                                  SA (3m)
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.15rem' }}>
                                  <button
                                    type="button"
                                    onClick={() => updateChapterQuestion(ch.chapter_title, 'sa', -1)}
                                    style={{
                                      width: '22px',
                                      height: '22px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      borderRadius: '0.25rem',
                                      border: '1px solid #CBD5E1',
                                      background: '#FFFFFF',
                                      cursor: 'pointer',
                                      fontWeight: 700,
                                      color: '#475569'
                                    }}
                                  >
                                    <Minus className="size-3 text-slate-600" />
                                  </button>
                                  <input
                                    type="number"
                                    min={0}
                                    max={20}
                                    value={bp.sa}
                                    onChange={(e) => setChapterQuestionCount(ch.chapter_title, 'sa', parseInt(e.target.value) || 0)}
                                    style={{
                                      width: '28px',
                                      textAlign: 'center',
                                      border: 'none',
                                      background: 'transparent',
                                      fontWeight: 800,
                                      fontSize: '0.8rem',
                                      color: bp.sa > 0 ? '#1D4ED8' : '#64748B',
                                      padding: 0
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateChapterQuestion(ch.chapter_title, 'sa', 1)}
                                    style={{
                                      width: '22px',
                                      height: '22px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      borderRadius: '0.25rem',
                                      border: '1px solid #93C5FD',
                                      background: '#EFF6FF',
                                      cursor: 'pointer',
                                      fontWeight: 700,
                                      color: '#1D4ED8'
                                    }}
                                  >
                                    <Plus className="size-3 text-blue-600" />
                                  </button>
                                </div>
                                <div style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '0.2rem', fontWeight: 600 }}>
                                  = {bp.sa * 3} Marks
                                </div>
                              </div>

                              {/* Long (5m) */}
                              <div style={{ background: '#F8FAFC', padding: '0.4rem 0.25rem', borderRadius: '0.375rem', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
                                  Long (5m)
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.15rem' }}>
                                  <button
                                    type="button"
                                    onClick={() => updateChapterQuestion(ch.chapter_title, 'long', -1)}
                                    style={{
                                      width: '22px',
                                      height: '22px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      borderRadius: '0.25rem',
                                      border: '1px solid #CBD5E1',
                                      background: '#FFFFFF',
                                      cursor: 'pointer',
                                      fontWeight: 700,
                                      color: '#475569'
                                    }}
                                  >
                                    <Minus className="size-3 text-slate-600" />
                                  </button>
                                  <input
                                    type="number"
                                    min={0}
                                    max={15}
                                    value={bp.long}
                                    onChange={(e) => setChapterQuestionCount(ch.chapter_title, 'long', parseInt(e.target.value) || 0)}
                                    style={{
                                      width: '28px',
                                      textAlign: 'center',
                                      border: 'none',
                                      background: 'transparent',
                                      fontWeight: 800,
                                      fontSize: '0.8rem',
                                      color: bp.long > 0 ? '#1D4ED8' : '#64748B',
                                      padding: 0
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateChapterQuestion(ch.chapter_title, 'long', 1)}
                                    style={{
                                      width: '22px',
                                      height: '22px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      borderRadius: '0.25rem',
                                      border: '1px solid #93C5FD',
                                      background: '#EFF6FF',
                                      cursor: 'pointer',
                                      fontWeight: 700,
                                      color: '#1D4ED8'
                                    }}
                                  >
                                    <Plus className="size-3 text-blue-600" />
                                  </button>
                                </div>
                                <div style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '0.2rem', fontWeight: 600 }}>
                                  = {bp.long * 5} Marks
                                </div>
                              </div>

                            </div>

                            {/* Target Subtopics Checklist */}
                            {Array.isArray(ch.subtopics) && ch.subtopics.length > 0 && (
                              <div style={{ marginTop: '0.35rem', paddingTop: '0.35rem', borderTop: '1px dashed #E2E8F0' }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', marginBottom: '0.25rem' }}>
                                  Target Subtopics:
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                  {ch.subtopics.map((st, sIdx) => {
                                    const isSubSelected = selectedSubtopics.includes(st);
                                    return (
                                      <button
                                        key={sIdx}
                                        type="button"
                                        onClick={() => toggleSubtopic(st)}
                                        style={{
                                          fontSize: '0.68rem',
                                          fontWeight: isSubSelected ? 600 : 400,
                                          padding: '0.15rem 0.45rem',
                                          borderRadius: '0.25rem',
                                          border: isSubSelected ? '1px solid #93C5FD' : '1px solid #E2E8F0',
                                          background: isSubSelected ? '#EFF6FF' : '#FFFFFF',
                                          color: isSubSelected ? '#1E40AF' : '#64748B',
                                          cursor: 'pointer',
                                          transition: 'all 0.15s ease'
                                        }}
                                      >
                                        {isSubSelected ? '✓ ' : ''}{st}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </>
                        )}

                      </div>
                    );
                  })}
                </div>
              )}

              {chapters.length > 0 && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748B', textAlign: 'right' }}>
                  <span>{selectedChapters.length}/{chapters.length} Topics Selected • {selectedSubtopics.length} Subtopics Active</span>
                </div>
              )}
            </div>

            {/* CARD 3: LIVE 2D SUMMARY MATRIX & ACTION */}
            <div className="m-card">
              <div className="m-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="m-card-title" style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sparkles className="size-4 text-blue-600" />
                  <span>3. Paper Blueprint Live Tally</span>
                </h3>
                <div style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  color: '#1D4ED8',
                  background: '#EFF6FF',
                  padding: '0.2rem 0.55rem',
                  borderRadius: '9999px',
                  border: '1px solid #BFDBFE'
                }}>
                  Target: {targetExamMarks} Marks
                </div>
              </div>

              {/* 2D Summary Rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                
                {/* Section A */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.45rem 0.65rem',
                  background: '#F8FAFC',
                  borderRadius: '0.375rem',
                  border: '1px solid #E2E8F0'
                }}>
                  <div style={{ fontSize: '0.78rem', color: '#334155' }}>
                    <strong style={{ color: '#0F172A' }}>Section A</strong> (MCQs 1m)
                  </div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1E293B' }}>
                    {totalMcq} {totalMcq === 1 ? 'Question' : 'Questions'} <span style={{ color: '#2563EB', marginLeft: '0.25rem' }}>= {totalMcq * 1} Marks</span>
                  </div>
                </div>

                {/* Section B */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.45rem 0.65rem',
                  background: '#F8FAFC',
                  borderRadius: '0.375rem',
                  border: '1px solid #E2E8F0'
                }}>
                  <div style={{ fontSize: '0.78rem', color: '#334155' }}>
                    <strong style={{ color: '#0F172A' }}>Section B</strong> (VSA 2m)
                  </div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1E293B' }}>
                    {totalVsa} {totalVsa === 1 ? 'Question' : 'Questions'} <span style={{ color: '#2563EB', marginLeft: '0.25rem' }}>= {totalVsa * 2} Marks</span>
                  </div>
                </div>

                {/* Section C */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.45rem 0.65rem',
                  background: '#F8FAFC',
                  borderRadius: '0.375rem',
                  border: '1px solid #E2E8F0'
                }}>
                  <div style={{ fontSize: '0.78rem', color: '#334155' }}>
                    <strong style={{ color: '#0F172A' }}>Section C</strong> (SA 3m)
                  </div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1E293B' }}>
                    {totalSa} {totalSa === 1 ? 'Question' : 'Questions'} <span style={{ color: '#2563EB', marginLeft: '0.25rem' }}>= {totalSa * 3} Marks</span>
                  </div>
                </div>

                {/* Section D */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.45rem 0.65rem',
                  background: '#F8FAFC',
                  borderRadius: '0.375rem',
                  border: '1px solid #E2E8F0'
                }}>
                  <div style={{ fontSize: '0.78rem', color: '#334155' }}>
                    <strong style={{ color: '#0F172A' }}>Section D</strong> (Long 5m)
                  </div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1E293B' }}>
                    {totalLong} {totalLong === 1 ? 'Question' : 'Questions'} <span style={{ color: '#2563EB', marginLeft: '0.25rem' }}>= {totalLong * 5} Marks</span>
                  </div>
                </div>

              </div>

              {/* TOTAL & PERFECT MATCH BADGE */}
              <div style={{
                marginTop: '0.65rem',
                padding: '0.65rem 0.75rem',
                borderRadius: '0.375rem',
                background: calculatedTotalMarks === targetExamMarks ? '#F0FDF4' : '#FEF3C7',
                border: calculatedTotalMarks === targetExamMarks ? '1.5px solid #86EFAC' : '1.5px solid #FCD34D',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: calculatedTotalMarks === targetExamMarks ? '#166534' : '#92400E' }}>
                    TOTAL: {totalQuestionsCount} Questions = {calculatedTotalMarks} / {targetExamMarks} Marks
                  </div>
                  <div style={{ fontSize: '0.72rem', color: calculatedTotalMarks === targetExamMarks ? '#15803D' : '#B45309', marginTop: '0.1rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    {calculatedTotalMarks === targetExamMarks ? (
                      <>
                        <CheckCircle2 className="size-3.5 text-emerald-600" />
                        <span>Perfect Match with Target Marks!</span>
                      </>
                    ) : (
                      <span>⚠️ Difference: {calculatedTotalMarks - targetExamMarks > 0 ? `+${calculatedTotalMarks - targetExamMarks}` : calculatedTotalMarks - targetExamMarks} Marks</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    onClick={resetAllBlueprints}
                    title="Reset all question counts to 0"
                  >
                    <RotateCcw className="size-3 text-slate-500" />
                    <span>Reset</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', fontWeight: 700 }}
                    onClick={() => autoDistributeBlueprint(targetExamMarks, selectedChapters)}
                    title="Auto-Fill balanced blueprint"
                  >
                    ⚡ Auto-Fill
                  </button>
                </div>
              </div>

              {/* ACTION: GENERATE QUESTION PAPER */}
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleGenerateExamPaper}
                disabled={isGenerating || totalQuestionsCount === 0}
                style={{ 
                  marginTop: '0.75rem', 
                  width: '100%', 
                  padding: '0.75rem', 
                  fontSize: '0.95rem', 
                  fontWeight: 700, 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
                }}
              >
                {isGenerating ? (
                  <>
                    <Clock className="size-5 animate-spin" />
                    <span>Generating Question Paper with Gemini...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="size-5" />
                    <span>Generate Question Paper ({calculatedTotalMarks}m)</span>
                  </>
                )}
              </button>
            </div>

          </div>

          {/* RIGHT PANEL: GENERATED QUESTION PAPER PREVIEW */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
            
            {/* Success Message Banner */}
            {saveSuccessMsg && (
              <div className="no-print" style={{ 
                padding: '0.65rem 1rem', 
                background: '#F0FDF4', 
                border: '1px solid #86EFAC', 
                color: '#15803D', 
                borderRadius: '0.375rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <CheckCircle2 className="size-4 text-emerald-600" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}

            <div className="m-card exam-preview-card" style={{ minHeight: '600px' }}>
              
              {/* Header Bar (HIDDEN DURING PRINT) */}
              <div className="m-card-header no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <h3 className="m-card-title" style={{ fontSize: '1.05rem', margin: 0 }}>
                    {paperTitle || 'Examination Paper Preview'}
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.2rem' }}>
                    {questions.length > 0 ? (
                      <span>{questions.length} Questions • {calculatedTotalMarks} Total Marks • {minutes} Minutes Allowed</span>
                    ) : (
                      <span>Configure your parameters on the left and click Generate</span>
                    )}
                  </div>
                </div>

                {questions.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', cursor: 'pointer' }} title="Toggle answer keys and model answers on screen">
                      <input 
                        type="checkbox" 
                        checked={showAnswerKey} 
                        onChange={(e) => setShowAnswerKey(e.target.checked)} 
                      />
                      <span>Show Answer Key</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 600, color: '#4F46E5', cursor: 'pointer' }} title="By default, print only includes questions. Check this only to print a teacher marking key.">
                      <input 
                        type="checkbox" 
                        checked={includeAnswerKeyInPrint} 
                        onChange={(e) => setIncludeAnswerKeyInPrint(e.target.checked)} 
                      />
                      <span>Print Answers (Teacher Key)</span>
                    </label>

                    <button 
                      type="button" 
                      className="btn btn-outline btn-sm"
                      onClick={() => setQuestions([])}
                      title="Clear paper preview"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {/* Paper Body */}
              {isGenerating ? (
                <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#64748B' }}>
                  <Sparkles className="size-10 text-blue-600 animate-spin mx-auto mb-3" />
                  <h4 style={{ fontSize: '1.1rem', color: '#1E293B', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Crafting Aligned Examination Paper</h4>
                  <p style={{ maxWidth: '420px', margin: '0 auto', fontSize: '0.85rem' }}>
                    Retrieving vector chunks for selected chapters and generating grounded questions, model answers, and marking rubrics...
                  </p>
                </div>
              ) : questions.length === 0 ? (
                <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#64748B' }}>
                  <BookOpen className="size-12 mx-auto mb-3 text-slate-300" />
                  <h4 style={{ fontSize: '1.1rem', color: '#334155', fontWeight: 700, margin: '0 0 0.5rem 0' }}>No Question Paper Generated Yet</h4>
                  <p style={{ maxWidth: '460px', margin: '0 auto', fontSize: '0.85rem' }}>
                    Select your Class, Subject, Chapters, and question typology breakdown on the left, then click <strong>"Generate Question Paper"</strong>.
                  </p>
                  <div style={{ marginTop: '1.25rem' }}>
                    <button 
                      type="button" 
                      className="btn btn-outline btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
                      onClick={() => { setIsLoadModalOpen(true); fetchSavedPapers(); }}
                    >
                      <FolderOpen className="size-4 text-amber-600" />
                      <span>Browse Saved & Previous Papers ({savedPapers.length})</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="printable-paper exam-paper-sheet" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  
                  {/* Formal Board Exam Paper Header */}
                  <div className="print-paper-header" style={{ textAlign: 'center', borderBottom: '2px solid #0F172A', paddingBottom: '0.75rem' }}>
                    <div className="print-school-name" style={{ fontSize: '1.35rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#0F172A' }}>
                      PAATAM.AI SENIOR SECONDARY SCHOOL
                    </div>
                    <div className="print-school-sub" style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>
                      AFFILIATED TO CENTRAL BOARD OF SECONDARY EDUCATION
                    </div>
                    <h2 className="print-exam-title" style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0.25rem 0', textTransform: 'uppercase', letterSpacing: '0.02em', color: '#1E293B' }}>
                      {paperTitle || `${activeClassName} Examination`}
                    </h2>
                    
                    {/* Metadata Grid */}
                    <div className="print-meta-grid" style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      marginTop: '0.5rem', 
                      padding: '0.4rem 0', 
                      borderTop: '1px solid #CBD5E1', 
                      borderBottom: '1px solid #CBD5E1', 
                      fontSize: '0.825rem', 
                      fontWeight: 700, 
                      color: '#0F172A' 
                    }}>
                      <span>CLASS: {activeClassName}</span>
                      <span>SUBJECT: {subject} ({paperLanguage})</span>
                      <span>TIME: {minutes} MINS</span>
                      <span>MAXIMUM MARKS: {calculatedTotalMarks}</span>
                    </div>

                    {/* Student Identification Box */}
                    <div className="print-student-box" style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      marginTop: '0.5rem', 
                      padding: '0.4rem 0.65rem', 
                      border: '1px solid #CBD5E1', 
                      borderRadius: '0.25rem', 
                      fontSize: '0.78rem', 
                      fontWeight: 600, 
                      color: '#334155' 
                    }}>
                      <span>Roll No.: _____________________</span>
                      <span>Student Name: ________________________________</span>
                      <span>Date: _______________</span>
                    </div>
                  </div>

                  {/* General Instructions */}
                  <div className="print-instructions-box" style={{ background: '#F8FAFC', padding: '0.65rem 0.85rem', borderRadius: '0.375rem', border: '1px solid #E2E8F0', fontSize: '0.75rem', color: '#334155' }}>
                    <div style={{ fontWeight: 800, marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>General Instructions:</div>
                    <ol style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: '1.45' }}>
                      <li>This question paper contains <strong>4 Sections</strong>: Section A, Section B, Section C, and Section D.</li>
                      {totalMcq > 0 && <li><strong>Section A</strong> comprises {totalMcq} Multiple Choice Questions carrying 1 mark each.</li>}
                      {totalVsa > 0 && <li><strong>Section B</strong> comprises {totalVsa} Very Short Answer Questions carrying 2 marks each.</li>}
                      {totalSa > 0 && <li><strong>Section C</strong> comprises {totalSa} Short Answer Questions carrying 3 marks each.</li>}
                      {totalLong > 0 && <li><strong>Section D</strong> comprises {totalLong} Long Answer Questions carrying 5 marks each.</li>}
                      <li>All questions are compulsory. Internal choices are provided where applicable.</li>
                      <li>Neat and clean presentation with legible handwriting is expected.</li>
                    </ol>
                  </div>

                  {/* Sections and Questions */}
                  {(Object.entries(sectionsMap) as [string, any[]][]).map(([sectionTitle, sectionQuestions]) => (
                    <div key={sectionTitle} className="print-section-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      
                      {/* Section Title Header */}
                      <div className="print-section-header" style={{ 
                        background: '#F1F5F9', 
                        padding: '0.4rem 0.75rem', 
                        borderRadius: '0.25rem', 
                        borderLeft: '4px solid #2563EB',
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        color: '#1E293B',
                        textTransform: 'uppercase',
                        letterSpacing: '0.02em'
                      }}>
                        {sectionTitle}
                      </div>

                      {/* Questions List */}
                      {sectionQuestions.map((q: any, idx: number) => (
                        <div 
                          key={q.id || idx}
                          className="print-question-block"
                          style={{
                            padding: '0.65rem 0.5rem',
                            borderBottom: '1px solid #E2E8F0',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.35rem',
                            pageBreakInside: 'avoid',
                            breakInside: 'avoid'
                          }}
                        >
                          {/* Question Text & Marks */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0F172A', lineHeight: '1.45', flex: 1 }}>
                              <span>Q{q.questionNo || q.number || idx + 1}. </span>
                              <span style={{ whiteSpace: 'pre-wrap' }}>{q.text}</span>
                              
                              {/* Stem Badge: ONLY in screen view, hidden in print! */}
                              {q.stem && (
                                <span className="no-print" style={{ marginLeft: '0.5rem', fontSize: '0.68rem', fontWeight: 600, color: '#1E40AF', background: '#DBEAFE', padding: '0.1rem 0.45rem', borderRadius: '0.25rem' }}>
                                  📘 {q.stem}
                                </span>
                              )}
                            </div>

                            {/* Marks indicator */}
                            <span className="print-marks-badge" style={{ 
                              fontSize: '0.75rem', 
                              fontWeight: 800, 
                              color: '#1D4ED8', 
                              background: '#EFF6FF', 
                              padding: '0.15rem 0.5rem', 
                              borderRadius: '0.25rem',
                              whiteSpace: 'nowrap'
                            }}>
                              [{q.marks} {q.marks === 1 ? 'Mark' : 'Marks'}]
                            </span>
                          </div>

                          {/* Options for MCQ */}
                          {Array.isArray(q.options) && q.options.length > 0 && (
                            <div className="print-mcq-options" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.35rem', marginTop: '0.25rem', paddingLeft: '1.25rem' }}>
                              {q.options.map((opt: string, optIdx: number) => (
                                <div key={optIdx} style={{ fontSize: '0.8rem', color: '#334155' }}>
                                  {opt}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Answer Key & Marking Scheme: hidden on print unless teacher explicitly enabled print answers */}
                          {showAnswerKey && (q.correctAnswer || q.rubricKey) && (
                            <div 
                              className={includeAnswerKeyInPrint ? 'answer-key-box' : 'answer-key-box no-print'}
                              style={{ 
                                marginTop: '0.4rem', 
                                padding: '0.5rem 0.75rem', 
                                background: '#F0FDF4', 
                                border: '1px solid #BBF7D0', 
                                borderRadius: '0.25rem',
                                fontSize: '0.75rem',
                                color: '#166534'
                              }}
                            >
                              {q.correctAnswer && (
                                <div>
                                  <strong>Model Answer: </strong>
                                  <span style={{ whiteSpace: 'pre-wrap' }}>{q.correctAnswer}</span>
                                </div>
                              )}
                              {q.rubricKey && (
                                <div style={{ marginTop: '0.2rem', color: '#15803D' }}>
                                  <strong>Marking Scheme / Rubric: </strong>
                                  <span>{q.rubricKey}</span>
                                </div>
                              )}
                            </div>
                          )}

                        </div>
                      ))}

                    </div>
                  ))}

                  {/* End of Question Paper marker */}
                  <div className="print-end-marker" style={{ textAlign: 'center', fontWeight: 800, fontSize: '0.85rem', color: '#475569', marginTop: '1rem', borderTop: '1px dashed #CBD5E1', paddingTop: '0.75rem', letterSpacing: '0.05em' }}>
                    *** END OF QUESTION PAPER ***
                  </div>

                </div>
              )}

            </div>

          </div>

        </div>

      </div>

      {/* 5. LOAD SAVED PAPERS MODAL DIALOG */}
      {isLoadModalOpen && (
        <div 
          className="no-print"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            backdropFilter: 'blur(3px)'
          }}
          onClick={() => setIsLoadModalOpen(false)}
        >
          <div 
            style={{
              background: '#FFFFFF',
              borderRadius: '0.75rem',
              width: '100%',
              maxWidth: '680px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid #E2E8F0',
              background: '#F8FAFC'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '0.5rem', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FolderOpen className="size-5 text-amber-600" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                    Saved & Previous Question Papers
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748B' }}>
                    Load any previously generated paper to review, print, or dispatch.
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setIsLoadModalOpen(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.25rem', color: '#64748B' }}
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Search Input Filter */}
            <div style={{ padding: '0.85rem 1.5rem', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#FFFFFF' }}>
              <Search className="size-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search by title, subject, or class..."
                value={paperSearchTerm}
                onChange={(e) => setPaperSearchTerm(e.target.value)}
                style={{ width: '100%', border: 'none', outline: 'none', fontSize: '0.85rem', color: '#0F172A' }}
              />
              {paperSearchTerm && (
                <button type="button" onClick={() => setPaperSearchTerm('')} style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer' }}>
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* Papers List */}
            <div style={{ padding: '1rem 1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
              {isLoadingSaved ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748B' }}>
                  <Clock className="size-8 animate-spin mx-auto mb-2 text-blue-600" />
                  <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>Loading saved question papers...</p>
                </div>
              ) : savedPapers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748B' }}>
                  <BookOpen className="size-10 mx-auto mb-2 text-slate-300" />
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155', margin: '0 0 0.25rem 0' }}>No Saved Papers Found</h4>
                  <p style={{ fontSize: '0.8rem', color: '#94A3B8', margin: 0 }}>
                    Any papers you generate or save will automatically appear here for quick loading.
                  </p>
                </div>
              ) : (
                (() => {
                  const filtered = savedPapers.filter((p) => {
                    if (!paperSearchTerm.trim()) return true;
                    const term = paperSearchTerm.toLowerCase();
                    return (
                      (p.title && p.title.toLowerCase().includes(term)) ||
                      (p.subject && p.subject.toLowerCase().includes(term)) ||
                      (p.className && p.className.toLowerCase().includes(term))
                    );
                  });

                  if (filtered.length === 0) {
                    return (
                      <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#64748B', fontSize: '0.85rem' }}>
                        No question papers match "{paperSearchTerm}".
                      </div>
                    );
                  }

                  return filtered.map((paper) => {
                    const qCount = Array.isArray(paper.questions) ? paper.questions.length : 0;
                    const marks = paper.targetMarks || (Array.isArray(paper.questions) ? paper.questions.reduce((s: number, q: any) => s + (Number(q.marks) || 1), 0) : 0);
                    const formattedDate = paper.createdAt ? new Date(paper.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent';

                    return (
                      <div 
                        key={paper.id}
                        style={{
                          border: '1px solid #E2E8F0',
                          borderRadius: '0.5rem',
                          padding: '0.85rem 1rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '1rem',
                          background: '#FFFFFF',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#0F172A' }}>
                              {paper.title || 'Untitled Exam Paper'}
                            </h4>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#1D4ED8', background: '#EFF6FF', padding: '0.1rem 0.45rem', borderRadius: '0.25rem' }}>
                              {marks} Marks • {qCount} Questions
                            </span>
                            {paper.status === 'dispatched' && (
                              <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#15803D', background: '#DCFCE7', padding: '0.1rem 0.4rem', borderRadius: '0.25rem' }}>
                                Dispatched
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.35rem', fontSize: '0.75rem', color: '#64748B' }}>
                            {paper.className && <span>Class: <strong>{paper.className}</strong></span>}
                            {paper.subject && <span>Subject: <strong>{paper.subject}</strong></span>}
                            <span>• {formattedDate}</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
                            onClick={() => handleLoadPaper(paper)}
                          >
                            <Check className="size-3.5" />
                            <span>Load Paper</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            style={{ padding: '0.35rem 0.5rem', color: '#EF4444', borderColor: '#FCA5A5' }}
                            onClick={(e) => handleDeleteSavedPaper(paper.id, e)}
                            title="Delete this saved paper"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '0.85rem 1.5rem', borderTop: '1px solid #E2E8F0', background: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                {savedPapers.length} saved question paper(s) in repository
              </span>
              <button 
                type="button" 
                className="btn btn-secondary btn-sm"
                onClick={() => setIsLoadModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
