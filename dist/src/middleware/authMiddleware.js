"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizeRole = exports.authenticateToken = void 0;
const authService_1 = require("../services/authService");
const authenticateToken = (req, res, next) => {
    try {
        // Get token from Authorization header
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }
        // Verify token
        const decoded = (0, authService_1.verifyToken)(token);
        // Attach user info to request
        req.user = decoded;
        next();
    }
    catch (err) {
        console.error(err);
        if (err.message === 'Token is not valid') {
            return res.status(401).json({ error: 'Token is not valid' });
        }
        res.status(401).json({ error: 'Authentication failed' });
    }
};
exports.authenticateToken = authenticateToken;
// Optional: Role-based authorization middleware
const authorizeRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!allowedRoles.includes(req.user.role_name)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
};
exports.authorizeRole = authorizeRole;
//# sourceMappingURL=authMiddleware.js.map