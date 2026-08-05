import { describe, expect, it } from 'vitest';

import { generateCode, hashCode } from './localAuth.js';

// Dependency-free: exercises only the pure OTP helpers. The request/verify
// flows that touch Prisma are covered by integration tests, not here.

describe('generateCode', () => {
  it('is always a 6-digit numeric string (zero-padded)', () => {
    for (let i = 0; i < 2000; i += 1) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });

  it('spreads across the full range including small values', () => {
    const codes = Array.from({ length: 500 }, () => generateCode());
    // With 500 samples we expect more than a handful of distinct codes.
    expect(new Set(codes).size).toBeGreaterThan(400);
  });
});

describe('hashCode', () => {
  it('is deterministic', () => {
    expect(hashCode('042317')).toBe(hashCode('042317'));
  });

  it('differs for different codes and never returns the raw code', () => {
    const hashed = hashCode('042317');
    expect(hashed).not.toBe(hashCode('042318'));
    expect(hashed).not.toContain('042317');
    expect(hashed).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });
});
