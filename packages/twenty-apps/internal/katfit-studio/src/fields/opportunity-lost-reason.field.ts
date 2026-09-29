import { defineField, FieldType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

export const OPPORTUNITY_LOST_REASON_FIELD_UNIVERSAL_IDENTIFIER = '25fbd297-9230-46d3-92c7-e22e00fe3636';

export default defineField({
  universalIdentifier: OPPORTUNITY_LOST_REASON_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.universalIdentifier,
  type: FieldType.SELECT,
  name: 'studioLostReason',
  label: 'Причина потери',
  icon: 'IconCircleX',
  isNullable: true,
  options: [
    { id: '60bdc24a-708a-4478-a942-e21717628d37', value: 'NO_RESPONSE', label: 'Нет ответа', position: 0, color: 'gray' },
    { id: '6e0a0e20-749d-4d88-940b-269975814fe2', value: 'NO_SUITABLE_TIME', label: 'Нет подходящего времени', position: 1, color: 'orange' },
    { id: 'e5ea7a83-151c-4b33-87c0-5a9224506c70', value: 'PRICE', label: 'Цена', position: 2, color: 'yellow' },
    { id: 'aa8cd2f9-c8a5-4336-9ba4-83c491af6043', value: 'LOCATION', label: 'Локация', position: 3, color: 'blue' },
    { id: '16726c42-0871-45a9-a604-4c4b60adcb71', value: 'FORMAT_MISMATCH', label: 'Не подходит формат', position: 4, color: 'purple' },
    { id: 'dd410b45-089a-473d-96c9-c2ea671df3dc', value: 'CHANGED_MIND', label: 'Передумал', position: 5, color: 'pink' },
    { id: '0fb75729-650a-4e35-8e0e-7ca343937967', value: 'DUPLICATE', label: 'Дубль', position: 6, color: 'gray' },
    { id: 'a1d4db0d-0d54-41e5-9348-208682ea4992', value: 'OTHER', label: 'Другое', position: 7, color: 'red' },
  ],
});
