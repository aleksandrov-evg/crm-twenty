# KATFIT BALANCE CRM: пошаговая техническая спецификация

## 1. Цель и границы

Документ превращает [план развития CRM](katfit-balance-crm-development-plan.ru.md) в исполнимую спецификацию для настройки и разработки Twenty.

Результат первой очереди:

```text
заявка studio.katfit.ru
→ Person + Opportunity в Twenty
→ уведомление и задача на ответ
→ запись на intro
→ явка и оплата
→ продажа пакета
→ регулярные бронирования и посещения
→ повторная покупка
```

В объём не входят бухгалтерия, фискализация, медицинская карта и мобильное приложение.

### Текущее состояние реализации

Версия `0.1.0` внутреннего приложения находится в `packages/twenty-apps/internal/katfit-studio`.

Реализованы каркас приложения, девять пользовательских объектов, базовые поля Person, расширение Opportunity, основные связи, индексы, семь views, шесть пунктов навигации и default function role. Приложение проходит typecheck, lint и сборку manifest. Пока не реализованы ingestion лендинга, связи MakeUpCredit с исходной/использованной Booking, связь Transaction с Booking, layouts, business constraints, workflows и seed начальных продуктов. Приложение ещё не применялось к workspace.

## 2. Правила реализации

### 2.1. Канонические имена

- Пользовательские названия в интерфейсе — на русском.
- API-имена объектов и полей — английский `camelCase`.
- Значения `SELECT` — английский `SCREAMING_SNAKE_CASE` и никогда не переименовываются после появления данных.
- Изменение пользовательской подписи не должно менять API-имя или значение option.
- Деньги хранятся в `CURRENCY` с валютой RUB.
- Моменты времени хранятся в `DATE_TIME`; календарные даты — в `DATE`.
- Все даты интерпретируются в timezone workspace `Europe/Moscow`.
- Все внешние события получают стабильный `externalId` и обрабатываются идемпотентно.

### 2.2. Способ поставки

| Слой | Способ | Почему |
| --- | --- | --- |
| Прототип полей и views | Settings → Data model | Быстро проверить терминологию и процесс |
| Постоянные custom objects/fields/views | Внутреннее Twenty app | Версионирование, повторяемый deploy и rollback |
| Простые уведомления и задачи | Twenty Workflows | Видимость и редактирование оператором |
| Бронь, capacity, пакетные операции | Logic Functions | Нужны транзакционные проверки и идемпотентность |
| Приём событий лендинга/кассы | HTTP Logic Functions | Валидация, auth, deduplication, retry |
| Регулярные проверки | Cron Logic Functions | SLA, истечение пакетов, сверка |

До создания production-данных необходимо решить, будет ли схема поставляться приложением. Не следует создавать одноимённые production-объекты вручную, а затем повторно объявлять их приложением.

### 2.3. Условные обозначения

| Обозначение | Значение |
| --- | --- |
| Required | Значение обязательно для перехода записи в рабочий статус |
| System | Заполняется логикой, оператором не редактируется |
| Indexed | Требуется индекс для поиска или уникальности |
| Computed | Рассчитывается из первичных операций |
| Decision | Требует решения владельца до включения функции |

## 3. Итоговая схема связей

```text
Person 1 ── N Opportunity
Person 1 ── N Booking N ── 1 ClassSession N ── 1 ClassGroup
Person 1 ── N Membership N ── 1 Product
Membership 1 ── N MembershipTransaction
Membership 1 ── N Booking
Booking 1 ── 0..1 MakeUpCredit
Person 1 ── N Payment
Payment N ── 0..1 Membership
Opportunity 0..1 ── 1 Booking (introBooking)
ClassGroup N ── 1 WorkspaceMember (trainer)
ClassSession N ── 1 WorkspaceMember (trainer)
```

`Company` не участвует в основной B2C-воронке. Он сохраняется для поставщиков, партнёров, арендодателя и будущих корпоративных клиентов.

## 4. Справочники

### 4.1. Lifecycle клиента

Поле `Person.lifecycleStatus`, тип `SELECT`, default `WAITLIST`.

| Value | Label | Условие |
| --- | --- | --- |
| `WAITLIST` | Лист ожидания | Оставил заявку до открытия |
| `LEAD` | Лид | Доступна запись, покупка ещё не состоялась |
| `CONTACTED` | Связались | Был содержательный контакт |
| `INTRO_BOOKED` | Записан на intro | Есть будущая intro-бронь |
| `INTRO_ATTENDED` | Посетил intro | Intro состоялось, покупки ещё нет |
| `ACTIVE_CLIENT` | Активный клиент | Есть активный пакет или оплачанная будущая запись |
| `PAUSED` | Пауза | Пауза подтверждена оператором |
| `CHURNED` | Ушёл | Нет активности и подтверждён уход |
| `RE_ENGAGEMENT` | Возврат | Запущена попытка возврата |

### 4.2. Источник лида

Поле `leadSource`, тип `SELECT`:

`YANDEX_SEARCH`, `YANDEX_NETWORK`, `ORGANIC_SEARCH`, `MAPS`, `REFERRAL`, `SOCIAL`, `DIRECT_MESSAGE`, `WALK_IN`, `OTHER`, `UNKNOWN`.

First-touch источник после первого заполнения изменяет только администратор. Last-touch хранится отдельно.

### 4.3. Предпочтительный канал

`PHONE`, `TELEGRAM`, `WHATSAPP`, `EMAIL`, `OTHER`, `UNKNOWN`.

### 4.4. Time band

`WEEKDAY_MORNING`, `WEEKDAY_DAY`, `WEEKDAY_EVENING`, `WEEKEND_MORNING`, `WEEKEND_DAY`, `WEEKEND_EVENING`, `FLEXIBLE`, `UNKNOWN`.

### 4.5. Формат занятия

