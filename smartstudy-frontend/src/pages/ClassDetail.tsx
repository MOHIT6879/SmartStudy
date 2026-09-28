import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Plus, ChevronRight, Layers, Users, UserCheck } from 'lucide-react';
import { API_BASE_URL } from '../config/api';

type ClassSubject = { id: string; classId: string; subjectName: string; createdAt: string };
type SectionItem = { id: string; section_name: string; strength: number; class_teacher_id?: string; teacher?: { id: string; name: string } };
type TeacherOption = { id: string; name: string; teacher_id: string };

export default function ClassDetail() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [className, setClassName] = useState('');
  const [activeTab, setActiveTab] = useState<'subjects' | 'sections'>('subjects');

  // Subjects
  const [subjects, setSubjects] = useState<ClassSubject[]>([]);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [isCreatingSubject, setIsCreatingSubject] = useState(false);

  // Sections
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [newSectionName, setNewSectionName] = useState('');
  const [newClassTeacherId, setNewClassTeacherId] = useState('');
  const [isCreatingSection, setIsCreatingSection] = useState(false);
  const [availableTeachers, setAvailableTeachers] = useState<TeacherOption[]>([]);

  const fetchSubjects = () => {
    if (!classId) return;
    fetch(`${API_BASE_URL}/api/classes/${classId}/subjects`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.subjects)) setSubjects(data.subjects);
      })
      .catch((err) => console.error('Unable to load class subjects:', err));
  };

  const fetchSections = () => {
    if (!classId) return;
    fetch(`${API_BASE_URL}/api/classes/${classId}/sections`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.sections)) setSections(data.sections);
      })
      .catch((err) => console.error('Unable to load sections:', err));
  };

  const fetchTeachers = () => {
    fetch(`${API_BASE_URL}/api/teachers`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.teachers)) setAvailableTeachers(data.teachers);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/classes`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.classes)) {
          const match = data.classes.find((c: any) => c.id === classId);
          if (match) setClassName(match.section ? `${match.name} - ${match.section}` : match.name);
        }
      })
      .catch(() => {});
    fetchSubjects();
    fetchSections();
    fetchTeachers();
  }, [classId]);

  const handleAddSubject = async () => {
    const subjectName = newSubjectName.trim();
    if (!subjectName || !classId) return;
    setIsCreatingSubject(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/classes/${classId}/subjects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectName })
      });
      const data = await res.json();
      if (data.success) {
        setNewSubjectName('');
        fetchSubjects();
      } else {
        alert(data.message || 'Unable to add subject.');
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server.');
    } finally {
      setIsCreatingSubject(false);
    }
  };

  const handleAddSection = async () => {
    const sectionName = newSectionName.trim().toUpperCase();
    if (!sectionName || !classId) return;
    setIsCreatingSection(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/classes/${classId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionName,
          classTeacherId: newClassTeacherId || null,
          strength: 0
        })
      });
      const data = await res.json();
      if (data.success) {
        setNewSectionName('');
        setNewClassTeacherId('');
        fetchSections();
      } else {
        alert(data.message || 'Unable to add section.');
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server.');
    } finally {
      setIsCreatingSection(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <header className="page-top-bar no-print">
        <div className="page-top-bar-text">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/classes')} style={{ marginBottom: '0.5rem' }}>
            <ArrowLeft className="size-4" />
            <span>All classes</span>
          </button>
          <h1>{className || 'Class'}</h1>
          <p>Manage curriculum subjects, physical sections, and faculty room allocations</p>
        </div>
      </header>

      <div className="page-container">
        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setActiveTab('subjects')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: activeTab === 'subjects' ? '#EFF6FF' : 'transparent',
              color: activeTab === 'subjects' ? '#1D4ED8' : '#64748B',
              fontWeight: 700,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <BookOpen className="size-4" />
            <span>Curriculum Subjects ({subjects.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sections')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: activeTab === 'sections' ? '#EFF6FF' : 'transparent',
              color: activeTab === 'sections' ? '#1D4ED8' : '#64748B',
              fontWeight: 700,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <Layers className="size-4" />
            <span>Class Sections & Rooms ({sections.length})</span>
          </button>
        </div>

        {/* 1. Subjects Tab */}
        {activeTab === 'subjects' && (
          <div>
            <div className="m-card" style={{ marginBottom: '1.25rem' }}>
              <div className="m-card-header">
                <h3 className="m-card-title">Add a subject to this class</h3>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Physics"
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddSubject()}
                />
                <button className="btn btn-primary" onClick={handleAddSubject} disabled={isCreatingSubject || !newSubjectName.trim()}>
                  <Plus className="size-4" />
                  <span>Add subject</span>
                </button>
              </div>
            </div>

            {subjects.length === 0 ? (
              <div className="m-card" style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#64748B' }}>
                <BookOpen className="size-10 text-slate-300 mx-auto" style={{ margin: '0 auto 0.75rem auto' }} />
                <p style={{ fontWeight: 600, color: '#334155', margin: 0 }}>No subjects configured yet.</p>
                <p style={{ fontSize: '0.8125rem', color: '#94A3B8', marginTop: '0.25rem' }}>
                  Add a subject above to deploy papers and scan student answer sheets.
                </p>
              </div>
            ) : (
              <div className="entity-cards-grid">
                {subjects.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="entity-card entity-card-subject"
                    onClick={() => navigate(`/classes/${classId}/${s.id}`)}
                  >
                    <div className="entity-card-head">
                      <div className="entity-card-icon entity-card-icon-subject">
                        <BookOpen className="size-5" />
                      </div>
                      <span className="entity-card-pill">Subject</span>
                    </div>

                    <h3 className="entity-card-title">{s.subjectName}</h3>
                    <p className="entity-card-subtitle">Deploy papers & scan scripts</p>

                    <div className="entity-card-footer">
                      <span className="entity-card-action">Open Workspace</span>
                      <ChevronRight className="size-4" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2. Sections Tab */}
        {activeTab === 'sections' && (
          <div>
            <div className="m-card" style={{ marginBottom: '1.25rem' }}>
              <div className="m-card-header">
                <h3 className="m-card-title">Add a section (e.g. Section B)</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Section letter, e.g. B"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                />
                <select
                  className="form-input"
                  value={newClassTeacherId}
                  onChange={(e) => setNewClassTeacherId(e.target.value)}
                >
                  <option value="">Designate Class Teacher (Optional)</option>
                  {availableTeachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.teacher_id})</option>
                  ))}
                </select>
                <button className="btn btn-primary" onClick={handleAddSection} disabled={isCreatingSection || !newSectionName.trim()}>
                  <Plus className="size-4" />
                  <span>Create Section</span>
                </button>
              </div>
            </div>

            {sections.length === 0 ? (
              <div className="m-card" style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#64748B' }}>
                <Layers className="size-10 text-slate-300 mx-auto" style={{ margin: '0 auto 0.75rem auto' }} />
                <p style={{ fontWeight: 600, color: '#334155', margin: 0 }}>No sections created yet.</p>
                <p style={{ fontSize: '0.8125rem', color: '#94A3B8', marginTop: '0.25rem' }}>
                  Create Section A or B above to start enrolling students.
                </p>
              </div>
            ) : (
              <div className="entity-cards-grid">
                {sections.map((sec) => (
                  <div key={sec.id} className="m-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                          Section {sec.section_name}
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.5rem', background: '#ECFDF5', color: '#065F46', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700 }}>
                          <Users className="size-3.5" />
                          <span>{sec.strength || 0} Students</span>
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', color: '#475569' }}>
                        <UserCheck className="size-4 text-blue-600" />
                        <span>Class Teacher: <strong>{sec.teacher?.name || 'Not assigned'}</strong></span>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '0.75rem', marginTop: '1rem', fontSize: '0.75rem', color: '#94A3B8' }}>
                      Roster synchronized with Supabase SIS
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
