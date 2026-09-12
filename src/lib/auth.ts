import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "atrium_session";
const SESSION_TTL = "7d";

function getSecret() {
  const raw =
    process.env.ATRIUM_SESSION_SECRET ||
    process.env.ATRIUM_PASSWORD ||
    "atrium-local-demo-secret";
  return new TextEncoder().encode(raw);
}

export function getExpectedPassword() {
  return process.env.ATRIUM_PASSWORD || "atrium";
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: "operator" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  return verifySessionToken(token);
}

export async function requireAuth(): Promise<boolean> {
  return isAuthenticated();
}
