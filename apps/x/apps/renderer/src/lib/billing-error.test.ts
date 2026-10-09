import { describe, expect, it } from 'vitest'
import { humanizeModelError, isBusyModelError, matchBillingError } from './billing-error'

const OUT_OF_CREDITS = 'Out of credits — add credits or configure your own API key in Settings'

describe('humanizeModelError', () => {
  it('maps a bare 403 / Forbidden to actionable out-of-credits copy', () => {
    // The reported case: the gateway refuses and the SDK surfaces the reason
    // phrase verbatim, which tells the user nothing.
    expect(humanizeModelError('Forbidden')).toBe(OUT_OF_CREDITS)
    expect(humanizeModelError('403 Forbidden')).toBe(OUT_OF_CREDITS)
    expect(humanizeModelError('Unauthorized')).toBe(OUT_OF_CREDITS)
    expect(humanizeModelError('AI_APICallError: status 401')).toBe(OUT_OF_CREDITS)
  })

  it('maps the backend worded credit error to the same copy', () => {
    expect(humanizeModelError('not enough credits')).toBe(OUT_OF_CREDITS)
  })

  it('keeps the other billing kinds distinct', () => {
    expect(humanizeModelError('upgrade required')).toContain('A subscription is required')
    expect(humanizeModelError('subscription not active')).toContain('Your subscription is inactive')
  })

  it('passes unrecognised failures through so diagnostics survive', () => {
    expect(humanizeModelError('The model did not produce a valid slide')).toBe(
      'The model did not produce a valid slide',
    )
    expect(humanizeModelError('  ETIMEDOUT  ')).toBe('ETIMEDOUT')
  })

  it('falls back for an empty message', () => {
    expect(humanizeModelError('')).toBe('Something went wrong. Try again.')
  })

  it('does not widen matchBillingError itself (chat dialog behaviour unchanged)', () => {
    // A bare 403 must NOT start popping the upgrade dialog in chat.
    expect(matchBillingError('Forbidden')).toBeNull()
    expect(matchBillingError('not enough credits')?.kind).toBe('out_of_credits')
  })
})

describe('isBusyModelError', () => {
  it('knows a model saturated or down at its provider', () => {
    const qwen = 'Failed after 3 attempts. Last error: AI_APICallError: [Alibaba] qwen/qwen3.8-flash is temporarily rate-limited upstream. [status 429 — {"error":{"code":429}}]'
    expect(isBusyModelError(qwen)).toBe(true)
    expect(isBusyModelError('Provider returned error [status 503 — overloaded]')).toBe(true)
  })

  it('leaves the plan\'s own limit and other failures alone', () => {
    expect(isBusyModelError('Usage limit reached for this week [status 429 — {"error":{"code":"quota_reached"}}]')).toBe(false)
    expect(isBusyModelError('The model did not produce a valid slide')).toBe(false)
  })
})
