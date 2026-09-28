import React, { createContext, useContext, useState, useEffect } from 'react';
import { API_BASE_URL } from '../config/api';

export type UserRole = 'ADMIN' | 'TEACHER' | 'STUDENT';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  title: string;
  branchId?: string;
  branchName?: string;
  classId?: string;
  className?: string;
  sectionName?: string;
}

export interface Branch {
  id: string;
  corporate_id?: string;
  name: string;
  pincode?: string;
  address?: string;
  branch_contact_mail?: string;
  mobile_number?: string;
}

interface AuthContextType {
  currentUser: UserProfile;
  role: UserRole;
  branches: Branch[];
  currentBranchId: string;
  setCurrentBranchId: (id: string) => void;
  switchRole: (role: UserRole) => void;
  loginWithProfile: (profile: UserProfile) => void;
  isRole: (roles: UserRole[]) => boolean;
  logout: () => void;
}

// Pre-configured Personas for instant demo switching
export const DEMO_PROFILES: Record<UserRole, UserProfile> = {
  ADMIN: {
    id: 'admin-dean-1',
    name: 'Dr. Ramesh Sundaram',
    email: 'dean.ramesh@paatam.edu',
    role: 'ADMIN',
    title: 'Dean & Principal (Executive Admin)',
    branchId: 'branch-main',
    branchName: 'Hyderabad Central Campus'
  },
  TEACHER: {
    id: 'teacher-101',
    name: 'Priya Sharma',
    email: 'priya.sharma@paatam.edu',
    role: 'TEACHER',
    title: 'Senior Faculty (Physics & Math)',
    branchId: 'branch-main',
    branchName: 'Hyderabad Central Campus'
  },
  STUDENT: {
    id: 'student-204',
    name: 'Aarav Patel',
    email: 'aarav.patel@student.paatam.edu',
    role: 'STUDENT',
    title: 'Grade 10 - Section A (Roll: 14)',
    branchId: 'branch-main',
    branchName: 'Hyderabad Central Campus',
    className: 'Grade 10',
    sectionName: 'A'
  }
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('paatam_user');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return DEMO_PROFILES.ADMIN;
  });

  const [branches, setBranches] = useState<Branch[]>([
    { id: 'branch-main', name: 'Hyderabad Central Campus' },
    { id: 'branch-north', name: 'Bangalore North Campus' }
  ]);
  const [currentBranchId, setCurrentBranchId] = useState<string>(() => {
    return localStorage.getItem('paatam_branch_id') || 'branch-main';
  });

  // Fetch live branches from backend
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/branches`)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.branches) && data.branches.length > 0) {
          setBranches(data.branches);
          if (!data.branches.some((b: Branch) => b.id === currentBranchId)) {
            setCurrentBranchId(data.branches[0].id);
          }
        }
      })
      .catch(() => {});
  }, []);

  const switchRole = (newRole: UserRole) => {
    const profile = DEMO_PROFILES[newRole];
    setCurrentUser(profile);
    localStorage.setItem('paatam_user', JSON.stringify(profile));
  };

  const loginWithProfile = (profile: UserProfile) => {
    setCurrentUser(profile);
    localStorage.setItem('paatam_user', JSON.stringify(profile));
  };

  const logout = () => {
    switchRole('ADMIN');
  };

  const isRole = (roles: UserRole[]) => {
    return roles.includes(currentUser.role);
  };

  const handleBranchChange = (branchId: string) => {
    setCurrentBranchId(branchId);
    localStorage.setItem('paatam_branch_id', branchId);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        role: currentUser.role,
        branches,
        currentBranchId,
        setCurrentBranchId: handleBranchChange,
        switchRole,
        loginWithProfile,
        isRole,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
