export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication is required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. Requires one of the following roles: ${roles.join(', ')}. Your role is: ${req.user.role}`,
      });
    }

    next();
  };
};

// Convenience helpers
export const REVIEWER_ROLES = ['system_admin', 'admin', 'ministry', 'district_authority', 'analyst'];
export const MINISTRY_ROLES = ['system_admin', 'admin', 'ministry'];
export const ALL_ROLES = ['system_admin', 'admin', 'ministry', 'district_authority', 'analyst', 'agency', 'viewer'];

