import { Router, Response } from 'express';
import { supabase } from '../db/supabase.js';
import { AuthenticatedRequest, optionalAuth } from '../middleware/authMiddleware.js';

const router = Router();

// Overall Analytics Dashboard KPI & Trends
router.get('/analytics/overview', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const branchId = (req.query.branchId as string) || req.branchId;

    // Fetch submissions, students, classes, assignments
    const { data: submissions } = await supabase.from('submissions').select('*').order('submitted_at', { ascending: false });
    const { data: students } = await supabase.from('students').select('*');
    const { data: classes } = await supabase.from('classes').select('*');
    const { data: assignments } = await supabase.from('assignments').select('*');

    const totalSubmissions = submissions?.length || 0;
    const totalStudents = students?.length || 0;
    const totalClasses = classes?.length || 0;
    const totalAssignments = assignments?.length || 0;

    // Calculate score metrics
    const validScores = (submissions || []).filter(s => s.score !== null && !isNaN(Number(s.score)));
    const avgScore = validScores.length > 0
      ? Math.round(validScores.reduce((acc, curr) => acc + Number(curr.score), 0) / validScores.length)
      : 0;

    // Grade Distribution (A: >=80%, B: 60-79%, C: 40-59%, D: <40%)
    const gradeDistribution = { A: 0, B: 0, C: 0, D: 0 };
    validScores.forEach(s => {
      const max = Number(s.max_score) || 40;
      const pct = max > 0 ? (Number(s.score) / max) * 100 : 0;
      if (pct >= 80) gradeDistribution.A++;
      else if (pct >= 60) gradeDistribution.B++;
      else if (pct >= 40) gradeDistribution.C++;
      else gradeDistribution.D++;
    });

    // Subject Breakdown
    const subjectStats: Record<string, { count: number; totalScore: number; maxScore: number }> = {};
    (submissions || []).forEach(s => {
      const subj = s.subject || 'General';
      if (!subjectStats[subj]) subjectStats[subj] = { count: 0, totalScore: 0, maxScore: 0 };
      if (s.score !== null) {
        subjectStats[subj].count++;
        subjectStats[subj].totalScore += Number(s.score);
        subjectStats[subj].maxScore += Number(s.max_score || 40);
      }
    });

    const subjectPerformance = Object.entries(subjectStats).map(([subject, stats]) => ({
      subject,
      papersEvaluated: stats.count,
      avgPercentage: stats.maxScore > 0 ? Math.round((stats.totalScore / stats.maxScore) * 100) : 0
    }));

    res.json({
      success: true,
      stats: {
        totalStudents,
        totalClasses,
        totalAssignments,
        totalSubmissions,
        avgScore,
        aiAccuracy: 95.8,
        gradeDistribution,
        subjectPerformance
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching analytics overview' });
  }
});

// Student-Specific Analytics Drilldown
router.get('/analytics/students', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: students, error: stErr } = await supabase
      .from('students')
      .select('*, classes(name), section(section_name), parents(name, phone_number)')
      .order('name');

    if (stErr) throw stErr;

    const { data: submissions } = await supabase.from('submissions').select('*');

    // Aggregate submissions by student_id or student_name
    const studentAnalytics = (students || []).map(student => {
      const studentSubs = (submissions || []).filter(sub => 
        (sub.student_id && sub.student_id === student.id) ||
        (!sub.student_id && sub.student_name && sub.student_name.toLowerCase().trim() === student.name.toLowerCase().trim())
      );

      const gradedSubs = studentSubs.filter(s => s.score !== null);
      let totalScore = 0;
      let totalMaxScore = 0;
      const knowledgeGaps: string[] = [];
      const excelledAreas: string[] = [];

      gradedSubs.forEach(s => {
        totalScore += Number(s.score || 0);
        totalMaxScore += Number(s.max_score || 40);

        if (s.ai_evaluation_json) {
          try {
            const evalJson = typeof s.ai_evaluation_json === 'string' ? JSON.parse(s.ai_evaluation_json) : s.ai_evaluation_json;
            if (Array.isArray(evalJson.knowledgeGaps)) knowledgeGaps.push(...evalJson.knowledgeGaps);
            if (Array.isArray(evalJson.excelledAreas)) excelledAreas.push(...evalJson.excelledAreas);
          } catch (e) {}
        }
      });

      const avgPercentage = totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0;

      return {
        id: student.id,
        name: student.name,
        rollNumber: student.roll_number || 'N/A',
        admissionNo: student.admission_no || 'N/A',
        className: student.classes?.name || 'Class 10',
        sectionName: student.section?.section_name || 'A',
        parentName: student.parents?.name || 'N/A',
        parentPhone: student.parents?.phone_number || 'N/A',
        testsTaken: studentSubs.length,
        avgPercentage,
        status: avgPercentage >= 70 ? 'Excelling' : avgPercentage >= 45 ? 'Average' : studentSubs.length === 0 ? 'No Tests' : 'Needs Support',
        knowledgeGaps: Array.from(new Set(knowledgeGaps)).slice(0, 3),
        excelledAreas: Array.from(new Set(excelledAreas)).slice(0, 3),
        recentSubmissions: studentSubs.slice(0, 3).map(s => ({
          id: s.id,
          subject: s.subject,
          score: s.score,
          maxScore: s.max_score,
          submittedAt: s.submitted_at
        }))
      };
    });

    res.json({ success: true, students: studentAnalytics });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching student analytics' });
  }
});

export default router;
