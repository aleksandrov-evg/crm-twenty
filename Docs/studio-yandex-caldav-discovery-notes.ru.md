# Начальное обследование Яндекс / CalDAV

Дата: 17 октября 2026 года. Ветка: `codex/yandex-caldav-sync`.
Статус: обследование и реализация начаты; стадии 0A / 0B не завершены.

Актуальное решение: отдельный сервис `services/katfit-calendar-sync`. Описанные ниже core entity, Nest module и instance migration относятся к предыдущему прототипу: они удалены из изменений Twenty при переносе. Реестр instance commands восстановлен. История ниже сохранена для контекста, не является текущей схемой развёртывания.

## Подтверждено по исходникам

- Backend уже зависит от tsdav `^2.2.1`, node-ical `^0.21.0` и ical-generator `^11.0.0`. Это диапазоны package.json, не подтверждение точных установленных версий и lossless round-trip.
- DTO `EmailAccountConnectionParametersInput` допускает отдельное необязательное поле CALDAV, как и IMAP / SMTP. Это ещё не доказательство возможности CALDAV-only во всём service/validation flow.
- CalDavClientProvider использует workspace encryption для пароля connectionParameters.CALDAV. CalDavClientService использует SSRF-safe fetch и Basic/Digest authentication.
- В SDK handlers есть отдельные read / mutation вызовы, в том числе updateClassSession для bookedCount. В модели ClassSession из спецификации пока нет отдельной доменной revision. Сериализация календарного worker не защищает от конкурирующего создания бронирования.
- Существующие CalDAV parser и fetch flow требуют различать ошибку и пустой результат; это уже отмечено в технической спецификации.
- В backend есть LogicFunctionExecutorService: `packages/twenty-server/src/engine/core-modules/logic-function/logic-function-executor/logic-function-executor.service.ts`. Его пригодность для service-identity вызова команд студии ещё не подтверждена.

## Следующие проверки

1. Проследить CALDAV-only от DTO через validation, сохранение ConnectedAccount и создание calendar channel.
2. Проверить контракт LogicFunctionExecutorService, авторизацию и workspace scope. Выбрать gateway без глобального API-ключа.
3. Изучить workspace repository transactions, блокировки / conditional update и все прямые пути изменения занятия. Зафиксировать concurrency strategy до разработки команд.
4. Проверить точные версии библиотек, сохранение полного VCALENDAR при изменении DESCRIPTION и RECURRENCE-ID; подготовить DAV stub.
5. Подготовить отдельные discovery-domain и discovery-transport отчёты с проверенными выводами и контрактами стадии 1.

## Что требуется от пользователя позже

Для автономной разработки credentials не нужны. До live spike нужен отдельный тестовый календарь Яндекса с искусственными событиями и пароль приложения «Календарь», переданный через предусмотренную серверную конфигурацию / защищённый механизм, без записи в документацию и git.

До пользовательского выпуска уточнить: какие пользователи могут управлять расписанием; требовать ли подтверждение переноса с участниками; нужны ли уведомления клиентам; defaults групп / форматов. Начальные безопасные настройки: прошлые события не импортировать автоматически, финансовые действия из календаря не выполнять, неоднозначные изменения направлять на проверку.

Live CalDAV, миграции, deploy и изменения реальных CRM-записей не выполнялись.

## Первый реализованный компонент

Добавлен `packages/twenty-server/src/modules/studio-calendar-sync/transport/write-caldav-resource.ts` и тесты рядом в `transport/__tests__/`.

- Создание через tsdav PUT с If-None-Match: *; обновление и удаление с обязательным сильным ETag / If-Match.
- Отклонение слабой версии, wildcard и Last-Modified как замены ETag.
- Проверка HTTPS, одного origin и непосредственного ICS-ресурса внутри выбранной коллекции; query, fragment и credentials в URL не допускаются. Текущая реализация принимает только ASCII filename из безопасного набора; расширение до иных discovered href требует отдельных тестов и выполняется до подключения реального импорта.
- Fetch обязательно передаётся вызывающим кодом; production caller должен использовать существующий authenticated SSRF-safe transport и проверенный discovery. Утилита не заменяет workspace authorization.
- Redirect отключён. HTTP 412 возвращает conflict без слепого повтора. Отдельно классифицируются auth, permissions, missing resource, retryable и rejected.
- При сетевом исключении результат unconfirmed: сервер мог сохранить изменение, нужна сверка до повтора.
- Written означает успешный HTTP-ответ, не завершённый sync: отсутствие ETag возвращается явно, каноническое перечитывание и фиксация baseSnapshot остаются задачей оркестратора.

