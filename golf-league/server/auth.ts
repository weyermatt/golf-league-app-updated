import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";

export interface AuthedRequest extends Request {
  userId?: number;
  userRole?: string;
}

// Auth uses BOTH a Bearer token (in-memory on the client) AND a `__Host-sid`
// cookie (persistent across deploys/refreshes/sandbox restarts). The
// published-site proxy strips any cookie that doesn't start with `__Host-`,
// so the prefix is required. We try the cookie first, then fall back to the
// Authorization header.
function getSid(req: Request): string | null {
  // Prefer cookie if present (persists across reloads)
  const cookieSid = (req as any).cookies?.["__Host-sid"];
  if (cookieSid && typeof cookieSid === "string") return cookieSid;
  const h = req.headers["authorization"];
  if (!h || typeof h !== "string") return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export async function authMiddleware(req: AuthedRequest, _res: Response, next: NextFunction) {
  const sid = getSid(req);
  if (!sid) return next();
  const session = storage.getSession(sid);
  if (!session) return next();
  const user = storage.getUser(session.userId);
  if (!user) return next();
  req.userId = user.id;
  req.userRole = user.role;
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.userId) return res.status(401).json({ message: "Authentication required" });
  next();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.userId) return res.status(401).json({ message: "Authentication required" });
  if (req.userRole !== "admin") return res.status(403).json({ message: "Admin only" });
  next();
}

import crypto from "node:crypto";

// 30 days — "Remember me" keeps the user signed in for a month before they
// have to re-enter credentials. Each successful request slides the cookie
// forward (browsers refresh maxAge on the cookie itself), but the session
// row's expiresAt is fixed at creation, so users will need to log in again
// 30 days after their last sign-in.
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = "__Host-sid";

// Create a session, set the persistent cookie, and return the token (sid).
// We return the token in the body too so the existing Bearer-header flow
// keeps working (belt-and-suspenders for proxies/iframes that mishandle cookies).
export function login(res: Response, userId: number): string {
  const sid = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  storage.createSession(sid, userId, expiresAt);
  res.cookie(COOKIE_NAME, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_MS,
  });
  return sid;
}

export function logout(req: Request, res: Response) {
  const sid = getSid(req);
  if (sid) storage.deleteSession(sid);
  res.clearCookie(COOKIE_NAME, { path: "/" });
}
