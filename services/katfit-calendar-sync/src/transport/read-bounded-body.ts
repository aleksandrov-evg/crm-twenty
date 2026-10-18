export const readBoundedBody = async (
  body: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
  errorCode: string,
): Promise<Buffer | null> => {
  if (body === null) return null;

  const chunks: Uint8Array[] = [];
  const reader = body.getReader();
  let size = 0;

  try {
    for (;;) {
      const chunk = await reader.read();

      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new Error(errorCode);
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks);
};
