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

import prisma from '../prisma.config';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET  = process.env.JWT_SECRET  || 'your-secret-key';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

export type OfficeType = 'clientOffice' | 'backOffice' | 'frontOffice';

export interface LoginInput {
  email:      string;
  password:   string;
  officeType: OfficeType;
}

export interface JwtPayload {
  user_id:             string;
  email:               string;
  name:                string;
  role:                string;
  is_admin:            boolean;
  office_type:         OfficeType;
  client_office_allow: boolean;
  back_office_allow:   boolean;
  front_office_allow:  boolean;
}

// Maps officeType → the corresponding DB flag column
const OFFICE_FLAG_MAP: Record<OfficeType, 'client_office_allow' | 'back_office_allow' | 'front_office_allow'> = {
  clientOffice: 'client_office_allow',
  backOffice:   'back_office_allow',
  frontOffice:  'front_office_allow',
};

const OFFICE_LABEL_MAP: Record<OfficeType, string> = {
  clientOffice: 'Client Office',
  backOffice:   'Back Office',
  frontOffice:  'Front Office',
};

// ── loginUser ────────────────────────────────────────────────

export const loginUser = async ({ email, password, officeType }: LoginInput) => {
  // 1. Find user — include role
  const user = await prisma.user.findUnique({
    where:   { email },
    include: {
      user_role: {
        include: { role: true },
      },
    },
  });

  if (!user) throw new Error('Invalid email or password');

  // 2. Verify password
  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) throw new Error('Invalid email or password');

  // 3. Check account is active
  if (user.status !== 'ACTIVE') {
    throw new Error('Account is inactive. Please contact your administrator.');
  }

  // 4. Resolve role
  const role = user.user_role?.role?.role_name;
  if (!role) throw new Error('User role not found');

  // 5. Validate office-access BEFORE signing the token
  const requiredFlag = OFFICE_FLAG_MAP[officeType];
  if (!(user[requiredFlag] ?? false)) {
    const officeLabel = OFFICE_LABEL_MAP[officeType];
    throw Object.assign(
      new Error(`Access denied. You do not have permission to access the ${officeLabel}. Contact your administrator.`),
      { code: 'OFFICE_ACCESS_DENIED' },
    );
  }

  // 6. Build JWT payload — office_type is now a signed claim
  const payload: JwtPayload = {
    user_id:             user.user_id,
    email:               user.email,
    name:                user.name,
    role,
    is_admin:            user.is_admin,
    office_type:         officeType,
    client_office_allow: user.client_office_allow ?? false,
    back_office_allow:   user.back_office_allow   ?? false,
    front_office_allow:  user.front_office_allow  ?? false,
  };

  // 7. Sign token
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES } as any);

  // 8. Return — user object mirrors JWT payload (never expose password_hash)
  return {
    token,
    user: payload,
  };
};

// ── verifyToken ──────────────────────────────────────────────
// Unchanged

export const verifyToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    throw new Error('Token is not valid');
  }
};