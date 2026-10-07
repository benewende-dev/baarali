// Signing in on the phone with its own screens (Baarali, 07/10/2026): an
// email, then the code it receives, and no web page. The sign-in server
// answers with a session token (better-auth's bearer, control auth.ts); with
// it the phone gets the key of the person's cloud instance, the one their
// Mac uses (POST /v1/devices), and its Spaces tokens (/v1/session/spaces-token).

/** The control plane: sign-in server, devices, Spaces tokens. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.x.rowboatlabs.com';

/** A refusal the screen can say in words. */
export class SignInError extends Error {
  constructor(
    readonly reason: 'bad_code' | 'expired_code' | 'too_many' | 'no_instance' | 'network' | 'other',
    message: string,
  ) {
    super(message);
  }
}

async function call(path: string, body: unknown, session?: string): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new SignInError('network', 'No connection. Check your internet and try again.');
  }
}

async function refusal(res: Response): Promise<SignInError> {
  const json = (await res.json().catch(() => ({}))) as { code?: string; message?: string; error?: { code?: string } };
  const code = json.code ?? json.error?.code ?? '';
  if (res.status === 429) return new SignInError('too_many', 'Too many tries. Wait a minute, then try again.');
  if (code === 'INVALID_OTP') return new SignInError('bad_code', 'That code isn’t right. Check it and try again.');
  if (code === 'OTP_EXPIRED') return new SignInError('expired_code', 'That code has expired. Send a new one.');
  if (code === 'TOO_MANY_ATTEMPTS') return new SignInError('too_many', 'Too many wrong codes. Send a new one.');
  return new SignInError('other', json.message || `Sign-in failed (${res.status}).`);
}

/** Sends a six-digit code to the address. */
export async function sendCode(email: string): Promise<void> {
  const res = await call('/auth/v1/email-otp/send-verification-otp', { email: email.trim(), type: 'sign-in' });
  if (!res.ok) throw await refusal(res);
}

/** Checks the code; the session token of the new sign-in. */
export async function verifyCode(email: string, code: string): Promise<string> {
  const res = await call('/auth/v1/sign-in/email-otp', { email: email.trim(), otp: code.trim() });
  if (!res.ok) throw await refusal(res);
  const session = res.headers.get('set-auth-token');
  if (!session) throw new SignInError('other', 'The server opened no session. Try again.');
  return session;
}

/** The person's cloud instance for this phone: where it lives and the key that opens it. */
export async function connectInstance(session: string, name: string): Promise<{ url: string; key: string }> {
  const res = await call('/v1/devices', { name }, session);
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
    const code = json.error?.code;
    if (code === 'instances_full') throw new SignInError('no_instance', 'Early access is full for now: your chats will open as soon as a place frees up. Spaces work already.');
    if (code === 'too_many_devices') throw new SignInError('no_instance', 'Too many devices on this account. Remove one from the Mac app’s settings, then sign in again.');
    throw new SignInError('no_instance', 'Your assistant could not be reached. Spaces work; try again in a moment for your chats.');
  }
  const { server } = (await res.json()) as { server: { url: string; key: string } };
  return server;
}

/** A Spaces token, renewed with the session (the phone has no OAuth refresh token). */
export async function spacesTokenForSession(session: string): Promise<{ access: string; expiresAt: number }> {
  const res = await call('/v1/session/spaces-token', {}, session);
  if (!res.ok) throw Object.assign(new Error(`Spaces token refused (${res.status})`), { status: res.status });
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return { access: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
}
