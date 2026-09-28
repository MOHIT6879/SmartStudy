import { Router, Response } from 'express';
import { supabase } from '../db/supabase.js';
import { AuthenticatedRequest, optionalAuth, requireAuth } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/rbacMiddleware.js';

const router = Router();

// -------------------------------------------------------------
// Corporate (School Chain / Multi-Academy Trust)
// -------------------------------------------------------------

// List corporate groups
router.get(['/corporate', '/corporates'], optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('corporate')
      .select('*, branches(id, name, pincode, branch_contact_mail)')
      .order('name');

    if (error) throw error;
    res.json({ success: true, corporate: data || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching corporate groups' });
  }
});

// Create corporate group
router.post(['/corporate', '/corporates'], optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, registrationNo } = req.body;
    if (!name || !registrationNo) {
      return res.status(400).json({ success: false, message: 'Name and registrationNo are required.' });
    }

    const { data, error } = await supabase
      .from('corporate')
      .insert([{ name: name.trim(), registration_no: registrationNo.trim() }])
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, corporate: data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error creating corporate group' });
  }
});

// Get single corporate with branch breakdown
router.get(['/corporate/:id', '/corporates/:id'], optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('corporate')
      .select('*, branches(*)')
      .eq('id', id)
      .single();

    if (error) throw error;
    res.json({ success: true, corporate: data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching corporate record' });
  }
});

// Update corporate group
router.put(['/corporate/:id', '/corporates/:id'], optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, registrationNo } = req.body;
    const updates: any = {};
    if (name) updates.name = name.trim();
    if (registrationNo) updates.registration_no = registrationNo.trim();

    const { data, error } = await supabase
      .from('corporate')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, corporate: data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error updating corporate record' });
  }
});

// Delete corporate group
router.delete('/corporate/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('corporate').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true, message: 'Corporate record deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error deleting corporate record' });
  }
});

// -------------------------------------------------------------
// Branches
// -------------------------------------------------------------

// List branches (optionally filtered by corporateId)
router.get('/branches', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let query = supabase.from('branches').select('*, corporate(id, name)').order('name');
    const corporateId = req.query.corporateId as string;
    if (corporateId) {
      query = query.eq('corporate_id', corporateId);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, branches: data || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching branches' });
  }
});

// Create branch
router.post('/branches', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { corporateId, name, pincode, address, branchContactMail, mobileNumber } = req.body;

    if (!corporateId || !name || !pincode || !address || !branchContactMail || !mobileNumber) {
      return res.status(400).json({
        success: false,
        message: 'corporateId, name, pincode, address, branchContactMail, and mobileNumber are required.'
      });
    }

    const newBranch = {
      corporate_id: corporateId,
      name: name.trim(),
      pincode: pincode.trim(),
      address: address.trim(),
      branch_contact_mail: branchContactMail.trim(),
      mobile_number: mobileNumber.trim()
    };

    const { data, error } = await supabase
      .from('branches')
      .insert([newBranch])
      .select('*, corporate(id, name)')
      .single();

    if (error) throw error;
    res.json({ success: true, branch: data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error creating branch' });
  }
});

// Get single branch with academic sessions, classes & stats
router.get('/branches/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .select('*, corporate(*), academic_years(*)')
      .eq('id', id)
      .single();

    if (branchError) throw branchError;

    // Get count of classes, teachers, students
    const { count: classesCount } = await supabase.from('classes').select('*', { count: 'exact', head: true }).eq('branch_id', id);
    const { count: teachersCount } = await supabase.from('teacher').select('*', { count: 'exact', head: true }).eq('branch_id', id);

    res.json({
      success: true,
      branch: {
        ...branch,
        stats: {
          totalClasses: classesCount || 0,
          totalTeachers: teachersCount || 0
        }
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching branch details' });
  }
});

// Update branch
router.put('/branches/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, pincode, address, branchContactMail, mobileNumber } = req.body;
    const updates: any = {};
    if (name) updates.name = name.trim();
    if (pincode) updates.pincode = pincode.trim();
    if (address) updates.address = address.trim();
    if (branchContactMail) updates.branch_contact_mail = branchContactMail.trim();
    if (mobileNumber) updates.mobile_number = mobileNumber.trim();

    const { data, error } = await supabase
      .from('branches')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, branch: data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error updating branch' });
  }
});

// Delete branch
router.delete('/branches/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('branches').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true, message: 'Branch deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error deleting branch' });
  }
});

// -------------------------------------------------------------
// Admin Branch Access
// -------------------------------------------------------------

// List admins assigned to a branch
router.get('/branches/:id/admins', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('admin_branch_access')
      .select('*, admins(*)')
      .eq('branch_id', id);

    if (error) throw error;
    res.json({ success: true, admins: data || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching branch admins' });
  }
});

// Assign admin to branch
router.post('/branches/:id/admins', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: branchId } = req.params;
    const { adminId } = req.body;

    if (!adminId) {
      return res.status(400).json({ success: false, message: 'adminId is required.' });
    }

    const { data, error } = await supabase
      .from('admin_branch_access')
      .upsert({ admin_id: adminId, branch_id: branchId }, { onConflict: 'admin_id,branch_id' })
      .select('*, admins(*), branches(*)')
      .single();

    if (error) throw error;
    res.json({ success: true, access: data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error assigning admin to branch' });
  }
});

// Remove admin access from branch
router.delete('/branches/:id/admins/:adminId', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: branchId, adminId } = req.params;
    const { error } = await supabase
      .from('admin_branch_access')
      .delete()
      .eq('branch_id', branchId)
      .eq('admin_id', adminId);

    if (error) throw error;
    res.json({ success: true, message: 'Admin access removed successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error removing admin access' });
  }
});

export default router;
