import prisma from '../../prisma.config';
import { Request, Response } from 'express';
import { createUserWithRole } from '../../services/userService';

// ─────────────────────────────────────────────────────────────
// GET ALL USERS
// ─────────────────────────────────────────────────────────────

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const getAll = req.query.all === 'true';

    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = getAll
      ? undefined
      : Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = getAll ? undefined : (page - 1) * limit!;

    // Optional filters (new)
    const search = (req.query.search as string)?.trim();
    const status = req.query.status as string | undefined;

    const where: any = {};

    if (status && ['ACTIVE', 'INACTIVE'].includes(status.toUpperCase())) {
      where.status = status.toUpperCase();
    }

    if (search) {
      where.OR = [
        { name:  { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          user_role: {
            include: { role: true },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const transformedUsers = users.map(user => ({
      user_id:             user.user_id,
      name:                user.name,
      email:               user.email,
      status:              user.status,
      is_admin:            user.is_admin,
      client_office_allow: user.client_office_allow,
      back_office_allow:   user.back_office_allow,
      front_office_allow:  user.front_office_allow,
      role_name:           user.user_role?.role?.role_name || null,
      created_at:          user.created_at,
      updated_at:          user.updated_at,
    }));

    res.json({
      data: transformedUsers,
      paging: getAll
        ? null
        : {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit!),
          },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─────────────────────────────────────────────────────────────
// GET USER BY ID
// ─────────────────────────────────────────────────────────────

export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const user = await prisma.user.findUnique({
      where: { user_id: id },
      include: {
        user_role: {
          include: { role: true },
        },
        user_activity: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Never expose password_hash
    const { password_hash, ...safeUser } = user as any;
    res.json(safeUser);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─────────────────────────────────────────────────────────────
// PATCH — Update general info (name, email)
// PATCH /users/:id
// ─────────────────────────────────────────────────────────────

export const updateUserInfo = async (req: Request, res: Response) => {
  try {
    const { id }          = req.params;
    const { name, email } = req.body;

    if (!name && !email) {
      return res.status(400).json({
        error: 'Provide at least one field to update: name or email',
      });
    }

    if (name !== undefined && typeof name !== 'string') {
      return res.status(400).json({ error: 'name must be a string' });
    }

    if (email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email address' });
      }
      const conflict = await prisma.user.findUnique({ where: { email } });
      if (conflict && conflict.user_id !== id) {
        return res.status(409).json({ error: 'Email already in use by another user' });
      }
    }

    const updateData: any = {};
    if (name  !== undefined) updateData.name  = name;
    if (email !== undefined) updateData.email = email;

    const user = await prisma.user.update({
      where: { user_id: id },
      data:  updateData,
    });

    const { password_hash, ...safeUser } = user as any;
    res.json({
      message: 'User info updated successfully',
      data: safeUser,
    });
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found' });
    if (err.code === 'P2002') return res.status(409).json({ error: 'Email already in use' });
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─────────────────────────────────────────────────────────────
// PATCH — Update is_admin flag  (unchanged from original)
// PATCH /users/:id/admin
// ─────────────────────────────────────────────────────────────

export const updateUserAdminStatus = async (req: Request, res: Response) => {
  try {
    const { id }       = req.params;
    const { is_admin } = req.body;

    if (typeof is_admin !== 'boolean') {
      return res.status(400).json({ error: 'is_admin must be a boolean' });
    }

    const user = await prisma.user.update({
      where: { user_id: id },
      data:  { is_admin },
    });

    res.json({
      message: 'User admin status updated successfully',
      data: user,
    });
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found' });
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─────────────────────────────────────────────────────────────
// PATCH — Update status  (unchanged from original)
// PATCH /users/:id/status
// ─────────────────────────────────────────────────────────────

export const updateUserStatus = async (req: Request, res: Response) => {
  try {
    const { id }     = req.params;
    const { status } = req.body;

    if (status !== 'ACTIVE' && status !== 'INACTIVE') {
      return res.status(400).json({ error: "status must be either 'ACTIVE' or 'INACTIVE'" });
    }

    const user = await prisma.user.update({
      where: { user_id: id },
      data:  { status },
    });

    res.json({
      message: 'User status updated successfully',
      data: user,
    });
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found' });
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─────────────────────────────────────────────────────────────
// PATCH — Update office-access flags  (new)
// PATCH /users/:id/office-access
// Body: { client_office_allow?, back_office_allow?, front_office_allow? }
// Supports partial updates — only send the flags you want to change.
// ─────────────────────────────────────────────────────────────

export const updateOfficeAccess = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { client_office_allow, back_office_allow, front_office_allow } = req.body;

    if (
      client_office_allow === undefined &&
      back_office_allow   === undefined &&
      front_office_allow  === undefined
    ) {
      return res.status(400).json({
        error:
          'Provide at least one office-access flag: client_office_allow, back_office_allow, front_office_allow',
      });
    }

    const flags: Record<string, boolean> = {};

    if (client_office_allow !== undefined) {
      if (typeof client_office_allow !== 'boolean') {
        return res.status(400).json({ error: 'client_office_allow must be a boolean' });
      }
      flags.client_office_allow = client_office_allow;
    }

    if (back_office_allow !== undefined) {
      if (typeof back_office_allow !== 'boolean') {
        return res.status(400).json({ error: 'back_office_allow must be a boolean' });
      }
      flags.back_office_allow = back_office_allow;
    }

    if (front_office_allow !== undefined) {
      if (typeof front_office_allow !== 'boolean') {
        return res.status(400).json({ error: 'front_office_allow must be a boolean' });
      }
      flags.front_office_allow = front_office_allow;
    }

    const user = await prisma.user.update({
      where: { user_id: id },
      data:  flags,
    });

    res.json({
      message: 'Office access updated successfully',
      data: {
        user_id:             user.user_id,
        client_office_allow: user.client_office_allow,
        back_office_allow:   user.back_office_allow,
        front_office_allow:  user.front_office_allow,
      },
    });
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found' });
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─────────────────────────────────────────────────────────────
// POST — Register new user  (unchanged from original)
// POST /users/register
// ─────────────────────────────────────────────────────────────

export const registerUser = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role_name } = req.body;

    if (!name || !email || !password || !role_name) {
      return res.status(400).json({
        error: 'Missing required fields: name, email, password, role_name',
      });
    }

    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        error:
          'Password must be at least 8 characters long and include at least one letter, one number, and one special character',
      });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    const newUser = await createUserWithRole({ name, email, password, role_name });

    res.status(201).json({
      message: 'User created successfully',
      data: newUser,
    });
  } catch (err: any) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};