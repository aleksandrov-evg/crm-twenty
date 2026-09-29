import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { LEAD_SOURCE_OPTIONS } from 'src/constants/select-options';

export const OPPORTUNITY_LEAD_SOURCE_FIELD_UNIVERSAL_IDENTIFIER =
  'dc337c14-1284-4e5b-b0b3-437ec36b6306';

export default defineField({
  universalIdentifier: OPPORTUNITY_LEAD_SOURCE_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.universalIdentifier,
  type: FieldType.SELECT,
  name: 'leadSource',
  label: 'Источник',
  description: 'Снимок источника на момент создания сделки',
  icon: 'IconSourceCode',
  isNullable: true,
  options: [...LEAD_SOURCE_OPTIONS],
});
