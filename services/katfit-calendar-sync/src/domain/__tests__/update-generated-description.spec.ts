import { updateGeneratedDescription } from '../update-generated-description';

describe('updateGeneratedDescription', () => {
  const begin = '--- KATFIT:GENERATED:BEGIN ---';
  const end = '--- KATFIT:GENERATED:END ---';
  const generatedContent = 'Участники:\n1. Анна Иванова\n2. Мария Петрова';
  const block = `${begin}\n${generatedContent}\n${end}`;

  it('adds a roster to an empty description', () => {
    expect(
      updateGeneratedDescription({ description: '', generatedContent }),
    ).toEqual({ status: 'rendered', description: block, changed: true });
  });

  it('preserves trainer notes and input metadata when adding the roster', () => {
    const description = 'Взять резинки.\n\nKATFIT:\ngroup=morning-pilates';

    expect(
      updateGeneratedDescription({ description, generatedContent }),
    ).toEqual({
      status: 'rendered',
      description: `${description}\n\n${block}`,
      changed: true,
    });
  });

  it('changes only the roster and preserves notes before and after it', () => {
    const description = `До\n${begin}\nСтарый список\n${end}\nПосле`;

    expect(
      updateGeneratedDescription({ description, generatedContent }),
    ).toEqual({
      status: 'rendered',
      description: `До\n${block}\nПосле`,
      changed: true,
    });
  });

  it('does not add a second block or request another write on replay', () => {
    expect(
      updateGeneratedDescription({ description: block, generatedContent }),
    ).toEqual({ status: 'rendered', description: block, changed: false });
  });

  it('preserves CRLF notes while normalizing the generated content', () => {
    const description = `До\r\n${begin}\r\nСтарый список\r\n${end}\r\nПосле`;

    expect(
      updateGeneratedDescription({ description, generatedContent }),
    ).toEqual({
      status: 'rendered',
      description: `До\r\n${block.replace(/\n/g, '\r\n')}\r\nПосле`,
      changed: true,
    });
  });

  it.each([
    begin,
    end,
    `${end}\n${begin}`,
    `${begin}\n${begin}\n${end}`,
    `${begin}\n${end}\n${end}`,
    `Заметка ${begin}\n${end}`,
    `${begin} лишний текст\n${end}`,
    `${begin}\nЗаметка ${end}`,
    `${begin}\n${end} лишний текст`,
  ])(
    'does not overwrite notes with ambiguous boundaries: %s',
    (description) => {
      expect(
        updateGeneratedDescription({ description, generatedContent }),
      ).toEqual({ status: 'invalid-markers' });
    },
  );

  it.each([begin, end])(
    'rejects a participant value containing a block boundary: %s',
    (marker) => {
      expect(
        updateGeneratedDescription({
          description: 'Заметка',
          generatedContent: `Участник\n${marker}`,
        }),
      ).toEqual({ status: 'invalid-content' });
    },
  );
});