`GROUP_REFORMER`, `INTRO_REFORMER`, `PERSONAL_EQUIPMENT`. Будущие значения добавляются без изменения существующих: `MAT_PILATES`, `STRETCHING`, `TRX`.

## 5. Расширение стандартного объекта Person

Создать поля в указанном порядке.

| # | API name | Label | Type | Default/Options | Правило |
| ---: | --- | --- | --- | --- | --- |
| 1 | `lifecycleStatus` | Статус клиента | `SELECT` | §4.1; `WAITLIST` | Required |
| 2 | `preferredChannel` | Канал связи | `SELECT` | §4.3; `UNKNOWN` |  |
| 3 | `interestedFormats` | Интересующие форматы | `MULTI_SELECT` | значения §4.5 |  |
| 4 | `preferredTimeBands` | Удобное время | `MULTI_SELECT` | §4.4 |  |
| 5 | `leadSource` | Первый источник | `SELECT` | §4.2; `UNKNOWN` | System после ingest |
| 6 | `lastLeadSource` | Последний источник | `SELECT` | §4.2; `UNKNOWN` | System |
| 7 | `firstLeadAt` | Первый лид | `DATE_TIME` | null | System |
| 8 | `lastLeadAt` | Последний лид | `DATE_TIME` | null | System |
| 9 | `firstContactedAt` | Первый ответ | `DATE_TIME` | null | System/workflow |
| 10 | `nextActionAt` | Следующее действие | `DATE_TIME` | null | Required для активного лида |
| 11 | `personalDataConsent` | Согласие ПДн | `BOOLEAN` | false | Required для ingest |
| 12 | `personalDataConsentAt` | Дата согласия ПДн | `DATE_TIME` | null | System |
| 13 | `personalDataConsentVersion` | Версия согласия ПДн | `TEXT` | null | System |
| 14 | `marketingConsent` | Маркетинговое согласие | `BOOLEAN` | false |  |
| 15 | `marketingConsentAt` | Дата маркетингового согласия | `DATE_TIME` | null | System |
| 16 | `marketingConsentSource` | Источник согласия | `TEXT` | null | System |
| 17 | `firstUtmSource` | First UTM source | `TEXT` | null | System |
| 18 | `firstUtmMedium` | First UTM medium | `TEXT` | null | System |
| 19 | `firstUtmCampaign` | First UTM campaign | `TEXT` | null | System |
| 20 | `firstUtmContent` | First UTM content | `TEXT` | null | System |
| 21 | `firstUtmTerm` | First UTM term | `TEXT` | null | System |
| 22 | `lastUtmSource` | Last UTM source | `TEXT` | null | System |
| 23 | `lastUtmMedium` | Last UTM medium | `TEXT` | null | System |
| 24 | `lastUtmCampaign` | Last UTM campaign | `TEXT` | null | System |
| 25 | `lastUtmContent` | Last UTM content | `TEXT` | null | System |
| 26 | `lastUtmTerm` | Last UTM term | `TEXT` | null | System |
| 27 | `landingLeadId` | ID лида лендинга | `TEXT` | null | Indexed, System |
| 28 | `lostReason` | Причина потери/ухода | `SELECT` | `NO_RESPONSE`, `NO_SUITABLE_TIME`, `PRICE`, `LOCATION`, `FORMAT_MISMATCH`, `CHANGED_MIND`, `DUPLICATE`, `OTHER` | Required для CHURNED |
| 29 | `lostReasonDetails` | Комментарий причины | `TEXT` | null | Required для OTHER |

Использовать стандартные поля `phones`, `emails`, `createdBy`, `assignedTo` и имя Person. Не создавать дублирующие `phone`/`email` как `TEXT`.

### 5.1. Нормализация контактов

- Телефон приводится к E.164, российский номер — `+7XXXXXXXXXX`.
- Email приводится к lowercase и trim.
- Поиск дубля: точный normalized phone, затем точный normalized email.
- Если телефон указывает на одного человека, а email на другого, автоматическое объединение запрещено; создаётся задача администратору.
- Повторная заявка обновляет last-touch и `lastLeadAt`, но не first-touch.
- ФИО не используется как уникальный ключ.

## 6. Настройка Opportunity

Стандартный объект используется только для первой покупки.

### 6.1. Стадии

Заменить или дополнить `stage`:

| Position | Value | Label | Terminal |
| ---: | --- | --- | --- |
| 10 | `WAITLIST` | Лист ожидания | Нет |
| 20 | `NEW_LEAD` | Новый лид | Нет |
| 30 | `CONTACTED` | Связались | Нет |
| 40 | `INTRO_OFFERED` | Предложено intro | Нет |
| 50 | `INTRO_BOOKED` | Intro записано | Нет |
| 60 | `INTRO_ATTENDED` | Intro посещено | Нет |
| 70 | `FIRST_PURCHASE` | Первая покупка | Да, won |
| 80 | `LOST` | Потерян | Да, lost |

### 6.2. Поля

| API name | Label | Type | Правило |
| --- | --- | --- | --- |
| `person` | Клиент | `RELATION` → Person, many-to-one | Required |
| `leadReceivedAt` | Получен | `DATE_TIME` | Required, System |
| `contactedAt` | Первый ответ | `DATE_TIME` | System/workflow |
| `firstResponseMinutes` | Время ответа, мин | `NUMBER` | Computed |
| `leadSource` | Источник | `SELECT` | Snapshot from Person |
| `utmCampaign` | UTM campaign | `TEXT` | Snapshot |
| `utmContent` | UTM content | `TEXT` | Snapshot |
| `introBooking` | Intro-запись | `RELATION` → Booking, one-to-one semantics | Nullable |
| `introOutcome` | Результат intro | `SELECT` | `ATTENDED`, `CANCELLED_IN_TIME`, `LATE_CANCEL`, `NO_SHOW`, `STUDIO_CANCEL`, `NOT_APPLICABLE` |
| `offeredProduct` | Предложенный продукт | `RELATION` → Product | Nullable |
| `firstPayment` | Первая оплата | `RELATION` → Payment | Nullable |
| `lostReason` | Причина потери | `SELECT` | Required at LOST |
| `lostReasonDetails` | Детали потери | `TEXT` | Required for OTHER |

