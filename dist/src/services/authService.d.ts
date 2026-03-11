export type OfficeType = 'clientOffice' | 'backOffice' | 'frontOffice';
export interface LoginInput {
    email: string;
    password: string;
    officeType: OfficeType;
}
export interface JwtPayload {
    user_id: string;
    email: string;
    name: string;
    role: string;
    is_admin: boolean;
    office_type: OfficeType;
    client_office_allow: boolean;
    back_office_allow: boolean;
    front_office_allow: boolean;
}
export declare const loginUser: ({ email, password, officeType }: LoginInput) => Promise<{
    token: string;
    user: JwtPayload;
}>;
export declare const verifyToken: (token: string) => JwtPayload;
//# sourceMappingURL=authService.d.ts.map