Проверки: 22 Jest-теста PASS с реальными tsdav-функциями и управляемым fetch без внешнего сервера; полный `tsgo -p tsconfig.json --noEmit` twenty-server PASS; целевой oxlint --type-aware и oxfmt PASS. Проверены фактические HTTP-метод, тело, preconditions, redirect policy, коды ошибок и запрет небезопасной записи.

Этот компонент пока не зарегистрирован в production workflow и не объявляет завершёнными стадии 0–2. Постоянное хранилище, worker, discovery endpoints, domain gateway и интеграция календаря ещё не реализованы.

Дополнительно подтверждено: validateAndTestConnectionParameters обрабатывает только переданные протоколы, поэтому CALDAV-only поддержан на уровне backend-валидации. Конечный flow сохранения ConnectedAccount и channel требует отдельной проверки. LogicFunctionExecutorService.execute принимает logicFunctionId, workspaceId и payload, с необязательными userId / userWorkspaceId; выбор допустимой service identity ещё не завершён.

## Продолжение: сравнение расписания и проекция описания

Добавлены два независимо проверяемых компонента в `src/modules/studio-calendar-sync/domain/` backend:

- `merge-session-schedule.ts`: типизированный snapshot названия и interval (startsAt, endsAt, timezone), валидация через Zod, нормализация offset в UTC и проверка timezone существующим isValidTimeZone. Three-way merge сравнивает base / local / remote. Результат — merged с флагами нужных направлений обновления, conflict со списком полей либо invalid с указанием источника. Начало, окончание и timezone изменяются атомарно как один interval. Идентичные изменения и эквивалентные offset не требуют повторной отправки. Бронирования, отмена и метаданные не смешиваются с контрактом редактируемого расписания.
- `update-generated-description.ts`: заменяет только однозначный GENERATED-блок в обычном тексте DESCRIPTION, сохраняет остальные фрагменты и CRLF/LF. Повторное применение того же содержимого возвращает changed=false. Неполные, дублированные, переставленные или встроенные в пользовательский текст маркеры отклоняются. generatedContent не может содержать служебные маркеры. Это слой обычного текста, не serializer VCALENDAR; escaping/folding iCalendar остаются задачей transport round-trip.

Эти компоненты ещё не подключены к jobs или endpoint. Они не подменяют долговечную очередь, domain revision и перечитывание канонического ресурса.

Дополнительно исследован backend flow `ImapSmtpCalDavApiService.connectAccount`: сохранение параметров шифруется и выполняется в транзакции; message channel создаётся только при наличии IMAP, calendar channel — при наличии CALDAV. Это подтверждает ветку серверного сохранения без обязательной почты; UI и реальный вход Яндекса не проверялись.

Найден штатный `WorkspaceOrmManager.runInWorkspaceTransaction` и WorkspaceTransactionScope с executeRawQuery / afterCommit. Его можно исследовать для атомарной команды, но наличие API само по себе не доказывает защиту от прямых generic GraphQL updates. Выбор concurrency guard остаётся обязательным незавершённым пунктом перед включением синхронизации.

## Продолжение: долговечное хранилище операций

Реализованы:

- Core entity `src/engine/core-modules/studio-calendar-sync/studio-calendar-operation.entity.ts`: операция, workspace, connectionId, resourceKey, action/payload, состояние, попытки, leaseGeneration / leaseUntil, nextAttemptAt и requiresReconciliation. Поле connectionId пока скалярное: сущность подключения и FK к ней ещё предстоит реализовать.
- `StudioCalendarOperationStore`: enqueue, claimNext, settle. Идемпотентность ограничена workspace и сверяет полное содержание запроса по JSONB, включая календарь и действие. Повтор другого запроса с прежним ключом отклоняется.
- Захват работы сериализуется по workspace/connection кратковременным advisory lock, блокировкой строки и уникальным индексом RUNNING. После потери lease первыми захватываются незавершённые операции; выставляется requiresReconciliation, потому что внешний эффект мог уже произойти.
- Settle проверяет workspace, connectionId, generation, RUNNING и неистёкший lease. Старый worker не может подтвердить или переназначить уже перехваченную операцию. Это fencing служебного состояния, а не замена доменной revision или CalDAV ETag для внешних эффектов.
- Nest-модуль экспортирует store; он ещё не подключён к корневому модулю, расписанию jobs и пользовательским endpoints. Автоматической обработки очереди пока нет.