Название opportunity формировать как `<Person name> — первое занятие`, не вводить вручную.

## 7. Custom objects

Каждый объект получает стандартные `id`, `createdAt`, `updatedAt`, `createdBy`, `position`. Ниже перечислены только предметные поля.

### 7.1. Product (`product` / `products`)

Label: `Продукт` / `Продукты`. Label identifier: `name`. Icon: канонический icon для продукта/прайса из icon dictionary.

| API name | Label | Type | Default/Options | Правило |
| --- | --- | --- | --- | --- |
| `name` | Название | `TEXT` |  | Required |
| `code` | Код | `TEXT` |  | Required, unique, Indexed |
| `category` | Категория | `SELECT` | `INTRO`, `SINGLE`, `GROUP_PACKAGE`, `PERSONAL` | Required |
| `sessionFormat` | Формат | `SELECT` | §4.5 | Required |
| `visitsIncluded` | Посещений | `NUMBER` | 1 | Required, integer > 0 |
| `price` | Цена | `CURRENCY` | RUB | Required, >= 0 |
| `validityDays` | Срок, дней | `NUMBER` | null | Decision, integer > 0 |
| `activationLimitDays` | Активация, дней | `NUMBER` | null | Decision |
| `isActive` | Доступен для продажи | `BOOLEAN` | false | Required |
| `isIntroOnly` | Только первое занятие | `BOOLEAN` | false |  |
| `version` | Версия | `NUMBER` | 1 | Required |
| `validFrom` | Действует с | `DATE` |  | Required |
| `validTo` | Действует до | `DATE` | null |  |
| `decisionStatus` | Статус решения | `SELECT` | `APPROVED`, `EXPERIMENT`, `DEFERRED` | Required |

Уникальность: `code + version`. Проданный Product нельзя изменять по цене, посещениям и срокам; создаётся новая версия.

Начальные записи:

| Code | Name | Category | Visits | Price | Active |
| --- | --- | --- | ---: | ---: | --- |
| `INTRO_REFORMER` | Первое занятие на реформере | INTRO | 1 | 1 500 ₽ | Да |
| `SINGLE_REFORMER` | Разовое занятие на реформере | SINGLE | 1 | 2 500 ₽ | Да |
| `PACKAGE_4_REFORMER` | Пакет 4 | GROUP_PACKAGE | 4 | 8 800 ₽ | После решения |
| `PACKAGE_8_REFORMER` | Пакет 8 | GROUP_PACKAGE | 8 | 16 000 ₽ | После решения |
| `PERSONAL_EQUIPMENT` | Персональное занятие | PERSONAL | 1 | 4 000 ₽ | Да |

### 7.2. ClassGroup (`classGroup` / `classGroups`)

| API name | Label | Type | Default/Options | Правило |
| --- | --- | --- | --- | --- |
| `name` | Название | `TEXT` |  | Required |
| `status` | Статус | `SELECT` | `DRAFT`, `FORMING`, `ACTIVE`, `PAUSED`, `CLOSED` | `DRAFT` |
| `sessionFormat` | Формат | `SELECT` | §4.5 | Required |
| `trainer` | Тренер | `ACTOR` или relation к workspace member |  | Required |
| `weekday` | День недели | `SELECT` | `MONDAY`…`SUNDAY` | Required |
| `startTimeLocal` | Время начала | `TEXT` | `HH:mm` | Required; validate regexp |
| `startsOn` | Начало | `DATE` |  | Required |
| `endsOn` | Окончание | `DATE` | null |  |
| `capacity` | Вместимость | `NUMBER` | 4 | Required; 1..4 на старте |
| `minimumPaidMembers` | Минимум участников | `NUMBER` | 3 | Required |
| `memberCount` | Постоянных участников | `NUMBER` | 0 | Computed |
| `availablePermanentPlaces` | Свободных мест | `NUMBER` | 4 | Computed |

Членство в группе не хранить multi-relation прямо в ClassGroup. Для истории создать `GroupMembership`.

### 7.3. GroupMembership (`groupMembership` / `groupMemberships`)

| API name | Label | Type | Правило |
| --- | --- | --- | --- |
| `name` | Название | `TEXT` | System: `<Person> / <Group>` |
| `person` | Клиент | `RELATION` → Person | Required |
| `classGroup` | Группа | `RELATION` → ClassGroup | Required |
| `status` | Статус | `SELECT`: `WAITLIST`, `OFFERED`, `ACTIVE`, `PAUSED`, `ENDED` | Required |
| `startsOn` | Начало | `DATE` |  |
| `endsOn` | Окончание | `DATE` |  |
| `waitlistPosition` | Позиция ожидания | `NUMBER` | System |
| `offerExpiresAt` | Предложение до | `DATE_TIME` |  |

Уникальность active membership: один Person не может дважды быть ACTIVE в одной группе.

### 7.4. ClassSession (`classSession` / `classSessions`)

| API name | Label | Type | Default/Options | Правило |
| --- | --- | --- | --- | --- |
| `name` | Название | `TEXT` | System | Required |
| `classGroup` | Постоянная группа | `RELATION` → ClassGroup | Nullable для intro/personal |
| `sessionFormat` | Формат | `SELECT` | §4.5 | Required |
| `trainer` | Тренер | `ACTOR` или relation | Required |
| `startsAt` | Начало | `DATE_TIME` |  | Required, Indexed |
| `endsAt` | Окончание | `DATE_TIME` |  | Required |
| `capacity` | Вместимость | `NUMBER` | 4 | Required |
| `status` | Статус | `SELECT` | `PLANNED`, `CONFIRMED`, `COMPLETED`, `CANCELLED_BY_STUDIO` | `PLANNED` |
| `bookedCount` | Забронировано | `NUMBER` | 0 | Computed |
| `attendedCount` | Посетило | `NUMBER` | 0 | Computed |
| `trainerCompensation` | Оплата тренеру | `CURRENCY` | 1 500 ₽ | Snapshot |
| `studioCancellationReason` | Причина отмены | `TEXT` |  | Required при отмене студией |
| `completionLockedAt` | Закрыто | `DATE_TIME` | null | System |

