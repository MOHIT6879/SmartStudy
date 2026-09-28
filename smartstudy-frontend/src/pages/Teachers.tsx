import React, { useEffect, useState } from 'react';
import { Users, Plus, BookOpen, Trash2, Mail, Phone, X } from 'lucide-react';
import { API_BASE_URL } from '../config/api';

interface TeacherItem {
  id: string;
  name: string;
  teacher_id: string;
  contact_email: string;
  contact_mobile: string;
  branches?: { id: string; name: string };
  teacher_subject?: { id: string; subject_id: string; subjects?: { id: string; name: string } }[];
}

interface SubjectItem {
  id: string;
  name: string;
}

export default function Teachers() {
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Add Teacher Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Allocate Subject Modal
  const [isAllocModalOpen, setIsAllocModalOpen] = useState(false);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');

  const fetchTeachers = () => {
    setIsLoading(true);
    fetch(`${API_BASE_URL}/api/teachers`)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.teachers)) setTeachers(data.teachers);
      })
      .catch(err => console.error('Error fetching teachers:', err))
      .finally(() => setIsLoading(false));
  };

  const fetchSubjects = () => {
    fetch(`${API_BASE_URL}/api/subjects`)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.subjects)) setSubjects(data.subjects);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchTeachers();
    fetchSubjects();
  }, []);

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !teacherId.trim() || !email.trim()) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/teachers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          teacherId: teacherId.trim(),
          contactEmail: email.trim(),
          contactMobile: mobile.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsAddModalOpen(false);
        setName('');
        setTeacherId('');
        setEmail('');
        setMobile('');
        fetchTeachers();
      } else {
        alert(data.message || 'Error creating teacher.');
      }
    } catch (err) {
      alert('Error connecting to server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAllocateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeacherId || !selectedSubjectId) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/teacher-subjects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: selectedTeacherId,
          subjectId: selectedSubjectId
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsAllocModalOpen(false);
        setSelectedTeacherId('');
        setSelectedSubjectId('');
        fetchTeachers();
      } else {
        alert(data.message || 'Error allocating subject.');
      }
    } catch (err) {
      alert('Error connecting to server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveAllocation = async (mappingId: string) => {
    if (!window.confirm('Remove this subject assignment?')) return;
    try {
      await fetch(`${API_BASE_URL}/api/teacher-subjects/${mappingId}`, { method: 'DELETE' });
      fetchTeachers();
    } catch (err) {
      alert('Error removing allocation.');
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Top Bar */}
      <header className="page-top-bar no-print">
        <div className="page-top-bar-text">
          <h1>Faculty & Staff Directory</h1>
          <p>Institutional staff records, teacher employee IDs, and curriculum subject allocations</p>
        </div>
      </header>

      <div className="page-container">
        {/* Actions Bar */}
        <div className="m-card" style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 className="m-card-title">Staff Management</h3>
              <p style={{ fontSize: '0.8125rem', color: '#64748B', margin: '0.2rem 0 0 0' }}>
                {teachers.length} faculty member(s) registered
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setIsAllocModalOpen(true)}>
                <BookOpen className="size-4" />
                <span>Assign Subject</span>
              </button>
              <button className="btn btn-primary" onClick={() => setIsAddModalOpen(true)}>
                <Plus className="size-4" />
                <span>Add Teacher</span>
              </button>
            </div>
          </div>
        </div>

        {/* Teachers Table */}
        <div className="m-card">
          {isLoading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
              Loading faculty directory...
            </div>
          ) : teachers.length === 0 ? (
            <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: '#64748B' }}>
              <Users className="size-10 text-slate-300 mx-auto" style={{ margin: '0 auto 0.75rem auto' }} />
              <p style={{ fontWeight: 600, color: '#334155', margin: 0 }}>No faculty members added yet.</p>
              <p style={{ fontSize: '0.8125rem', color: '#94A3B8', marginTop: '0.25rem' }}>
                Click "Add Teacher" above to register school staff.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '0.875rem 1rem' }}>Faculty Name</th>
                    <th style={{ padding: '0.875rem 1rem' }}>Staff ID</th>
                    <th style={{ padding: '0.875rem 1rem' }}>Contact Email</th>
                    <th style={{ padding: '0.875rem 1rem' }}>Mobile</th>
                    <th style={{ padding: '0.875rem 1rem' }}>Assigned Subjects</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{t.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{t.branches?.name || 'Main Campus'}</div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem', fontFamily: 'monospace', fontWeight: 600 }}>
                        {t.teacher_id}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', color: '#475569' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Mail className="size-3.5 text-slate-400" />
                          <span>{t.contact_email}</span>
                        </div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem', color: '#475569' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Phone className="size-3.5 text-slate-400" />
                          <span>{t.contact_mobile}</span>
                        </div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {(!t.teacher_subject || t.teacher_subject.length === 0) ? (
                            <span style={{ color: '#94A3B8', fontSize: '0.75rem' }}>None allocated</span>
                          ) : (
                            t.teacher_subject.map(ts => (
                              <span key={ts.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', background: '#EFF6FF', color: '#1E40AF', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                                <span>{ts.subjects?.name || 'Subject'}</span>
                                <button type="button" onClick={() => handleRemoveAllocation(ts.id)} style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', display: 'flex' }}>
                                  <Trash2 className="size-3 hover:text-red-600" />
                                </button>
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add Teacher Modal */}
      {isAddModalOpen && (
        <div className="modal-backdrop animate-fade-in" style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem'
        }}>
          <div className="m-card" style={{ width: '100%', maxWidth: '440px' }}>
            <div className="m-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="m-card-title">Add Faculty Member</h3>
              <button onClick={() => setIsAddModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X className="size-5" />
              </button>
            </div>
            <form onSubmit={handleAddTeacher} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>Full Name *</label>
                <input required type="text" className="form-input" placeholder="e.g. Priya Sharma" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>Employee / Staff ID *</label>
                <input required type="text" className="form-input" placeholder="e.g. TCH-102" value={teacherId} onChange={e => setTeacherId(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>Official Email *</label>
                <input required type="email" className="form-input" placeholder="priya.sharma@paatam.edu" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>Mobile Number *</label>
                <input required type="text" className="form-input" placeholder="+91 9876543210" value={mobile} onChange={e => setMobile(e.target.value)} />
              </div>
              <button type="submit" disabled={isSubmitting} className="btn btn-primary" style={{ marginTop: '0.5rem', justifyContent: 'center' }}>
                {isSubmitting ? 'Registering...' : 'Register Teacher'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Allocate Subject Modal */}
      {isAllocModalOpen && (
        <div className="modal-backdrop animate-fade-in" style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem'
        }}>
          <div className="m-card" style={{ width: '100%', maxWidth: '440px' }}>
            <div className="m-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="m-card-title">Assign Subject to Faculty</h3>
              <button onClick={() => setIsAllocModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X className="size-5" />
              </button>
            </div>
            <form onSubmit={handleAllocateSubject} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>Select Teacher *</label>
                <select required className="form-input" value={selectedTeacherId} onChange={e => setSelectedTeacherId(e.target.value)}>
                  <option value="">Choose teacher...</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.teacher_id})</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>Select Subject *</label>
                <select required className="form-input" value={selectedSubjectId} onChange={e => setSelectedSubjectId(e.target.value)}>
                  <option value="">Choose subject...</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <button type="submit" disabled={isSubmitting} className="btn btn-primary" style={{ marginTop: '0.5rem', justifyContent: 'center' }}>
                {isSubmitting ? 'Assigning...' : 'Confirm Assignment'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
