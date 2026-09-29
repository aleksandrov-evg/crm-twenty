import { defineField, FieldType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

export const OPPORTUNITY_CLIENT_STAGE_FIELD_UNIVERSAL_IDENTIFIER = 'd1380982-f31f-4f7e-8875-6b1b9abfd007';

export const OPPORTUNITY_CLIENT_STAGE_OPTIONS = [
  { id: '02648b5f-8fa9-46b0-b428-f671870a2f27', value: 'WAITLIST', label: 'Лист ожидания', position: 0, color: 'gray' as const },
  { id: 'f090893d-4e04-438c-8365-4d2570ca9a49', value: 'NEW_LEAD', label: 'Новый лид', position: 1, color: 'blue' as const },
  { id: 'd67b6a7a-a7c7-49e6-8d32-7e495fc1e42e', value: 'CONTACTED', label: 'Связались', position: 2, color: 'sky' as const },
  { id: 'bfa15f6a-288d-4e6f-85d2-c463f53f76bf', value: 'INTRO_OFFERED', label: 'Предложено intro', position: 3, color: 'yellow' as const },
  { id: 'b045ff16-df6d-409a-b666-595a983d39d9', value: 'INTRO_BOOKED', label: 'Intro записано', position: 4, color: 'orange' as const },
  { id: '4d5cdb33-f597-4405-9e55-7baef9092aac', value: 'INTRO_ATTENDED', label: 'Intro посещено', position: 5, color: 'purple' as const },
  { id: '159c0fa4-c6f7-4d31-8094-dfe06085504d', value: 'FIRST_PURCHASE', label: 'Первая покупка', position: 6, color: 'green' as const },
  { id: 'da961a17-c145-49e0-ac9e-d6697c69feaf', value: 'LOST', label: 'Потерян', position: 7, color: 'red' as const },
];

export default defineField({
  universalIdentifier: OPPORTUNITY_CLIENT_STAGE_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.universalIdentifier,
  type: FieldType.SELECT,
  name: 'clientStage',
  label: 'Этап первой покупки',
  description: 'Путь клиента от waitlist до первой покупки',
  icon: 'IconRoute',
  defaultValue: "'WAITLIST'",
  options: OPPORTUNITY_CLIENT_STAGE_OPTIONS,
});
