export const CLIENT_LIFECYCLE_OPTIONS = [
  { id: '823e0954-d8de-4730-b68a-739d794a539c', value: 'WAITLIST', label: 'Лист ожидания', position: 0, color: 'gray' },
  { id: 'af038787-9f37-48d9-abf0-b9314ac03e3d', value: 'LEAD', label: 'Лид', position: 1, color: 'blue' },
  { id: '2c7fae2c-f698-4f34-851f-2f3258e92356', value: 'CONTACTED', label: 'Связались', position: 2, color: 'sky' },
  { id: '612070e8-c43e-4175-825d-e51b6d6d5a1c', value: 'INTRO_BOOKED', label: 'Записан на intro', position: 3, color: 'orange' },
  { id: '43e3a84f-2b7c-4c84-80f1-6149fca7ef66', value: 'INTRO_ATTENDED', label: 'Посетил intro', position: 4, color: 'yellow' },
  { id: 'ce131e6e-314f-4f3f-873f-9362d25ae55c', value: 'ACTIVE_CLIENT', label: 'Активный клиент', position: 5, color: 'green' },
  { id: '29a616f5-d28c-4544-952b-7a25977f5b87', value: 'PAUSED', label: 'Пауза', position: 6, color: 'purple' },
  { id: 'b21e1d21-f0c9-42a4-8726-3c80dac9c9b3', value: 'CHURNED', label: 'Ушёл', position: 7, color: 'red' },
  { id: 'c0c4563c-b5cb-4be6-8443-2df44427b771', value: 'RE_ENGAGEMENT', label: 'Возврат', position: 8, color: 'pink' },
] as const;

export const LEAD_SOURCE_OPTIONS = [
  { id: 'f1be162d-68b7-4ba8-889d-e5ea5190e4ec', value: 'YANDEX_SEARCH', label: 'Яндекс Поиск', position: 0, color: 'red' },
  { id: 'a00ef387-fb8b-4dd8-8bff-aecf4bfe012b', value: 'YANDEX_NETWORK', label: 'Яндекс РСЯ', position: 1, color: 'orange' },
  { id: '651a6758-af4f-4fd4-b1ef-5cb246cae3bc', value: 'ORGANIC_SEARCH', label: 'Органический поиск', position: 2, color: 'green' },
  { id: 'fcd1b2bd-16af-4b25-9866-09286765539a', value: 'MAPS', label: 'Карты', position: 3, color: 'blue' },
  { id: 'abbe7f69-4860-4c15-8313-ab8dfd33e6ca', value: 'REFERRAL', label: 'Рекомендация', position: 4, color: 'purple' },
  { id: 'a389ad32-1d09-423c-bafe-e2c42c84b2a3', value: 'SOCIAL', label: 'Соцсети', position: 5, color: 'pink' },
  { id: '54db40dc-bfbd-452c-a46a-1b9da268878d', value: 'DIRECT_MESSAGE', label: 'Личное сообщение', position: 6, color: 'sky' },
  { id: '2aa94eec-d829-4f14-a982-308799dd3472', value: 'WALK_IN', label: 'Визит', position: 7, color: 'yellow' },
  { id: 'b6f57b89-eb95-482c-9847-dab0d825d8bd', value: 'OTHER', label: 'Другое', position: 8, color: 'gray' },
  { id: 'f72be8d6-a971-4b02-acf5-0f5b5ed0e451', value: 'UNKNOWN', label: 'Неизвестно', position: 9, color: 'gray' },
] as const;

export const SESSION_FORMAT_OPTIONS = [
  { id: '67ddce18-70b4-4f41-a846-c2e92a2aca07', value: 'GROUP_REFORMER', label: 'Группа на реформере', position: 0, color: 'green' },
  { id: '09d1c8ca-d76d-44af-b881-d3dc56c7894d', value: 'INTRO_REFORMER', label: 'Intro на реформере', position: 1, color: 'blue' },
  { id: '20e8f802-e6fc-4b3d-89e8-52e85d8f28b4', value: 'PERSONAL_EQUIPMENT', label: 'Персональное на оборудовании', position: 2, color: 'purple' },
  { id: '8500af47-0ff4-4a1b-8ec2-259b2bb2d7b9', value: 'SPLIT_EQUIPMENT', label: 'Сплит на оборудовании', position: 3, color: 'violet' },
  { id: '5780d3ad-5e31-42aa-b86c-4495d05c687f', value: 'MAT_PILATES', label: 'Пилатес на коврике', position: 4, color: 'yellow' },
  { id: 'd7ffcbcd-1293-4233-a08e-a330ac732304', value: 'STRETCHING', label: 'Стрейчинг', position: 5, color: 'pink' },
  { id: 'f6d938c0-c66c-435e-b88e-dff2c46017b6', value: 'TRX', label: 'TRX', position: 6, color: 'orange' },
] as const;

