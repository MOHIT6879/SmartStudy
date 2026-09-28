import { Router, Response } from 'express';
import { supabase } from '../db/supabase.js';
import { AuthenticatedRequest, optionalAuth, requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

// Register School Admin (Dean, Principal, Vice Principal)
router.post('/auth/register-admin', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { adminName, contactEmail, mobile, role, password, branchId } = req.body;

    if (!adminName || !contactEmail || !mobile) {
      return res.status(400).json({ success: false, message: 'adminName, contactEmail, and mobile are required.' });
    }

    const adminPayload: any = {
      id: `admin-${Date.now()}`,
      admin_name: adminName.trim(),
      contact_email: contactEmail.trim().toLowerCase(),
      mobile: mobile.trim(),
      role: role ? String(role).toUpperCase() : 'OTHER',
      password_hash: password || 'default-password',
      created_at: new Date().toISOString()
    };

    const { data: admin, error: adminErr } = await supabase
      .from('admins')
      .insert([adminPayload])
      .select()
      .single();

    if (adminErr) throw adminErr;

    // Link to branch if branchId provided
    if (branchId && admin) {
      await supabase.from('admin_branch_access').upsert({
        admin_id: admin.id,
        branch_id: branchId
      }, { onConflict: 'admin_id,branch_id' });
    }

    res.json({ success: true, admin });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error registering admin' });
  }
});

// Register Teacher
router.post('/auth/register-teacher', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { branchId, name, teacherId, contactEmail, contactMobile, password } = req.body;

    if (!name || !teacherId || !contactEmail || !contactMobile) {
      return res.status(400).json({
        success: false,
        message: 'name, teacherId, contactEmail, and contactMobile are required.'
      });
    }

    const payload: any = {
      id: `teacher-${Date.now()}`,
      branch_id: branchId || null,
      name: name.trim(),
      teacher_id: teacherId.trim(),
      contact_email: contactEmail.trim().toLowerCase(),
      contact_mobile: contactMobile.trim(),
      password_hash: password || 'default-password',
      created_at: new Date().toISOString()
    };

    const { data: teacher, error } = await supabase
      .from('teacher')
      .insert([payload])
      .select('*, branches(id, name)')
      .single();

    if (error) throw error;
    res.json({ success: true, teacher });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error registering teacher' });
  }
});

// Login (Checks admin or teacher record)
router.post('/auth/login', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check Admins
    const { data: admin } = await supabase
      .from('admins')
      .select('*, admin_branch_access(branch_id, branches(*))')
      .eq('contact_email', cleanEmail)
      .maybeSingle();

    if (admin) {
      return res.json({
        success: true,
        user: {
          id: admin.id,
          name: admin.admin_name,
          email: admin.contact_email,
          role: admin.role,
          type: 'admin',
          branches: (admin.admin_branch_access || []).map((b: any) => b.branches)
        }
      });
    }

    // Check Teacher
    const { data: teacher } = await supabase
      .from('teacher')
      .select('*, branches(*), teacher_subject(*, subjects(*))')
      .eq('contact_email', cleanEmail)
      .maybeSingle();

    if (teacher) {
      return res.json({
        success: true,
        user: {
          id: teacher.id,
          name: teacher.name,
          email: teacher.contact_email,
          teacherId: teacher.teacher_id,
          role: 'TEACHER',
          type: 'teacher',
          branch: teacher.branches,
          subjects: (teacher.teacher_subject || []).map((ts: any) => ts.subjects)
        }
      });
    }

    // Check Student
    const { data: student } = await supabase
      .from('students')
      .select('*, classes(*), section(*), parents(*)')
      .eq('contact_email', cleanEmail)
      .maybeSingle();

    if (student) {
      return res.json({
        success: true,
        user: {
          id: student.id,
          name: student.name,
          email: student.contact_email,
          rollNumber: student.roll_number,
          admissionNo: student.admission_no,
          role: 'STUDENT',
          type: 'student',
          class: student.classes,
          section: student.section,
          parent: student.parents
        }
      });
    }

    // Default Demo response if credentials not found in DB
    return res.status(401).json({ success: false, message: 'Invalid credentials or user not found.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error during login' });
  }
});

// Current User Profile
router.get('/auth/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.json({ success: true, user: req.user });
    }

    // Check admin
    const { data: admin } = await supabase
      .from('admins')
      .select('*, admin_branch_access(branch_id, branches(*))')
      .eq('contact_email', userEmail.toLowerCase())
      .maybeSingle();

    if (admin) {
      return res.json({
        success: true,
        user: {
          id: admin.id,
          name: admin.admin_name,
          email: admin.contact_email,
          role: admin.role,
          type: 'admin',
          branches: (admin.admin_branch_access || []).map((b: any) => b.branches)
        }
      });
    }

    // Check teacher
    const { data: teacher } = await supabase
      .from('teacher')
      .select('*, branches(*), teacher_subject(*, subjects(*))')
      .eq('contact_email', userEmail.toLowerCase())
      .maybeSingle();

    if (teacher) {
      return res.json({
        success: true,
        user: {
          id: teacher.id,
          name: teacher.name,
          email: teacher.contact_email,
          teacherId: teacher.teacher_id,
          role: 'TEACHER',
          type: 'teacher',
          branch: teacher.branches,
          subjects: (teacher.teacher_subject || []).map((ts: any) => ts.subjects)
        }
      });
    }

    res.json({ success: true, user: req.user });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching user profile' });
  }
});

export default router;
