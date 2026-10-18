# KATFIT Studio

Internal Twenty application for KATFIT BALANCE CRM operations.

## Lead contour (implemented in code)

```text
Landing form → PostgreSQL leads → telegram-lead-notifier
  ├─ Telegram alert (supergroup + inline keyboard + deep-link)
  └─ POST /s/studio/leads (WF-01)
        → Person + Opportunity (WAITLIST) + Task «Написать клиенту» (due +2h)

Telegram buttons / reply / secretary
  └─ POST /s/studio/lead-actions
        → Note + stage / lifecycle / tasks (see docs/lead-actions.md)

Telegram resend card (ID36 / /resend)
  └─ POST /s/studio/lead-status
        → stage + channel + notes history (see docs/lead-status.md)
```

Manager lists in Opportunities: **Новые лиды**, **Нарушение SLA**, **Воронка первой покупки**, **Связались — ждут intro**, **Intro без покупки**.

Apply to a workspace (`twenty plan` / `apply`) and enable `CRM_SYNC_ENABLED` on the poller before this appears in production UI.

## Also in 0.1.0+

- Person lifecycle, lead source / last-touch, lead timestamps, landing ID, consents, full UTM, preferred channel, **lastContactChannel**, formats, time bands, next action.
- Opportunity pipeline fields (stage, SLA timestamps, lead/UTM snapshots, lost reason).
- WF-01 ingest + **LeadAction API** (`studio-lead-actions`) + **LeadStatus API** (`studio-lead-status`) for Telegram ops-bot.
- Products, groups, sessions, bookings, memberships, payments, make-up credits and relations.
- Pair records and the relations required for a shared split block and two client bookings.
- Five active base products: group single visit, group packages of 4/8 visits,
  and personal single visit/package of 8 visits.
- Package payment command: paid Payment + active Membership + idempotent GRANT transaction and visit balance.
- Past attendance command: completed ClassSession + attended Booking + idempotent CONSUME transaction and reconciled visit balance.

The attendance command resumes an interrupted operation when called with the same key. The SDK does not provide a transaction spanning CRM records: a failed intermediate mutation may leave a session or booking until retry completes it. The unique consumption sequence prevents two concurrent commands from consuming the same visit, but this flow still needs a transactional server-side write path before it can guarantee all-or-nothing behavior.
- Default application function role.

Not in this app yet: refunds and balance corrections, WF-02 SLA cron, WF-03 Telegram-from-CRM (outbound stays in poller), and transactional server-side writes for concurrent booking safety.

Split contract: [docs/split-implementation-brief.ru.md](docs/split-implementation-brief.ru.md). The Pair data model, split sale, future booking, attendance and cancellation commands are available. Review the generated plan and run integration tests with a workspace database before production use.

Contracts: [docs/lead-actions.md](docs/lead-actions.md), [docs/lead-status.md](docs/lead-status.md).

User guide: [Календарь занятий](docs/training-calendar-guide.ru.md).

Operator instructions: [Оформление оплаты пакета](docs/instructions/confirm-package-payment.ru.md), [внесение прошедшего занятия](docs/instructions/record-past-attendance.ru.md).

Split operator instruction: [Работа со сплитами](docs/instructions/split-workflow.ru.md).
QA: [Позитивный тест-кейс сплита](docs/instructions/split-positive-test-case.ru.md).

## Validate

```bash
yarn install
yarn typecheck
yarn lint
yarn test:unit
yarn twenty dev:build
```

## Deploy safely

```bash
yarn twenty remote:add
yarn twenty plan
yarn twenty apply
```

Do not apply to production before reviewing the plan and backing up the workspace.

Contract: `docs/katfit-balance-crm-technical-spec.ru.md` (repo root `crm-twenty`).
Manager guide: `docs/katfit-balance-crm-manager-guide.ru.md`.

### Основа координации изменений занятия

Добавлены техническое поле `classSession.mutationLock` и общий helper
`src/logic-functions/utils/session-mutation-lock.ts`. Поле появляется через штатное
обновление приложения; пересборка Twenty server не нужна. На рабочем окружении
обновление в рамках этой доработки не выполнялось.

Захват и освобождение используют публичный условный `updateClassSessions`.
Каждый запуск получает уникального владельца, включая повтор той же бизнес-команды.
Неопределённый HTTP-ответ проверяется чтением; автоматического повторного захвата,
снятия по таймеру или освобождения после неопределённой доменной записи нет.
Необходимый `@sniptt/guards` теперь объявлен прямой зависимостью приложения;
используется уже зафиксированная версия 0.2.0.

Helper подключён к маршруту обычной записи, описанному ниже; общей гарантии
исключения до перевода остальных writers и настройки прав ещё нет. Автоматическое исполнение
отмен внешним CalDAV-сервисом остаётся выключенным. Контракт и дальнейшие шаги:
`Docs/studio-cancellation-execution-contract.ru.md` основного репозитория.

