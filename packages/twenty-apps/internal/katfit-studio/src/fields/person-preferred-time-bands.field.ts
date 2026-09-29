import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { TIME_BAND_OPTIONS } from 'src/constants/select-options';

export const PERSON_PREFERRED_TIME_BANDS_FIELD_UNIVERSAL_IDENTIFIER =
  '050b41c4-8f2e-46f2-9815-9fdbbf26f210';

export default defineField({
  universalIdentifier: PERSON_PREFERRED_TIME_BANDS_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.MULTI_SELECT,
  name: 'preferredTimeBands',
  label: 'Удобное время',
  description: 'Предпочтительные временные окна для занятий',
  icon: 'IconClockHour4',
  isNullable: true,
  options: [...TIME_BAND_OPTIONS],
});
