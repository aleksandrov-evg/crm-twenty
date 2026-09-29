import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { SESSION_FORMAT_OPTIONS } from 'src/constants/select-options';

export const PERSON_INTERESTED_FORMATS_FIELD_UNIVERSAL_IDENTIFIER =
  '16e952f5-8aad-456b-a87f-3a661c39c4b1';

export default defineField({
  universalIdentifier: PERSON_INTERESTED_FORMATS_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.MULTI_SELECT,
  name: 'interestedFormats',
  label: 'Интересующие форматы',
  description: 'Форматы занятий, которые интересуют клиента',
  icon: 'IconBarbell',
  isNullable: true,
  options: [...SESSION_FORMAT_OPTIONS],
});
