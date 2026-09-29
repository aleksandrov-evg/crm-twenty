import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapNoteTargetsToStatusNotes } from '../lead-crm-lookup.ts';

describe('mapNoteTargetsToStatusNotes', () => {
  it('maps markdown body and sorts oldest first', () => {
    const notes = mapNoteTargetsToStatusNotes([
      {
        node: {
          note: {
            id: 'n2',
            createdAt: '2026-09-29T14:00:00.000Z',
            title: 'TG-EVENT:b',
            bodyV2: { markdown: 'Вторая' },
          },
        },
      },
      {
        node: {
          note: {
            id: 'n1',
            createdAt: '2026-09-29T12:00:00.000Z',
            title: 'TG-EVENT:a',
            bodyV2: { markdown: 'Первая' },
          },
        },
      },
    ]);

    assert.equal(notes.length, 2);
    assert.equal(notes[0]?.id, 'n1');
    assert.equal(notes[0]?.body, 'Первая');
    assert.equal(notes[1]?.id, 'n2');
    assert.equal(notes[1]?.title, 'TG-EVENT:b');
  });

  it('skips edges without note id and tolerates empty body', () => {
    const notes = mapNoteTargetsToStatusNotes([
      { node: { note: null } },
      {
        node: {
          note: {
            id: 'n3',
            createdAt: '2026-09-29T15:00:00.000Z',
            title: null,
            bodyV2: null,
          },
        },
      },
    ]);

    assert.equal(notes.length, 1);
    assert.equal(notes[0]?.id, 'n3');
    assert.equal(notes[0]?.title, null);
    assert.equal(notes[0]?.body, '');
  });
});
