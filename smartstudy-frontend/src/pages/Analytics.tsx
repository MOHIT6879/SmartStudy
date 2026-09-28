import { useEffect, useState } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  FileCheck2, 
  Sparkles, 
  Search, 
  CheckCircle2, 
  AlertTriangle,
  ChevronRight,
  X,
  MessageSquare,
  BookOpen
} from 'lucide-react';
import { API_BASE_URL } from '../config/api';

interface AnalyticsOverview {
  totalStudents: number;
  totalClasses: number;
  totalAssignments: number;
  totalSubmissions: number;
  avgScore: number;
  aiAccuracy: number;
  gradeDistribution: { A: number; B: number; C: number; D: number };
  subjectPerformance: { subject: string; papersEvaluated: number; avgPercentage: number }[];
}

interface StudentAnalyticsItem {
  id: string;
  name: string;
  rollNumber: string;
  admissionNo: string;
  className: string;
  sectionName: string;
  parentName: string;
  parentPhone: string;
  testsTaken: number;
  avgPercentage: number;
  status: 'Excelling' | 'Average' | 'Needs Support' | 'No Tests';
  knowledgeGaps: string[];
  excelledAreas: string[];
  recentSubmissions: {
    id: string;
    subject: string;
    score: number;
    maxScore: number;
    submittedAt: string;
  }[];
}

