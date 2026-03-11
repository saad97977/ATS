"use strict";
// ================================================================
// controllers/user/authController.ts
//
// WHAT CHANGED:
//   • officeType is now passed to loginUserService so the service
//     validates access and embeds office_type as a signed JWT claim
//   • Removed duplicate post-auth office-flag check (now in service)
//   • Handles OFFICE_ACCESS_DENIED error thrown by the service
//   • validateToken is unchanged
// ================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateToken = exports.loginUser = void 0;
const authService_1 = require("../../services/authService");
const VALID_OFFICE_TYPES = ['clientOffice', 'backOffice', 'frontOffice'];
// ── loginUser ────────────────────────────────────────────────
const loginUser = async (req, res) => {
    try {
        const { email, password, officeType } = req.body;
        // 1. Basic field validation
        if (!email || !password) {
            return res.status(400).json({
                error: 'Missing required fields: email, password',
            });
        }
        // 2. Validate officeType
        if (!officeType || !VALID_OFFICE_TYPES.includes(officeType)) {
            return res.status(400).json({
                error: 'officeType is required. Must be one of: clientOffice, backOffice, frontOffice',
            });
        }
        // 3. Authenticate + access-check + token generation (all in service)
        const loginResponse = await (0, authService_1.loginUser)({ email, password, officeType });
        // 4. All good — return token + full user object (includes office_type claim)
        return res.status(200).json(loginResponse);
    }
    catch (err) {
        console.error('loginUser error:', err);
        if (err.message === 'Invalid email or password' ||
            err.message === 'Account is inactive. Please contact your administrator.') {
            return res.status(401).json({ error: err.message });
        }
        if (err.code === 'OFFICE_ACCESS_DENIED') {
            return res.status(403).json({ error: err.message, code: 'OFFICE_ACCESS_DENIED' });
        }
        if (err.message === 'User role not found') {
            return res.status(500).json({ error: 'User configuration error' });
        }
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.loginUser = loginUser;
// ── validateToken ────────────────────────────────────────────
// Unchanged
const validateToken = async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }
        const decoded = (0, authService_1.verifyToken)(token);
        res.status(200).json({ valid: true, user: decoded });
    }
    catch (err) {
        console.error('validateToken error:', err);
        if (err.message === 'Token is not valid') {
            return res.status(401).json({ error: 'Token is not valid' });
        }
        res.status(401).json({ error: 'Authentication failed' });
    }
};
exports.validateToken = validateToken;
//# sourceMappingURL=authController.js.map