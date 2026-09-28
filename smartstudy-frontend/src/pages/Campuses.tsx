import React, { useEffect, useState } from 'react';
import { Building2, Plus, MapPin, Mail, Phone, Calendar, X } from 'lucide-react';
import { API_BASE_URL } from '../config/api';

interface BranchItem {
  id: string;
  name: string;
  pincode: string;
  address: string;
  branch_contact_mail: string;
  mobile_number: string;
  corporate?: { id: string; name: string };
  stats?: { totalClasses: number; totalTeachers: number };
}

interface CorporateItem {
  id: string;
  name: string;
  registration_no: string;
}

export default function Campuses() {
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [corporates, setCorporates] = useState<CorporateItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Add Branch Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [pincode, setPincode] = useState('');
  const [address, setAddress] = useState('');
  const [mail, setMail] = useState('');
  const [phone, setPhone] = useState('');
  const [corporateId, setCorporateId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchBranches = () => {
    setIsLoading(true);
    fetch(`${API_BASE_URL}/api/branches`)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.branches)) setBranches(data.branches);
      })
      .catch(err => console.error('Error fetching branches:', err))
      .finally(() => setIsLoading(false));
  };

  const fetchCorporates = () => {
    fetch(`${API_BASE_URL}/api/corporate`)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.corporate)) {
          setCorporates(data.corporate);
          if (data.corporate.length > 0 && !corporateId) {
            setCorporateId(data.corporate[0].id);
          }
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchBranches();
    fetchCorporates();
  }, []);

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !pincode.trim() || !address.trim() || !mail.trim() || !phone.trim()) return;

    let targetCorpId = corporateId;
    // Auto-create a default corporate group if none exist
    if (!targetCorpId && corporates.length === 0) {
      try {
        const corpRes = await fetch(`${API_BASE_URL}/api/corporate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'PAATAM Educational Network', registrationNo: 'REG-PAATAM-2026' })
        });
        const corpData = await corpRes.json();
        if (corpData.success) targetCorpId = corpData.corporate.id;
      } catch (e) {}
    }

    if (!targetCorpId) {
      alert('A corporate educational network is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/branches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          corporateId: targetCorpId,
          name: name.trim(),
          pincode: pincode.trim(),
          address: address.trim(),
          branchContactMail: mail.trim(),
          mobileNumber: phone.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        setName('');
        setPincode('');
        setAddress('');
        setMail('');
        setPhone('');
        fetchBranches();
      } else {
        alert(data.message || 'Error creating branch.');
      }
    } catch (err) {
      alert('Error connecting to server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Header */}
      <header className="page-top-bar no-print">
        <div className="page-top-bar-text">
          <h1>Campuses & Multi-Branch Network</h1>
          <p>Multi-tenant school branches, institutional address profiles, and campus data boundaries</p>
        </div>
      </header>

      <div className="page-container">
        {/* Actions Bar */}
        <div className="m-card" style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 className="m-card-title">Campus Directory</h3>
              <p style={{ fontSize: '0.8125rem', color: '#64748B', margin: '0.2rem 0 0 0' }}>
                {branches.length} campus location(s) active
              </p>
            </div>

            <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
              <Plus className="size-4" />
              <span>Add Campus Branch</span>
            </button>
          </div>
        </div>

        {/* Campuses Grid */}
        {isLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
            Loading campuses...
          </div>
        ) : branches.length === 0 ? (
          <div className="m-card" style={{ padding: '3.5rem 1rem', textAlign: 'center', color: '#64748B' }}>
            <Building2 className="size-10 text-slate-300 mx-auto" style={{ margin: '0 auto 0.75rem auto' }} />
            <p style={{ fontWeight: 600, color: '#334155', margin: 0 }}>No campus branches created yet.</p>
            <p style={{ fontSize: '0.8125rem', color: '#94A3B8', marginTop: '0.25rem' }}>
              Click "Add Campus Branch" to set up your primary school location.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
            {branches.map(branch => (
              <div key={branch.id} className="m-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Building2 className="size-5" />
                      </div>
                      <div>
                        <h4 style={{ fontWeight: 700, color: '#0F172A', fontSize: '1rem', margin: 0 }}>{branch.name}</h4>
                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>{branch.corporate?.name || 'PAATAM Network'}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '0.2rem 0.5rem', background: '#ECFDF5', color: '#065F46', borderRadius: '999px' }}>
                      Active
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.8125rem', color: '#475569', margin: '0.75rem 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <MapPin className="size-3.5 text-slate-400 shrink-0" />
                      <span>{branch.address} (PIN: {branch.pincode})</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Mail className="size-3.5 text-slate-400 shrink-0" />
                      <span>{branch.branch_contact_mail}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Phone className="size-3.5 text-slate-400 shrink-0" />
                      <span>{branch.mobile_number}</span>
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748B' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Calendar className="size-3.5" />
                    <span>Academic: 2026-2027</span>
                  </span>
                  <span style={{ fontWeight: 600, color: '#2563EB' }}>Branch Code: {branch.id.substring(0, 8)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Campus Modal */}
      {isModalOpen && (
        <div className="modal-backdrop animate-fade-in" style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem'
        }}>
          <div className="m-card" style={{ width: '100%', maxWidth: '480px' }}>
            <div className="m-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="m-card-title">Add School Campus</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X className="size-5" />
              </button>
            </div>
            <form onSubmit={handleAddBranch} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>Campus Name *</label>
                <input required type="text" className="form-input" placeholder="e.g. Hyderabad Central Campus" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>Contact Email *</label>
                  <input required type="email" className="form-input" placeholder="hyderabad@paatam.edu" value={mail} onChange={e => setMail(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>Contact Mobile *</label>
                  <input required type="text" className="form-input" placeholder="+91 9876543210" value={phone} onChange={e => setPhone(e.target.value)} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>Physical Address *</label>
                <input required type="text" className="form-input" placeholder="Road No. 12, Banjara Hills" value={address} onChange={e => setAddress(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>Pincode (6 digits) *</label>
                <input required type="text" className="form-input" placeholder="500034" value={pincode} onChange={e => setPincode(e.target.value)} />
              </div>
              <button type="submit" disabled={isSubmitting} className="btn btn-primary" style={{ marginTop: '0.5rem', justifyContent: 'center' }}>
                {isSubmitting ? 'Registering...' : 'Register Campus Branch'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
