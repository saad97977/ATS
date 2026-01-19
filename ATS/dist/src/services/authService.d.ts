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
export declare const generateToken: (payload: JwtPayload) => string;
export declare const verifyToken: (token: string) => JwtPayload;
export declare const loginUser: (input: LoginInput) => Promise<LoginResponse>;
//# sourceMappingURL=authService.d.ts.map