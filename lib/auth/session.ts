import "server-only";
import { SignJWT, jwtVerify } from "jose";

const secretEnv = process.env.SESSION_SECRET;
if (!secretEnv) {
  throw new Error("SESSION_SECRET is not set.");
}
const secret = new TextEncoder().encode(secretEnv);

const ALG = "HS256";
const ISSUER = "bw-ops";
const AUDIENCE = "bw-ops";

export type Role = "OWNER" | "EMPLOYEE" | "VIEWER";

export interface SessionPayload {
  sub: string;
  username: string;
  role: Role;
  name: string;
}

export const SESSION_COOKIE = "bw_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    username: payload.username,
    role: payload.role,
    name: payload.name,
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload.sub !== "string") return null;
    return {
      sub: payload.sub,
      username: String(payload.username),
      role: payload.role as Role,
      name: String(payload.name),
    };
  } catch {
    return null;
  }
}