Миграция `2-42-instance-command-fast-1792229192906-create-studio-calendar-operation.ts` получена через существующие GenerateInstanceCommandCommand / InstanceCommandGenerationService на изолированной PostgreSQL-базе с минимальной моделью workspace и новой entity. Реестр instance commands обновлён самим генератором. Полный Nx build / запуск bootstrap приложения для генерации не использовался. Миграция содержит только новую таблицу, индексы, проверки и FK workspace; up/down проверены. Таблица отмечена WasIntroducedInUpgrade. Существующие committed upgrade commands не изменялись.

Проверки: 53 прежних unit-теста и 9 новых интеграционных тестов на отдельном локальном PostgreSQL — PASS. Интеграционные тесты создают случайную собственную БД, используют только явно переданный Unix socket `/tmp/studio-caldav-postgres.*` на порту socket 55439, не читают PG_DATABASE_URL и удаляют тестовую БД после выполнения. Без STUDIO_CALENDAR_TEST_SOCKET эти DB-тесты явно пропускаются, а не объявляются проверенными.

Команда повторной проверки из twenty-server при запущенном изолированном кластере:

```bash
STUDIO_CALENDAR_TEST_SOCKET=/tmp/studio-caldav-postgres.<суффикс> npx jest src/modules/studio-calendar-sync --config=jest.config.mjs --runInBand
```

Далее нужны сущности connection/resource/binding/inbox, атомарная фиксация ingestion batch с cursor, разрешённые handlers операций и dispatcher. Store не включает проверку принадлежности подключения пользователю, pause/resume или доменные изменения: эти проверки выполняются при добавлении модели подключения и orchestration.

## Перенос во внешний сервис

Код и тесты находятся в `services/katfit-calendar-sync`, без импортов Twenty/NestJS/twenty-shared. Очередь использует `calendar_sync` собственной БД; workspaceId — внешний идентификатор, каскада из CRM больше нет. Вместо core entity используется простой тип CalendarOperation. Миграция исполняется собственным TypeORM CLI-скриптом и не регистрируется в Twenty. Root package.json и Yarn lockfile Twenty не меняются.

Добавлены самостоятельные package.json/lockfile, TypeScript/Jest config, сборка, health endpoint, Dockerfile и compose с отдельным PostgreSQL. Фоновая синхронизация пока выключена; health не объявляет её работающей. Подключение к API CRM и собственный SSRF-safe транспорт предстоят.

Проверка переноса: независимая копия каталога сервиса в /tmp, собственный npm ci из lockfile без доступа к node_modules Twenty, typecheck/build — PASS; 66 тестов, включая 10 PostgreSQL integration — PASS. Отдельно проверены CLI миграции дважды, запуск собранного Node-процесса, health с synchronizationEnabled=false, 404 и SIGTERM с очисткой тестовой БД. Docker Compose config — PASS. Изменений в packages/twenty-server, корневом package.json и yarn.lock нет.

Docker build был запущен, но остановлен после ожидания metadata базового node:24-bookworm-slim в Docker Hub без прогресса. Контейнерный образ не собран и не проверен запуском; независимая Node-сборка, smoke и PostgreSQL-тесты проверены отдельно. Docker-развёртывание не выполнялось.

## Продолжение: независимый Яндекс CalDAV transport и discovery

Добавлены create-yandex-caldav-transport, yandex-caldav-target, yandex-caldav-lookup и discover-yandex-calendars в services/katfit-calendar-sync/src/transport. Используются прямые зависимости undici, ipaddr.js и xml-js, без внутренних сервисов Twenty.

Credentials отправляются только на https://caldav.yandex.ru:443. Авторизация Basic поверх TLS с отдельным паролем приложения; Cookie, Host и Proxy-Authorization удаляются. DNS lookup, используемый непосредственно сокетом, возвращает только проверенные unicast-адреса; ответы с приватными, link-local, loopback, mapped private IPv6 и смешанными адресами отвергаются. Redirects не следуют автоматически; same-origin discovery Location допускается для последующей обработки tsdav, conditional writes отклоняют redirects. Введены лимиты 2 MiB на запрос и ответ, timeout 15 секунд и отказ от XML DTD/entity declarations.

Discovery использует настоящий DAVClient: principal → calendar home → VEVENT collections и supported reports. Проверяет origin возвращённых календарей, не доверяет произвольным href и возвращает безопасные категории ошибок. writeAccess остаётся unverified до отдельной проверки; discovery выполняет только чтение. Входящий 207 проверяется на корректный XML multistatus до tsdav: повреждённый inventory не превращается в успешный пустой список.

Ручной CLI: после npm run build — npm run discover; credentials из YANDEX_CALDAV_USERNAME / YANDEX_CALDAV_APP_PASSWORD. Публичный discovery endpoint, хранение пароля и автоматический polling ещё не подключены. CLI без credentials проверен: возвращает auth-required и exit 1 без сетевого запроса.

