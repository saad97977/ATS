"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUserWithRole = void 0;
const prisma_config_1 = __importDefault(require("../prisma.config"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const createUserWithRole = async (input) => {
    const { name, email, password, role_name } = input;
    // Hash password
    const password_hash = await bcrypt_1.default.hash(password, 10);
    // Create user
    const user = await prisma_config_1.default.user.create({
        data: {
            name,
            email,
            password_hash,
            status: 'ACTIVE',
        },
    });
    // Find or create role
    let role = await prisma_config_1.default.role.findFirst({
        where: { role_name },
    });
    if (!role) {
        role = await prisma_config_1.default.role.create({
            data: { role_name },
        });
    }
    // Create user-role association
    const userRole = await prisma_config_1.default.userRole.create({
        data: {
            user_id: user.user_id,
            role_id: role.role_id,
        },
    });
    return {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        status: user.status,
        role: role.role_name,
    };
};
exports.createUserWithRole = createUserWithRole;
//# sourceMappingURL=userService.js.map