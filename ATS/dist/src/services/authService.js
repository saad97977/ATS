"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginUser = exports.verifyToken = exports.generateToken = void 0;
// ==========================================
// 1. AUTH SERVICE (authService.ts)
// ==========================================
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma_config_1 = __importDefault(require("../prisma.config"));
// Generate JWT token
const generateToken = (payload) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET is not defined in environment variables');
    }
    return jsonwebtoken_1.default.sign(payload, secret, {
        expiresIn: '24h', // 1 day
    });
};
exports.generateToken = generateToken;
// Verify JWT token
const verifyToken = (token) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET is not defined in environment variables');
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        return decoded;
    }
    catch (error) {
        throw new Error('Token is not valid');
    }
};
exports.verifyToken = verifyToken;
// Login user
const loginUser = async (input) => {
    const { email, password } = input;
    // Find user by email with role information
    const user = await prisma_config_1.default.user.findUnique({
        where: { email },
        include: {
            user_role: {
                include: {
                    role: true,
                },
            },
        },
    });
    // Check if user exists
    if (!user) {
        throw new Error('Invalid email or password');
    }
    // Verify password
    const isPasswordValid = await bcrypt_1.default.compare(password, user.password_hash);
    if (!isPasswordValid) {
        throw new Error('Invalid email or password');
    }
    // Check if user has a role
    if (!user.user_role || !user.user_role.role) {
        throw new Error('User role not found');
    }
    // Update or create user activity with last login time
    await prisma_config_1.default.userActivity.upsert({
        where: { user_id: user.user_id },
        update: {
            last_login_at: new Date(),
        },
        create: {
            user_id: user.user_id,
            last_login_at: new Date(),
        },
    });
    // Create JWT payload
    const payload = {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role_name: user.user_role.role.role_name,
        is_admin: user.is_admin,
    };
    // Generate token
    const token = (0, exports.generateToken)(payload);
    // Return login response
    return {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        is_admin: user.is_admin,
        token,
    };
};
exports.loginUser = loginUser;
//# sourceMappingURL=authService.js.map