import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { LEAD_SOURCE_OPTIONS } from 'src/constants/select-options';

export const PERSON_LAST_LEAD_SOURCE_FIELD_UNIVERSAL_IDENTIFIER =
  '5b5d8e02-baa9-429e-ab21-85b8b58d1d7a';

export default defineField({
  universalIdentifier: PERSON_LAST_LEAD_SOURCE_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.SELECT,
  name: 'lastLeadSource',
  label: 'Последний источник',
  description: 'Источник последней заявки (last-touch)',
  icon: 'IconSourceCode',
  defaultValue: "'UNKNOWN'",
  options: [...LEAD_SOURCE_OPTIONS],
});