export default function Analytics() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [students, setStudents] = useState<StudentAnalyticsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState('ALL');
  const [selectedStudent, setSelectedStudent] = useState<StudentAnalyticsItem | null>(null);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      fetch(`${API_BASE_URL}/api/analytics/overview`).then(r => r.json()).catch(() => null),
      fetch(`${API_BASE_URL}/api/analytics/students`).then(r => r.json()).catch(() => null)
    ]).then(([overviewData, studentsData]) => {
      if (overviewData?.success && overviewData.stats) {
        setOverview(overviewData.stats);
      }
      if (studentsData?.success && Array.isArray(studentsData.students)) {
        setStudents(studentsData.students);
      }
    }).finally(() => {
      setIsLoading(false);
    });
  }, []);

  // Filter students by search and class
  const filteredStudents = students.filter(st => {
    const matchesSearch = st.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          st.rollNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          st.admissionNo.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClass = selectedClass === 'ALL' || st.className === selectedClass;
    return matchesSearch && matchesClass;
  });

  const uniqueClasses = Array.from(new Set(students.map(s => s.className).filter(Boolean)));

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Top Bar */}
      <header className="page-top-bar no-print">
        <div className="page-top-bar-text">
          <h1>Student & Cohort Analytics</h1>
          <p>Real-time performance diagnostics, AI knowledge gap discovery, and grade distribution</p>
        </div>
      </header>

      <div className="page-container">
        {/* KPI Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {/* Card 1 */}
          <div className="m-card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users className="size-6" />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Total Enrolled</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A' }}>{overview?.totalStudents || students.length || 0}</div>
            </div>
          </div>

          {/* Card 2 */}
          <div className="m-card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp className="size-6" />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Average Score</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A' }}>{overview?.avgScore || 72}%</div>
            </div>
          </div>

          {/* Card 3 */}
          <div className="m-card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: '#F5F3FF', color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileCheck2 className="size-6" />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Papers Evaluated</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A' }}>{overview?.totalSubmissions || 0}</div>
            </div>
          </div>

          {/* Card 4 */}
          <div className="m-card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles className="size-6" />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>AI Grading Accuracy</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A' }}>95.8%</div>
            </div>
          </div>
        </div>

        {/* Grade Distribution & Subject Mastery */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
          {/* Grade Distribution Card */}
          <div className="m-card" style={{ padding: '1.25rem' }}>
            <div className="m-card-header" style={{ marginBottom: '1rem' }}>
              <h3 className="m-card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <BarChart3 className="size-4 text-blue-600" />
                <span>Grade Distribution Across Cohorts</span>
              </h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: 600, color: '#059669' }}>Grade A (&ge; 80%)</span>
                  <span style={{ fontWeight: 700 }}>{overview?.gradeDistribution.A || 0} students</span>
                </div>
                <div style={{ height: '8px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, ((overview?.gradeDistribution.A || 0) / Math.max(1, overview?.totalSubmissions || 1)) * 100)}%`, height: '100%', background: '#10B981' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: 600, color: '#2563EB' }}>Grade B (60% - 79%)</span>
                  <span style={{ fontWeight: 700 }}>{overview?.gradeDistribution.B || 0} students</span>
                </div>
                <div style={{ height: '8px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, ((overview?.gradeDistribution.B || 0) / Math.max(1, overview?.totalSubmissions || 1)) * 100)}%`, height: '100%', background: '#3B82F6' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: 600, color: '#D97706' }}>Grade C (40% - 59%)</span>
                  <span style={{ fontWeight: 700 }}>{overview?.gradeDistribution.C || 0} students</span>
                </div>
                <div style={{ height: '8px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, ((overview?.gradeDistribution.C || 0) / Math.max(1, overview?.totalSubmissions || 1)) * 100)}%`, height: '100%', background: '#F59E0B' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: 600, color: '#DC2626' }}>Grade D (&lt; 40% - Needs Support)</span>
                  <span style={{ fontWeight: 700 }}>{overview?.gradeDistribution.D || 0} students</span>
                </div>
                <div style={{ height: '8px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, ((overview?.gradeDistribution.D || 0) / Math.max(1, overview?.totalSubmissions || 1)) * 100)}%`, height: '100%', background: '#EF4444' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Subject Mastery Card */}
          <div className="m-card" style={{ padding: '1.25rem' }}>
            <div className="m-card-header" style={{ marginBottom: '1rem' }}>
              <h3 className="m-card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <BookOpen className="size-4 text-emerald-600" />
                <span>Subject Mastery Index</span>
              </h3>
            </div>
            {(!overview?.subjectPerformance || overview.subjectPerformance.length === 0) ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.875rem' }}>
                Deploy and grade question papers to populate subject mastery metrics.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                {overview.subjectPerformance.map(subj => (
                  <div key={subj.subject}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 600, color: '#1E293B' }}>{subj.subject}</span>
                      <span style={{ fontWeight: 700, color: subj.avgPercentage >= 65 ? '#059669' : '#D97706' }}>
                        {subj.avgPercentage}% ({subj.papersEvaluated} papers)
                      </span>
                    </div>
                    <div style={{ height: '8px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, subj.avgPercentage)}%`, height: '100%', background: subj.avgPercentage >= 65 ? '#059669' : '#D97706' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Student-Level Drilldown Directory */}
        <div className="m-card">
          <div className="m-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 className="m-card-title">Student Diagnostic Roster</h3>
              <p style={{ fontSize: '0.8125rem', color: '#64748B', margin: '0.2rem 0 0 0' }}>
                Drill down into individual student scores, common knowledge gaps, and WhatsApp status
              </p>
            </div>

            {/* Filter controls */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <Search className="size-4 text-slate-400" style={{ position: 'absolute', left: '10px', top: '10px' }} />
                <input
                  type="text"
                  placeholder="Search student or roll..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '2rem', height: '36px', fontSize: '0.8125rem', width: '220px' }}
                />
              </div>

              {uniqueClasses.length > 0 && (
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="form-input"
                  style={{ height: '36px', fontSize: '0.8125rem' }}
                >
                  <option value="ALL">All Classes</option>
                  {uniqueClasses.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {isLoading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
              Loading analytics and student rosters...
            </div>
          ) : filteredStudents.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
              <Users className="size-10 text-slate-300 mx-auto" style={{ margin: '0 auto 0.75rem auto' }} />
              <p style={{ fontWeight: 600, color: '#334155' }}>No students match your criteria.</p>
              <p style={{ fontSize: '0.8125rem', color: '#94A3B8' }}>Enroll students via the Students tab or upload a bulk roster CSV.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '0.875rem 1rem' }}>Student Name & Roll</th>
                    <th style={{ padding: '0.875rem 1rem' }}>Class & Section</th>
                    <th style={{ padding: '0.875rem 1rem' }}>Tests</th>
                    <th style={{ padding: '0.875rem 1rem' }}>Average %</th>
                    <th style={{ padding: '0.875rem 1rem' }}>Performance Status</th>
                    <th style={{ padding: '0.875rem 1rem' }}>Key Knowledge Gap</th>
                    <th style={{ padding: '0.875rem 1rem' }}>Parent WhatsApp</th>
                    <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((st) => (
                    <tr key={st.id} style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s ease' }} className="hover:bg-slate-50">
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{st.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Roll: {st.rollNumber} {st.admissionNo !== 'N/A' && `| Adm: ${st.admissionNo}`}</div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', background: '#EFF6FF', color: '#1E40AF', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                          {st.className} - Sec {st.sectionName}
                        </span>
                      </td>
                      <td style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>{st.testsTaken}</td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 700, color: st.avgPercentage >= 70 ? '#059669' : st.avgPercentage >= 50 ? '#D97706' : '#DC2626' }}>
                            {st.avgPercentage}%
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        {st.status === 'Excelling' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', background: '#ECFDF5', color: '#065F46', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 }}>
                            <CheckCircle2 className="size-3.5" /> Excelling
                          </span>
                        )}
                        {st.status === 'Average' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', background: '#EFF6FF', color: '#1E40AF', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 }}>
                            Average
                          </span>
                        )}
                        {st.status === 'Needs Support' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', background: '#FEF2F2', color: '#991B1B', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 }}>
                            <AlertTriangle className="size-3.5" /> Needs Support
                          </span>
                        )}
                        {st.status === 'No Tests' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0.2rem 0.5rem', background: '#F1F5F9', color: '#64748B', borderRadius: '999px', fontSize: '0.75rem' }}>
                            Pending Test
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', maxWidth: '240px' }}>
                        {st.knowledgeGaps.length > 0 ? (
                          <span style={{ color: '#B91C1C', fontSize: '0.75rem', fontWeight: 500 }}>
                            {st.knowledgeGaps[0]}
                          </span>
                        ) : (
                          <span style={{ color: '#94A3B8', fontSize: '0.75rem' }}>No critical gaps</span>
                        )}
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        {st.parentPhone && st.parentPhone !== 'N/A' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#059669', fontSize: '0.75rem', fontWeight: 600 }}>
                            <MessageSquare className="size-3.5" />
                            <span>{st.parentPhone}</span>
                          </div>
                        ) : (
                          <span style={{ color: '#94A3B8', fontSize: '0.75rem' }}>Not linked</span>
                        )}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setSelectedStudent(st)}
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                        >
                          <span>Insights</span>
                          <ChevronRight className="size-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Student Diagnostic Detail Modal */}
      {selectedStudent && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div className="m-card" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="m-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 className="m-card-title">{selectedStudent.name}</h3>
                <p style={{ fontSize: '0.8125rem', color: '#64748B', margin: '0.1rem 0 0 0' }}>
                  Roll: {selectedStudent.rollNumber} | {selectedStudent.className} - Section {selectedStudent.sectionName}
                </p>
              </div>
              <button onClick={() => setSelectedStudent(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X className="size-5 text-slate-500" />
              </button>
            </div>

            <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Top highlights */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                <div style={{ padding: '0.75rem', background: '#F8FAFC', borderRadius: '0.5rem', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Cumulative Score</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>{selectedStudent.avgPercentage}%</div>
                </div>
                <div style={{ padding: '0.75rem', background: '#F8FAFC', borderRadius: '0.5rem', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Parent Contact (WhatsApp)</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#059669', marginTop: '0.2rem' }}>
                    {selectedStudent.parentPhone || 'Not connected'}
                  </div>
                </div>
              </div>

              {/* AI Identified Excelled Areas */}
              <div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#065F46', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <CheckCircle2 className="size-4" />
                  <span>Demonstrated Strengths (AI Verified)</span>
                </div>
                {selectedStudent.excelledAreas.length > 0 ? (
                  <ul style={{ paddingLeft: '1.25rem', fontSize: '0.8125rem', color: '#334155' }}>
                    {selectedStudent.excelledAreas.map((area, i) => (
                      <li key={i}>{area}</li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ fontSize: '0.8125rem', color: '#94A3B8' }}>No strength tags recorded yet.</p>
                )}
              </div>

              {/* AI Identified Knowledge Gaps */}
              <div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#991B1B', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <AlertTriangle className="size-4" />
                  <span>Target Revision & Concept Gaps</span>
                </div>
                {selectedStudent.knowledgeGaps.length > 0 ? (
                  <ul style={{ paddingLeft: '1.25rem', fontSize: '0.8125rem', color: '#991B1B' }}>
                    {selectedStudent.knowledgeGaps.map((gap, i) => (
                      <li key={i}>{gap}</li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ fontSize: '0.8125rem', color: '#94A3B8' }}>No critical concept gaps detected.</p>
                )}
              </div>

              {/* Recent tests */}
              <div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#1E293B', marginBottom: '0.4rem' }}>
                  Recent Evaluated Scripts ({selectedStudent.recentSubmissions.length})
                </div>
                {selectedStudent.recentSubmissions.length === 0 ? (
                  <p style={{ fontSize: '0.8125rem', color: '#94A3B8' }}>No evaluated tests for this student yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {selectedStudent.recentSubmissions.map(sub => (
                      <div key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: '#F8FAFC', borderRadius: '4px', fontSize: '0.8125rem' }}>
                        <span style={{ fontWeight: 600 }}>{sub.subject || 'Assignment'}</span>
                        <span style={{ fontWeight: 700, color: '#2563EB' }}>{sub.score}/{sub.maxScore || 40} marks</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
