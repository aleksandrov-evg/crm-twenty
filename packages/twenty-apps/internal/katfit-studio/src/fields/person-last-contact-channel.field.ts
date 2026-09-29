import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { LAST_CONTACT_CHANNEL_OPTIONS } from 'src/constants/select-options';

export const PERSON_LAST_CONTACT_CHANNEL_FIELD_UNIVERSAL_IDENTIFIER =
  'c8e4a1b2-9d3f-4e67-a890-1b2c3d4e5f60';

export default defineField({
  universalIdentifier: PERSON_LAST_CONTACT_CHANNEL_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.SELECT,
  name: 'lastContactChannel',
  label: 'Последний канал касания',
  description:
    'Канал, которым студия последний раз писала или звонила клиенту (не путать с preferredChannel)',
  icon: 'IconMessage',
  isNullable: true,
  options: [...LAST_CONTACT_CHANNEL_OPTIONS],
});
