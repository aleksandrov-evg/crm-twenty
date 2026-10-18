# Деплой Яндекс CalDAV ↔ Twenty

Инструкция для текущей ветки `codex/yandex-caldav-sync`. Первый выпуск выполняйте на тестовом workspace и отдельном закрытом календаре. Сам деплой в рамках разработки не выполнялся.

Поставляются две части: обновление пользовательского приложения `katfit-studio` и отдельный Docker Compose проекта синхронизации. Он подключается к отдельной базе и пользователю на существующем сервере PostgreSQL. Официальный образ Twenty остаётся прежним.

## 1. Подготовка

Нужны:

- Репозиторий с этой веткой на машине сборки и сервере. Проверьте, что туда попали новые `services/katfit-calendar-sync` и файлы приложения: часть разработки могла ещё не быть закоммичена/отправлена.
- Node.js 24 и Yarn 4 для установки приложения; Docker Engine и Compose v2 на сервере сервиса.
- HTTPS-адрес Twenty, UUID нужного workspace и его API-ключ.
- Закрытый календарь Яндекса, логин владельца и пароль приложения для доступа к календарю.
- Резервная копия CRM перед обновлением приложения.

`TWENTY_API_URL` должен быть доступен **из контейнера**. Обычно это `https://crm.example.ru`, без `/graphql` и `/rest`. `localhost` внутри контейнера указывает на сам контейнер.

## 2. Обновить приложение Twenty

Из корня репозитория:

```bash
cd packages/twenty-apps/internal/katfit-studio
yarn install --immutable
yarn typecheck
yarn test:unit
yarn twenty dev:build
```

Настройте remote интерактивно, указав нужную CRM и ключ:

```bash
yarn twenty remote:add
yarn twenty plan
```

Проверьте, что выбран нужный workspace и план не удаляет бизнес-данные. Затем примените:

```bash
yarn twenty apply
```

Появятся технические поля владения, квитанция покупки, журнал операций и новые команды приложения. Пересобирать или перезапускать ядро Twenty для этих изменений не требуется.

На тестовом workspace проверьте создание, изменение, запись клиента и отмену занятия. Отдельно проверьте, что обычные пользователи/ключи не обходят команды прямыми изменениями броней, проводок и остатков. Metadata-проверка сервиса не доказывает эффективные права. Подробности: [операторский runbook](studio-gateway-operator-runbook.ru.md).

## 3. Подготовить окружение сервиса на сервере

Из корня репозитория:

```bash
cd services/katfit-calendar-sync
cp .env.example .env
chmod 600 .env
```

Сгенерируйте **два разных** значения по 32 байта и один UUID:

```bash
openssl rand -hex 32
openssl rand -hex 32
docker run --rm node:24-bookworm-slim node -e "console.log(require('node:crypto').randomUUID())"
```

В `.env` заполните:

```dotenv
CALENDAR_DATABASE_URL=postgresql://katfit_calendar_sync:<первое hex-значение>@<postgres-host>:5432/katfit_calendar_sync
CALENDAR_ENCRYPTION_KEY=<второе hex-значение>
CALENDAR_ENCRYPTION_KEY_ID=primary
CALENDAR_CONNECTION_ID=<сгенерированный UUID>
TWENTY_WORKSPACE_ID=<UUID workspace>
TWENTY_API_URL=https://crm.example.ru
TWENTY_API_TOKEN=<ключ этого workspace>
TWENTY_ALLOW_INSECURE_HTTP=false
YANDEX_CALDAV_USERNAME=<логин Яндекса>
YANDEX_CALDAV_APP_PASSWORD=<пароль приложения>
CALENDAR_TIMEZONE=Europe/Moscow
CALENDAR_HTTP_PORT=3100
CALENDAR_LOG_LEVEL=info
```

Все флаги `*_ENABLED` пока оставьте `false`. `YANDEX_CALDAV_CALENDAR_URL` заполните после discovery.

