import { defineObject, FieldType } from 'twenty-sdk/define';

export const PAIR_OBJECT_UNIVERSAL_IDENTIFIER =
  'f4fc2e62-5b06-40ed-b7e3-88c78f260ca5';
export const PAIR_NAME_FIELD_UNIVERSAL_IDENTIFIER =
  'bea4e576-929c-4f46-a08d-ef811f09bb43';

export default defineObject({
  universalIdentifier: PAIR_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'studioPair',
  namePlural: 'studioPairs',
  labelSingular: 'Пара',
  labelPlural: 'Пары',
  description: 'Закреплённая пара клиентов для совместных сплит-тренировок',
  icon: 'IconUsers',
  labelIdentifierFieldMetadataUniversalIdentifier:
    PAIR_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: PAIR_NAME_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Название',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: 'a1e03f9e-302a-4f60-ac34-c512871760ae',
      type: FieldType.SELECT,
      name: 'status',
      label: 'Статус',
      icon: 'IconProgress',
      defaultValue: "'ACTIVE'",
      options: [
        { id: '13ac0a75-6110-4e90-ac05-d91829223ba9', value: 'ACTIVE', label: 'Активна', position: 0, color: 'green' },
        { id: '5d6415cd-cfb6-4dd5-91a5-3decd6dbb40c', value: 'INACTIVE', label: 'Неактивна', position: 1, color: 'gray' },
      ],
    },
  ],
});