Constraints:

- `endsAt > startsAt`;
- один тренер не может иметь пересекающиеся сессии;
- на старте длительность 50 минут, соседние занятия имеют 10-минутный turnover;
- completed session не редактируется обычным оператором.

### 7.5. Booking (`booking` / `bookings`)

| API name | Label | Type | Default/Options | Правило |
| --- | --- | --- | --- | --- |
| `name` | Название | `TEXT` | System | Required |
| `person` | Клиент | `RELATION` → Person | Required |
| `classSession` | Занятие | `RELATION` → ClassSession | Required |
| `membership` | Пакет | `RELATION` → Membership | Nullable для unpaid/intro |
| `product` | Продукт | `RELATION` → Product | Required snapshot relation |
| `bookingType` | Тип записи | `SELECT` | `REGULAR`, `INTRO`, `PERSONAL`, `MAKE_UP` | Required |
| `status` | Статус | `SELECT` | `BOOKED`, `ATTENDED`, `CANCELLED_IN_TIME`, `LATE_CANCEL`, `NO_SHOW`, `CANCELLED_BY_STUDIO` | `BOOKED` |
| `bookedAt` | Записан | `DATE_TIME` | now | System |
| `cancelledAt` | Отменён | `DATE_TIME` | null | System |
| `hoursBeforeStartAtCancellation` | Часов до старта | `NUMBER` | null | Computed |
| `consumesVisit` | Списать посещение | `BOOLEAN` | false | Computed |
| `makeUpCredit` | Право на отработку | `RELATION` → MakeUpCredit | Nullable |
| `source` | Канал записи | `SELECT` | `OPERATOR`, `CLIENT_WEB`, `CLIENT_APP`, `IMPORT` | Required |
| `externalId` | Внешний ID | `TEXT` | null | Indexed |

Constraints:

- unique active booking: `person + classSession`;
- active booking count < `classSession.capacity`;
- Membership соответствует Person, формату и сроку занятия;
- MAKE_UP требует доступный MakeUpCredit;
- изменение результата после закрытия session — только корректирующей операцией администратора.

### 7.6. Membership (`membership` / `memberships`)

| API name | Label | Type | Default/Options | Правило |
| --- | --- | --- | --- | --- |
| `name` | Название | `TEXT` | System | Required |
| `person` | Клиент | `RELATION` → Person | Required |
| `product` | Продукт | `RELATION` → Product | Required |
| `payment` | Оплата | `RELATION` → Payment | Required для ACTIVE |
| `status` | Статус | `SELECT` | `PENDING_PAYMENT`, `ACTIVE`, `EXHAUSTED`, `EXPIRED`, `FROZEN`, `REFUNDED`, `CANCELLED` | `PENDING_PAYMENT` |
| `soldAt` | Продан | `DATE_TIME` |  | Required |
| `activationDeadline` | Активировать до | `DATE` | Computed |
| `activatedAt` | Активирован | `DATE_TIME` | null | System |
| `expiresOn` | Действует до | `DATE` | null | Computed |
| `visitsGranted` | Начислено | `NUMBER` | Product snapshot | System |
| `visitsReserved` | Зарезервировано | `NUMBER` | 0 | Computed |
| `visitsConsumed` | Использовано | `NUMBER` | 0 | Computed |
| `visitsAvailable` | Доступно | `NUMBER` | 0 | Computed |
| `purchasePrice` | Цена покупки | `CURRENCY` | Product snapshot | System |
| `refundAmount` | Возвращено | `CURRENCY` | 0 | System |
| `studioExtensionDays` | Продление студией | `NUMBER` | 0 | System |
| `currentMakeUpsUsed` | Отработок в периоде | `NUMBER` | 0 | Computed |

Формула: `visitsAvailable = grants + positive adjustments - reserved - consumed - refunded visits`. Поля-счётчики — кэш; источником правды является MembershipTransaction.

### 7.7. MembershipTransaction (`membershipTransaction` / `membershipTransactions`)

| API name | Label | Type | Правило |
| --- | --- | --- | --- |
| `name` | Название | `TEXT` | System |
| `membership` | Пакет | `RELATION` → Membership | Required |
| `booking` | Запись | `RELATION` → Booking | Nullable |
| `type` | Операция | `SELECT`: `GRANT`, `RESERVE`, `RELEASE`, `CONSUME`, `ADJUST`, `REFUND_VISIT`, `EXTEND` | Required |
| `visitDelta` | Изменение посещений | `NUMBER` | Required; signed |
| `daysDelta` | Изменение срока | `NUMBER` | default 0 |
| `occurredAt` | Время | `DATE_TIME` | System |
| `idempotencyKey` | Ключ идемпотентности | `TEXT` | Required, unique, Indexed |
| `reason` | Причина | `TEXT` | Required для ADJUST/REFUND/EXTEND |
| `actor` | Инициатор | `ACTOR` | System |

Операции append-only. Удаление и редактирование запрещены; ошибка исправляется компенсирующей операцией.

### 7.8. Payment (`payment` / `payments`)

