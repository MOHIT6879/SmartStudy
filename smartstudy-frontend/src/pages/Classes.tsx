import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Plus, ChevronRight } from 'lucide-react';
import { API_BASE_URL } from '../config/api';

type ClassItem = { id: string; name: string; section: string | null; createdAt: string };

export default function Classes() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [newClassName, setNewClassName] = useState('');
  const [newSection, setNewSection] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const fetchClasses = () => {
    fetch(`${API_BASE_URL}/api/classes`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.classes)) setClasses(data.classes);
      })
      .catch((err) => console.error('Unable to load classes:', err));
  };

  useEffect(() => {
    fetchClasses();
  }, []);

  const handleCreateClass = async () => {
    const name = newClassName.trim();
    const section = newSection.trim();
    if (!name || !section) return;
    setIsCreating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/classes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, section })
      });
      const data = await res.json();
      if (data.success) {
        setNewClassName('');
        setNewSection('');
        fetchClasses();
      } else {
        alert(data.message || 'Unable to create class.');
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
          <h1>Classes</h1>
          <p>Open a class to manage its subjects, question papers and grading</p>
        </div>
      </header>

      <div className="page-container">
        <div className="m-card" style={{ marginBottom: '1.25rem' }}>
          <div className="m-card-header">
            <h3 className="m-card-title">Add a new class</h3>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Grade 10"
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateClass()}
            />
            <input
              type="text"
              className="form-input"
              placeholder="Section (required), e.g. A"
              value={newSection}
              onChange={(e) => setNewSection(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateClass()}
              style={{ maxWidth: '220px' }}
            />
            <button className="btn btn-primary" onClick={handleCreateClass} disabled={isCreating || !newClassName.trim() || !newSection.trim()}>
              <Plus className="size-4" />
              <span>Add class</span>
            </button>
          </div>
        </div>

        {classes.length === 0 ? (
          <div className="m-card" style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#64748B' }}>
            <GraduationCap className="size-10 text-slate-300 mx-auto" style={{ margin: '0 auto 0.75rem auto' }} />
            <p style={{ fontWeight: 600, color: '#334155', margin: 0 }}>No classes yet.</p>
            <p style={{ fontSize: '0.8125rem', color: '#94A3B8', marginTop: '0.25rem' }}>
              Add your first class above to start deploying question papers.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {classes.map((cls) => (
              <div
                key={cls.id}
                className="submission-row-card"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/classes/${cls.id}`)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '0.625rem', background: '#EFF6FF', display: 'grid', placeItems: 'center', color: '#2563EB' }}>
                    <GraduationCap className="size-5" />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>{cls.section ? `${cls.name} - ${cls.section}` : cls.name}</div>
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
