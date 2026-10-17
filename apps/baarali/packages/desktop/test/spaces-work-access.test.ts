import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { ROOT, harborPlan } from '../scripts/brand.mjs';

// BAARALI(17/10/2026): exercise the actual branded Harbor driver against
// real signed JWTs; the network is a fixture serving discovery and JWKS.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baarali-spaces-access-'));
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
fs.symlinkSync(path.join(ROOT, 'apps/harbor/packages/server/node_modules'), path.join(dir, 'node_modules'));
for (const name of ['auth-oidc', 'errors']) {
  const file = `apps/harbor/packages/server/src/${name}.ts`;
  let source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const edit of harborPlan().edits.filter(edit => edit.file === file)) source = source.replace(edit.from, () => edit.to);
  fs.writeFileSync(path.join(dir, name + '.js'), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
}
const load = async (file: string) => import(/* @vite-ignore */ pathToFileURL(path.join(dir, file)).href);
const { OidcAuthDriver } = await load('auth-oidc.js');
const { generateKeyPair, exportJWK, SignJWT } = await load('node_modules/jose/dist/webapi/index.js');
const issuer = 'https://spaces-access.test/auth/v1';
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let jwks: unknown;
beforeAll(async () => {
  keys = await generateKeyPair('ES256');
  jwks = { keys: [{ ...await exportJWK(keys.publicKey), kid: 'work', alg: 'ES256' }] };
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
async function driverAndToken(claim: unknown) {
  vi.stubGlobal('fetch', async (url: unknown) => new Response(JSON.stringify(String(url).endsWith('/jwks') ? jwks : { issuer, jwks_uri: issuer + '/jwks' })));
  const token = await new SignJWT({ baarali_work: claim }).setProtectedHeader({ alg: 'ES256', kid: 'work' }).setIssuer(issuer).setSubject('person').setExpirationTime('5m').sign(keys.privateKey);
  return { driver: new OidcAuthDriver({ issuer }), token };
}
it.each([undefined, false, 'true', 1])('refuses a validly signed token without a true Work entitlement (%s)', async claim => {
  const { driver, token } = await driverAndToken(claim);
  await expect(driver.authenticate('Bearer ' + token)).rejects.toMatchObject({ code: 'forbidden', status: 403 });
});
it('accepts the signed paid entitlement and preserves the verified identity', async () => {
  const { driver, token } = await driverAndToken(true);
  await expect(driver.authenticate('Bearer ' + token)).resolves.toMatchObject({ iss: issuer, sub: 'person' });
});
