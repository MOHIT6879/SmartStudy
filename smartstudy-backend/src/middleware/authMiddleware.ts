import { Request, Response, NextFunction } from 'express';
import { supabase } from '../db/supabase.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    role?: string;
    branchId?: string;
    corporateId?: string;
    raw?: any;
  };
  branchId?: string;
  corporateId?: string;
}

/**
 * Optional authentication: checks Authorization Bearer token if present,
 * but does not reject unauthenticated requests.
 * Used for backward compatibility with existing frontend calls.
 */
export async function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    if (!token) return next();

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return next();
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: (user.user_metadata?.role as string) || 'OTHER',
      branchId: (user.user_metadata?.branch_id as string) || undefined,
      corporateId: (user.user_metadata?.corporate_id as string) || undefined,
      raw: user
    };

    if (req.user.branchId) req.branchId = req.user.branchId;
    if (req.user.corporateId) req.corporateId = req.user.corporateId;

    next();
  } catch (err) {
    next();
  }
}

/**
 * Required authentication: rejects requests without a valid Supabase JWT token.
 */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authorization token required.' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ success: false, message: 'Invalid or expired authorization token.' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: (user.user_metadata?.role as string) || 'OTHER',
      branchId: (user.user_metadata?.branch_id as string) || undefined,
      corporateId: (user.user_metadata?.corporate_id as string) || undefined,
      raw: user
    };

    if (req.user.branchId) req.branchId = req.user.branchId;
    if (req.user.corporateId) req.corporateId = req.user.corporateId;

    next();
  } catch (err: any) {
    res.status(401).json({ success: false, message: err?.message || 'Authentication error' });
  }
}
