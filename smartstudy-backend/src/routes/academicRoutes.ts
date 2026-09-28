import { Router, Response } from 'express';
import { supabase } from '../db/supabase.js';
import { AuthenticatedRequest, optionalAuth } from '../middleware/authMiddleware.js';

const router = Router();

// -------------------------------------------------------------
// Academic Years
// -------------------------------------------------------------

router.get('/academic-years', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let query = supabase.from('academic_years').select('*, branches(id, name)').order('start_year', { ascending: false });
    const branchId = (req.query.branchId as string) || req.branchId;
    if (branchId) query = query.eq('branch_id', branchId);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, academicYears: data || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching academic years' });
  }
});

router.post('/academic-years', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { branchId, startYear, endYear, isActive } = req.body;
    const targetBranchId = branchId || req.branchId;

    if (!targetBranchId || !startYear || !endYear) {
      return res.status(400).json({ success: false, message: 'branchId, startYear, and endYear are required.' });
    }

    const payload = {
      branch_id: targetBranchId,
      start_year: Number(startYear),
      end_year: Number(endYear),
      is_active: isActive !== undefined ? Boolean(isActive) : true
    };

    const { data, error } = await supabase
      .from('academic_years')
      .upsert(payload, { onConflict: 'branch_id,start_year' })
      .select('*, branches(id, name)')
      .single();

    if (error) throw error;
    res.json({ success: true, academicYear: data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error creating academic year' });
  }
});

router.put('/academic-years/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { startYear, endYear, isActive } = req.body;
    const updates: any = {};
    if (startYear !== undefined) updates.start_year = Number(startYear);
    if (endYear !== undefined) updates.end_year = Number(endYear);
    if (isActive !== undefined) updates.is_active = Boolean(isActive);

    const { data, error } = await supabase
      .from('academic_years')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, academicYear: data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error updating academic year' });
  }
});

router.delete('/academic-years/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('academic_years').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true, message: 'Academic year deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error deleting academic year' });
  }
});

// -------------------------------------------------------------
// Classes (100% backward compatible with existing UI)
// -------------------------------------------------------------

router.get('/classes', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let query = supabase.from('classes').select('*, section(*), class_subjects(*)').order('name');
    const branchId = (req.query.branchId as string) || req.branchId;
    if (branchId) query = query.eq('branch_id', branchId);

    const { data, error } = await query;
    if (error) throw error;

    const classes = (data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      section: c.section || null,
      branchId: c.branch_id || null,
      academicYearId: c.academic_year_id || null,
      classOrder: c.class_order || null,
      sections: c.section || [],
      classSubjects: c.class_subjects || [],
      createdAt: c.created_at
    }));

    res.json({ success: true, classes });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching classes' });
  }
});

router.post('/classes', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const name = String(req.body.name || '').trim();
    const section = String(req.body.section || '').trim();
    const branchId = req.body.branchId || req.branchId || null;
    const academicYearId = req.body.academicYearId || null;
    const classOrder = req.body.classOrder !== undefined ? Number(req.body.classOrder) : null;

    if (!name) return res.status(400).json({ success: false, message: 'Class name is required.' });

    const newClass: any = {
      id: `class-${Date.now()}`,
      name,
      section: section || null,
      branch_id: branchId,
      academic_year_id: academicYearId,
      class_order: classOrder,
      created_at: new Date().toISOString()
    };

    let { data, error } = await supabase.from('classes').insert([newClass]).select().single();
    if (error) {
      console.warn('⚠️ [CLASSES] Insert retry notice:', error.message);
      // Fallback in case older schema constraints
      const fallbackClass = { id: newClass.id, name, section: section || null, created_at: newClass.created_at };
      const retry = await supabase.from('classes').insert([fallbackClass]).select().single();
      if (retry.error) throw retry.error;
      data = retry.data;
    }

    // If section name was provided, automatically create a section record in the section table as well
    if (section && data?.id) {
      try {
        await supabase.from('section').upsert({
          class_id: data.id,
          section_name: section,
          strength: 0
        }, { onConflict: 'class_id,section_name' });
      } catch (secErr) {
        console.warn('⚠️ [SECTION] Auto-create notice:', secErr);
      }
    }

    res.json({
      success: true,
      class: {
        id: data.id,
        name: data.name,
        section: data.section || section,
        branchId: data.branch_id || branchId,
        academicYearId: data.academic_year_id || academicYearId,
        classOrder: data.class_order || classOrder,
        createdAt: data.created_at
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error creating class' });
  }
});

router.get('/classes/:classId', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { classId } = req.params;
    const { data: cls, error } = await supabase
      .from('classes')
      .select('*, section(*, teacher:class_teacher_id(*)), class_subjects(*), branches(*)')
      .eq('id', classId)
      .single();

    if (error) throw error;
    res.json({ success: true, class: cls });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching class details' });
  }
});

