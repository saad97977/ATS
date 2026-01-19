"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerUser = exports.updateUserStatus = exports.updateUserAdminStatus = exports.getUserById = exports.getAllUsers = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const userService_1 = require("../../services/userService");
// CRUD factory not used here now
const getAllUsers = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const [users, total] = await Promise.all([
            prisma_config_1.default.user.findMany({
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    user_role: {
                        include: {
                            role: true,
                        },
                    },
                },
            }),
            prisma_config_1.default.user.count(),
        ]);
        // Transform the data to only include required fields
        const transformedUsers = users.map(user => ({
            user_id: user.user_id,
            name: user.name,
            email: user.email,
            role_name: user.user_role?.role?.role_name || null,
        }));
        res.json({
            data: transformedUsers,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.getAllUsers = getAllUsers;
const getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        const user = await prisma_config_1.default.user.findUnique({
            where: { user_id: id },
            include: {
                user_role: {
                    include: {
                        role: true,
                    },
                },
                user_activity: true,
            },
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.getUserById = getUserById;
// patch is_admin field
const updateUserAdminStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_admin } = req.body;
        if (typeof is_admin !== 'boolean') {
            return res.status(400).json({ error: 'is_admin must be a boolean' });
        }
        const user = await prisma_config_1.default.user.update({
            where: { user_id: id },
            data: { is_admin },
        });
        res.json({
            message: 'User admin status updated successfully',
            data: user,
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.updateUserAdminStatus = updateUserAdminStatus;
// patch user Status
const updateUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (status !== 'ACTIVE' && status !== 'INACTIVE') {
            return res.status(400).json({ error: "status must be either 'ACTIVE' or 'INACTIVE'" });
        }
        const user = await prisma_config_1.default.user.update({
            where: { user_id: id },
            data: { status },
        });
        res.json({
            message: 'User status updated successfully',
            data: user,
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.updateUserStatus = updateUserStatus;
const registerUser = async (req, res) => {
    try {
        const { name, email, password, role_name } = req.body;
        // Validation
        if (!name || !email || !password || !role_name) {
            return res.status(400).json({
                error: 'Missing required fields: name, email, password, role_name',
            });
        }
        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({
                error: 'Password must be at least 8 characters long and include at least one letter, one number, and one special character',
            });
        }
        // Check if user already exists
        const existingUser = await prisma_config_1.default.user.findUnique({
            where: { email },
        });
        if (existingUser) {
            return res.status(409).json({ error: 'User with this email already exists' });
        }
        // Create user with role
        const newUser = await (0, userService_1.createUserWithRole)({
            name,
            email,
            password,
            role_name,
        });
        res.status(201).json({
            message: 'User created successfully',
            data: newUser,
        });
    }
    catch (err) {
        if (err.code === 'P2002') {
            return res.status(409).json({ error: 'Email already exists' });
        }
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.registerUser = registerUser;
//# sourceMappingURL=userController.js.map