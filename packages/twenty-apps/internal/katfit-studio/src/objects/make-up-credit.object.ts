import { defineObject, FieldType } from 'twenty-sdk/define';

export const MAKE_UP_CREDIT_OBJECT_UNIVERSAL_IDENTIFIER = '83bb53ec-479b-450f-b2be-822fba4b1275';
export const MAKE_UP_CREDIT_NAME_FIELD_UNIVERSAL_IDENTIFIER = '3119502e-59b2-4806-b654-8499ed886a89';

export default defineObject({
  universalIdentifier: MAKE_UP_CREDIT_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'makeUpCredit', namePlural: 'makeUpCredits',
  labelSingular: 'Право на отработку', labelPlural: 'Права на отработку',
  description: 'Право использовать свободное место после своевременной отмены', icon: 'IconCalendarRepeat',
  labelIdentifierFieldMetadataUniversalIdentifier: MAKE_UP_CREDIT_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    { universalIdentifier: MAKE_UP_CREDIT_NAME_FIELD_UNIVERSAL_IDENTIFIER, type: FieldType.TEXT, name: 'name', label: 'Название', icon: 'IconAbc' },
    {
      universalIdentifier: '413a6765-22ac-4aa5-8724-a5d109c46728', type: FieldType.SELECT, name: 'status', label: 'Статус', icon: 'IconProgress', defaultValue: "'AVAILABLE'",
      options: [
        { id: '6260fc10-c709-4fa8-a7dc-b0ff7df2b185', value: 'AVAILABLE', label: 'Доступно', position: 0, color: 'green' },
        { id: 'b4e54db5-40ac-4fb8-ac07-c7dbb283aa36', value: 'BOOKED', label: 'Забронировано', position: 1, color: 'blue' },
        { id: '1f50e197-65ef-4f33-b72e-ad67c76b7c86', value: 'USED', label: 'Использовано', position: 2, color: 'gray' },
        { id: '2b50dbca-66f7-4af7-87de-140005d5bd8c', value: 'EXPIRED', label: 'Истекло', position: 3, color: 'orange' },
        { id: '5b23e06d-6b43-499c-9fc4-7c871900cc32', value: 'REVOKED', label: 'Отозвано', position: 4, color: 'red' },
      ],
    },
    { universalIdentifier: '97a11209-4626-4b1b-a11f-802410bd0064', type: FieldType.DATE_TIME, name: 'grantedAt', label: 'Выдано', icon: 'IconCalendarPlus' },
    { universalIdentifier: '73bcb32a-1613-45a8-adb7-9c4aa546a9c2', type: FieldType.DATE_TIME, name: 'expiresAt', label: 'Истекает', icon: 'IconCalendarOff' },
    { universalIdentifier: 'b8fb55bb-d3a6-4320-891b-44adeab12781', type: FieldType.TEXT, name: 'idempotencyKey', label: 'Ключ идемпотентности', icon: 'IconKey' },
    { universalIdentifier: 'f5d82494-b81e-462f-84e0-c7663ae9a5b2', type: FieldType.TEXT, name: 'revocationReason', label: 'Причина отзыва', icon: 'IconNote', isNullable: true },
  ],
});
