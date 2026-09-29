import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

export const OPPORTUNITY_UTM_CONTENT_FIELD_UNIVERSAL_IDENTIFIER =
  'bbf50241-fbfb-4a11-a7d3-95e375a0a29f';

export default defineField({
  universalIdentifier: OPPORTUNITY_UTM_CONTENT_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.universalIdentifier,
  type: FieldType.TEXT,
  name: 'utmContent',
  label: 'UTM content',
  description: 'Снимок utm_content на момент заявки',
  icon: 'IconSourceCode',
  isNullable: true,
});
