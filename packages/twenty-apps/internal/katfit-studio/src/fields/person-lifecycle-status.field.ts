import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { CLIENT_LIFECYCLE_OPTIONS } from 'src/constants/select-options';

export const PERSON_LIFECYCLE_STATUS_FIELD_UNIVERSAL_IDENTIFIER =
  'd43512bb-95f4-4145-a017-1c9e18bbec07';

export default defineField({
  universalIdentifier: PERSON_LIFECYCLE_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.SELECT,
  name: 'lifecycleStatus',
  label: 'Статус клиента',
  description: 'Текущий этап отношений клиента со студией',
  icon: 'IconProgress',
  defaultValue: "'WAITLIST'",
  options: [...CLIENT_LIFECYCLE_OPTIONS],
});
