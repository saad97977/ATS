import { RoleName } from '@prisma/client';
export interface CreateUserInput {
    name: string;
    email: string;
    password: string;
    role_name: RoleName;
}
export declare const createUserWithRole: (input: CreateUserInput) => Promise<{
    user_id: string;
    name: string;
    email: string;
    status: import(".prisma/client").$Enums.UserStatus;
    role: import(".prisma/client").$Enums.RoleName;
}>;
//# sourceMappingURL=userService.d.ts.map