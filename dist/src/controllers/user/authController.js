"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateToken = exports.loginUser = void 0;
const authService_1 = require("../../services/authService");
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        // Validation
        if (!email || !password) {
            return res.status(400).json({
                error: 'Missing required fields: email, password',
            });
        }
        // Login user
        const loginResponse = await (0, authService_1.loginUser)({ email, password });
        res.status(200).json(loginResponse);
    }
    catch (err) {
        console.error(err);
        // Handle authentication errors
        if (err.message === 'Invalid email or password') {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        if (err.message === 'User role not found') {
            return res.status(500).json({ error: 'User configuration error' });
        }
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.loginUser = loginUser;
const validateToken = async (req, res) => {
    try {
        // Get token from Authorization header
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }
        // Verify token
        const decoded = (0, authService_1.verifyToken)(token);
        // Return whole decoded payload
        res.status(200).json({ valid: true, user: decoded });
    }
    catch (err) {
        console.error(err);
        if (err.message === 'Token is not valid') {
            return res.status(401).json({ error: 'Token is not valid' });
        }
        res.status(401).json({ error: 'Authentication failed' });
    }
};
exports.validateToken = validateToken;
//# sourceMappingURL=authController.js.map