Compose передаёт `CALENDAR_DATABASE_URL` в сервис и миграции без изменений. Хост PostgreSQL должен быть доступен из контейнера; `localhost` не подходит для БД на другой машине или хосте Docker. Если PostgreSQL работает в другом Compose-проекте, нужна общая Docker-сеть либо доступный адрес сервера; имя контейнера из чужой изолированной сети само по себе не разрешится. Не указывайте БД Twenty. Ключ шифрования сохраните отдельно от бэкапа БД и не меняйте после подключения без процедуры ротации.

## 4. Создать отдельную базу и запустить

На существующем сервере PostgreSQL войдите через `psql` под администратором и выполните вне транзакции:

```sql
CREATE ROLE katfit_calendar_sync LOGIN;
\password katfit_calendar_sync
CREATE DATABASE katfit_calendar_sync OWNER katfit_calendar_sync;
```

Команда `\password` интерактивно запросит пароль — используйте первое hex-значение из предыдущего шага. Оно же должно быть в `CALENDAR_DATABASE_URL`. Не выдавайте этому пользователю доступ к базе CRM. Настройте сетевой доступ PostgreSQL и `pg_hba.conf` для адреса сервиса. Для подключения через недоверенную сеть настройте проверяемый TLS.

Compose больше не создаёт PostgreSQL или том с её данными. Миграции создадут схему `calendar_sync` внутри новой базы.


Из `services/katfit-calendar-sync`:

```bash
docker compose config --quiet
docker compose build
docker compose up -d
docker compose ps -a
docker compose logs --tail=100 migrate service
curl --fail http://127.0.0.1:3100/healthz
```

Ожидается: `migrate` завершён с кодом 0, `service` healthy. PostgreSQL управляется отдельно от этого Compose. Применяются 14 миграций только собственной схемы сервиса. При ошибке миграций дальше не продолжайте. Порт сервиса опубликован только на loopback; наружу его открывать не требуется.

## 5. Найти календарь и сохранить подключение

Разовые команды запускайте с дополнительным `compose.operator.yaml`. Он загружает операторские параметры из `.env`; базовая Compose-конфигурация передаёт тот же `CALENDAR_DATABASE_URL`. Этот override не нужен для фонового `up`.

```bash
docker compose -f compose.yaml -f compose.operator.yaml run --rm --no-deps service node dist/discover.js
```

Из результата возьмите точный URL нужного календаря и запишите в `.env`:

```dotenv
YANDEX_CALDAV_CALENDAR_URL=https://caldav.yandex.ru/<точный путь из discovery>
```

Сохраните подключение:

```bash
docker compose -f compose.yaml -f compose.operator.yaml run --rm --no-deps service node dist/connect.js
```

Ожидается состояние `PREVIEW`. Сохраните выданную `configurationVersion`; она понадобится для активации. При повторе используйте тот же `CALENDAR_CONNECTION_ID`.

## 6. Включить чтение и подготовку

Измените в `.env`:

```dotenv
CALENDAR_POLLING_ENABLED=true
CALENDAR_PREVIEW_ENABLED=true
CALENDAR_CRM_LOOKUP_ENABLED=true
CALENDAR_CREATE_PREPARATION_ENABLED=true
CALENDAR_CREATION_RECOVERY_ENABLED=true
CALENDAR_LIVE_SOURCE_CHECK_ENABLED=true
```

Примените окружение:

```bash
docker compose up -d --no-deps --force-recreate service
```

Создайте в тестовом календаре обычное **будущее одиночное** событие со временем начала/окончания. В описание добавьте:

```text
KATFIT:
format=MAT_PILATES
capacity=8
```

Укажите фактический формат/вместимость занятия. Серии, события на весь день и неоднозначные метаданные не импортируются автоматически. Простого названия события для определения формата недостаточно.

Проверьте логи и актуальные preview:

```bash
docker compose logs --tail=100 service
psql -h <postgres-host> -p 5432 -U katfit_calendar_sync -d katfit_calendar_sync -W -c 'SELECT "decision", "reason", "candidate" FROM calendar_sync."calendarCurrentImportPreview" ORDER BY "createdAt" DESC LIMIT 20;'
```

Для тестового события ожидается `READY`. Пока все send-флаги false, тренировка в CRM не создаётся. Не исправляйте `NEEDS_REVIEW` прямой правкой служебных таблиц.

## 7. Проверить CRM и активировать подключение

