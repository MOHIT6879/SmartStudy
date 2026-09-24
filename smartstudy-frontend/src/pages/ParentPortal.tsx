import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config/api';

export default function ParentPortal() {
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 4000);
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/notifications`);
      const data = await res.json();
      if (data.success && Array.isArray(data.notifications)) {
        setNotifications(data.notifications);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      
      {/* Sticky Top Header */}
      <header className="page-top-bar no-print">
        <div className="page-top-bar-text">
          <h1>Parent WhatsApp alerts</h1>
          <p>Real-time WhatsApp digest simulation dispatched to parents upon teacher grade verification</p>
        </div>
        <div className="page-top-bar-actions">
          <span className="badge badge-green">● WhatsApp Business API Verified</span>
        </div>
      </header>

      <div className="page-container">
        
        <div className="wa-container">
          {/* WhatsApp Chat Header */}
          <div className="wa-header">
            <div style={{ background: '#25D366', color: 'white', width: '38px', height: '38px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 700 }}>
              🏫
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700 }}>PAATAM.AI School AI Desk</span>
                <span style={{ color: '#34D399', fontSize: '0.75rem', fontWeight: 600 }}>✔ Official</span>
              </div>
              <span style={{ fontSize: '0.75rem', color: '#E2E8F0', fontWeight: 400 }}>Automated WhatsApp Dispatch System</span>
            </div>
          </div>

          {/* WhatsApp Chat Feed */}
          <div className="wa-messages">
            
            <div className="wa-bubble" style={{ alignSelf: 'center', background: '#FFFBEB', border: '1px solid #FCD34D', textAlign: 'center', borderRadius: '0.5rem', maxWidth: '90%' }}>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#92400E' }}>
                🔒 Messages are end-to-end encrypted. Sent to registered parent numbers via WhatsApp API.
              </p>
            </div>

            <div className="wa-bubble">
              <p style={{ margin: 0, color: '#1F2937', fontSize: '0.875rem' }}>
                👋 Welcome to PAATAM.AI Parent Digest! You will receive instant notifications when teachers dispatch assignments and approve evaluated paper copies.
              </p>
              <div style={{ fontSize: '0.6875rem', color: '#94A3B8', textAlign: 'right', marginTop: '0.25rem' }}>09:00 AM</div>
            </div>
            
            {notifications.map((notif, index) => (
              <div key={notif.id || index} className="wa-bubble out" style={{ width: '100%', maxWidth: '90%' }}>
                
                <div style={{ fontSize: '0.8125rem', color: '#047857', fontWeight: 700, marginBottom: '0.25rem' }}>
                  {notif.title || '📲 Class Alert'}
                </div>

                <p style={{ margin: 0, color: '#111827', fontSize: '0.875rem', lineHeight: 1.5 }}>
                  {notif.message}
                </p>
                
                {notif.type === 'evaluation_ready' && notif.details && (
                  <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed #A7F3D0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#065F46' }}>
                        Child Score: {notif.details.score}/100
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#047857', background: '#D1FAE5', padding: '0.15rem 0.4rem', borderRadius: '0.25rem' }}>
                        Approved by Teacher
                      </span>
                    </div>

                    {notif.details.feedback && (
                      <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8125rem', color: '#1E293B' }}>
                        <strong>📝 Teacher Remarks:</strong> {notif.details.feedback}
                      </p>
                    )}

                    {notif.details.socraticHint && (
                      <div style={{ background: '#ECFDF5', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', borderLeft: '3px solid #10B981' }}>
                        <p style={{ margin: 0, fontSize: '0.8125rem', color: '#065F46' }}>
                          <strong>💡 Socratic Hint:</strong> "{notif.details.socraticHint}"
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ fontSize: '0.6875rem', color: '#059669', textAlign: 'right', marginTop: '0.25rem', fontWeight: 600 }}>
                  {new Date(notif.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ✓✓
                </div>
              </div>
            ))}

          </div>
        </div>

      </div>
    </div>
  );
}


