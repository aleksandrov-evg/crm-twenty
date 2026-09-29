import { defineObject, FieldType } from 'twenty-sdk/define';

export const GROUP_MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER = '5f67b488-df1d-4db9-b8f7-51fc795e08f7';
export const GROUP_MEMBERSHIP_NAME_FIELD_UNIVERSAL_IDENTIFIER = '217cf332-4d8d-4ba4-92f7-c33ec3d33df6';

export default defineObject({
  universalIdentifier: GROUP_MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'groupMembership', namePlural: 'groupMemberships',
  labelSingular: 'Участник группы', labelPlural: 'Участники групп',
  description: 'История закрепления клиента за постоянной группой', icon: 'IconUserStar',
  labelIdentifierFieldMetadataUniversalIdentifier: GROUP_MEMBERSHIP_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    { universalIdentifier: GROUP_MEMBERSHIP_NAME_FIELD_UNIVERSAL_IDENTIFIER, type: FieldType.TEXT, name: 'name', label: 'Название', icon: 'IconAbc' },
    {
      universalIdentifier: '1a8b782b-7446-41ba-bd49-6f46ea8a418a', type: FieldType.SELECT, name: 'status', label: 'Статус', icon: 'IconProgress', defaultValue: "'WAITLIST'",
      options: [
        { id: '6c919549-d7d6-487c-b6d8-500def3c41c5', value: 'WAITLIST', label: 'Ожидает', position: 0, color: 'gray' },
        { id: '0f53f3a0-06e9-4d9b-a9c2-da684b38a540', value: 'OFFERED', label: 'Место предложено', position: 1, color: 'orange' },
        { id: '97b2ece7-267b-45a4-80c7-febcb208a566', value: 'ACTIVE', label: 'Активен', position: 2, color: 'green' },
        { id: '6d521c9c-02d6-4bd4-aa05-bf98c517b110', value: 'PAUSED', label: 'Пауза', position: 3, color: 'purple' },
        { id: '31fecf37-0e59-4a78-af5f-061309019dc4', value: 'ENDED', label: 'Завершён', position: 4, color: 'red' },
      ],
    },
    { universalIdentifier: 'e7a898a7-a846-4c7e-bd31-920227615f67', type: FieldType.DATE, name: 'startsOn', label: 'Начало', icon: 'IconCalendarEvent', isNullable: true },
    { universalIdentifier: '7673486a-6744-4701-98ad-60de8505273e', type: FieldType.DATE, name: 'endsOn', label: 'Окончание', icon: 'IconCalendarOff', isNullable: true },
    { universalIdentifier: '5b22012e-e0ad-409b-a747-42b134fa4cea', type: FieldType.NUMBER, name: 'waitlistPosition', label: 'Позиция ожидания', icon: 'IconListNumbers', isNullable: true },
    { universalIdentifier: 'd72067cd-c99c-4b77-b054-42655a4b4fd3', type: FieldType.DATE_TIME, name: 'offerExpiresAt', label: 'Предложение до', icon: 'IconClockHour4', isNullable: true },
  ],
});
