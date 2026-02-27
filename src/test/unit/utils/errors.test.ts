import { describe, it, expect } from 'vitest';
import { toErrorMessage } from '../../../utils/errors';

describe('toErrorMessage', () => {
  it('extracts message from an Error instance', () => {
    expect(toErrorMessage(new Error('something broke'))).toBe('something broke');
  });

  it('returns the string itself for string errors', () => {
    expect(toErrorMessage('string error')).toBe('string error');
  });

  it('returns "Unknown error" for null', () => {
    expect(toErrorMessage(null)).toBe('Unknown error');
  });

  it('returns "Unknown error" for undefined', () => {
    expect(toErrorMessage(undefined)).toBe('Unknown error');
  });

  it('returns "Unknown error" for a number', () => {
    expect(toErrorMessage(42)).toBe('Unknown error');
  });

  it('returns "Unknown error" for a plain object', () => {
    expect(toErrorMessage({ message: 'not an Error' })).toBe('Unknown error');
  });

  it('handles empty string', () => {
    expect(toErrorMessage('')).toBe('');
  });

  it('handles Error subclasses', () => {
    expect(toErrorMessage(new TypeError('type error'))).toBe('type error');
  });
});
