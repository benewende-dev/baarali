// Signing in on the phone with its own screens (Baarali, 07/10/2026): an
// email, then the code it receives, and no web page. The sign-in server
// answers with a session token (better-auth's bearer, control auth.ts); with
// it the phone gets the key of the person's cloud instance, the one their
// Mac uses (POST /v1/devices), and its Spaces tokens (/v1/session/spaces-token).

/** The control plane: sign-in server, devices, Spaces tokens. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.x.rowboatlabs.com';

export type SignInProblem =
  | 'bad_code'
  | 'expired_code'
  | 'too_many'
  | 'instances_full'
  | 'too_many_devices'
  | 'no_instance'
  | 'network'
  | 'no_session'
  | 'other';

/** A refusal; the screen says it in words (in the person's language). */
export class SignInError extends Error {
  constructor(readonly reason: SignInProblem) {
    super(`sign-in: ${reason}`);
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
    throw new SignInError('network');
  }
}

async function refusal(res: Response): Promise<SignInError> {
  const json = (await res.json().catch(() => ({}))) as { code?: string; error?: { code?: string } };
  const code = json.code ?? json.error?.code ?? '';
  if (res.status === 429 || code === 'TOO_MANY_ATTEMPTS') return new SignInError('too_many');
  if (code === 'INVALID_OTP') return new SignInError('bad_code');
  if (code === 'OTP_EXPIRED') return new SignInError('expired_code');
  return new SignInError('other');
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
  if (!session) throw new SignInError('no_session');
  return session;
}

/** The person's cloud instance for this phone: where it lives and the key that opens it. */
export async function connectInstance(session: string, name: string): Promise<{ url: string; key: string }> {
  const res = await call('/v1/devices', { name }, session);
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
    const code = json.error?.code;
    if (code === 'instances_full') throw new SignInError('instances_full');
    if (code === 'too_many_devices') throw new SignInError('too_many_devices');
    throw new SignInError('no_instance');
  }
  const { server } = (await res.json()) as { server: { url: string; key: string } };
  return server;
}

/** A Spaces token, renewed with the session (the phone has no OAuth refresh token). */
export async function spacesTokenForSession(session: string): Promise<{ access: string; expiresAt: number }> {
  const res = await call('/v1/session/spaces-token', {}, session);
  // The status is what the account reads (401: the session is over).
  if (!res.ok) throw Object.assign(new Error(String(res.status)), { status: res.status });
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return { access: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
}
