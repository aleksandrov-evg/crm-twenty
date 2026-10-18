import { CalendarCredentialCipher } from '../calendar-credential-cipher';

describe('CalendarCredentialCipher', () => {
  const key = 'ab'.repeat(32);
  const context = {
    workspaceId: 'workspace-1',
    connectionId: 'connection-1',
    username: 'trainer@yandex.ru',
  };
  const cipher = new CalendarCredentialCipher('primary', { primary: key });

  it('round-trips a password without including it in the stored envelope', () => {
    const sealed = cipher.seal(context, 'пароль-приложения');
    expect(sealed).toMatch(/^v1\.primary\./);
    expect(sealed).not.toContain('пароль');
    expect(cipher.open(context, sealed)).toBe('пароль-приложения');
    expect(cipher.seal(context, 'пароль-приложения')).not.toBe(sealed);
  });

  it.each(['workspaceId', 'connectionId', 'username'] as const)(
    'rejects copying a secret to another %s',
    (field) => {
      const sealed = cipher.seal(context, 'secret');
      expect(() =>
        cipher.open({ ...context, [field]: 'different' }, sealed),
      ).toThrow('CALENDAR_CREDENTIALS_UNREADABLE');
    },
  );

  it.each([2, 3, 4])(
    'rejects tampering with envelope component %s',
    (index) => {
      const parts = cipher.seal(context, 'secret').split('.');
      const bytes = Buffer.from(parts[index], 'base64url');
      bytes[0] ^= 1;
      parts[index] = bytes.toString('base64url');
      expect(() => cipher.open(context, parts.join('.'))).toThrow(
        'CALENDAR_CREDENTIALS_UNREADABLE',
      );
    },
  );

  it('allows key rotation while the old key remains available', () => {
    const sealed = cipher.seal(context, 'secret');
    const rotated = new CalendarCredentialCipher('next', {
      primary: key,
      next: 'cd'.repeat(32),
    });
    expect(rotated.open(context, sealed)).toBe('secret');
    expect(rotated.seal(context, 'secret')).toMatch(/^v1\.next\./);
    expect(() =>
      new CalendarCredentialCipher('next', { next: 'cd'.repeat(32) }).open(
        context,
        sealed,
      ),
    ).toThrow('CALENDAR_CREDENTIALS_UNREADABLE');
  });

  it.each(['', 'aa', 'x'.repeat(64)])(
    'rejects malformed encryption keys',
    (value) => {
      expect(
        () => new CalendarCredentialCipher('primary', { primary: value }),
      ).toThrow('CALENDAR_ENCRYPTION_KEY_INVALID');
    },
  );

  it.each(['', '   ', 'x'.repeat(4097)])(
    'rejects empty or oversized passwords',
    (password) => {
      expect(() => cipher.seal(context, password)).toThrow(
        'CALENDAR_PASSWORD_INVALID',
      );
    },
  );

  it.each(['plaintext-password', 'v2.primary.a.b.c', 'v1.primary.a.b.c'])(
    'rejects unrecognized or malformed envelopes',
    (value) => {
      expect(() => cipher.open(context, value)).toThrow(
        'CALENDAR_CREDENTIALS_UNREADABLE',
      );
    },
  );
});