export const PREFERRED_CHANNEL_OPTIONS = [
  { id: 'f0b4e2f3-f5c3-496d-a9b1-099f37de44be', value: 'PHONE', label: 'Телефон', position: 0, color: 'green' },
  { id: '87e8bc73-7d90-4b28-beb5-2bc9151505dc', value: 'TELEGRAM', label: 'Telegram', position: 1, color: 'sky' },
  { id: 'e0afb8af-a93d-4538-aeff-d5ad583ca0d9', value: 'WHATSAPP', label: 'WhatsApp', position: 2, color: 'green' },
  { id: '6e935a36-569a-4c2b-9d0b-bd044b473245', value: 'EMAIL', label: 'Email', position: 3, color: 'blue' },
  { id: 'eb7eaec1-260c-49da-9023-e933c6427422', value: 'OTHER', label: 'Другое', position: 4, color: 'gray' },
  { id: '33450ecb-e25a-4643-9d64-edd0707eac11', value: 'UNKNOWN', label: 'Неизвестно', position: 5, color: 'gray' },
] as const;

/** Last outbound contact channel used by the studio (Telegram ops-bot). */
export const LAST_CONTACT_CHANNEL_OPTIONS = [
  { id: 'a1c2d3e4-f5a6-4789-b012-3456789abc01', value: 'CALL', label: 'Звонок', position: 0, color: 'green' },
  { id: 'a1c2d3e4-f5a6-4789-b012-3456789abc02', value: 'SMS', label: 'SMS', position: 1, color: 'blue' },
  { id: 'a1c2d3e4-f5a6-4789-b012-3456789abc03', value: 'MAX', label: 'MAX', position: 2, color: 'purple' },
  { id: 'a1c2d3e4-f5a6-4789-b012-3456789abc04', value: 'TELEGRAM', label: 'Telegram', position: 3, color: 'sky' },
  { id: 'a1c2d3e4-f5a6-4789-b012-3456789abc05', value: 'WHATSAPP', label: 'WhatsApp', position: 4, color: 'green' },
] as const;

export const TIME_BAND_OPTIONS = [
  { id: '6857cde0-6e6d-4b0a-81d0-5c2ceaeb96dc', value: 'WEEKDAY_MORNING', label: 'Будни утро', position: 0, color: 'yellow' },
  { id: '46cf84ec-be5b-4577-a648-613562dd8917', value: 'WEEKDAY_DAY', label: 'Будни день', position: 1, color: 'orange' },
  { id: '1a7f9fc7-c28e-4a50-af94-28f29b8e0571', value: 'WEEKDAY_EVENING', label: 'Будни вечер', position: 2, color: 'purple' },
  { id: '16304afd-e348-48c7-aecf-60820f38c573', value: 'WEEKEND_MORNING', label: 'Выходные утро', position: 3, color: 'yellow' },
  { id: '37d4e37c-73a5-4885-ae7c-5308a807300e', value: 'WEEKEND_DAY', label: 'Выходные день', position: 4, color: 'orange' },
  { id: '83791d19-af78-4bca-867d-082c138d8e38', value: 'WEEKEND_EVENING', label: 'Выходные вечер', position: 5, color: 'purple' },
  { id: '1bd69a6e-c6fe-4998-a723-540e6a58875e', value: 'FLEXIBLE', label: 'Гибко', position: 6, color: 'green' },
  { id: 'c8c972e0-804b-45be-9eda-b08538ba522c', value: 'UNKNOWN', label: 'Неизвестно', position: 7, color: 'gray' },
] as const;
