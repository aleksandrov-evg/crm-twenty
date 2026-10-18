const GENERATED_BLOCK_BEGIN = '--- KATFIT:GENERATED:BEGIN ---';
const GENERATED_BLOCK_END = '--- KATFIT:GENERATED:END ---';

export type GeneratedDescriptionResult =
  | { status: 'invalid-markers' | 'invalid-content' }
  | { status: 'rendered'; description: string; changed: boolean };

const isCompleteMarkerLine = (
  description: string,
  marker: string,
  position: number,
): boolean => {
  const suffix = description.slice(position + marker.length);

  return (
    (position === 0 || description[position - 1] === '\n') &&
    (suffix === '' || suffix.startsWith('\n') || suffix.startsWith('\r\n'))
  );
};

export const updateGeneratedDescription = ({
  description,
  generatedContent,
}: {
  description: string;
  generatedContent: string;
}): GeneratedDescriptionResult => {
  if (
    generatedContent.includes(GENERATED_BLOCK_BEGIN) ||
    generatedContent.includes(GENERATED_BLOCK_END)
  ) {
    return { status: 'invalid-content' };
  }

  const begin = description.indexOf(GENERATED_BLOCK_BEGIN);
  const end = description.indexOf(GENERATED_BLOCK_END);
  const newline = description.includes('\r\n') ? '\r\n' : '\n';
  const block = [
    GENERATED_BLOCK_BEGIN,
    generatedContent.replace(/\r\n|\r|\n/g, newline),
    GENERATED_BLOCK_END,
  ].join(newline);

  let updated: string;

  if (begin === -1 && end === -1) {
    updated = description
      ? `${description}${newline}${newline}${block}`
      : block;
  } else {
    // Ambiguous boundaries must not erase a trainer's free-form notes.
    if (
      begin === -1 ||
      end === -1 ||
      end <= begin ||
      begin !== description.lastIndexOf(GENERATED_BLOCK_BEGIN) ||
      end !== description.lastIndexOf(GENERATED_BLOCK_END) ||
      !isCompleteMarkerLine(description, GENERATED_BLOCK_BEGIN, begin) ||
      !isCompleteMarkerLine(description, GENERATED_BLOCK_END, end)
    ) {
      return { status: 'invalid-markers' };
    }

    updated =
      description.slice(0, begin) +
      block +
      description.slice(end + GENERATED_BLOCK_END.length);
  }

  return {
    status: 'rendered',
    description: updated,
    changed: updated !== description,
  };
};