router.put('/classes/:classId', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { classId } = req.params;
    const { name, section, branchId, academicYearId, classOrder } = req.body;
    const updates: any = {};
    if (name) updates.name = String(name).trim();
    if (section !== undefined) updates.section = String(section).trim();
    if (branchId !== undefined) updates.branch_id = branchId || null;
    if (academicYearId !== undefined) updates.academic_year_id = academicYearId || null;
    if (classOrder !== undefined) updates.class_order = Number(classOrder);

    const { data, error } = await supabase
      .from('classes')
      .update(updates)
      .eq('id', classId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, class: data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error updating class' });
  }
});

router.delete('/classes/:classId', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { classId } = req.params;
    const { error } = await supabase.from('classes').delete().eq('id', classId);
    if (error) throw error;
    res.json({ success: true, message: 'Class deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error deleting class' });
  }
});

// -------------------------------------------------------------
// Sections (Within a Class)
// -------------------------------------------------------------

router.get('/classes/:classId/sections', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { classId } = req.params;
    const { data, error } = await supabase
      .from('section')
      .select('*, teacher:class_teacher_id(id, name, teacher_id, contact_email)')
      .eq('class_id', classId)
      .order('section_name');

    if (error) throw error;
    res.json({ success: true, sections: data || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching sections' });
  }
});

router.post('/classes/:classId/sections', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { classId } = req.params;
    const { sectionName, classTeacherId, strength } = req.body;

    if (!sectionName) {
      return res.status(400).json({ success: false, message: 'sectionName is required.' });
    }

    const payload = {
      class_id: classId,
      section_name: String(sectionName).trim().toUpperCase(),
      class_teacher_id: classTeacherId || null,
      strength: Number(strength) || 0
    };

    const { data, error } = await supabase
      .from('section')
      .upsert(payload, { onConflict: 'class_id,section_name' })
      .select('*, teacher:class_teacher_id(id, name)')
      .single();

    if (error) throw error;
    res.json({ success: true, section: data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error creating section' });
  }
});

router.get('/sections/:sectionId', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sectionId } = req.params;
    const { data: sec, error } = await supabase
      .from('section')
      .select('*, classes(*), teacher:class_teacher_id(*), students(*, parents(*))')
      .eq('id', sectionId)
      .single();

    if (error) throw error;
    res.json({ success: true, section: sec });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching section' });
  }
});

router.put('/sections/:sectionId', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sectionId } = req.params;
    const { sectionName, classTeacherId, strength } = req.body;
    const updates: any = {};
    if (sectionName) updates.section_name = String(sectionName).trim().toUpperCase();
    if (classTeacherId !== undefined) updates.class_teacher_id = classTeacherId || null;
    if (strength !== undefined) updates.strength = Number(strength);

    const { data, error } = await supabase
      .from('section')
      .update(updates)
      .eq('id', sectionId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, section: data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error updating section' });
  }
});

router.delete('/sections/:sectionId', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sectionId } = req.params;
    const { error } = await supabase.from('section').delete().eq('id', sectionId);
    if (error) throw error;
    res.json({ success: true, message: 'Section deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error deleting section' });
  }
});