В этой итерации: 96 unit/transport-тестов PASS, 10 неизменённых PostgreSQL integration явно SKIP без отдельного socket; typecheck/build, целевой type-aware lint и форматирование проверяются самостоятельно. Новые тесты используют контролируемый fetch и настоящий DAVClient, DNS callback тестируется отдельно; реального TLS/Яндекс-аккаунта и DB в этих тестах нет. Изменения ядра Twenty отсутствуют.

## Продолжение: зашифрованные подключения

Добавлены CalendarCredentialCipher, CalendarConnectionStore, собственная миграция 1792230811000-create-calendar-connections и операторский connect CLI. Это только внешний сервис; файлы ядра Twenty не меняются.

Cipher использует AES-256-GCM, случайный nonce и AAD из версии envelope, key ID, workspace, connection ID и логина. Подмена ciphertext/tag/nonce или перенос в другой workspace/account не расшифровываются. Envelope содержит key ID для ротации; класс поддерживает keyring, операторский CLI пока загружает один ключ из окружения. Процедура массового перешифрования ещё не реализована.

В calendar_sync.calendarConnection сохраняются username, выбранный URL/имя календаря, timezone, reports, encryptedAppPassword, state и версии конфигурации/credentials. Один неотключённый календарь на workspace обеспечивается уникальным индексом. Начальное состояние PREVIEW; автоматической активации нет. Public SELECT/RETURNING перечисляет поля явно и не возвращает ciphertext. Workspace-scoped чтение секрета предназначено только для внутреннего discovery. Pause/disconnect/replacePassword проверяют expectedVersion; disconnect удаляет ciphertext, замена пароля возвращает PREVIEW.

Команда connect проверяет, что выбранный URL снова присутствует в discovery аккаунта, и сохраняет PREVIEW с предоставленным стабильным connection UUID. Повтор тех же параметров не дублирует подключение, повтор UUID с другими параметрами отклоняется. CLI не является публичным API, не создаёт тренировки или события.

Проверка: все 132 теста PASS, включая 19 PostgreSQL integration на отдельных временных БД, 17 crypto unit и прежние transport/domain tests. Проверены две миграции, rollback подключения без удаления очереди, изоляция tenant, CAS конкурирующей замены пароля и удаление секрета. Реального аккаунта Яндекса не использовали. Worker, preview импорта и API CRM ещё не подключены; состояния подключения пока сами по себе не блокируют ручной claim очереди, это требует orchestration с проверкой configurationVersion перед внешним действием.

## Продолжение: read-only polling и транзакционный inbox

Добавлены readCalendarSnapshot, CalendarPollStore, CalendarPoller и управляемый lifecycle polling. Новая собственная миграция 1792237004000 вводит readGeneration, lease и расписание опросов подключения, calendarResource и calendarInbox с tenant-scoped FK только внутри БД сервиса. Изменений ядра и БД Twenty нет.

Чтение полного REPORT строго проверяет весь multi-status: ошибка одного ресурса, отсутствующий сильный ETag, повтор href или ресурс вне коллекции отклоняет снимок. Raw VCALENDAR сохраняется без разворачивания RRULE и без попытки создать тренировку. Повтор не создаёт inbox-дублей; A → B → A создаёт разные версии. Отсутствующий ресурс становится MISSING_CANDIDATE, а не отменой. Это начальный full inventory, не реализация sync-token/delta; действуют лимиты 2 MiB/2000 ресурсов.

Ресурсы, inbox и поколение фиксируются одной транзакцией. Lease generation, срок, configurationVersion и состояние проверяются до и после сохранения; устаревший worker не может подтвердить snapshot. Пауза/отключение во время чтения предотвращает фиксацию. Ошибки не продвигают поколение; 401/403 требуют операторского восстановления.

Runtime включается только CALENDAR_POLLING_ENABLED=true с ключом credentials. Значение по умолчанию false, Compose передаёт flag/key. Health различает calendarPollingEnabled и synchronizationEnabled=false. Shutdown дожидается текущего цикла. Проверки на реальном календаре не выполнялись и флаг в рабочей среде не включался.

Проверки: все 163 теста PASS, включая 30 PostgreSQL integration. Дополнительно проверены три миграции через реальный CLI дважды и запуск собранного процесса с включённым polling на пустой тестовой БД, корректные health flags и SIGTERM. Тесты включают partial response, пустой snapshot, потерю lease, конкурирующие workers, паузу/disconnect в ходе чтения, возвращение исчезнувшего ресурса, failure injection с rollback пачки и down/up новой миграции. Typecheck, build, type-aware lint, formatting и Compose config проверены.