| API name | Label | Type | Default/Options | Правило |
| --- | --- | --- | --- | --- |
| `name` | Название | `TEXT` | System |
| `person` | Клиент | `RELATION` → Person | Required |
| `membership` | Пакет | `RELATION` → Membership | Nullable |
| `product` | Продукт | `RELATION` → Product | Required |
| `amount` | Сумма | `CURRENCY` | RUB | Required |
| `method` | Способ | `SELECT` | `CASH`, `SBP` | Required |
| `status` | Статус | `SELECT` | `EXPECTED`, `PAID`, `PARTIALLY_REFUNDED`, `REFUNDED`, `FAILED` | `EXPECTED` |
| `paidAt` | Оплачено | `DATE_TIME` | null | Required при PAID |
| `fiscalReceiptId` | ID чека | `TEXT` | null | Required при PAID после запуска кассы |
| `receiptUrl` | Ссылка на чек | `LINKS` | null |  |
| `externalId` | Внешний ID | `TEXT` | null | unique, Indexed when present |
| `refundAmount` | Сумма возврата | `CURRENCY` | 0 | System |
| `leadSourceSnapshot` | Источник клиента | `SELECT` | §4.2 | System |

### 7.9. MakeUpCredit (`makeUpCredit` / `makeUpCredits`)

| API name | Label | Type | Правило |
| --- | --- | --- | --- |
| `name` | Название | `TEXT` | System |
| `person` | Клиент | `RELATION` → Person | Required |
| `membership` | Пакет | `RELATION` → Membership | Required |
| `sourceBooking` | Исходная запись | `RELATION` → Booking | Required, unique |
| `usedBooking` | Запись-отработка | `RELATION` → Booking | Nullable |
| `status` | Статус | `SELECT` | `AVAILABLE`, `BOOKED`, `USED`, `EXPIRED`, `REVOKED` |
| `grantedAt` | Выдано | `DATE_TIME` | System |
| `expiresAt` | Истекает | `DATE_TIME` | Membership expiry |
| `idempotencyKey` | Ключ | `TEXT` | Required, unique |
| `revocationReason` | Причина отзыва | `TEXT` | Required для REVOKED |

## 8. Индексы и ограничения

| Object | Index/constraint | Реализация |
| --- | --- | --- |
| Person | `landingLeadId` lookup | Поиск через ingestion logic: app indexes нельзя создавать на стандартном Person |
| Product | `code + version` unique | application index |
| GroupMembership | Person + Group + ACTIVE unique semantics | Logic Function validation; DB constraint если поддерживается partial index |
| ClassSession | `startsAt`, trainer | indexes для календаря и проверки конфликтов |
| Booking | Person + Session active unique | Logic Function + unique key strategy |
| Booking | capacity | транзакционная Logic Function, не workflow |
| MembershipTransaction | `idempotencyKey` unique | unique index |
| Payment | `externalId` unique when present | Logic Function + index |
| MakeUpCredit | `sourceBooking` unique | unique relation/index |
| MakeUpCredit | `idempotencyKey` unique | unique index |

Если Twenty metadata не позволяет выразить составной/частичный unique index, constraint реализуется в единственной серверной команде записи и покрывается конкурентным integration test. UI и внешние клиенты не должны создавать такие записи напрямую.

## 9. Views

Создать в следующем порядке.

| ID | Object | Name | Layout | Filter/sort/group |
| --- | --- | --- | --- | --- |
| VIEW-01 | Opportunity | Новые лиды | Table | stage NEW_LEAD/WAITLIST; leadReceivedAt asc |
| VIEW-02 | Opportunity | Нарушение SLA | Table | contactedAt null; leadReceivedAt older than SLA |
| VIEW-03 | Opportunity | Воронка первой покупки | Kanban | group stage; owner filter optional |
| VIEW-04 | Opportunity | Intro без покупки | Table | stage INTRO_ATTENDED; createdAt asc |
| VIEW-05 | ClassSession | Календарь занятий | Calendar | date startsAt; status not cancelled by default |
| VIEW-06 | ClassGroup | Формирование групп | Kanban | group status |
| VIEW-07 | Booking | Ближайшие записи | Table | session startsAt next 7 days; sort asc |
| VIEW-08 | Booking | Требуется отметить явку | Table | past session + BOOKED |
| VIEW-09 | Membership | Активные пакеты | Table | status ACTIVE; expiresOn asc |
| VIEW-10 | Membership | Заканчиваются | Table | visitsAvailable <= 2 OR expiresOn within 7 days |
| VIEW-11 | MakeUpCredit | Сгорающие отработки | Table | AVAILABLE; expiresAt asc |
| VIEW-12 | Payment | Оплаты без чека | Table | PAID and fiscalReceiptId empty |
| VIEW-13 | GroupMembership | Лист ожидания групп | Table | WAITLIST; group then waitlistPosition |

## 10. Roles

Матрица `C/R/U/D` — create/read/update/delete. `—` — запрет.

| Object | Owner | Operator/Trainer | Marketing | Accounting | Integration |
| --- | --- | --- | --- | --- | --- |
| Person | CRUD | CRU | R limited | R limited | CRU limited |
| Opportunity | CRUD | CRU | R | R | CRU limited |
| Product | CRUD | R | R | R | R |
| ClassGroup | CRUD | CRU | R aggregate | R | R |
| ClassSession | CRUD | CRU | R aggregate | R | R |
| Booking | CRUD | CRU through actions | — | R | CRU through actions |
| Membership | CRUD | CRU through actions | — | R | CRU through actions |
| MembershipTransaction | CR, no update/delete | CR through actions | — | R | C through functions |
| Payment | CRUD | CRU limited | — | CRU | C/U limited |
| MakeUpCredit | CRUD | CRU through actions | — | R | C/U through functions |

Marketing не должен видеть телефон, email, сообщения, notes и согласия, если для задачи достаточно агрегатов. Integration role получает доступ только к полям ingest и не может читать все записи.

## 11. Workflows и Logic Functions

### WF-01 Lead ingestion

Тип: HTTP Logic Function. Endpoint: `POST /studio/leads`.

Вход:

```json
{
  "externalId": "landing-lead-id",
  "submittedAt": "ISO-8601",
  "name": "string",
  "phone": "string|null",
  "email": "string|null",
  "interestedFormats": ["INTRO_REFORMER"],
  "personalDataConsent": true,
  "personalDataConsentVersion": "string",
  "marketingConsent": false,
  "utm": {
    "source": "string|null",
    "medium": "string|null",
    "campaign": "string|null",
    "content": "string|null",
    "term": "string|null"
  }
}
```

