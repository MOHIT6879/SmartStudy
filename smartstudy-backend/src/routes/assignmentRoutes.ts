import { Router, Response } from 'express';
import { supabase } from '../db/supabase.js';
import { AuthenticatedRequest, optionalAuth } from '../middleware/authMiddleware.js';
import { determineReasoningModel } from '../services/aiService.js';
import { sendAndLogParentNotification } from '../services/notificationService.js';

const router = Router();

// Dispatch Assignment (supports both /api/assignments and /api/save-assignment)
router.post(['/assignments', '/save-assignment'], optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      title,
      questions,
      className,
      subject,
      language,
      difficulty,
      durationMinutes,
      classId,
      classSubjectId,
      sectionId,
      teacherSubjectId,
      answerKeyText,
      questionPaperUrl,
      answerKeyUrl
    } = req.body;

    const id = 'assign-' + Date.now();
    const createdAt = new Date().toISOString();
    const titleVal = title || 'Daily Learning Assignment';
    const classVal = String(className || '').trim();

    if (!classVal && !classId) {
      return res.status(400).json({ success: false, message: 'A class is required so submissions can be matched back to this assignment.' });
    }

    console.log(`\n📋 [ASSIGNMENT DISPATCH] Dispatching Assessment to Students`);
    console.log(`   ├─ Assignment ID : "${id}"`);
    console.log(`   ├─ Title         : "${titleVal}"`);
    console.log(`   ├─ Subject/Class : "${subject || classVal}" (${classVal})`);
    console.log(`   ├─ Section ID    : "${sectionId || 'All sections'}"`);
    console.log(`   ├─ Questions     : ${(questions || []).length} question(s)`);
    console.log(`   └─ Difficulty    : ${difficulty || 'Medium'} (${durationMinutes || 60} min)`);

    const reasoningModel = await determineReasoningModel(subject || classVal || titleVal, JSON.stringify(questions || []), language || 'English');

    const newAssignment: any = {
      id,
      title: titleVal,
      class_name: classVal,
      subject: subject || classVal,
      language: language || 'English',
      difficulty: difficulty || 'Medium',
      duration_minutes: Number(durationMinutes) || 60,
      questions_json: JSON.stringify(questions || []),
      reasoning_model: reasoningModel,
      status: 'dispatched',
      created_at: createdAt,
      class_id: classId || null,
      class_subject_id: classSubjectId || null,
      section_id: sectionId || null,
      teacher_subject_id: teacherSubjectId || null,
      answer_key_text: answerKeyText || null,
      question_paper_url: questionPaperUrl || null,
      answer_key_url: answerKeyUrl || null
    };

    let { error: dbErr } = await supabase.from('assignments').insert([newAssignment]);
    if (dbErr) {
      console.warn('⚠️ Supabase DB Insert Notice (retrying with legacy assignment schema):', dbErr.message);
      const legacyAssignment = { ...newAssignment };
      delete legacyAssignment.section_id;
      delete legacyAssignment.teacher_subject_id;
      const { error: retryErr } = await supabase.from('assignments').insert([legacyAssignment]);
      if (retryErr) console.error('❌ Supabase DB Insert Fallback Error:', retryErr.message);
    }

    // Lookup students to dispatch notifications
    let targetStudents: any[] = [];
    if (sectionId) {
      const { data: secStudents } = await supabase.from('students').select('id, name').eq('section_id', sectionId);
      if (secStudents && secStudents.length > 0) targetStudents = secStudents;
    } else if (classId) {
      const { data: clsStudents } = await supabase.from('students').select('id, name').eq('class_id', classId);
      if (clsStudents && clsStudents.length > 0) targetStudents = clsStudents;
    }

    if (targetStudents.length === 0) {
      const { data: sampleStudents } = await supabase.from('students').select('id, name').limit(10);
      if (sampleStudents && sampleStudents.length > 0) targetStudents = sampleStudents;
    }

    if (targetStudents.length > 0) {
      for (const st of targetStudents) {
        await sendAndLogParentNotification({
          supabase,
          type: 'assignment_dispatched',
          title: '📲 WhatsApp Alert: New Class Assignment',
          message: `New assignment "${titleVal}" has been assigned for ${classVal}. Please check the Student Portal.`,
          details_json: { title: titleVal, className: classVal },
          studentId: st.id,
          studentName: st.name
        });
      }
    } else {
      await sendAndLogParentNotification({
        supabase,
        type: 'assignment_dispatched',
        title: '📲 WhatsApp Alert: New Class Assignment',
        message: `New assignment "${titleVal}" has been assigned for ${classVal}. Please check the Student Portal.`,
        details_json: { title: titleVal, className: classVal }
      });
    }

    console.log(`✅ [ASSIGNMENT DISPATCHED] ID: ${id} ready for student uploads.`);

    res.json({
      success: true,
      assignment: {
        id,
        title: titleVal,
        className: classVal,
        subject: subject || classVal,
        language: language || 'English',
        difficulty: difficulty || 'Medium',
        durationMinutes: Number(durationMinutes) || 60,
        questions,
        reasoningModel,
        status: 'dispatched',
        createdAt,
        classId: classId || null,
        classSubjectId: classSubjectId || null,
        sectionId: sectionId || null,
        teacherSubjectId: teacherSubjectId || null,
        answerKeyText: answerKeyText || null,
        pdfUrl: questionPaperUrl || null,
        answerKeyUrl: answerKeyUrl || null
      }
    });
  } catch (err: any) {
    console.error('❌ Assignment Dispatch Error:', err);
    res.status(500).json({ success: false, message: err?.message || 'Error dispatching assignment' });
  }
});