В `.env` задайте `CALENDAR_EXPECTED_CONFIGURATION_VERSION` из результата `connect` — не подставляйте версию вслепую.

```bash
docker compose -f compose.yaml -f compose.operator.yaml run --rm --no-deps service node dist/check-crm.js
docker compose -f compose.yaml -f compose.operator.yaml run --rm --no-deps service node dist/activate.js
```

Ожидается `ready` при проверке и `active` при активации. Для активации нужны свежий полный снимок календаря, завершённая подготовка и отсутствие актуальных ошибок разбора. После обновления приложения/ключа/конфигурации прежняя активация может перестать подходить — проверяйте результат команд.

## 8. Включать отправку по очереди

Сначала создание из Яндекса в CRM:

```dotenv
CALENDAR_CREATE_SEND_ENABLED=true
```

```bash
docker compose up -d --no-deps --force-recreate service
```

Проверьте, что тестовое событие создало ровно одно занятие. После повторных опросов дубля быть не должно.

Затем добавьте обогащение календаря ФИО участников из CRM:

```dotenv
CALENDAR_DESCRIPTION_PREPARATION_ENABLED=true
CALENDAR_EXPORT_SEND_ENABLED=true
```

Пересоздайте сервис той же командой. Добавьте клиента к связанному занятию штатной командой CRM и проверьте описание события в закрытом календаре.

Последним включите переносы и переименования связанных будущих занятий:

```dotenv
CALENDAR_SCHEDULE_PREPARATION_ENABLED=true
CALENDAR_SCHEDULE_SEND_ENABLED=true
CALENDAR_CANCELLATION_REVIEW_ENABLED=true
```

Пересоздайте сервис. Проверьте по отдельности изменение в Яндексе и в CRM. Одновременные несовместимые правки должны попадать на разбор.

**Границы текущего выпуска:** новые занятия для этого потока создавайте в Яндексе. Произвольные старые занятия и новые слоты, созданные только в CRM, автоматически не получают первичную связь с календарём. Для связанных занятий работают переносы/переименования в обе стороны. Серии исключены. Отмена из календаря попадает в очередь и исполняется оператором; фоновой автоотмены нет.

В health поле `synchronizationEnabled` остаётся false: это не признак падения процесса. Проверяйте `status`, отдельные флаги, логи и результат тестового обмена.

## 9. Эксплуатация и остановка

Очередь отмен:

```bash
docker compose -f compose.yaml -f compose.operator.yaml run --rm --no-deps service node dist/review-cancellations.js
```

Порядок `prepare → execute`, обязательный snapshot и отдельный opt-in отправки описаны в [README сервиса](../services/katfit-calendar-sync/README.md). Не включайте отправку отмен до приёмки прав и финансовых сценариев.

Чтобы остановить обмен без удаления данных:

```bash
docker compose stop service
```

Чтобы остановить отдельный стек сервиса:

```bash
docker compose down
```

Внешняя PostgreSQL и её данные этой командой не останавливаются и не удаляются. Для обычного отключения функций выставьте send-флаги false и пересоздайте сервис. `pause.js` — более строгая остановка подключения с изменением версии; готового resume CLI сейчас нет, поэтому не используйте pause как временный переключатель без плана восстановления.

Резервируйте отдельную БД сервиса и ключ шифрования. При обновлении сначала остановите `service`, соберите новый образ, явно выполните `docker compose run --rm migrate` и только после успешных миграций запускайте `docker compose up -d service`. Не снимайте неизвестные блокировки SQL-запросом.

Полная приёмка и откат: [release checklist](studio-calendar-release-checklist.ru.md).

Если уже использовался прежний Compose с контейнером `database`, сначала перенесите его базу через `pg_dump`/`pg_restore`, сохранив идентификаторы и прежний ключ шифрования. Не удаляйте старый контейнер/том до проверки переноса. Простая смена URL на пустую базу не переносит подключения и журнал операций.

Для диагностики фонового обмена задайте `CALENDAR_LOG_LEVEL=debug` и пересоздайте сервис (в Dokploy — Deploy). Подтверждённые действия имеют отдельные JSON-события; `worker.cycle` с `saved` отражает локальную обработку. После диагностики верните `info`.
