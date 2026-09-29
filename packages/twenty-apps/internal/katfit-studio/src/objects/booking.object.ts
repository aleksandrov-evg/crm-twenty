import { defineObject, FieldType } from 'twenty-sdk/define';

export const BOOKING_OBJECT_UNIVERSAL_IDENTIFIER = '9e40ea48-55bb-41ac-b724-33f452279078';
export const BOOKING_NAME_FIELD_UNIVERSAL_IDENTIFIER = '0b6a8e06-812e-4ec8-b645-4b876e2069cb';

export default defineObject({
  universalIdentifier: BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'studioBooking', namePlural: 'studioBookings',
  labelSingular: 'Запись', labelPlural: 'Записи',
  description: 'Бронирование места клиента на занятии', icon: 'IconCalendarCheck',
  labelIdentifierFieldMetadataUniversalIdentifier: BOOKING_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    { universalIdentifier: BOOKING_NAME_FIELD_UNIVERSAL_IDENTIFIER, type: FieldType.TEXT, name: 'name', label: 'Название', icon: 'IconAbc' },
    {
      universalIdentifier: '5a0fc536-570f-4cfa-a67f-c1a0980189ae', type: FieldType.SELECT, name: 'bookingType', label: 'Тип записи', icon: 'IconCategory',
      options: [
        { id: '71bdfc11-5071-41c2-88b4-ce709b5bf86e', value: 'REGULAR', label: 'Регулярная', position: 0, color: 'green' },
        { id: '7b69e415-101b-4092-be2a-3e4492979905', value: 'INTRO', label: 'Intro', position: 1, color: 'blue' },
        { id: '935dd17b-3391-4449-99a7-4c98f0b87dda', value: 'PERSONAL', label: 'Персональная', position: 2, color: 'purple' },
        { id: 'b0821ddf-098a-4d59-8f1c-e00bb10259a1', value: 'MAKE_UP', label: 'Отработка', position: 3, color: 'orange' },
      ],
    },
    {
      universalIdentifier: 'd6ce83f2-e8a7-43c3-aebf-f8770bd476f3', type: FieldType.SELECT, name: 'status', label: 'Статус', icon: 'IconProgress', defaultValue: "'BOOKED'",
      options: [
        { id: '3494b06d-c251-4692-95ef-68c858a252dc', value: 'BOOKED', label: 'Записан', position: 0, color: 'blue' },
        { id: 'c74259e4-b8c6-443a-a359-d387660e390c', value: 'ATTENDED', label: 'Посетил', position: 1, color: 'green' },
        { id: '55c79c30-4204-4ff0-a40d-7973269b61aa', value: 'CANCELLED_IN_TIME', label: 'Отмена вовремя', position: 2, color: 'yellow' },
        { id: '6d633635-2694-468c-bfe9-c42db9f5fcd4', value: 'LATE_CANCEL', label: 'Поздняя отмена', position: 3, color: 'orange' },
        { id: 'fe12e2aa-4554-4be0-867f-afd87af82efc', value: 'NO_SHOW', label: 'Неявка', position: 4, color: 'red' },
        { id: 'eb1b1850-1cc5-432b-84d2-b92dd4226e7c', value: 'CANCELLED_BY_STUDIO', label: 'Отменено студией', position: 5, color: 'purple' },
      ],
    },
    { universalIdentifier: '9c1d090b-0d79-46bc-89c1-ff4a506a7034', type: FieldType.DATE_TIME, name: 'bookedAt', label: 'Создана', icon: 'IconCalendarPlus' },
    { universalIdentifier: '0537dfd0-4768-4ec1-9911-77fb9420498f', type: FieldType.DATE_TIME, name: 'cancelledAt', label: 'Отменена', icon: 'IconCalendarCancel', isNullable: true },
    { universalIdentifier: '395c61c2-ff58-4cfb-99ea-5a2800f91e34', type: FieldType.NUMBER, name: 'hoursBeforeStartAtCancellation', label: 'Часов до начала', icon: 'IconClockCancel', isNullable: true },
    { universalIdentifier: '16389ea1-d8c8-434f-9d66-ab1578ba9fba', type: FieldType.BOOLEAN, name: 'consumesVisit', label: 'Списывает посещение', icon: 'IconCircleMinus', defaultValue: false },
    { universalIdentifier: 'a7161c9f-f2f8-4185-9822-0b30dcb01cad', type: FieldType.TEXT, name: 'externalId', label: 'Внешний ID', icon: 'IconId', isNullable: true },
  ],
});
