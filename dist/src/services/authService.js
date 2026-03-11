"use strict";
// ================================================================
// services/authService.ts
//
// WHAT CHANGED:
//   • loginUser() accepts officeType and validates access server-side
//   • office_type is embedded as a signed JWT claim (tamper-proof)
//   • All three office-access flags also remain in the payload
//   • Added inactive account check
//   • verifyToken is unchanged
// ================================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = exports.loginUser = void 0;
const prisma_config_1 = __importDefault(require("../prisma.config"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';
// Maps officeType → the corresponding DB flag column
const OFFICE_FLAG_MAP = {
    clientOffice: 'client_office_allow',
    backOffice: 'back_office_allow',
    frontOffice: 'front_office_allow',
};
const OFFICE_LABEL_MAP = {
    clientOffice: 'Client Office',
    backOffice: 'Back Office',
    frontOffice: 'Front Office',
};
// ── loginUser ────────────────────────────────────────────────
const loginUser = async ({ email, password, officeType }) => {
    // 1. Find user — include role
    const user = await prisma_config_1.default.user.findUnique({
        where: { email },
        include: {
            user_role: {
                include: { role: true },
            },
        },
    });
    if (!user)
        throw new Error('Invalid email or password');
    // 2. Verify password
    const passwordMatch = await bcrypt_1.default.compare(password, user.password_hash);
    if (!passwordMatch)
        throw new Error('Invalid email or password');
    // 3. Check account is active
    if (user.status !== 'ACTIVE') {
        throw new Error('Account is inactive. Please contact your administrator.');
    }
    // 4. Resolve role
    const role = user.user_role?.role?.role_name;
    if (!role)
        throw new Error('User role not found');
    // 5. Validate office-access BEFORE signing the token
    const requiredFlag = OFFICE_FLAG_MAP[officeType];
    if (!(user[requiredFlag] ?? false)) {
        const officeLabel = OFFICE_LABEL_MAP[officeType];
        throw Object.assign(new Error(`Access denied. You do not have permission to access the ${officeLabel}. Contact your administrator.`), { code: 'OFFICE_ACCESS_DENIED' });
    }
    // 6. Build JWT payload — office_type is now a signed claim
    const payload = {
        user_id: user.user_id,
        email: user.email,
        name: user.name,
        role,
        is_admin: user.is_admin,
        office_type: officeType,
        client_office_allow: user.client_office_allow ?? false,
        back_office_allow: user.back_office_allow ?? false,
        front_office_allow: user.front_office_allow ?? false,
    };
    // 7. Sign token
    const token = jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    // 8. Return — user object mirrors JWT payload (never expose password_hash)
    return {
        token,
        user: payload,
    };
};
exports.loginUser = loginUser;
// ── verifyToken ──────────────────────────────────────────────
// Unchanged
const verifyToken = (token) => {
    try {
        return jsonwebtoken_1.default.verify(token, JWT_SECRET);
    }
    catch {
        throw new Error('Token is not valid');
    }
};
exports.verifyToken = verifyToken;
//# sourceMappingURL=authService.js.map