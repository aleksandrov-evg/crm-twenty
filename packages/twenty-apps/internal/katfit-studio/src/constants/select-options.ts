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
  { id: '5780d3ad-5e31-42aa-b86c-4495d05c687f', value: 'MAT_PILATES', label: 'Пилатес на коврике', position: 3, color: 'yellow' },
  { id: 'd7ffcbcd-1293-4233-a08e-a330ac732304', value: 'STRETCHING', label: 'Стрейчинг', position: 4, color: 'pink' },
  { id: 'f6d938c0-c66c-435e-b88e-dff2c46017b6', value: 'TRX', label: 'TRX', position: 5, color: 'orange' },
] as const;