// -------------------------------------------------------------
// Subjects (Curriculum Master - Backward Compatible)
// -------------------------------------------------------------

router.get('/subjects', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let query = supabase.from('subjects').select('*').order('name');
    const branchId = (req.query.branchId as string) || req.branchId;
    if (branchId) query = query.eq('branch_id', branchId);

    const { data, error } = await query;
    if (error) throw error;

    const subjects = (data || []).map((subject: any) => ({
      ...subject,
      grade: subject.grade || '',
      board: subject.board || '',
      className: subject.class_name || [subject.grade, subject.name].filter(Boolean).join(' ') || subject.name,
      description: subject.description || '',
      branchId: subject.branch_id || null
    }));

    res.json({ success: true, subjects });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching subjects' });
  }
});

router.post('/subjects', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const name = String(req.body.name || '').trim();
    const grade = String(req.body.grade || '').trim();
    const board = String(req.body.board || '').trim();
    const description = req.body.description ? String(req.body.description).trim() : null;
    const branchId = req.body.branchId || req.branchId || null;

    if (!name) return res.status(400).json({ success: false, message: 'Subject name is required.' });

    const className = grade ? `${grade} ${name}`.trim() : name;
    const subjectRecord: any = {
      id: `subject-${Date.now()}`,
      name,
      description,
      branch_id: branchId,
      created_at: new Date().toISOString()
    };

    let { data, error } = await supabase.from('subjects').upsert(subjectRecord, { onConflict: 'name' }).select().single();
    if (error) {
      console.warn('⚠️ [SUBJECTS] Upsert notice (retrying legacy columns):', error.message);
      const legacySubject = { id: subjectRecord.id, name: subjectRecord.name, created_at: subjectRecord.created_at };
      const retry = await supabase.from('subjects').upsert(legacySubject, { onConflict: 'name' }).select().single();
      if (retry.error) throw retry.error;
      data = retry.data;
    }

    res.json({
      success: true,
      subject: {
        ...data,
        grade,
        board,
        className,
        description: data.description || description
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error creating subject' });
  }
});

router.delete('/subjects/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('subjects').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true, message: 'Subject deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error deleting subject' });
  }
});

// -------------------------------------------------------------
// Class-Subjects (Subjects Taught Within a Specific Class)
// -------------------------------------------------------------

router.get('/classes/:classId/subjects', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { classId } = req.params;
    const { data, error } = await supabase
      .from('class_subjects')
      .select('*, subjects(*)')
      .eq('class_id', classId)
      .order('subject_name');

    if (error) throw error;

    res.json({
      success: true,
      subjects: (data || []).map((s: any) => ({
        id: s.id,
        classId: s.class_id,
        subjectId: s.subject_id || null,
        subjectName: s.subject_name,
        subjectDetails: s.subjects || null,
        createdAt: s.created_at
      }))
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching class subjects' });
  }
});

router.post('/classes/:classId/subjects', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { classId } = req.params;
    const subjectName = String(req.body.subjectName || '').trim();
    const subjectId = req.body.subjectId || null;

    if (!subjectName) return res.status(400).json({ success: false, message: 'Subject name is required.' });

    const newClassSubject = {
      id: `csub-${Date.now()}`,
      class_id: classId,
      subject_id: subjectId,
      subject_name: subjectName,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('class_subjects')
      .upsert(newClassSubject, { onConflict: 'class_id,subject_name' })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      subject: {
        id: data.id,
        classId: data.class_id,
        subjectId: data.subject_id || subjectId,
        subjectName: data.subject_name,
        createdAt: data.created_at
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error adding class subject' });
  }
});

router.delete('/classes/:classId/subjects/:csubId', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { classId, csubId } = req.params;
    const { error } = await supabase
      .from('class_subjects')
      .delete()
      .eq('class_id', classId)
      .eq('id', csubId);

    if (error) throw error;
    res.json({ success: true, message: 'Class subject removed successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error removing class subject' });
  }
});

export default router;
