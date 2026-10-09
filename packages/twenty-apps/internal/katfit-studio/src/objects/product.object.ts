import { defineObject, FieldType } from 'twenty-sdk/define';

import { RUSSIAN_RUBLE_DEFAULT_VALUE } from 'src/constants/currency';
import { SESSION_FORMAT_OPTIONS } from 'src/constants/select-options';

export const PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER =
  '70a76372-e739-4dea-a9be-eecc24511497';
export const PRODUCT_NAME_FIELD_UNIVERSAL_IDENTIFIER =
  '4f5b0f59-81ae-420f-aee5-84a533ce5e84';
export const PRODUCT_CODE_FIELD_UNIVERSAL_IDENTIFIER =
  '828fe2d8-f0aa-49ad-b5a0-24900cf753c4';
export const PRODUCT_DURATION_MINUTES_FIELD_UNIVERSAL_IDENTIFIER =
  'b28d3d08-7e4f-4a0c-8db7-57f7511b0bf5';

export default defineObject({
  universalIdentifier: PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'studioProduct',
  namePlural: 'studioProducts',
  labelSingular: 'Продукт студии',
  labelPlural: 'Продукты студии',
  description: 'Версионируемые занятия и пакеты KATFIT BALANCE',
  icon: 'IconPackage',
  labelIdentifierFieldMetadataUniversalIdentifier:
    PRODUCT_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: PRODUCT_NAME_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Название',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: PRODUCT_CODE_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'code',
      label: 'Код',
      icon: 'IconCode',
    },
    {
      universalIdentifier: '0bbd8e69-4401-4898-93f8-11733d5d7af2',
      type: FieldType.SELECT,
      name: 'category',
      label: 'Категория',
      icon: 'IconCategory',
      options: [
        { id: 'd5b74fc2-6882-431c-b427-757246d797c6', value: 'INTRO', label: 'Первое занятие', position: 0, color: 'blue' },
        { id: '3a24a78a-a54e-408c-a82a-2331064fb708', value: 'SINGLE', label: 'Разовое', position: 1, color: 'sky' },
        { id: 'b5bbb5e4-ddc0-4fb8-b495-f0661662d4d5', value: 'GROUP_PACKAGE', label: 'Пакет группы', position: 2, color: 'green' },
        { id: 'a19bdf46-3d04-4c4b-917e-3a623f52feec', value: 'PERSONAL', label: 'Персональное', position: 3, color: 'purple' },
        { id: '660bde42-6206-4b38-b6cd-d6ff9ee849ae', value: 'SPLIT', label: 'Сплит', position: 4, color: 'violet' },
      ],
    },
    {
      universalIdentifier: 'a4bb509a-9159-4f7c-bf27-39d3010a1a4f',
      type: FieldType.SELECT,
      name: 'sessionFormat',
      label: 'Формат занятия',
      icon: 'IconYoga',
      options: [...SESSION_FORMAT_OPTIONS],
    },
    {
      universalIdentifier: PRODUCT_DURATION_MINUTES_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.NUMBER,
      name: 'durationMinutes',
      label: 'Длительность, минут',
      icon: 'IconClock',
      defaultValue: 55,
    },
    {
      universalIdentifier: '1dd53e14-f5d9-4672-972a-75edc9e8d42f',
      type: FieldType.NUMBER,
      name: 'defaultSessionCapacity',
      label: 'Вместимость слота по умолчанию',
      icon: 'IconArmchair',
      defaultValue: 4,
    },
    {
      universalIdentifier: '533e574b-dad6-422c-9fd0-805409205f1f',
      type: FieldType.NUMBER,
      name: 'visitsIncluded',
      label: 'Посещений',
      icon: 'IconNumber',
      defaultValue: 1,
    },
    {
      universalIdentifier: 'd14114ee-098d-456d-a398-41b6802aefed',
      type: FieldType.CURRENCY,
      name: 'price',
      label: 'Цена',
      icon: 'IconCurrencyRubel',
      defaultValue: RUSSIAN_RUBLE_DEFAULT_VALUE,
    },
    {
      universalIdentifier: '4e659744-43b1-4dc9-a82f-b6682961e391',
      type: FieldType.NUMBER,
      name: 'validityDays',
      label: 'Срок действия, дней',
      icon: 'IconCalendarDue',
      isNullable: true,
    },
    {
      universalIdentifier: '5a644f80-2b8d-4699-87c8-b9071a58c5dd',
      type: FieldType.NUMBER,
      name: 'activationLimitDays',
      label: 'Срок активации, дней',
      icon: 'IconCalendarTime',
      isNullable: true,
    },
    {
      universalIdentifier: 'f8cc0f25-7ef5-457e-991c-9831c12bbbc4',
      type: FieldType.BOOLEAN,
      name: 'isActive',
      label: 'Доступен для продажи',
      icon: 'IconToggleRight',
      defaultValue: false,
    },
    {
      universalIdentifier: '05104633-4907-48ad-9021-4ce9c321a307',
      type: FieldType.NUMBER,
      name: 'version',
      label: 'Версия',
      icon: 'IconVersions',
      defaultValue: 1,
    },
    {
      universalIdentifier: '0549a6cf-27e8-4d76-a0e1-9c95a4169824',
      type: FieldType.DATE,
      name: 'validFrom',
      label: 'Действует с',
      icon: 'IconCalendarEvent',
    },
    {
      universalIdentifier: '99fc1da2-7662-434b-ac1a-e446af90ba83',
      type: FieldType.DATE,
      name: 'validTo',
      label: 'Действует до',
      icon: 'IconCalendarOff',
      isNullable: true,
    },
  ],
});
