import { Router, Response } from 'express';
import { supabase } from '../db/supabase.js';
import { AuthenticatedRequest, optionalAuth } from '../middleware/authMiddleware.js';
import { sendAndLogParentNotification } from '../services/notificationService.js';

const router = Router();

// List Parent WhatsApp Notifications
router.get('/notifications', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let query = supabase.from('notifications').select('*').order('timestamp', { ascending: false });
    const studentId = req.query.studentId as string;
    if (studentId) query = query.eq('student_id', studentId);

    const { data, error } = await query;
    if (error) throw error;

    const notifications = (data || []).map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      message: r.message,
      details: r.details_json ? (typeof r.details_json === 'string' ? JSON.parse(r.details_json) : r.details_json) : null,
      timestamp: r.timestamp,
      studentName: r.student_name,
      studentId: r.student_id,
      submissionId: r.submission_id || null,
      parentPhone: r.parent_phone,
      deliveryStatus: r.delivery_status || 'simulated',
      providerMessageId: r.provider_message_id
    }));

    res.json({ success: true, notifications });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching notifications' });
  }
});

// Test WhatsApp Alert to Phone Number
router.post('/notifications/test', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { phone, studentName, message, studentId } = req.body;
    const targetPhone = phone || null;
    const targetStudent = studentName || 'Student';
    const notifMessage = message || `Teacher reviewed & approved the evaluated answer sheet for ${targetStudent}.`;

    const result = await sendAndLogParentNotification({
      supabase,
      type: 'evaluation_ready',
      title: '📲 WhatsApp Digest: Teacher Graded Paper',
      message: notifMessage,
      details_json: { score: 40, maxScore: 50, feedback: 'Verified & approved by teacher.' },
      studentName: targetStudent,
      studentId: studentId || undefined,
      overridePhone: targetPhone
    });

    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error sending test notification' });
  }
});

// Delete Notification
router.delete('/notifications/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('notifications').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true, message: 'Notification deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error deleting notification' });
  }
});

export default router;
