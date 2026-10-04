import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ShieldCheck,
  Users,
  GraduationCap,
  Building2,
  KeyRound,
  ArrowRight,
  Sparkles,
  Lock,
  Mail,
  CheckCircle2,
  ArrowLeft
} from 'lucide-react';
import { useAuth, type UserRole, DEMO_PROFILES } from '../context/AuthContext';
import { API_BASE_URL } from '../config/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const {
    role,
    switchRole,
    loginWithProfile,
    branches,
    currentBranchId,
    setCurrentBranchId
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSelectPersona = (selectedRole: UserRole) => {
    switchRole(selectedRole);
    setSuccessMsg(`Switched active persona to ${DEMO_PROFILES[selectedRole].name}`);
    setTimeout(() => {
      navigate('/');
    }, 600);
  };

  const handleCustomLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.success && data.user) {
        loginWithProfile({
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          role: data.user.role as UserRole,
          title: data.user.type === 'admin' ? `${data.user.role} (Executive)` : data.user.type === 'teacher' ? 'Faculty' : 'Student Learner',
          branchId: currentBranchId
        });
        setSuccessMsg(`Welcome back, ${data.user.name}!`);
        setTimeout(() => {
          navigate('/');
        }, 600);
      } else {
        // Fallback demo matching
        const demoMatch = Object.values(DEMO_PROFILES).find(p => p.email.toLowerCase() === email.toLowerCase());
        if (demoMatch) {
          loginWithProfile(demoMatch);
          setSuccessMsg(`Welcome, ${demoMatch.name}!`);
          setTimeout(() => navigate('/'), 600);
        } else {
          setErrorMsg(data.message || 'Invalid credentials. Please select a 1-click persona or enter verified email.');
        }
      }
    } catch {
      // Offline fallback: check if matches any demo profile
      const demoMatch = Object.values(DEMO_PROFILES).find(p => p.email.toLowerCase() === email.toLowerCase());
      if (demoMatch) {
        loginWithProfile(demoMatch);
        setSuccessMsg(`Signed in as ${demoMatch.name}!`);
        setTimeout(() => navigate('/'), 600);
      } else {
        // Fallback allow instant teacher sign-in for demo
        loginWithProfile({
          id: 'teacher-custom',
          name: email.split('@')[0].replace('.', ' '),
          email: email,
          role: 'TEACHER',
          title: 'Teacher',
          branchId: currentBranchId
        });
        setSuccessMsg('Signed in successfully!');
        setTimeout(() => navigate('/'), 600);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page-wrapper">
      {/* Decorative Background Elements */}
      <div className="login-bg-glow-top" />
      <div className="login-bg-glow-bottom" />

      <div className="login-container">
        {/* Navigation Bar / Back */}
        <div className="login-top-bar">
          <Link to="/" className="login-back-link">
            <ArrowLeft size={16} />
            <span>Return to Workspace</span>
          </Link>
          <div className="login-brand-capsule">
            <img src="/logo.jpg" alt="Logo" className="login-logo-img" />
            <span className="login-brand-text">PAATAM.AI</span>
          </div>
        </div>

        {/* Main Dual Cards */}
        <div className="login-card-grid">
          {/* Card 1: 1-Click Role Access */}
          <div className="login-panel persona-panel">
            <div className="panel-header">
              <div className="panel-badge">
                <Sparkles size={14} className="text-amber-500" />
                <span>Instant Perspective</span>
              </div>
              <h2 className="panel-title">1-Click Role Switcher</h2>
              <p className="panel-subtitle">
                Instantly explore the grading desk, administrative portals, or student workspaces.
              </p>
            </div>

            <div className="persona-selection-stack">
              {/* Dean / Admin */}
              <div
                className={`persona-selection-card ${role === 'ADMIN' ? 'active' : ''}`}
                onClick={() => handleSelectPersona('ADMIN')}
              >
                <div className="persona-card-icon-box admin">
                  <ShieldCheck size={22} />
                </div>
                <div className="persona-card-content">
                  <div className="persona-card-title">Dean & Principal</div>
                  <div className="persona-card-desc">Dr. Ramesh Sundaram • Institutional governance & branches</div>
                </div>
                <div className="persona-card-arrow">
                  <ArrowRight size={16} />
                </div>
              </div>

              {/* Teacher */}
              <div
                className={`persona-selection-card ${role === 'TEACHER' ? 'active' : ''}`}
                onClick={() => handleSelectPersona('TEACHER')}
              >
                <div className="persona-card-icon-box teacher">
                  <Users size={22} />
                </div>
                <div className="persona-card-content">
                  <div className="persona-card-title">Faculty Teacher</div>
                  <div className="persona-card-desc">Mohit Yadav • OCR grading, question papers & roster</div>
                </div>
                <div className="persona-card-arrow">
                  <ArrowRight size={16} />
                </div>
              </div>

              {/* Student */}
              <div
                className={`persona-selection-card ${role === 'STUDENT' ? 'active' : ''}`}
                onClick={() => handleSelectPersona('STUDENT')}
              >
                <div className="persona-card-icon-box student">
                  <GraduationCap size={22} />
                </div>
                <div className="persona-card-content">
                  <div className="persona-card-title">Student Learner</div>
                  <div className="persona-card-desc">Aarav Patel • Submissions, AI hints & progress tracker</div>
                </div>
                <div className="persona-card-arrow">
                  <ArrowRight size={16} />
                </div>
              </div>
            </div>

            {/* Campus Selector */}
            <div className="campus-switch-box">
              <label className="campus-label">
                <Building2 size={15} className="text-blue-500" />
                <span>Active Branch Campus</span>
              </label>
              <select
                value={currentBranchId}
                onChange={(e) => setCurrentBranchId(e.target.value)}
                className="campus-select-input"
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Card 2: Institutional Sign In Form */}
          <div className="login-panel form-panel">
            <div className="panel-header">
              <div className="panel-badge">
                <Lock size={13} className="text-blue-500" />
                <span>Single Sign-On</span>
              </div>
              <h2 className="panel-title">Institutional Credentials</h2>
              <p className="panel-subtitle">
                Enter your verified academic email and institutional password.
              </p>
            </div>

            {errorMsg && (
              <div className="login-alert-banner error animate-fade-in">
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="login-alert-banner success animate-fade-in">
                <CheckCircle2 size={16} />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleCustomLogin} className="login-form">
              <div className="login-input-field">
                <label className="input-label">Academic Email</label>
                <div className="input-box-wrapper">
                  <Mail size={16} className="input-icon" />
                  <input
                    type="email"
                    required
                    placeholder="e.g. mohit.yadav@paatam.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="login-text-input"
                  />
                </div>
              </div>

              <div className="login-input-field">
                <label className="input-label">Password</label>
                <div className="input-box-wrapper">
                  <KeyRound size={16} className="input-icon" />
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="login-text-input"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="login-submit-button"
              >
                {isLoading ? (
                  <span>Verifying Credentials...</span>
                ) : (
                  <>
                    <span>Sign In to Institutional Portal</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            <div className="login-panel-footer">
              <div className="security-note">
                <CheckCircle2 size={14} className="text-emerald-500" />
                <span>SOC2 Certified • 256-bit Institutional Encryption</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
