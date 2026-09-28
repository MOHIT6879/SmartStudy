import { Router, Response } from 'express';
import { supabase } from '../db/supabase.js';
import { AuthenticatedRequest, optionalAuth } from '../middleware/authMiddleware.js';
import { enrollStudent, bulkEnrollStudents, parseStudentsCsv } from '../services/rosterService.js';

const router = Router();

// -------------------------------------------------------------
// Parents CRM
// -------------------------------------------------------------

router.get('/parents', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('parents')
      .select('*, students(id, name, roll_number, class_id)')
      .order('name', { ascending: true });

    if (error) throw error;
    res.json({ success: true, parents: data || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching parents' });
  }
});

router.post('/parents', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, phoneNumber, email, preferredChannel } = req.body;
    if (!name || !phoneNumber) {
      return res.status(400).json({ success: false, message: 'Name and phoneNumber are required.' });
    }

    const parentRecord = {
      name: name.trim(),
      phone_number: phoneNumber.trim(),
      email: email ? email.trim().toLowerCase() : null,
      preferred_channel: preferredChannel || 'whatsapp'
    };

    const { data, error } = await supabase
      .from('parents')
      .upsert(parentRecord, { onConflict: 'phone_number' })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, parent: data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error creating parent' });
  }
});

router.get('/parents/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('parents')
      .select('*, students(*, classes(name), section(section_name))')
      .eq('id', id)
      .single();

    if (error) throw error;
    res.json({ success: true, parent: data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching parent profile' });
  }
});

router.put('/parents/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, phoneNumber, email, preferredChannel } = req.body;
    const updates: any = {};
    if (name) updates.name = name.trim();
    if (phoneNumber) updates.phone_number = phoneNumber.trim();
    if (email !== undefined) updates.email = email ? email.trim().toLowerCase() : null;
    if (preferredChannel) updates.preferred_channel = preferredChannel;

    const { data, error } = await supabase
      .from('parents')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, parent: data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error updating parent' });
  }
});

router.delete('/parents/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('parents').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true, message: 'Parent deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error deleting parent' });
  }
});

// -------------------------------------------------------------
// Students Roster
// -------------------------------------------------------------

router.get('/students', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let query = supabase
      .from('students')
      .select('*, parents(*), classes(id, name), section(id, section_name)')
      .order('name', { ascending: true });

    const classId = req.query.classId as string;
    const sectionId = req.query.sectionId as string;
    if (classId) query = query.eq('class_id', classId);
    if (sectionId) query = query.eq('section_id', sectionId);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ success: true, students: data || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching students' });
  }
});

// Create single student
router.post('/students', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, rollNumber, admissionNo, classId, sectionId, parentId, parentName, parentPhone, parentEmail, contactEmail, contactMobile } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Student name is required.' });

    const student = await enrollStudent({
      name: name.trim(),
      rollNumber,
      admissionNo,
      classId,
      sectionId,
      parentId,
      parentName,
      parentPhone,
      parentEmail,
      contactEmail,
      contactMobile
    });

    res.json({ success: true, student });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error enrolling student' });
  }
});

// Bulk student onboarding (supports JSON array or CSV text)
router.post('/students/bulk', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let studentPayloads: any[] = [];

    if (req.body.csv && typeof req.body.csv === 'string') {
      studentPayloads = parseStudentsCsv(req.body.csv);
    } else if (Array.isArray(req.body.students)) {
      studentPayloads = req.body.students;
    } else if (Array.isArray(req.body)) {
      studentPayloads = req.body;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Provide an array of students in `students` or CSV string in `csv`.'
      });
    }

    if (studentPayloads.length === 0) {
      return res.status(400).json({ success: false, message: 'No student records detected in payload.' });
    }

    const result = await bulkEnrollStudents(studentPayloads);
    res.json({
      success: true,
      message: `Enrolled ${result.successful} student(s) successfully (${result.failed} failed).`,
      ...result
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error during bulk enrollment' });
  }
});

router.get('/students/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { data: student, error } = await supabase
      .from('students')
      .select('*, parents(*), classes(*), section(*), submissions(*)')
      .eq('id', id)
      .single();

    if (error) throw error;
    res.json({ success: true, student });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching student record' });
  }
});

router.put('/students/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, rollNumber, admissionNo, classId, sectionId, parentId, contactEmail, contactMobile } = req.body;
    const updates: any = {};
    if (name) updates.name = name.trim();
    if (rollNumber !== undefined) updates.roll_number = rollNumber || null;
    if (admissionNo !== undefined) updates.admission_no = admissionNo || null;
    if (classId !== undefined) updates.class_id = classId || null;
    if (sectionId !== undefined) updates.section_id = sectionId || null;
    if (parentId !== undefined) updates.parent_id = parentId || null;
    if (contactEmail !== undefined) updates.contact_email = contactEmail || null;
    if (contactMobile !== undefined) updates.contact_mobile = contactMobile || null;

    const { data, error } = await supabase
      .from('students')
      .update(updates)
      .eq('id', id)
      .select('*, parents(*)')
      .single();

    if (error) throw error;
    res.json({ success: true, student: data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error updating student record' });
  }
});

router.delete('/students/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('students').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true, message: 'Student deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error deleting student' });
  }
});

export default router;