### Журнал операций и обычная запись

Добавлены объект `studioSessionOperation`, уникальный индекс `operationKey` и
обёртка `createGuardedRegularBooking`. HTTP-маршрут `/studio/bookings/create`
переведён на неё. Метаданные журнала/индекса и mutationLock должны появиться до
вызова обновлённого маршрута; без них он откажет без бизнес-записи. Эти изменения
в текущем сеансе не устанавливались на рабочую CRM.

Сохраняются неизменяемый запрос, владелец, фаза выполнения и результат. Успешный
повтор возвращает существующий bookingId. Чистый отказ без mutation-запросов
сохраняется как REJECTED и освобождает lock. При частичном/неопределённом выполнении
lock остаётся, журнал требует разбора; автоматического повторного запуска тела
обработчика нет. Не снимайте lock вручную до выяснения судьбы прежних запросов.

Текущий охват HTTP-маршрутов приведён ниже. Пакетное создание участников,
посещения, отмены и прямые UI/API-мутации остаются отдельными writers; права против обхода ещё не настроены. Объект журнала должен быть доступен
на запись только доверенным обработчикам. Его state/owner/result — часть протокола,
а не свободно редактируемые оператором поля. Полного исключения гонок и разрешения
автоотмены этот промежуточный этап не даёт.

### Защищённые маршруты создания брони

Общий `runBookingOperation` теперь используется ordinary, split и pay-as-you-go:

- `/studio/bookings/create`;
- `/studio/split-bookings/create`;
- `/studio/bookings/create-pay-as-you-go`.

Они конкурируют за одного владельца занятия, сохраняют отдельные неизменяемые
команды и подтверждённые квитанции. Для split нужны два разных bookingId, для
разовой записи — bookingId и paymentId. Повтор подтверждённого gateway-журнала
возвращает те же ID и не запускает резервирование/создание ожидаемой оплаты снова.
После частичного выполнения нужна сверка; автоматически повторять команду нельзя.

Legacy duplicate без подтверждённого gateway-журнала возвращает
SESSION_OPERATION_LEGACY_DUPLICATE_REQUIRES_REVIEW и сохраняет блокировку. Наличие
двух split-броней или пары booking/payment ещё не доказывает подтверждение всех
счётчиков, резерва и аудита. Это поведение также применено к ordinary-маршруту.

Публичный пакетный маршрут подключён следующим этапом ниже; прямые вызовы нижних
обработчиков не защищены общим исполнителем.
Нет общей гарантии для всех writers или для одного пакета на разных занятиях.
Автоматическое исполнение отмен остаётся выключенным.

### Пакет участников при создании занятия

Публичный `/studio/sessions/create` теперь включает координацию всего списка:
один journal/lock на пакет. Будущие записи выполняются с BOOK-владельцем,
прошедшие посещения — с ATTEND. Вложенные обработчики получают тот же tracked
client и не захватывают lock заново. Подтверждённый повтор не резервирует и не
списывает посещения повторно. Частичный пакет остаётся заблокированным для разбора.

Перед первым запуском проверяется отсутствие старых броней без квитанции пакета.
Их наличие или неполный ответ требуют сверки; автоматическое дополнение legacy
пакета не выполняется. Неправильные UUID участников отклоняются до создания слота.
Создание занятия и SESSION_CREATED выполняются раньше пакета: после отказа
участников сам слот может уже существовать. Пустое создание из CalDAV идёт без
журнала участников, контракт создания сохраняется.

Внутренняя опция coordinateParticipants не читается из HTTP body. Прямой вызов
нижнего createClassSession без опции остаётся прежним режимом; его нельзя считать
защищённым публичным gateway. Самостоятельные посещения/проведение, отмены, прямые
CRUD-пути и общие остатки пакетов ещё требуют отдельной координации.

### Общие ресурсы и доменные команды календаря

Все маршруты изменения занятия используют журнал операции и владение занятием;
пакетные операции дополнительно захватывают `studioMembership.mutationLock`.
Покупки имеют `purchaseOperationReceipt`, поэтому повтор подтверждения после
последующих посещений возвращает квитанцию без повторного начисления.

Расписание вызывает `/studio/sessions/create`, `/studio/sessions/update` и
`/studio/sessions/cancel`. Изменение использует исходный snapshot и owner CAS,
отмена проверяет полный список броней. Проведённые/оплаченные неоднозначные случаи
не отменяются этим путём автоматически.

Локальные операторские команды и границы прав:
[runbook](../../../../Docs/studio-gateway-operator-runbook.ru.md).
Установка и приёмка:
[release checklist](../../../../Docs/studio-calendar-release-checklist.ru.md).
Обновляется пользовательское приложение; образ ядра Twenty не пересобирается.
