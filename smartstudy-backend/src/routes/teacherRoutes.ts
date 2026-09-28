import { Router, Response } from 'express';
import { supabase } from '../db/supabase.js';
import { AuthenticatedRequest, optionalAuth } from '../middleware/authMiddleware.js';

const router = Router();

// -------------------------------------------------------------
// Teachers Directory
// -------------------------------------------------------------

router.get('/teachers', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let query = supabase.from('teacher').select('*, branches(id, name), teacher_subject(*, subjects(*))').order('name');
    const branchId = (req.query.branchId as string) || req.branchId;
    if (branchId) query = query.eq('branch_id', branchId);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ success: true, teachers: data || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching teachers' });
  }
});

router.post('/teachers', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { branchId, name, teacherId, contactEmail, contactMobile, password } = req.body;
    const targetBranchId = branchId || req.branchId;

    if (!name || !teacherId || !contactEmail || !contactMobile) {
      return res.status(400).json({
        success: false,
        message: 'name, teacherId, contactEmail, and contactMobile are required.'
      });
    }

    const payload: any = {
      id: `teacher-${Date.now()}`,
      branch_id: targetBranchId || null,
      name: name.trim(),
      teacher_id: teacherId.trim(),
      contact_email: contactEmail.trim().toLowerCase(),
      contact_mobile: contactMobile.trim(),
      password_hash: password ? password : 'demo-password',
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('teacher')
      .insert([payload])
      .select('*, branches(id, name)')
      .single();

    if (error) throw error;
    res.json({ success: true, teacher: data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error creating teacher' });
  }
});

router.get('/teachers/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { data: teacher, error } = await supabase
      .from('teacher')
      .select('*, branches(*), teacher_subject(*, subjects(*)), section(*, classes(*))')
      .eq('id', id)
      .single();

    if (error) throw error;
    res.json({ success: true, teacher });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching teacher profile' });
  }
});

router.put('/teachers/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, teacherId, contactEmail, contactMobile, branchId } = req.body;
    const updates: any = {};
    if (name) updates.name = name.trim();
    if (teacherId) updates.teacher_id = teacherId.trim();
    if (contactEmail) updates.contact_email = contactEmail.trim().toLowerCase();
    if (contactMobile) updates.contact_mobile = contactMobile.trim();
    if (branchId !== undefined) updates.branch_id = branchId || null;

    const { data, error } = await supabase
      .from('teacher')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, teacher: data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error updating teacher' });
  }
});

router.delete('/teachers/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('teacher').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true, message: 'Teacher deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error deleting teacher' });
  }
});

// -------------------------------------------------------------
// Teacher-Subject Mapping
// -------------------------------------------------------------

router.get('/teacher-subjects', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let query = supabase.from('teacher_subject').select('*, teacher(*), subjects(*)');
    const teacherId = req.query.teacherId as string;
    const subjectId = req.query.subjectId as string;

    if (teacherId) query = query.eq('teacher_id', teacherId);
    if (subjectId) query = query.eq('subject_id', subjectId);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ success: true, teacherSubjects: data || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching teacher subjects' });
  }
});

router.post('/teacher-subjects', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { teacherId, subjectId } = req.body;
    if (!teacherId || !subjectId) {
      return res.status(400).json({ success: false, message: 'teacherId and subjectId are required.' });
    }

    const payload = {
      teacher_id: teacherId,
      subject_id: subjectId,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('teacher_subject')
      .upsert(payload, { onConflict: 'teacher_id,subject_id' })
      .select('*, teacher(name, teacher_id), subjects(name)')
      .single();

    if (error) throw error;
    res.json({ success: true, teacherSubject: data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error mapping teacher to subject' });
  }
});

router.delete('/teacher-subjects/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('teacher_subject').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true, message: 'Teacher-subject allocation removed successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error removing teacher-subject allocation' });
  }
});

export default router;