Алгоритм:

1. Проверить сервисную авторизацию, размер и JSON schema.
2. Отклонить запрос без `externalId`, имени, контакта или согласия ПДн.
3. Нормализовать телефон/email.
4. Найти Person по телефону, затем email.
5. При конфликте двух Person создать integration incident и вернуть accepted-for-review без merge.
6. Создать Person либо обновить last-touch.
7. First-touch заполнить только если пусто.
8. Создать Opportunity, если для Person нет незавершённой opportunity первой покупки.
9. Создать Task с due date по SLA.
10. Поставить Telegram notification в очередь.
11. Вернуть стабильный `personId`, `opportunityId`, `duplicate`.

Идемпотентность: повтор `externalId` возвращает прежний результат без второй opportunity/task.

Ошибки: 4xx не ретраятся; 5xx ретраятся лендингом с exponential backoff. Payload без контакта не логируется целиком.

### WF-02 Lead SLA

Тип: cron каждые 15 минут.

- Выбрать открытые Opportunity без `contactedAt`.
- Рассчитать дедлайн с учётом утверждённых рабочих часов.
- При первом нарушении создать уведомление ответственному.
- Не создавать повторные задачи; использовать marker/idempotency key.
- После фиксации контакта заполнить `contactedAt`, `firstResponseMinutes`, Person.firstContactedAt и stage CONTACTED.

Рабочие часы — Decision. До решения cron работает только как отчёт, без оценки нарушения.

### WF-03 Telegram lead alert

Тип: background Logic Function.

Сообщение: имя, контакт в минимально необходимом виде, время, источник, marketing consent yes/no, ссылка на CRM. Не включать полный payload, UTM term и notes.

Повторная отправка не должна создавать второе сообщение без пометки retry. Ошибка Telegram не откатывает сохранение лида.

### WF-04 Create session series

Тип: command/Logic Function.

Вход: ClassGroup, from, to. Создаёт ClassSession по weekday/time, пропускает уже существующие. Проверяет конфликт тренера и capacity. До подтверждения показывает dry-run: число создаваемых, пропущенных и конфликтных сессий.

### WF-05 Create booking

Тип: транзакционная Logic Function; единственная точка создания активной брони.

1. Заблокировать/повторно прочитать ClassSession.
2. Проверить session status и будущее время.
3. Проверить отсутствие активной брони Person+Session.
4. Проверить `bookedCount < capacity`.
5. Проверить Product и Membership/MakeUpCredit.
6. Для Membership создать RESERVE transaction.
7. Для MakeUpCredit изменить AVAILABLE → BOOKED.
8. Создать Booking.
9. Пересчитать counters.
10. Создать напоминания.

При любой ошибке не должно оставаться резерва без Booking.

### WF-06 Cancel booking

Вход: bookingId, cancelledAt, actor, reason.

- Вычислить часы до startsAt на сервере.
- `>= 12` → CANCELLED_IN_TIME, RELEASE reservation, при соблюдении месячного лимита создать MakeUpCredit.
- `< 12` → LATE_CANCEL, CONSUME visit.
- Отмена студией вызывается отдельной командой и не использует клиентский лимит.
- Повторный вызов возвращает текущий результат без второй транзакции.

Правило MakeUpCredit включать только после утверждения полного срока пакета и возвратов.

### WF-07 Complete session

Тип: command operator.

1. Показать все BOOKED.
2. Потребовать исход для каждого: ATTENDED или NO_SHOW.
3. Для ATTENDED и NO_SHOW создать CONSUME.
4. Освободить некорректные оставшиеся reservations только через явное решение.
5. Обновить session counts/status COMPLETED и lock timestamp.
6. Для intro обновить Opportunity и lifecycle.
7. Для intro ATTENDED без покупки создать follow-up Task.

Повторное завершение запрещено; исправление — admin correction.

### WF-08 Confirm payment and sell membership

Вход: Person, Product version, amount, method, receipt data.

1. Проверить активность Product и сумму либо потребовать permission на скидку.
2. Создать/подтвердить Payment.
3. Создать Membership snapshot.
4. Создать GRANT transaction.
5. Рассчитать activationDeadline.
6. Для single/intro связать с Booking либо создать право на одну бронь.
7. При первой покупке stage → FIRST_PURCHASE, Person → ACTIVE_CLIENT.

Payment PAID без receipt допускается только до включения обязательного кассового правила и попадает в VIEW-12.

### WF-09 Activate and expire membership

- Активация происходит при первом подходящем посещении или вручную согласно Decision.
- `expiresOn = activation date + validityDays - 1 + extensionDays`.
- Cron ежедневно переводит ACTIVE → EXPIRED, если срок прошёл.
- Если visitsAvailable = 0 и reservations = 0, status → EXHAUSTED.
- За 7 дней или при остатке <=2 создаётся одна задача повторной продажи.

### WF-10 Studio cancellation

1. Session → CANCELLED_BY_STUDIO с причиной.
2. Все BOOKED → CANCELLED_BY_STUDIO.
3. RELEASE reservations.
4. Вернуть BOOKED MakeUpCredit в AVAILABLE.
5. Применить утверждённое продление пакета либо создать review task.
6. Отправить уведомление клиентам.
7. Создать incident, если сообщение не доставлено.

До утверждения продления workflow не меняет expiry автоматически.

### WF-11 Reconciliation

Ежедневно:

- landing leads count/IDs против CRM ingest log;
- memberships counters против transactions;
- sessions bookedCount против active bookings;
- payments PAID против чеков;
- просроченные background jobs и уведомления.

Расхождение создаёт Integration Incident и не исправляется молча.

## 12. Layouts

### Person page

Tab `Клиент`: lifecycle, контакты, ответственный, next action, предпочтения.

