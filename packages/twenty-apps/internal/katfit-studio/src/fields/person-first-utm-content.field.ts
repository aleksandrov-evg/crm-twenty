import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

export default defineField({
  universalIdentifier: '8069ff43-613b-44d7-a9b0-a86af091e399',
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.TEXT,
  name: 'firstUtmContent',
  label: 'First UTM content',
  icon: 'IconSourceCode',
  isNullable: true,
});
