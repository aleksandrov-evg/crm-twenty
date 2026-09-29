import { defineObject, FieldType } from 'twenty-sdk/define';

import { SESSION_FORMAT_OPTIONS } from 'src/constants/select-options';

export const CLASS_GROUP_OBJECT_UNIVERSAL_IDENTIFIER =
  '39df9fe4-e2ce-4a0c-b18c-d25ca9780b02';
export const CLASS_GROUP_NAME_FIELD_UNIVERSAL_IDENTIFIER =
  '09b4066a-e225-47fa-a984-983972b1d9a0';

export default defineObject({
  universalIdentifier: CLASS_GROUP_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'classGroup',
  namePlural: 'classGroups',
  labelSingular: 'Постоянная группа',
  labelPlural: 'Постоянные группы',
  description: 'Регулярная группа клиентов студии',
  icon: 'IconUsersGroup',
  labelIdentifierFieldMetadataUniversalIdentifier:
    CLASS_GROUP_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    { universalIdentifier: CLASS_GROUP_NAME_FIELD_UNIVERSAL_IDENTIFIER, type: FieldType.TEXT, name: 'name', label: 'Название', icon: 'IconAbc' },
    {
      universalIdentifier: 'a4800b43-1718-41a5-a6da-cb926e0491c9', type: FieldType.SELECT, name: 'status', label: 'Статус', icon: 'IconProgress', defaultValue: "'DRAFT'",
      options: [
        { id: '5a2e131b-7b03-4b76-840e-327c5aa64a1e', value: 'DRAFT', label: 'Черновик', position: 0, color: 'gray' },
        { id: 'ec0aaad0-931f-465c-b73c-1c818c50b57e', value: 'FORMING', label: 'Формируется', position: 1, color: 'orange' },
        { id: 'b2b127ac-f3ca-4836-840c-049667af9f5b', value: 'ACTIVE', label: 'Активна', position: 2, color: 'green' },
        { id: 'aec3bd67-208e-4d95-81aa-0cf7fc95b6c3', value: 'PAUSED', label: 'Пауза', position: 3, color: 'purple' },
        { id: 'f67ddac0-086e-413c-b5bb-8e6a7f4d2d26', value: 'CLOSED', label: 'Закрыта', position: 4, color: 'red' },
      ],
    },
    { universalIdentifier: '6cd79d6c-f1ef-4b70-84ed-906db927845b', type: FieldType.SELECT, name: 'sessionFormat', label: 'Формат', icon: 'IconYoga', options: [...SESSION_FORMAT_OPTIONS] },
    {
      universalIdentifier: '065a57be-88e5-4e13-88e5-428d362b5c59', type: FieldType.SELECT, name: 'weekday', label: 'День недели', icon: 'IconCalendarWeek',
      options: [
        { id: '90884b8c-1145-47d3-b699-a866d5726938', value: 'MONDAY', label: 'Понедельник', position: 0, color: 'blue' },
        { id: '6764123a-2ca0-4329-a0d3-95fa631165fd', value: 'TUESDAY', label: 'Вторник', position: 1, color: 'sky' },
        { id: '376502de-f41c-43a1-8328-11b58d31118b', value: 'WEDNESDAY', label: 'Среда', position: 2, color: 'green' },
        { id: 'dff4fb81-57d8-40b6-91cd-026d629acef0', value: 'THURSDAY', label: 'Четверг', position: 3, color: 'yellow' },
        { id: 'bb85a40b-38e4-4fad-a445-b6ce6a0c8e34', value: 'FRIDAY', label: 'Пятница', position: 4, color: 'orange' },
        { id: 'ef78bf50-1d9f-4a32-961e-58065b6b71e9', value: 'SATURDAY', label: 'Суббота', position: 5, color: 'purple' },
        { id: '6a17d466-2cca-4635-a5b8-dd55653e4898', value: 'SUNDAY', label: 'Воскресенье', position: 6, color: 'pink' },
      ],
    },
    { universalIdentifier: 'd1c4ebef-b736-4c8d-a6c3-02f3e6025922', type: FieldType.TEXT, name: 'startTimeLocal', label: 'Время начала', icon: 'IconClock' },
    { universalIdentifier: '8e32937b-cb12-46fd-a0db-27174f6a6b8d', type: FieldType.DATE, name: 'startsOn', label: 'Начало', icon: 'IconCalendarEvent' },
    { universalIdentifier: 'fa1f1458-cae7-41d6-86fb-80a4884d01c7', type: FieldType.DATE, name: 'endsOn', label: 'Окончание', icon: 'IconCalendarOff', isNullable: true },
    { universalIdentifier: '4ca12cbc-d7bc-470d-9a4b-966109b73f83', type: FieldType.NUMBER, name: 'capacity', label: 'Вместимость', icon: 'IconArmchair', defaultValue: 4 },
    { universalIdentifier: 'deec269a-982f-4603-aaf4-aa61c2123343', type: FieldType.NUMBER, name: 'minimumPaidMembers', label: 'Минимум участников', icon: 'IconUsers', defaultValue: 3 },
    { universalIdentifier: 'a12dc22c-4b40-4719-b134-288bed610184', type: FieldType.NUMBER, name: 'memberCount', label: 'Участников', icon: 'IconUsersGroup', defaultValue: 0 },
  ],
});
