import prisma from '../prisma.config';
import bcrypt from 'bcrypt';
import { RoleName } from '@prisma/client';

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role_name: RoleName;
}

export const createUserWithRole = async (input: CreateUserInput) => {
  const { name, email, password, role_name } = input;

  // Hash password
  const password_hash = await bcrypt.hash(password, 10);

  // Create user
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password_hash,
      status: 'ACTIVE',
    },
  });

  // Find or create role
  let role = await prisma.role.findFirst({
    where: { role_name },
  });

  if (!role) {
    role = await prisma.role.create({
      data: { role_name },
    });
  }

  // Create user-role association
  const userRole = await prisma.userRole.create({
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
