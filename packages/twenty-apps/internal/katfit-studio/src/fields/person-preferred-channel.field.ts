import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PREFERRED_CHANNEL_OPTIONS } from 'src/constants/select-options';

export const PERSON_PREFERRED_CHANNEL_FIELD_UNIVERSAL_IDENTIFIER =
  'd5c49e7c-52cc-48cf-bed2-398061780376';

export default defineField({
  universalIdentifier: PERSON_PREFERRED_CHANNEL_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.SELECT,
  name: 'preferredChannel',
  label: 'Канал связи',
  description: 'Предпочтительный канал для ответа клиенту',
  icon: 'IconPhone',
  defaultValue: "'UNKNOWN'",
  options: [...PREFERRED_CHANNEL_OPTIONS],
});