// List Assignments
router.get('/assignments', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let query = supabase.from('assignments').select('*, section(*), classes(name)').order('created_at', { ascending: false });
    const { classSubjectId, sectionId, classId } = req.query;

    if (classSubjectId) query = query.eq('class_subject_id', String(classSubjectId));
    if (sectionId) query = query.eq('section_id', String(sectionId));
    if (classId) query = query.eq('class_id', String(classId));

    const { data, error } = await query;
    if (error) throw error;

    const assignments = (data || []).map((r: any) => ({
      id: r.id,
      title: r.title,
      className: r.class_name,
      subject: r.subject,
      language: r.language,
      difficulty: r.difficulty,
      durationMinutes: r.duration_minutes,
      questions: typeof r.questions_json === 'string' ? JSON.parse(r.questions_json || '[]') : r.questions_json,
      reasoningModel: r.reasoning_model,
      status: r.status,
      createdAt: r.created_at,
      classId: r.class_id || null,
      classSubjectId: r.class_subject_id || null,
      sectionId: r.section_id || null,
      teacherSubjectId: r.teacher_subject_id || null,
      section: r.section || null,
      answerKeyText: r.answer_key_text || '',
      pdfUrl: r.question_paper_url || '',
      answerKeyUrl: r.answer_key_url || ''
    }));

    res.json({ success: true, assignments });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching assignments' });
  }
});

// Single Assignment
router.get('/assignments/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { data: r, error } = await supabase
      .from('assignments')
      .select('*, section(*), classes(*)')
      .eq('id', id)
      .single();

    if (error) throw error;

    res.json({
      success: true,
      assignment: {
        id: r.id,
        title: r.title,
        className: r.class_name,
        subject: r.subject,
        language: r.language,
        difficulty: r.difficulty,
        durationMinutes: r.duration_minutes,
        questions: typeof r.questions_json === 'string' ? JSON.parse(r.questions_json || '[]') : r.questions_json,
        reasoningModel: r.reasoning_model,
        status: r.status,
        createdAt: r.created_at,
        classId: r.class_id || null,
        classSubjectId: r.class_subject_id || null,
        sectionId: r.section_id || null,
        teacherSubjectId: r.teacher_subject_id || null,
        section: r.section || null,
        classes: r.classes || null,
        answerKeyText: r.answer_key_text || '',
        pdfUrl: r.question_paper_url || '',
        answerKeyUrl: r.answer_key_url || ''
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching assignment' });
  }
});

// Question Modules (100% DB-driven)
router.get('/question-modules', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const modules: any[] = [];
    const { data, error } = await supabase.from('assignments').select('*').order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      data.forEach((r) => {
        let parsedQuestions: any[] = [];
        try {
          parsedQuestions = typeof r.questions_json === 'string' ? JSON.parse(r.questions_json || '[]') : r.questions_json;
        } catch (e) {}

        if (Array.isArray(parsedQuestions) && parsedQuestions.length > 0) {
          modules.push({
            id: r.id,
            title: r.title || 'Dispatched Assignment',
            className: r.class_name || 'General Class',
            language: r.language || 'English',
            description: `DB Assignment (${parsedQuestions.length} Questions)`,
            questions: parsedQuestions,
            reasoningModel: r.reasoning_model
          });
        }
      });
    }

    res.json({ success: true, modules });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching question modules' });
  }
});

// Delete Assignment
router.delete('/assignments/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('assignments').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true, message: 'Assignment deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error deleting assignment' });
  }
});

export default router;
