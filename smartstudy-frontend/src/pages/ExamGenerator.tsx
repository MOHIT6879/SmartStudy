import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  Check,
  Building2,
  Edit3,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Upload,
  Sliders
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
  mcq: number;
  vsa: number;
  sa: number;
  long: number;
}

export interface LetterheadConfig {
  mode: 'text' | 'banner';
  schoolName: string;
  subtitle: string;
  affiliationCode: string;
  academicSession: string;
  logoUrl?: string;
  bannerUrl?: string;
  examFormat: 'cbse' | 'icse' | 'minimal';
  instructions: string[];
}

export default function ExamGenerator() {
  const [searchParams] = useSearchParams();
  const queryClassId = searchParams.get('classId');
  const queryClassSubjectId = searchParams.get('classSubjectId');
  const querySubject = searchParams.get('subject');
  const queryClassName = searchParams.get('className');
  const queryPaperId = searchParams.get('paperId');

  const [currentPaperId, setCurrentPaperId] = useState<string | null>(queryPaperId || null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(queryClassId || null);
  const [selectedClassSubjectId, setSelectedClassSubjectId] = useState<string | null>(queryClassSubjectId || null);

  // 1. Exam Configuration
  const [subject, setSubject] = useState(querySubject || '');
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [paperTitle, setPaperTitle] = useState('');
  const [targetExamMarks, setTargetExamMarks] = useState<number>(40);
  const [difficulty, setDifficulty] = useState('Standard');
  const [paperLanguage, setPaperLanguage] = useState('English');
  const [minutes, setMinutes] = useState(90);

  // Dynamic Typology Marks Configuration (MCQ, VSA, SA, Long)
  const [marksConfig, setMarksConfig] = useState<{ mcq: number; vsa: number; sa: number; long: number }>({
    mcq: 1,
    vsa: 2,
    sa: 3,
    long: 5
  });

  // Dynamic School Letterhead & Exam Modeling Configuration
  const [isLetterheadModalOpen, setIsLetterheadModalOpen] = useState(false);
  const [letterhead, setLetterhead] = useState<LetterheadConfig>(() => {
    try {
      const saved = localStorage.getItem('smartstudy_school_letterhead');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      mode: 'text',
      schoolName: 'PAATAM.AI SENIOR SECONDARY SCHOOL',
      subtitle: 'AFFILIATED TO CENTRAL BOARD OF SECONDARY EDUCATION',
      affiliationCode: 'CBSE / DEL / 2026',
      academicSession: '2025 - 2026',
      examFormat: 'cbse',
      instructions: [
        'This question paper contains multiple sections. All questions are compulsory unless internal choice is specified.',
        'Neat and clean presentation with legible handwriting is expected.',
        'Use of electronic calculators or unauthorized reference material is strictly prohibited.'
      ]
    };
  });

  // 2. Chapters & Subtopics Loaded from DB
  const [chapters, setChapters] = useState<CurriculumChapter[]>([]);
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [selectedSubtopics, setSelectedSubtopics] = useState<string[]>([]);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);

  // 3. Topic Blueprint Allocations
  const [chapterBlueprints, setChapterBlueprints] = useState<Record<string, ChapterBlueprintState>>({});

  // 4. Generation & Questions State
  const [isGenerating, setIsGenerating] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);
  const [showAnswerKey, setShowAnswerKey] = useState(true);

  // Teacher Question Editor State
  const [editingQuestion, setEditingQuestion] = useState<any | null>(null);
  const [isRegeneratingQuestionId, setIsRegeneratingQuestionId] = useState<string | null>(null);
  const [isGeneratingImageForQuestionId, setIsGeneratingImageForQuestionId] = useState<string | null>(null);
  const [isGeneratingBatchImages, setIsGeneratingBatchImages] = useState(false);

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

  // DYNAMIC TOTAL MARKS: uses configured marks per typology!
  const calculatedTotalMarks = (totalMcq * marksConfig.mcq) + (totalVsa * marksConfig.vsa) + (totalSa * marksConfig.sa) + (totalLong * marksConfig.long);
  const totalQuestionsCount = totalMcq + totalVsa + totalSa + totalLong;

  // Auto-Distribute blueprint allocations across selected chapters to match target marks dynamically
  const autoDistributeBlueprint = (
    target: number, 
    selChapters: string[] = selectedChapters,
    mConfig = marksConfig
  ) => {
    if (!selChapters || selChapters.length === 0) {
      setChapterBlueprints({});
      return;
    }

    const { mcq: mcqM, vsa: vsaM, sa: saM, long: longM } = mConfig;

    // Distribute questions to match target marks dynamically
    let rem = target;
    const long = rem >= longM * 3 ? Math.max(1, Math.floor((rem * 0.25) / longM)) : (rem >= longM ? 1 : 0);
    rem -= long * longM;
    const sa = rem >= saM * 2 ? Math.max(1, Math.floor((rem * 0.35) / saM)) : (rem >= saM ? 1 : 0);
    rem -= sa * saM;
    const vsa = rem >= vsaM * 2 ? Math.max(1, Math.floor((rem * 0.4) / vsaM)) : (rem >= vsaM ? 1 : 0);
    rem -= vsa * vsaM;
    const mcq = Math.max(0, Math.floor(rem / (mcqM || 1)));

    const qAlloc = { mcq, vsa, sa, long };

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
  const activeClassName = activeSubject?.className || queryClassName || activeSubject?.name || subject;

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
        difficulty,
        marksConfig
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
        const generatedId = 'paper-' + Date.now();
        setCurrentPaperId(generatedId);
        savePaperToStorage(data.questions, payload.examTitle, generatedId);
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
      const seenSignatures = new Set<string>();
      const combined: any[] = [];

      // Fuzzy signature matching identical papers saved to local and backend
      const getPaperSig = (p: any) => {
        const title = (p.title || '').trim().toLowerCase();
        const totalQ = p.totalQuestions || (Array.isArray(p.questions) ? p.questions.length : 0);
        const marks = p.targetMarks || (Array.isArray(p.questions) ? p.questions.reduce((s: number, q: any) => s + (Number(q.marks) || 1), 0) : 0);
        const createdMs = p.createdAt ? new Date(p.createdAt).getTime() : 0;
        // 5-minute bucket so near-simultaneous saves correlate
        const timeBucket = createdMs ? Math.floor(createdMs / (5 * 60 * 1000)) : 0;
        return `${title}__${totalQ}__${marks}__${timeBucket}`;
      };

      // 1. Supabase DB papers first (ground truth)
      if (Array.isArray(dbPapers)) {
        dbPapers.forEach((p) => {
          if (p && p.id) {
            seenIds.add(p.id);
            seenSignatures.add(getPaperSig(p));
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

      // 2. Local papers next (deduplicate against DB entries)
      if (Array.isArray(localPapers)) {
        localPapers.forEach((p) => {
          if (p && p.id) {
            const sig = getPaperSig(p);
            // Skip if ID was already added or fuzzy signature matches a DB paper
            if (seenIds.has(p.id) || seenSignatures.has(sig)) {
              return;
            }
            seenIds.add(p.id);
            seenSignatures.add(sig);
            combined.push(p);
          }
        });
      }

      // Sort newest first
      combined.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

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

  // Auto-load paper if paperId query parameter was passed
  useEffect(() => {
    if (queryPaperId && savedPapers.length > 0) {
      const target = savedPapers.find((p) => p.id === queryPaperId);
      if (target) {
        handleLoadPaper(target);
      }
    }
  }, [queryPaperId, savedPapers]);

  // Save paper to LocalStorage and backend with workspace metadata
  const savePaperToStorage = async (customQuestions?: any[], customTitle?: string, forcedId?: string) => {
    const qList = customQuestions || questions;
    const tTitle = customTitle || paperTitle || `${activeClassName} Examination`;
    if (!qList || qList.length === 0) return;

    const paperId = forcedId || currentPaperId || ('paper-' + Date.now());
    if (!currentPaperId) {
      setCurrentPaperId(paperId);
    }

    const newPaperRecord = {
      id: paperId,
      title: tTitle,
      className: activeClassName,
      classId: selectedClassId,
      classSubjectId: selectedClassSubjectId,
      subject,
      language: paperLanguage,
      difficulty,
      durationMinutes: minutes,
      targetMarks: calculatedTotalMarks || qList.reduce((s: number, q: any) => s + (Number(q.marks) || 1), 0),
      totalQuestions: qList.length,
      questions: qList,
      blueprint: chapterBlueprints,
      marksConfig,
      letterhead,
      selectedChapters,
      createdAt: new Date().toISOString(),
      status: 'saved'
    };

    // 1. Local storage save
    try {
      const existingRaw = localStorage.getItem('smartstudy_saved_exam_papers');
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      const updated = [newPaperRecord, ...existing.filter((p: any) => p.id !== paperId && p.title !== tTitle)];
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
          id: paperId,
          title: tTitle,
          className: activeClassName,
          classId: selectedClassId,
          classSubjectId: selectedClassSubjectId,
          subject,
          language: paperLanguage,
          difficulty,
          durationMinutes: minutes,
          questions: qList,
          status: 'saved',
          marksConfig,
          letterhead
        })
      });
    } catch (e) {
      console.warn('Backend save notice:', e);
    }

    setSavedPapers((prev) => [newPaperRecord, ...prev.filter((p) => p.id !== paperId && p.title !== tTitle)]);
  };

  const handleSavePaper = async () => {
    if (!questions || questions.length === 0) {
      alert('No questions to save. Please generate or load questions first.');
      return;
    }
    setIsSavingPaper(true);
    await savePaperToStorage(questions, paperTitle, currentPaperId || undefined);
    setIsSavingPaper(false);
    setSaveSuccessMsg(`💾 Question paper "${paperTitle || 'Examination'}" saved successfully!`);
    setTimeout(() => setSaveSuccessMsg(''), 4000);
  };

  const handleLoadPaper = (paper: any) => {
    if (!paper || !Array.isArray(paper.questions) || paper.questions.length === 0) {
      alert('Selected paper has no questions.');
      return;
    }

    setCurrentPaperId(paper.id);
    setQuestions(paper.questions);
    if (paper.title) setPaperTitle(paper.title);
    if (paper.subject) setSubject(paper.subject);
    if (paper.targetMarks) setTargetExamMarks(paper.targetMarks);
    if (paper.durationMinutes) setMinutes(paper.durationMinutes);
    if (paper.difficulty) setDifficulty(paper.difficulty);
    if (paper.language) setPaperLanguage(paper.language);
    if (paper.classId) setSelectedClassId(paper.classId);
    if (paper.classSubjectId) setSelectedClassSubjectId(paper.classSubjectId);

    if (paper.marksConfig && typeof paper.marksConfig === 'object') {
      setMarksConfig(paper.marksConfig);
    }
    if (paper.letterhead && typeof paper.letterhead === 'object') {
      setLetterhead(paper.letterhead);
    }

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
    if (currentPaperId === paperId) {
      setCurrentPaperId(null);
    }
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
          classId: selectedClassId,
          classSubjectId: selectedClassSubjectId,
          subject,
          language: paperLanguage,
          difficulty,
          durationMinutes: minutes,
          questions,
          status: 'dispatched',
          marksConfig,
          letterhead
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

  // Teacher Single Question Actions
  const handleRegenerateSingleQuestion = async (q: any) => {
    const qId = q.id || q.number || q.questionNo;
    setIsRegeneratingQuestionId(String(qId));
    try {
      const res = await fetch(`${API_BASE_URL}/api/rag/regenerate-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          subjectName: subject,
          className: activeClassName,
          chapterTitle: q.topic || q.stem || (selectedChapters.length > 0 ? selectedChapters[0] : ''),
          language: paperLanguage,
          difficulty
        })
      });
      const data = await res.json();
      if (data.success && data.question) {
        const replacement = {
          ...data.question,
          id: q.id || 'q-' + Date.now(),
          number: q.number || q.questionNo,
          questionNo: q.questionNo || q.number,
          section: q.section,
          marks: q.marks
        };
        setQuestions((prev) => prev.map((item) => {
          const itemId = item.id || item.number || item.questionNo;
          return itemId === qId ? replacement : item;
        }));
        setSaveSuccessMsg(`🔄 Question Q${q.questionNo || q.number} regenerated with textbook precision!`);
        setTimeout(() => setSaveSuccessMsg(''), 3000);
      } else {
        alert(data.message || 'Unable to regenerate question.');
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to question regeneration service.');
    } finally {
      setIsRegeneratingQuestionId(null);
    }
  };

  const handleGenerateQuestionImage = async (q: any) => {
    const qId = q.id || q.number || q.questionNo;
    const prompt = q.imagePrompt || q.text;
    setIsGeneratingImageForQuestionId(String(qId));
    try {
      const res = await fetch(`${API_BASE_URL}/api/rag/generate-question-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          questionText: q.text,
          subject: subject
        })
      });
      const data = await res.json();
      if (data.success && (data.imageUrl || data.diagramSvg)) {
        setQuestions((prev) => prev.map((item) => {
          const itemId = item.id || item.number || item.questionNo;
          if (itemId === qId) {
            return {
              ...item,
              imageUrl: data.imageUrl || undefined,
              diagramSvg: data.diagramSvg || undefined,
              imagePrompt: prompt,
              hasVisual: true
            };
          }
          return item;
        }));
        setSaveSuccessMsg(`🎨 Generated educational visual diagram for Q${q.questionNo || q.number}!`);
        setTimeout(() => setSaveSuccessMsg(''), 3000);
      } else {
        alert(data.message || 'Could not generate visual diagram.');
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to diagram generation service.');
    } finally {
      setIsGeneratingImageForQuestionId(null);
    }
  };

  const handleRemoveQuestionImage = (qId: any) => {
    setQuestions((prev) => prev.map((item) => {
      const itemId = item.id || item.number || item.questionNo;
      if (itemId === qId) {
        return {
          ...item,
          imageUrl: undefined,
          diagramSvg: undefined,
          hasVisual: false
        };
      }
      return item;
    }));
    setSaveSuccessMsg('🗑️ Removed visual diagram from question.');
    setTimeout(() => setSaveSuccessMsg(''), 3000);
  };

  const handleGenerateAllMissingImages = async () => {
    const missing = questions.filter(q => (q.hasVisual || q.imagePrompt) && !q.imageUrl && !q.diagramSvg);
    if (missing.length === 0) return;
    setIsGeneratingBatchImages(true);
    try {
      for (const q of missing) {
        const qId = q.id || q.number || q.questionNo;
        setIsGeneratingImageForQuestionId(String(qId));
        const prompt = q.imagePrompt || q.text;
        const res = await fetch(`${API_BASE_URL}/api/rag/generate-question-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            questionText: q.text,
            subject: subject
          })
        });
        const data = await res.json();
        if (data.success && (data.imageUrl || data.diagramSvg)) {
          setQuestions((prev) => prev.map((item) => {
            const itemId = item.id || item.number || item.questionNo;
            if (itemId === qId) {
              return {
                ...item,
                imageUrl: data.imageUrl || undefined,
                diagramSvg: data.diagramSvg || undefined,
                imagePrompt: prompt,
                hasVisual: true
              };
            }
            return item;
          }));
        }
      }
      setSaveSuccessMsg(`🎨 Generated figures for all ${missing.length} visual questions!`);
      setTimeout(() => setSaveSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Error generating batch figures:', err);
    } finally {
      setIsGeneratingImageForQuestionId(null);
      setIsGeneratingBatchImages(false);
    }
  };

  const handleUploadQuestionImage = (qId: any, file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setQuestions((prev) => prev.map((item) => {
        const itemId = item.id || item.number || item.questionNo;
        if (itemId === qId) {
          return {
            ...item,
            imageUrl: base64,
            diagramSvg: undefined
          };
        }
        return item;
      }));
      setSaveSuccessMsg(`🖼️ Image uploaded successfully!`);
      setTimeout(() => setSaveSuccessMsg(''), 3000);
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteQuestion = (qId: any) => {
    if (!confirm('Are you sure you want to delete this question?')) return;
    setQuestions((prev) => {
      const filtered = prev.filter((item) => (item.id || item.number || item.questionNo) !== qId);
      return filtered.map((item, idx) => ({
        ...item,
        number: idx + 1,
        questionNo: idx + 1
      }));
    });
  };

  const handleMoveQuestion = (qId: any, direction: 'up' | 'down') => {
    setQuestions((prev) => {
      const idx = prev.findIndex((item) => (item.id || item.number || item.questionNo) === qId);
      if (idx === -1) return prev;
      if (direction === 'up' && idx === 0) return prev;
      if (direction === 'down' && idx === prev.length - 1) return prev;

      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      const copy = [...prev];
      const temp = copy[idx];
      copy[idx] = copy[targetIdx];
      copy[targetIdx] = temp;

      return copy.map((item, i) => ({
        ...item,
        number: i + 1,
        questionNo: i + 1
      }));
    });
  };

  const handleAddNewQuestion = (sectionName?: string) => {
    const newNo = questions.length + 1;
    const newQ = {
      id: 'q-' + Date.now(),
      number: newNo,
      questionNo: newNo,
      section: sectionName || (marksConfig.sa > 0 ? 'Section C (Short Answer Questions)' : 'Section A (Multiple Choice Questions)'),
      type: 'short',
      text: 'Enter your question text here...',
      marks: marksConfig.sa || 3,
      options: [],
      correctAnswer: 'Model answer text...',
      rubricKey: 'Accurate explanation (2 marks) + example (1 mark)'
    };
    setQuestions((prev) => [...prev, newQ]);
    setEditingQuestion(newQ);
  };

  const handleSaveEditedQuestion = (updatedQ: any) => {
    setQuestions((prev) => prev.map((item) => {
      const itemId = item.id || item.number || item.questionNo;
      const updatedId = updatedQ.id || updatedQ.number || updatedQ.questionNo;
      return itemId === updatedId ? updatedQ : item;
    }));
    setEditingQuestion(null);
    setSaveSuccessMsg(`💾 Saved changes to Question Q${updatedQ.questionNo || updatedQ.number}!`);
    setTimeout(() => setSaveSuccessMsg(''), 3000);
  };

  // Helper to parse Markdown tables in question text
  const renderQuestionContent = (text: string) => {
    if (!text) return null;
    if (text.includes('|') && text.includes('---')) {
      const lines = text.split('\n');
      const tableStartIdx = lines.findIndex((l) => l.trim().startsWith('|') && l.includes('|'));
      if (tableStartIdx !== -1) {
        const beforeText = lines.slice(0, tableStartIdx).join('\n');
        let tableEndIdx = tableStartIdx;
        while (tableEndIdx < lines.length && lines[tableEndIdx].trim().startsWith('|')) {
          tableEndIdx++;
        }
        const tableLines = lines.slice(tableStartIdx, tableEndIdx);
        const afterText = lines.slice(tableEndIdx).join('\n');

        const cleanCells = (row: string) =>
          row
            .split('|')
            .map((c) => c.trim())
            .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        const headerCells = tableLines.length > 0 ? cleanCells(tableLines[0]) : [];
        const dataRows = tableLines.slice(2).map(cleanCells);

        return (
          <div>
            {beforeText && <div style={{ whiteSpace: 'pre-wrap', marginBottom: '0.5rem' }}>{beforeText}</div>}
            <div style={{ overflowX: 'auto', margin: '0.65rem 0' }}>
              <table className="question-markdown-table">
                <thead>
                  <tr>
                    {headerCells.map((h, i) => (
                      <th key={i}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataRows.map((row, rI) => (
                    <tr key={rI}>
                      {row.map((cell, cI) => (
                        <td key={cI}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {afterText && <div style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem' }}>{afterText}</div>}
          </div>
        );
      }
    }
    return <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>;
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
            onClick={() => setIsLetterheadModalOpen(true)}
            title="Configure school letterhead banner, logo, and exam format presets"
          >
            <Building2 className="size-4 text-purple-600" />
            <span>Letterhead & Format</span>
          </button>
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

                {/* Dynamic Typology Marks Configuration */}
                <div style={{ marginTop: '0.65rem', paddingTop: '0.65rem', borderTop: '1px dashed #CBD5E1' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#1E293B' }}>
                      <Sliders className="size-3.5 text-blue-600" />
                      <span>Marks per Typology (Dynamic)</span>
                    </label>
                    <span style={{ fontSize: '0.68rem', color: '#64748B' }}>Editable Marks/Q</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.35rem' }}>
                    <div style={{ textAlign: 'center', background: '#F8FAFC', padding: '0.25rem', borderRadius: '0.25rem', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#475569', marginBottom: '0.15rem' }}>MCQ</div>
                      <input 
                        type="number"
                        min={1}
                        max={10}
                        className="form-input"
                        value={marksConfig.mcq}
                        onChange={(e) => {
                          const val = Math.max(1, Number(e.target.value) || 1);
                          const nextConfig = { ...marksConfig, mcq: val };
                          setMarksConfig(nextConfig);
                          autoDistributeBlueprint(targetExamMarks, selectedChapters, nextConfig);
                        }}
                        style={{ fontSize: '0.78rem', padding: '0.2rem', textAlign: 'center', fontWeight: 800, color: '#1D4ED8' }}
                      />
                    </div>
                    <div style={{ textAlign: 'center', background: '#F8FAFC', padding: '0.25rem', borderRadius: '0.25rem', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#475569', marginBottom: '0.15rem' }}>VSA</div>
                      <input 
                        type="number"
                        min={1}
                        max={10}
                        className="form-input"
                        value={marksConfig.vsa}
                        onChange={(e) => {
                          const val = Math.max(1, Number(e.target.value) || 1);
                          const nextConfig = { ...marksConfig, vsa: val };
                          setMarksConfig(nextConfig);
                          autoDistributeBlueprint(targetExamMarks, selectedChapters, nextConfig);
                        }}
                        style={{ fontSize: '0.78rem', padding: '0.2rem', textAlign: 'center', fontWeight: 800, color: '#1D4ED8' }}
                      />
                    </div>
                    <div style={{ textAlign: 'center', background: '#F8FAFC', padding: '0.25rem', borderRadius: '0.25rem', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#475569', marginBottom: '0.15rem' }}>SA</div>
                      <input 
                        type="number"
                        min={1}
                        max={15}
                        className="form-input"
                        value={marksConfig.sa}
                        onChange={(e) => {
                          const val = Math.max(1, Number(e.target.value) || 1);
                          const nextConfig = { ...marksConfig, sa: val };
                          setMarksConfig(nextConfig);
                          autoDistributeBlueprint(targetExamMarks, selectedChapters, nextConfig);
                        }}
                        style={{ fontSize: '0.78rem', padding: '0.2rem', textAlign: 'center', fontWeight: 800, color: '#1D4ED8' }}
                      />
                    </div>
                    <div style={{ textAlign: 'center', background: '#F8FAFC', padding: '0.25rem', borderRadius: '0.25rem', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#475569', marginBottom: '0.15rem' }}>Long</div>
                      <input 
                        type="number"
                        min={1}
                        max={20}
                        className="form-input"
                        value={marksConfig.long}
                        onChange={(e) => {
                          const val = Math.max(1, Number(e.target.value) || 1);
                          const nextConfig = { ...marksConfig, long: val };
                          setMarksConfig(nextConfig);
                          autoDistributeBlueprint(targetExamMarks, selectedChapters, nextConfig);
                        }}
                        style={{ fontSize: '0.78rem', padding: '0.2rem', textAlign: 'center', fontWeight: 800, color: '#1D4ED8' }}
                      />
                    </div>
                  </div>
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
                    const topicTotal = (bp.mcq * marksConfig.mcq) + (bp.vsa * marksConfig.vsa) + (bp.sa * marksConfig.sa) + (bp.long * marksConfig.long);

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

                        {/* Steppers: MCQ, VSA, SA, Long with dynamic marks */}
                        {isSelected && (
                          <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.35rem', marginTop: '0.2rem' }}>
                              
                              {/* MCQ */}
                              <div style={{ background: '#F8FAFC', padding: '0.4rem 0.25rem', borderRadius: '0.375rem', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
                                  MCQ ({marksConfig.mcq}m)
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
                                  = {bp.mcq * marksConfig.mcq} Marks
                                </div>
                              </div>

                              {/* VSA */}
                              <div style={{ background: '#F8FAFC', padding: '0.4rem 0.25rem', borderRadius: '0.375rem', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
                                  VSA ({marksConfig.vsa}m)
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
                                  = {bp.vsa * marksConfig.vsa} Marks
                                </div>
                              </div>

                              {/* SA */}
                              <div style={{ background: '#F8FAFC', padding: '0.4rem 0.25rem', borderRadius: '0.375rem', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
                                  SA ({marksConfig.sa}m)
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
                                  = {bp.sa * marksConfig.sa} Marks
                                </div>
                              </div>

                              {/* Long */}
                              <div style={{ background: '#F8FAFC', padding: '0.4rem 0.25rem', borderRadius: '0.375rem', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
                                  Long ({marksConfig.long}m)
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
                                  = {bp.long * marksConfig.long} Marks
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
                    <strong style={{ color: '#0F172A' }}>Section A</strong> (MCQs {marksConfig.mcq}m)
                  </div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1E293B' }}>
                    {totalMcq} {totalMcq === 1 ? 'Question' : 'Questions'} <span style={{ color: '#2563EB', marginLeft: '0.25rem' }}>= {totalMcq * marksConfig.mcq} Marks</span>
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
                    <strong style={{ color: '#0F172A' }}>Section B</strong> (VSA {marksConfig.vsa}m)
                  </div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1E293B' }}>
                    {totalVsa} {totalVsa === 1 ? 'Question' : 'Questions'} <span style={{ color: '#2563EB', marginLeft: '0.25rem' }}>= {totalVsa * marksConfig.vsa} Marks</span>
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
                    <strong style={{ color: '#0F172A' }}>Section C</strong> (SA {marksConfig.sa}m)
                  </div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1E293B' }}>
                    {totalSa} {totalSa === 1 ? 'Question' : 'Questions'} <span style={{ color: '#2563EB', marginLeft: '0.25rem' }}>= {totalSa * marksConfig.sa} Marks</span>
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
                    <strong style={{ color: '#0F172A' }}>Section D</strong> (Long {marksConfig.long}m)
                  </div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1E293B' }}>
                    {totalLong} {totalLong === 1 ? 'Question' : 'Questions'} <span style={{ color: '#2563EB', marginLeft: '0.25rem' }}>= {totalLong * marksConfig.long} Marks</span>
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

                    {questions.some(q => (q.hasVisual || q.imagePrompt) && !q.imageUrl && !q.diagramSvg) && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{ fontSize: '0.75rem', borderColor: '#F59E0B', color: '#B45309', background: '#FFFBEB', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}
                        disabled={isGeneratingBatchImages}
                        onClick={handleGenerateAllMissingImages}
                        title="Generate diagrams for all visual questions that do not have figures yet"
                      >
                        <Sparkles className={`size-3.5 ${isGeneratingBatchImages ? 'animate-spin text-amber-600' : 'text-amber-500'}`} />
                        <span>{isGeneratingBatchImages ? 'Generating Figures...' : `Generate Missing Figures (${questions.filter(q => (q.hasVisual || q.imagePrompt) && !q.imageUrl && !q.diagramSvg).length})`}</span>
                      </button>
                    )}

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
                  
                  {/* Formal Board Exam Paper Header / School Letterhead */}
                  {letterhead.mode === 'banner' && letterhead.bannerUrl ? (
                    <div className="print-letterhead-banner-container" style={{ textAlign: 'center', marginBottom: '0.5rem', borderBottom: '2px solid #0F172A', paddingBottom: '0.75rem' }}>
                      <img 
                        src={letterhead.bannerUrl} 
                        alt="School Official Letterhead" 
                        className="print-letterhead-banner" 
                        style={{ maxWidth: '100%', maxHeight: '130px', objectFit: 'contain', margin: '0 auto', display: 'block' }} 
                      />
                      <h2 className="print-exam-title" style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0.4rem 0 0.2rem 0', textTransform: 'uppercase', letterSpacing: '0.02em', color: '#1E293B' }}>
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
                  ) : (
                    <div className="print-paper-header" style={{ textAlign: 'center', borderBottom: '2px solid #0F172A', paddingBottom: '0.75rem' }}>
                      {letterhead.logoUrl && (
                        <img src={letterhead.logoUrl} alt="Logo" style={{ height: '48px', width: 'auto', margin: '0 auto 0.35rem auto', display: 'block' }} />
                      )}
                      <div className="print-school-name" style={{ fontSize: '1.35rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#0F172A' }}>
                        {letterhead.schoolName || 'PAATAM.AI SENIOR SECONDARY SCHOOL'}
                      </div>
                      <div className="print-school-sub" style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>
                        {letterhead.subtitle || 'AFFILIATED TO CENTRAL BOARD OF SECONDARY EDUCATION'}
                      </div>
                      {letterhead.affiliationCode && (
                        <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600, marginBottom: '0.35rem' }}>
                          Affiliation: {letterhead.affiliationCode} • Academic Session: {letterhead.academicSession}
                        </div>
                      )}
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
                  )}

                  {/* General Instructions */}
                  <div className="print-instructions-box" style={{ background: '#F8FAFC', padding: '0.65rem 0.85rem', borderRadius: '0.375rem', border: '1px solid #E2E8F0', fontSize: '0.75rem', color: '#334155' }}>
                    <div style={{ fontWeight: 800, marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>General Instructions:</div>
                    <ol style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: '1.45' }}>
                      {letterhead.instructions && letterhead.instructions.length > 0 ? (
                        letterhead.instructions.map((inst, idx) => (
                          <li key={idx}>{inst}</li>
                        ))
                      ) : (
                        <>
                          <li>All questions are compulsory unless internal choice is specified.</li>
                          {totalMcq > 0 && <li>Section A comprises {totalMcq} Multiple Choice Questions carrying {marksConfig.mcq} mark each.</li>}
                          {totalVsa > 0 && <li>Section B comprises {totalVsa} Very Short Answer Questions carrying {marksConfig.vsa} marks each.</li>}
                          {totalSa > 0 && <li>Section C comprises {totalSa} Short Answer Questions carrying {marksConfig.sa} marks each.</li>}
                          {totalLong > 0 && <li>Section D comprises {totalLong} Long Answer Questions carrying {marksConfig.long} marks each.</li>}
                          <li>Neat and clean presentation with legible handwriting is expected.</li>
                        </>
                      )}
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
                        letterSpacing: '0.02em',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <span>{sectionTitle}</span>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm no-print"
                          style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', background: '#FFFFFF' }}
                          onClick={() => handleAddNewQuestion(sectionTitle)}
                        >
                          + Add Question
                        </button>
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
                              {renderQuestionContent(q.text)}
                              
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

                          {/* Visual Diagram / Image (if present) */}
                          {q.imageUrl && (
                            <div style={{ margin: '0.65rem auto', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <div className="question-diagram-figure">
                                <img 
                                  src={q.imageUrl} 
                                  alt={`Figure for Question ${q.questionNo || q.number || idx + 1}`} 
                                />
                              </div>
                              {q.imagePrompt && (
                                <div className="question-figure-caption">Figure: {q.imagePrompt}</div>
                              )}
                            </div>
                          )}

                          {q.diagramSvg && !q.imageUrl && (
                            <div style={{ margin: '0.65rem auto', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <div 
                                className="question-diagram-figure" 
                                dangerouslySetInnerHTML={{ __html: q.diagramSvg }} 
                              />
                              {q.imagePrompt && (
                                <div className="question-figure-caption">Figure: {q.imagePrompt}</div>
                              )}
                            </div>
                          )}

                          {/* Figure needed notice when question specifies visual requirement */}
                          {(q.hasVisual || q.imagePrompt) && !q.imageUrl && !q.diagramSvg && (
                            <div className="no-print" style={{ 
                              margin: '0.55rem 0', 
                              padding: '0.6rem 0.9rem', 
                              background: '#FEFCE8', 
                              border: '1px dashed #FDE047', 
                              borderRadius: '0.375rem', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'space-between', 
                              gap: '0.5rem' 
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', color: '#854D0E' }}>
                                <Sparkles className="size-4 text-amber-600 flex-shrink-0" />
                                <span>Figure required: <strong>{q.imagePrompt || 'Scientific Diagram'}</strong></span>
                              </div>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                style={{ fontSize: '0.72rem', padding: '0.25rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.3rem', background: '#D97706', borderColor: '#B45309' }}
                                disabled={isGeneratingImageForQuestionId === String(q.id || q.number || q.questionNo)}
                                onClick={() => handleGenerateQuestionImage(q)}
                              >
                                <Sparkles className="size-3" />
                                <span>{isGeneratingImageForQuestionId === String(q.id || q.number || q.questionNo) ? 'Drawing...' : 'Generate Figure'}</span>
                              </button>
                            </div>
                          )}

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

                          {/* Teacher Action Toolbar - visible on screen, hidden during print */}
                          <div className="no-print" style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.35rem', 
                            marginTop: '0.5rem', 
                            paddingTop: '0.35rem', 
                            borderTop: '1px dashed #E2E8F0', 
                            flexWrap: 'wrap' 
                          }}>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                              onClick={() => setEditingQuestion({ ...q })}
                              title="Edit question text, marks, options, or answer key"
                            >
                              <Edit3 className="size-3 text-blue-600" />
                              <span>Edit</span>
                            </button>

                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                              disabled={isRegeneratingQuestionId === String(q.id || q.number || q.questionNo)}
                              onClick={() => handleRegenerateSingleQuestion(q)}
                              title="Regenerate this specific question with fresh AI generation"
                            >
                              <RefreshCw className={`size-3 text-purple-600 ${isRegeneratingQuestionId === String(q.id || q.number || q.questionNo) ? 'animate-spin' : ''}`} />
                              <span>{isRegeneratingQuestionId === String(q.id || q.number || q.questionNo) ? 'Regenerating...' : 'Regenerate'}</span>
                            </button>

                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                              disabled={isGeneratingImageForQuestionId === String(q.id || q.number || q.questionNo)}
                              onClick={() => handleGenerateQuestionImage(q)}
                              title="Generate an AI visual diagram or illustration for this question"
                            >
                              <Sparkles className="size-3 text-amber-600" />
                              <span>{isGeneratingImageForQuestionId === String(q.id || q.number || q.questionNo) ? 'Drawing...' : (q.imageUrl || q.diagramSvg ? 'Regen Diagram' : '+ AI Diagram')}</span>
                            </button>

                            <label
                              className="btn btn-outline btn-sm"
                              style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', margin: 0 }}
                              title="Upload custom image or diagram for this question"
                            >
                              <Upload className="size-3 text-slate-600" />
                              <span>Upload Image</span>
                              <input 
                                type="file" 
                                accept="image/*" 
                                style={{ display: 'none' }} 
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleUploadQuestionImage(q.id || q.number || q.questionNo, file);
                                }}
                              />
                            </label>

                            {(q.imageUrl || q.diagramSvg) && (
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#DC2626', borderColor: '#FECACA' }}
                                onClick={() => handleRemoveQuestionImage(q.id || q.number || q.questionNo)}
                                title="Remove diagram from this question"
                              >
                                <X className="size-3 text-red-500" />
                                <span>Remove Figure</span>
                              </button>
                            )}

                            <div style={{ display: 'flex', gap: '0.2rem', marginLeft: 'auto' }}>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                style={{ padding: '0.2rem 0.4rem' }}
                                onClick={() => handleMoveQuestion(q.id || q.number || q.questionNo, 'up')}
                                disabled={idx === 0}
                                title="Move Question Up"
                              >
                                <ArrowUp className="size-3 text-slate-600" />
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                style={{ padding: '0.2rem 0.4rem' }}
                                onClick={() => handleMoveQuestion(q.id || q.number || q.questionNo, 'down')}
                                disabled={idx === sectionQuestions.length - 1}
                                title="Move Question Down"
                              >
                                <ArrowDown className="size-3 text-slate-600" />
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                style={{ padding: '0.2rem 0.4rem', color: '#EF4444', borderColor: '#FCA5A5' }}
                                onClick={() => handleDeleteQuestion(q.id || q.number || q.questionNo)}
                                title="Delete Question"
                              >
                                <Trash2 className="size-3 text-red-500" />
                              </button>
                            </div>
                          </div>

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

      {/* 6. TEACHER QUESTION EDITOR MODAL */}
      {editingQuestion && (
        <div 
          className="no-print"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            zIndex: 1050,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            backdropFilter: 'blur(3px)'
          }}
          onClick={() => setEditingQuestion(null)}
        >
          <div 
            style={{
              background: '#FFFFFF',
              borderRadius: '0.75rem',
              width: '100%',
              maxWidth: '640px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Edit3 className="size-4 text-blue-600" />
                <span>Edit Question Q{editingQuestion.questionNo || editingQuestion.number}</span>
              </h3>
              <button type="button" onClick={() => setEditingQuestion(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X className="size-5" />
              </button>
            </div>

            <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Question Text</label>
                <textarea
                  className="form-input"
                  rows={4}
                  value={editingQuestion.text}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, text: e.target.value })}
                  style={{ fontSize: '0.85rem', lineHeight: '1.45' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Marks</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    className="form-input"
                    value={editingQuestion.marks}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, marks: Number(e.target.value) || 1 })}
                    style={{ fontSize: '0.85rem' }}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Section</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editingQuestion.section || ''}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, section: e.target.value })}
                    style={{ fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              {/* MCQ Options editor if options exist */}
              {Array.isArray(editingQuestion.options) && (
                <div className="form-group" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, margin: 0 }}>MCQ Options</label>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}
                      onClick={() => {
                        const opts = editingQuestion.options || [];
                        const label = String.fromCharCode(65 + opts.length);
                        setEditingQuestion({ ...editingQuestion, options: [...opts, `(${label}) `] });
                      }}
                    >
                      + Add Option
                    </button>
                  </div>
                  {editingQuestion.options.map((opt: string, optI: number) => (
                    <div key={optI} style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem' }}>
                      <input
                        type="text"
                        className="form-input"
                        value={opt}
                        onChange={(e) => {
                          const next = [...editingQuestion.options];
                          next[optI] = e.target.value;
                          setEditingQuestion({ ...editingQuestion, options: next });
                        }}
                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem' }}
                      />
                      <button
                        type="button"
                        style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer' }}
                        onClick={() => {
                          const next = editingQuestion.options.filter((_: any, i: number) => i !== optI);
                          setEditingQuestion({ ...editingQuestion, options: next });
                        }}
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Model Answer</label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={editingQuestion.correctAnswer || ''}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, correctAnswer: e.target.value })}
                  style={{ fontSize: '0.85rem' }}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Marking Rubric / Criteria</label>
                <input
                  type="text"
                  className="form-input"
                  value={editingQuestion.rubricKey || ''}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, rubricKey: e.target.value })}
                  style={{ fontSize: '0.85rem' }}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Diagram Caption / Prompt</label>
                <input
                  type="text"
                  className="form-input"
                  value={editingQuestion.imagePrompt || ''}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, imagePrompt: e.target.value })}
                  placeholder="e.g. Labeled diagram of human digestive system"
                  style={{ fontSize: '0.85rem' }}
                />
              </div>
            </div>

            <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid #E2E8F0', background: '#F8FAFC', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingQuestion(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => handleSaveEditedQuestion(editingQuestion)}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. SCHOOL LETTERHEAD & FORMATTING MODAL */}
      {isLetterheadModalOpen && (
        <div 
          className="no-print"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            zIndex: 1050,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            backdropFilter: 'blur(3px)'
          }}
          onClick={() => setIsLetterheadModalOpen(false)}
        >
          <div 
            style={{
              background: '#FFFFFF',
              borderRadius: '0.75rem',
              width: '100%',
              maxWidth: '680px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Building2 className="size-4 text-purple-600" />
                <span>School Letterhead & Paper Formatting</span>
              </h3>
              <button type="button" onClick={() => setIsLetterheadModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X className="size-5" />
              </button>
            </div>

            <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Header Mode Toggle */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${letterhead.mode === 'text' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ flex: 1, padding: '0.45rem' }}
                  onClick={() => setLetterhead({ ...letterhead, mode: 'text' })}
                >
                  Configured Text Header (Board Presets)
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${letterhead.mode === 'banner' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ flex: 1, padding: '0.45rem' }}
                  onClick={() => setLetterhead({ ...letterhead, mode: 'banner' })}
                >
                  Custom School Banner Graphic
                </button>
              </div>

              {letterhead.mode === 'banner' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: '#F8FAFC', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #E2E8F0' }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Upload School Letterhead Banner</label>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748B' }}>
                    Upload your school's official graphic banner (PNG, JPEG, SVG). It will appear across the full width at the top of printed and displayed papers.
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setLetterhead({ ...letterhead, bannerUrl: ev.target?.result as string });
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                  {letterhead.bannerUrl && (
                    <div style={{ marginTop: '0.5rem', textAlign: 'center', border: '1px dashed #CBD5E1', padding: '0.5rem', borderRadius: '0.375rem', background: 'white' }}>
                      <img src={letterhead.bannerUrl} alt="Banner Preview" style={{ maxHeight: '100px', maxWidth: '100%', objectFit: 'contain' }} />
                      <button
                        type="button"
                        style={{ display: 'block', margin: '0.35rem auto 0 auto', background: 'transparent', border: 'none', color: '#EF4444', fontSize: '0.75rem', cursor: 'pointer' }}
                        onClick={() => setLetterhead({ ...letterhead, bannerUrl: undefined })}
                      >
                        Remove Banner
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>School Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={letterhead.schoolName}
                      onChange={(e) => setLetterhead({ ...letterhead, schoolName: e.target.value })}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Affiliation & Subtitle</label>
                    <input
                      type="text"
                      className="form-input"
                      value={letterhead.subtitle}
                      onChange={(e) => setLetterhead({ ...letterhead, subtitle: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Affiliation Code</label>
                      <input
                        type="text"
                        className="form-input"
                        value={letterhead.affiliationCode}
                        onChange={(e) => setLetterhead({ ...letterhead, affiliationCode: e.target.value })}
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Academic Session</label>
                      <input
                        type="text"
                        className="form-input"
                        value={letterhead.academicSession}
                        onChange={(e) => setLetterhead({ ...letterhead, academicSession: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Board Preset Format</label>
                    <select
                      className="form-select"
                      value={letterhead.examFormat}
                      onChange={(e) => setLetterhead({ ...letterhead, examFormat: e.target.value as any })}
                    >
                      <option value="cbse">CBSE Standard Format (Sections A, B, C, D)</option>
                      <option value="icse">ICSE Standard Format</option>
                      <option value="minimal">Minimalist School Assessment Format</option>
                    </select>
                  </div>
                </div>
              )}

              {/* General Instructions Editor */}
              <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, margin: 0 }}>
                    General Instructions
                  </label>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}
                    onClick={() => setLetterhead({ ...letterhead, instructions: [...(letterhead.instructions || []), 'New instruction item...'] })}
                  >
                    + Add Line
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {(letterhead.instructions || []).map((inst, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '0.35rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', alignSelf: 'center', minWidth: '18px' }}>
                        {idx + 1}.
                      </span>
                      <input
                        type="text"
                        className="form-input"
                        value={inst}
                        onChange={(e) => {
                          const next = [...letterhead.instructions];
                          next[idx] = e.target.value;
                          setLetterhead({ ...letterhead, instructions: next });
                        }}
                        style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                      />
                      <button
                        type="button"
                        style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer' }}
                        onClick={() => {
                          const next = letterhead.instructions.filter((_, i) => i !== idx);
                          setLetterhead({ ...letterhead, instructions: next });
                        }}
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid #E2E8F0', background: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  const defaults: LetterheadConfig = {
                    mode: 'text',
                    schoolName: 'PAATAM.AI SENIOR SECONDARY SCHOOL',
                    subtitle: 'AFFILIATED TO CENTRAL BOARD OF SECONDARY EDUCATION',
                    affiliationCode: 'CBSE / DEL / 2026',
                    academicSession: '2025 - 2026',
                    examFormat: 'cbse',
                    instructions: [
                      'This question paper contains multiple sections. All questions are compulsory unless internal choice is specified.',
                      'Neat and clean presentation with legible handwriting is expected.',
                      'Use of electronic calculators or unauthorized reference material is strictly prohibited.'
                    ]
                  };
                  setLetterhead(defaults);
                }}
              >
                Reset to CBSE Default
              </button>

              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  try {
                    localStorage.setItem('smartstudy_school_letterhead', JSON.stringify(letterhead));
                  } catch {}
                  setIsLetterheadModalOpen(false);
                  setSaveSuccessMsg('🏫 School Letterhead & Formatting saved!');
                  setTimeout(() => setSaveSuccessMsg(''), 3000);
                }}
              >
                Apply & Save Letterhead
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