Tab `Занятия`: будущие Bookings, история посещений, MakeUpCredits.

Tab `Пакеты и оплаты`: active Memberships, transactions read-only, Payments.

Tab `Маркетинг и согласия`: attribution и consent audit; ограниченный доступ.

Tab `Коммуникации`: стандартные email/calendar/notes/tasks при подключении.

### ClassSession page

Header: startsAt, format, trainer, status, booked/capacity. Main relation table: Bookings. Actions: `Записать`, `Отменить занятие`, `Отметить явку`.

### Membership page

Header: status, available/granted, expiry. Main: immutable transaction table. Actions: `Продлить студией`, `Корректировка` только для owner с обязательной причиной.

## 13. Migration existing leads

### MIG-01 Export

Выгрузить `leads` в CSV/JSON с исходным primary key, timestamps, name, phone, email, consents, format preferences и UTM. Сделать read-only snapshot и записать count/hash.

### MIG-02 Transform

- нормализовать контакты;
- отметить записи без допустимого контакта;
- построить группы дублей;
- не объединять конфликтные записи автоматически;
- сформировать deterministic idempotency key `landing:<lead-id>`.

### MIG-03 Dry run

Отчёт: total, valid, invalid, exact duplicates, conflicts, persons to create, persons to update, opportunities to create. В CRM не писать.

### MIG-04 Import

Пакеты ограниченного размера через тот же Lead ingestion service с mode IMPORT; после каждого batch сохранять checkpoint.

### MIG-05 Verify

- все valid external IDs представлены один раз;
- first-touch не потерян;
- consent false не превратился в true;
- число открытых opportunities объяснимо;
- выборочно сверить не менее 20 записей или все записи, если их меньше 20.

### MIG-06 Cutover

Включить webhook лендинга, выполнить delta import, повторить reconciliation, затем прекратить ручную работу непосредственно в PostgreSQL.

## 14. Тестовая стратегия

### 14.1. Unit tests

- phone/email normalization;
- source mapping;
- 12-hour boundary: ровно 12:00 считается своевременной;
- package expiry calculation;
- visit balance reducer;
- one make-up per calculation month;
- first-touch immutability;
- Product snapshot/version behavior.

### 14.2. Integration tests

| ID | Scenario | Expected |
| --- | --- | --- |
| INT-01 | Один lead webhook дважды | Один Person, одна Opportunity, одна Task |
| INT-02 | Повтор с новым UTM | First-touch прежний, last-touch обновлён |
| INT-03 | Phone и email находят разных Person | Ни один не merged, incident created |
| INT-04 | Две параллельные брони последнего места | Успешна только одна |
| INT-05 | Повтор Create booking с idempotency key | Одна Booking/RESERVE |
| INT-06 | Своевременная отмена | RELEASE + максимум один MakeUpCredit |
| INT-07 | Поздняя отмена | CONSUME, credit отсутствует |
| INT-08 | No-show | CONSUME один раз |
| INT-09 | Отмена студией | RELEASE, credit restored, review/extension generated |
| INT-10 | Membership counter reconciliation | Counters равны transaction ledger |
| INT-11 | Новая версия Product | Старая Membership не меняется |
| INT-12 | Telegram недоступен | Lead сохранён, job retried, incident visible |

### 14.3. End-to-end acceptance

1. Отправить тестовую заявку на production-like лендинге.
2. Убедиться, что Person/Opportunity/Task созданы и alert доставлен.
3. Зафиксировать первый ответ.
4. Создать intro session и booking.
5. Подтвердить payment/receipt.
6. Отметить attendance.
7. Продать package 4/8.
8. Создать регулярные bookings.
9. Выполнить своевременную и позднюю отмены.
10. Проверить balance, make-up, dashboard и audit trail.

## 15. Набор задач

Размер: `S` — до одного небольшого изменения; `M` — самостоятельная функция; `L` — комплексная функция с интеграцией/конкурентностью. Размер не является календарной оценкой.

### Epic A — решения и foundation

| ID | Задача | Size | Depends on | Done when |
| --- | --- | --- | --- | --- |
| CRM-001 | Зафиксировать Twenty version, deployment и backup | S | — | Версия и restore procedure записаны |
| CRM-002 | Утвердить channel/SLA/working hours | S | — | Decision внесён в spec |
| CRM-003 | Утвердить package activation/expiry/refund | M | — | Все Decision в §7 закрыты |
| CRM-004 | Создать internal app skeleton `katfit-studio` | M | CRM-001 | App ставится в test workspace |
| CRM-005 | Настроить stable identifiers and environments | S | CRM-004 | Dev/test/prod remotes разделены |
| CRM-006 | Создать roles and integration credentials | M | CRM-004 | Least privilege проверен |

### Epic B — lead CRM

| ID | Задача | Size | Depends on | Done when |
| --- | --- | --- | --- | --- |
| CRM-101 | Добавить Person fields/options | M | CRM-004 | Поля из §5 синхронизированы |
| CRM-102 | Настроить Opportunity stages/fields | M | CRM-004 | Схема §6 доступна |
| CRM-103 | Создать lead views | S | CRM-101, CRM-102 | VIEW-01..04 работают |
| CRM-104 | Реализовать contact normalization | M | CRM-004 | Unit tests green |
| CRM-105 | Реализовать WF-01 Lead ingestion | L | CRM-101, CRM-102, CRM-104 | INT-01..03 green |
| CRM-106 | Подключить лендинг к endpoint | M | CRM-105 | Test lead проходит end-to-end |
| CRM-107 | Реализовать Telegram queue/alert | M | CRM-105 | Failure не теряет lead |
| CRM-108 | Реализовать SLA workflow | M | CRM-002, CRM-105 | SLA view и alert корректны |
| CRM-109 | Добавить ingest/reconciliation telemetry | M | CRM-105 | Missing IDs создают incident |

### Epic C — migration

