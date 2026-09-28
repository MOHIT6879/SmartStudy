import React, { useEffect, useState } from 'react';
import { Users, Plus, Upload, Search, MessageSquare, Download, X } from 'lucide-react';
import { API_BASE_URL } from '../config/api';

interface Student {
  id: string;
  name: string;
  roll_number?: string;
  admission_no?: string;
  class_id?: string;
  section_id?: string;
  parent_id?: string;
  classes?: { id: string; name: string };
  section?: { id: string; section_name: string };
  parents?: { id: string; name: string; phone_number: string; preferred_channel?: string };
}

interface ClassItem {
  id: string;
  name: string;
  section?: string;
  sections?: { id: string; section_name: string }[];
}

export default function StudentsRoster() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('ALL');
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  // Manual Add Form
  const [newName, setNewName] = useState('');
  const [newRoll, setNewRoll] = useState('');
  const [newAdm, setNewAdm] = useState('');
  const [newClassId, setNewClassId] = useState('');
  const [newParentName, setNewParentName] = useState('');
  const [newParentPhone, setNewParentPhone] = useState('');

  // Bulk CSV
  const [csvContent, setCsvContent] = useState('');
  const [bulkStatus, setBulkStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchStudents = () => {
    setIsLoading(true);
    fetch(`${API_BASE_URL}/api/students`)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.students)) setStudents(data.students);
      })
      .catch(err => console.error('Error fetching students:', err))
      .finally(() => setIsLoading(false));
  };

  const fetchClasses = () => {
    fetch(`${API_BASE_URL}/api/classes`)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.classes)) setClasses(data.classes);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchStudents();
    fetchClasses();
  }, []);

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          rollNumber: newRoll.trim(),
          admissionNo: newAdm.trim(),
          classId: newClassId || null,
          parentName: newParentName.trim(),
          parentPhone: newParentPhone.trim()
        })
      });

      const data = await res.json();
      if (data.success) {
        setIsAddModalOpen(false);
        setNewName('');
        setNewRoll('');
        setNewAdm('');
        setNewParentName('');
        setNewParentPhone('');
        fetchStudents();
      } else {
        alert(data.message || 'Error creating student.');
      }
    } catch (err) {
      alert('Error connecting to server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkUpload = async () => {
    if (!csvContent.trim()) return;
    setIsSubmitting(true);
    setBulkStatus(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/students/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvContent })
      });
      const data = await res.json();
      if (data.success) {
        setBulkStatus(`✅ Successfully enrolled ${data.successful} student(s)! (${data.failed} failed)`);
        fetchStudents();
        setTimeout(() => {
          setIsBulkModalOpen(false);
          setCsvContent('');
          setBulkStatus(null);
        }, 1800);
      } else {
        setBulkStatus(`❌ Error: ${data.message}`);
      }
    } catch (err: any) {
      setBulkStatus('❌ Server communication error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadSampleCsv = () => {
    const sample = `name,roll_number,admission_no,parent_name,parent_phone,parent_email\nAarav Patel,14,ADM-2026-01,Vikram Patel,+919876543210,vikram.patel@gmail.com\nDiya Sharma,08,ADM-2026-02,Sunita Sharma,+919876543211,sunita.sharma@gmail.com\nRohan Verma,22,ADM-2026-03,Amit Verma,+919876543212,amit.verma@gmail.com`;
    const blob = new Blob([sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'PAATAM_Students_Template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCsvContent(String(event.target?.result || ''));
      };
      reader.readAsText(file);
    }
  };

  const filteredStudents = students.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (s.roll_number || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (s.admission_no || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClass = selectedClassId === 'ALL' || s.class_id === selectedClassId;
    return matchesSearch && matchesClass;
  });

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Header */}
      <header className="page-top-bar no-print">
        <div className="page-top-bar-text">
          <h1>Student Roster & Parent CRM</h1>
          <p>Manage student profiles, enroll cohorts via bulk CSV, and verify parent WhatsApp contact links</p>
        </div>
      </header>

      <div className="page-container">
        {/* Action Header Card */}
        <div className="m-card" style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            {/* Search & Filter */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flex: 1 }}>
              <div style={{ position: 'relative', minWidth: '240px' }}>
                <Search className="size-4 text-slate-400" style={{ position: 'absolute', left: '10px', top: '10px' }} />
                <input
                  type="text"
                  placeholder="Search by name, roll, or admission no..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '2rem' }}
                />
              </div>

              {classes.length > 0 && (
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="form-input"
                  style={{ maxWidth: '200px' }}
                >
                  <option value="ALL">All Classes</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name} {c.section ? `(${c.section})` : ''}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setIsBulkModalOpen(true)}>
                <Upload className="size-4" />
                <span>Bulk Import CSV</span>
              </button>
              <button className="btn btn-primary" onClick={() => setIsAddModalOpen(true)}>
                <Plus className="size-4" />
                <span>Add Student</span>
              </button>
            </div>
          </div>
        </div>

        {/* Table of Students */}
        <div className="m-card">
          {isLoading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
              Loading student roster...
            </div>
          ) : filteredStudents.length === 0 ? (
            <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: '#64748B' }}>
              <Users className="size-10 text-slate-300 mx-auto" style={{ margin: '0 auto 0.75rem auto' }} />
              <p style={{ fontWeight: 600, color: '#334155', margin: 0 }}>No students enrolled yet.</p>
              <p style={{ fontSize: '0.8125rem', color: '#94A3B8', marginTop: '0.25rem' }}>
                Click "Bulk Import CSV" or "Add Student" to populate your cohort.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '0.875rem 1rem' }}>Student Profile</th>
                    <th style={{ padding: '0.875rem 1rem' }}>Admission No</th>
                    <th style={{ padding: '0.875rem 1rem' }}>Roll No</th>
                    <th style={{ padding: '0.875rem 1rem' }}>Assigned Class</th>
                    <th style={{ padding: '0.875rem 1rem' }}>Parent / Guardian</th>
                    <th style={{ padding: '0.875rem 1rem' }}>WhatsApp Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map(student => (
                    <tr key={student.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{student.name}</div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem', fontFamily: 'monospace', color: '#475569' }}>
                        {student.admission_no || '—'}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>
                        {student.roll_number || '—'}
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', background: '#EFF6FF', color: '#1E40AF', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                          {student.classes?.name || 'Class 10'} {student.section?.section_name ? `- ${student.section.section_name}` : ''}
                        </span>
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: '#1E293B' }}>{student.parents?.name || 'Not linked'}</div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        {student.parents?.phone_number ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#059669', fontSize: '0.8125rem', fontWeight: 600 }}>
                            <MessageSquare className="size-3.5" />
                            <span>{student.parents.phone_number}</span>
                          </div>
                        ) : (
                          <span style={{ color: '#94A3B8', fontSize: '0.75rem' }}>No phone linked</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Manual Add Student Modal */}
      {isAddModalOpen && (
        <div className="modal-backdrop animate-fade-in" style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem'
        }}>
          <div className="m-card" style={{ width: '100%', maxWidth: '480px' }}>
            <div className="m-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="m-card-title">Add New Student</h3>
              <button onClick={() => setIsAddModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X className="size-5" />
              </button>
            </div>
            <form onSubmit={handleManualAdd} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>Student Name *</label>
                <input required type="text" className="form-input" placeholder="e.g. Aarav Patel" value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>Roll Number</label>
                  <input type="text" className="form-input" placeholder="e.g. 14" value={newRoll} onChange={e => setNewRoll(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>Admission No</label>
                  <input type="text" className="form-input" placeholder="ADM-2026-01" value={newAdm} onChange={e => setNewAdm(e.target.value)} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>Class</label>
                <select className="form-input" value={newClassId} onChange={e => setNewClassId(e.target.value)}>
                  <option value="">Select a class</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.5rem' }}>Parent WhatsApp Link</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <input type="text" className="form-input" placeholder="Parent Name" value={newParentName} onChange={e => setNewParentName(e.target.value)} />
                  <input type="text" className="form-input" placeholder="Mobile (+91...)" value={newParentPhone} onChange={e => setNewParentPhone(e.target.value)} />
                </div>
              </div>
              <button type="submit" disabled={isSubmitting} className="btn btn-primary" style={{ marginTop: '0.75rem', justifyContent: 'center' }}>
                {isSubmitting ? 'Enrolling...' : 'Enroll Student'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Bulk CSV Upload Modal */}
      {isBulkModalOpen && (
        <div className="modal-backdrop animate-fade-in" style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem'
        }}>
          <div className="m-card" style={{ width: '100%', maxWidth: '580px' }}>
            <div className="m-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 className="m-card-title">Bulk Student CSV Onboarding</h3>
                <p style={{ fontSize: '0.8125rem', color: '#64748B', margin: '0.1rem 0 0 0' }}>
                  Upload a spreadsheet of 50 to 500 students with parent WhatsApp details
                </p>
              </div>
              <button onClick={() => setIsBulkModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X className="size-5" />
              </button>
            </div>

            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: '#F8FAFC', borderRadius: '0.5rem', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '0.8125rem', color: '#475569' }}>
                  Need the standard column layout?
                </div>
                <button type="button" onClick={downloadSampleCsv} className="btn btn-secondary btn-sm" style={{ gap: '0.3rem' }}>
                  <Download className="size-3.5" />
                  <span>Download Sample CSV</span>
                </button>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.4rem' }}>
                  Select CSV File
                </label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvFilePick}
                  className="form-input"
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.4rem' }}>
                  Or Paste Raw CSV Data Below
                </label>
                <textarea
                  rows={6}
                  value={csvContent}
                  onChange={e => setCsvContent(e.target.value)}
                  placeholder={`name,roll_number,admission_no,parent_name,parent_phone,parent_email\nAarav Patel,14,ADM-01,Vikram Patel,+919876543210,parent@gmail.com`}
                  className="form-input"
                  style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                />
              </div>

              {bulkStatus && (
                <div style={{ padding: '0.75rem', borderRadius: '0.375rem', fontSize: '0.8125rem', background: bulkStatus.includes('✅') ? '#ECFDF5' : '#FEF2F2', color: bulkStatus.includes('✅') ? '#065F46' : '#991B1B' }}>
                  {bulkStatus}
                </div>
              )}

              <button
                type="button"
                onClick={handleBulkUpload}
                disabled={isSubmitting || !csvContent.trim()}
                className="btn btn-primary"
                style={{ justifyContent: 'center' }}
              >
                <Upload className="size-4" />
                <span>{isSubmitting ? 'Parsing & Enrolling Cohort...' : 'Upload & Process Batch'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
