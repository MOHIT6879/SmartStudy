import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Plus, ChevronRight } from 'lucide-react';
import { API_BASE_URL } from '../config/api';

type ClassSubject = { id: string; classId: string; subjectName: string; createdAt: string };

export default function ClassDetail() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [className, setClassName] = useState('');
  const [subjects, setSubjects] = useState<ClassSubject[]>([]);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const fetchSubjects = () => {
    if (!classId) return;
    fetch(`${API_BASE_URL}/api/classes/${classId}/subjects`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.subjects)) setSubjects(data.subjects);
      })
      .catch((err) => console.error('Unable to load class subjects:', err));
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
  }, [classId]);

  const handleAddSubject = async () => {
    const subjectName = newSubjectName.trim();
    if (!subjectName || !classId) return;
    setIsCreating(true);
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
      setIsCreating(false);
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
          <p>Subjects taught in this class — open one to deploy papers and grade scripts</p>
        </div>
      </header>

      <div className="page-container">
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
            <button className="btn btn-primary" onClick={handleAddSubject} disabled={isCreating || !newSubjectName.trim()}>
              <Plus className="size-4" />
              <span>Add subject</span>
            </button>
          </div>
        </div>

        {subjects.length === 0 ? (
          <div className="m-card" style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#64748B' }}>
            <BookOpen className="size-10 text-slate-300 mx-auto" style={{ margin: '0 auto 0.75rem auto' }} />
            <p style={{ fontWeight: 600, color: '#334155', margin: 0 }}>No subjects yet.</p>
            <p style={{ fontSize: '0.8125rem', color: '#94A3B8', marginTop: '0.25rem' }}>
              Add a subject above to start deploying question papers for this class.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {subjects.map((s) => (
              <div
                key={s.id}
                className="submission-row-card"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/classes/${classId}/${s.id}`)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '0.625rem', background: '#EFF6FF', display: 'grid', placeItems: 'center', color: '#2563EB' }}>
                    <BookOpen className="size-5" />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>{s.subjectName}</div>
                </div>
                <ChevronRight className="size-4 text-slate-400" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
