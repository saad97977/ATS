// ==========================================
// 1. AUTH SERVICE (authService.ts)
// ==========================================
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import prisma from '../prisma.config';

export interface JwtPayload {
  user_id: string;
  name: string;
  email: string;
  role_name: string;
  is_admin: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResponse {
  user_id: string;
  name: string;
  email: string;
  is_admin: boolean;
  token: string;
}

// Generate JWT token
export const generateToken = (payload: JwtPayload): string => {
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }

  return jwt.sign(payload, secret, {
    expiresIn: '24h', // 1 day
  });
};

// Verify JWT token
export const verifyToken = (token: string): JwtPayload => {
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    return decoded;
  } catch (error) {
    throw new Error('Token is not valid');
  }
};

// Login user
export const loginUser = async (input: LoginInput): Promise<LoginResponse> => {
  const { email, password } = input;

  // Find user by email with role information
  const user = await prisma.user.findUnique({
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
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordValid) {
    throw new Error('Invalid email or password');
  }

  // Check if user has a role
  if (!user.user_role || !user.user_role.role) {
    throw new Error('User role not found');
  }

    // Update or create user activity with last login time
  await prisma.userActivity.upsert({
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
  const payload: JwtPayload = {
    user_id: user.user_id,
    name: user.name,
    email: user.email,
    role_name: user.user_role.role.role_name,
    is_admin: user.is_admin,
  };

  // Generate token
  const token = generateToken(payload);

  // Return login response
  return {
    user_id: user.user_id,
    name: user.name,
    email: user.email,
    is_admin: user.is_admin,
    token,
  };
};