| ID | Задача | Size | Depends on | Done when |
| --- | --- | --- | --- | --- |
| CRM-201 | Описать и экспортировать leads schema | S | — | Snapshot/count/hash сохранены |
| CRM-202 | Реализовать transform/dedup report | M | CRM-104, CRM-201 | Dry-run классифицирует все строки |
| CRM-203 | Разобрать конфликтные дубли | M | CRM-202 | Для каждого есть решение |
| CRM-204 | Импортировать через ingest service | M | CRM-105, CRM-203 | Checkpoints и retry работают |
| CRM-205 | Выполнить verification/cutover | M | CRM-106, CRM-204 | MIG-05/06 пройдены |

### Epic D — schedule

| ID | Задача | Size | Depends on | Done when |
| --- | --- | --- | --- | --- |
| CRM-301 | Создать ClassGroup/GroupMembership | M | CRM-004 | Schema §7.2/7.3 ready |
| CRM-302 | Создать ClassSession | M | CRM-301 | Calendar view works |
| CRM-303 | Создать Booking | M | CRM-302 | Schema §7.5 ready |
| CRM-304 | Реализовать session-series dry-run/create | L | CRM-302 | Conflicts shown before write |
| CRM-305 | Реализовать transactional create booking | L | CRM-303 | INT-04/05 green |
| CRM-306 | Создать session/booking views and layouts | M | CRM-305 | VIEW-05..08 ready |
| CRM-307 | Реализовать reminder scheduling | M | CRM-305 | 24h/13–14h jobs observable |
| CRM-308 | Реализовать session completion | L | CRM-305 | Attendance required for all bookings |

### Epic E — products, payments and memberships

| ID | Задача | Size | Depends on | Done when |
| --- | --- | --- | --- | --- |
| CRM-401 | Создать Product and seed approved products | M | CRM-003, CRM-004 | Versioning enforced |
| CRM-402 | Создать Payment | M | CRM-401 | Manual paid flow works |
| CRM-403 | Создать Membership | M | CRM-401 | Snapshot fields immutable |
| CRM-404 | Создать append-only transaction ledger | L | CRM-403 | Direct update/delete denied |
| CRM-405 | Реализовать payment + membership sale | L | CRM-402..404 | Grant created exactly once |
| CRM-406 | Реализовать reservation/consumption | L | CRM-305, CRM-404 | Balance explains all bookings |
| CRM-407 | Реализовать activation/expiry cron | M | CRM-003, CRM-406 | Boundary tests green |
| CRM-408 | Создать membership/payment views/layouts | M | CRM-405 | VIEW-09/10/12 ready |

### Epic F — cancellations and make-ups

| ID | Задача | Size | Depends on | Done when |
| --- | --- | --- | --- | --- |
| CRM-501 | Создать MakeUpCredit | M | CRM-403 | Schema and indexes ready |
| CRM-502 | Реализовать cancel booking | L | CRM-003, CRM-406, CRM-501 | INT-06/07 green |
| CRM-503 | Реализовать studio cancellation | L | CRM-502 | INT-09 green |
| CRM-504 | Реализовать admin correction action | M | CRM-404 | Compensating transaction required |
| CRM-505 | Создать make-up views | S | CRM-501 | VIEW-11 ready |

### Epic G — analytics and operations

| ID | Задача | Size | Depends on | Done when |
| --- | --- | --- | --- | --- |
| CRM-601 | Dashboard lead funnel | M | CRM-205, CRM-308 | Metrics trace to records |
| CRM-602 | Dashboard capacity/attendance | M | CRM-308 | Paid places and attendance separated |
| CRM-603 | Dashboard retention | L | CRM-407 | 30/60/90 cohorts reproducible |
| CRM-604 | Dashboard payments/contribution | L | CRM-405, CRM-308 | Cash and earned revenue separated |
| CRM-605 | Daily reconciliation job | L | CRM-406, CRM-502 | INT-10 and incident flow green |
| CRM-606 | Backup/monitoring/runbook | M | all MVP epics | Restore and alert drill passed |

## 16. Порядок выполнения

Не запускать все epics параллельно. Рабочая последовательность:

1. `CRM-001..006` — решения, app skeleton, roles.
2. `CRM-101..109` — новые лиды сразу идут в CRM.
3. `CRM-201..205` — перенос текущего waitlist и cutover.
4. `CRM-301..308` — расписание и intro без пакетов.
5. `CRM-401..408` — продажи и пакетный ledger.
6. `CRM-501..505` — отмены и отработки после утверждения правил.
7. `CRM-601..606` — дашборды, сверка и эксплуатация.

После каждого epic проводится demo на тестовых данных и подписывается acceptance checklist. Переход к следующему epic не должен скрывать незакрытые ошибки потери данных, двойной брони или неверного баланса.

## 17. Definition of Done

Задача завершена, только если:

- metadata/code находится под version control;
- API names и option values соответствуют спецификации;
- права проверены от имени каждой затронутой роли;
- happy path и ошибки покрыты тестами;
- повтор события не создаёт дубль;
- персональные данные не попадают в логи;
- есть понятное сообщение оператору при отказе;
- monitoring показывает failure;
- документация и runbook обновлены;
- миграция/rollback описаны для изменения существующих данных;
- acceptance criterion задачи продемонстрирован на test workspace.

## 18. Решения, блокирующие разработку

| Decision | Блокирует |
| --- | --- |
| Канал, часы и SLA ответа | WF-02, коммуникации |
| Сроки пакетов и активация | Membership activation/expiry |
| Возвраты | Refund operations и клиентские тексты |
| Продление при отмене студией | WF-10 |
| Касса/ОФД | Автоматическое подтверждение Payment |
| Финальная стартовая сетка | ClassGroup seed и capacity dashboard |

Lead CRM, импорт waitlist, Telegram-alert и базовая intro-запись можно реализовывать до закрытия тарифных решений. Пакетные списания и отработки — нельзя.
