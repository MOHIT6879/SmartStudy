import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './authMiddleware.js';

export type AllowedRole = 'DEAN' | 'PRINCIPAL' | 'VICE_PRINCIPAL' | 'OTHER' | 'TEACHER' | 'STUDENT';

/**
 * Ensures user has one of the allowed roles.
 */
export function requireRole(allowedRoles: AllowedRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required for this operation.' });
    }

    const userRole = (req.user.role || 'OTHER').toUpperCase() as AllowedRole;
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Access requires one of [${allowedRoles.join(', ')}]. Current role: ${userRole}`
      });
    }

    next();
  };
}
