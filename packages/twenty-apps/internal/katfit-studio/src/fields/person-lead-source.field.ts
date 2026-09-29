import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { LEAD_SOURCE_OPTIONS } from 'src/constants/select-options';

export const PERSON_LEAD_SOURCE_FIELD_UNIVERSAL_IDENTIFIER =
  'fe97772e-5be5-4f64-a7b3-f9f91f8d32d1';

export default defineField({
  universalIdentifier: PERSON_LEAD_SOURCE_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.SELECT,
  name: 'leadSource',
  label: 'Первый источник',
  description: 'Первый подтверждённый источник клиента',
  icon: 'IconSourceCode',
  defaultValue: "'UNKNOWN'",
  options: [...LEAD_SOURCE_OPTIONS],
});
