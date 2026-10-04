import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './authMiddleware.js';

/**
 * Extracts branchId and corporateId from headers (x-branch-id, x-corporate-id)
 * or query parameters (branchId, corporateId) and attaches them to req.
 */
export function tenantScope(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const branchId = (req.headers['x-branch-id'] as string) || (req.query.branchId as string) || req.user?.branchId;
  const corporateId = (req.headers['x-corporate-id'] as string) || (req.query.corporateId as string) || req.user?.corporateId;

  if (branchId) req.branchId = branchId;
  if (corporateId) req.corporateId = corporateId;

  next();
}
