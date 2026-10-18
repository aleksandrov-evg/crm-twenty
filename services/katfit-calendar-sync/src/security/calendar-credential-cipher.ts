import {
  createCipheriv,
  createDecipheriv,
  createSecretKey,
  type KeyObject,
  randomBytes,
} from 'node:crypto';

export type CalendarCredentialContext = {
  workspaceId: string;
  connectionId: string;
  username: string;
};

export class CalendarCredentialCipher {
  private readonly keys = new Map<string, KeyObject>();

  constructor(
    private readonly activeKeyId: string,
    keys: Readonly<Record<string, string>>,
  ) {
    for (const [id, hex] of Object.entries(keys)) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || !/^[a-fA-F0-9]{64}$/.test(hex)) {
        throw new Error('CALENDAR_ENCRYPTION_KEY_INVALID');
      }
      this.keys.set(id, createSecretKey(Buffer.from(hex, 'hex')));
    }

    if (!this.keys.has(activeKeyId))
      throw new Error('CALENDAR_ENCRYPTION_KEY_INVALID');
  }

  seal(context: CalendarCredentialContext, password: string): string {
    if (!password.trim() || Buffer.byteLength(password) > 4096) {
      throw new Error('CALENDAR_PASSWORD_INVALID');
    }

    const key = this.keys.get(this.activeKeyId);
    if (!key) throw new Error('CALENDAR_ENCRYPTION_KEY_INVALID');
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);

    cipher.setAAD(this.aad(context, this.activeKeyId));
    const ciphertext = Buffer.concat([
      cipher.update(password, 'utf8'),
      cipher.final(),
    ]);

    return [
      'v1',
      this.activeKeyId,
      nonce.toString('base64url'),
      ciphertext.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
    ].join('.');
  }

  open(context: CalendarCredentialContext, envelope: string): string {
    try {
      const parts = envelope.split('.');
      if (parts.length !== 5 || parts[0] !== 'v1') throw new Error();
      const [, keyId, encodedNonce, encodedCiphertext, encodedTag] = parts;
      const key = this.keys.get(keyId);
      if (
        !key ||
        ![encodedNonce, encodedCiphertext, encodedTag].every((value) =>
          /^[a-zA-Z0-9_-]+$/.test(value),
        )
      )
        throw new Error();
      const nonce = Buffer.from(encodedNonce, 'base64url');
      const ciphertext = Buffer.from(encodedCiphertext, 'base64url');
      const tag = Buffer.from(encodedTag, 'base64url');
      if (
        nonce.toString('base64url') !== encodedNonce ||
        ciphertext.toString('base64url') !== encodedCiphertext ||
        tag.toString('base64url') !== encodedTag
      )
        throw new Error();
      if (nonce.length !== 12 || tag.length !== 16 || ciphertext.length > 4096)
        throw new Error();

      const decipher = createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAAD(this.aad(context, keyId));
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error('CALENDAR_CREDENTIALS_UNREADABLE');
    }
  }

  private aad(context: CalendarCredentialContext, keyId: string): Buffer {
    // Copying an envelope to another tenant, account or connection must invalidate it.
    return Buffer.from(
      JSON.stringify([
        'v1',
        keyId,
        context.workspaceId,
        context.connectionId,
        context.username,
      ]),
    );
  }
}
