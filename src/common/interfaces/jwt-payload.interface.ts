export interface JwtPayload {
  sub: string; // userId
  email: string;
  companyId: string;
  role: string;
  iat?: number;
  exp?: number;
}
