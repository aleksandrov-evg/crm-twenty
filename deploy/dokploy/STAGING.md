# Работа с production и staging

Эта инструкция описывает два независимых контура Twenty, развернутых через
Dokploy:

- `production` — рабочая CRM и единственный источник боевых данных;
- `staging` — закрытый стенд для проверки обновлений и изменений до их выпуска
  в production.

Локальная разработка не является staging: в ней используются тестовые данные и
она не должна обращаться к ресурсам production.

## Границы контуров

Для staging создайте отдельное Dokploy Compose-приложение с собственной копией
`docker-compose.yml` и отдельными значениями Environment. У контуров не должно
быть общих PostgreSQL, Redis или каталогов данных.

| Параметр | Production | Staging |
| --- | --- | --- |
| Домен | `crm.lan` | отдельный, например `crm-stage.lan` |
| `SERVER_URL` | production URL | staging URL |
| PostgreSQL volume | только production | отдельный volume / каталог |
| local storage | только production | отдельный volume / каталог |
| Redis | production instance | отдельный instance |
| SMTP, webhooks, OAuth, API keys | рабочие | отключены либо тестовые |

Не задавайте для staging production `PG_DATABASE_URL`, `REDIS_URL`, volume,
SMTP-пароль или ключи внешних интеграций.

`ENCRYPTION_KEY` требует отдельного решения. С тем же ключом staging сможет
прочитать зашифрованные значения из копии production, поэтому он считается
production-секретом. Предпочтительный вариант — удалить секреты интеграций при
подготовке данных и использовать отдельный ключ staging. Если временно нужен
тот же ключ для диагностической копии, ограничьте доступ к стенду и замените
ключ после завершения работ.

## Первое развёртывание staging в Dokploy

`Apply` и `Deploy` выполняют разные действия:

- `Apply` сохраняет настройки Compose-приложения и значения на вкладке
  Environment в Dokploy;
- `Deploy` получает код из Git, подставляет сохраненные переменные, применяет
  Docker Compose и создает либо обновляет контейнеры.

Поэтому для первого запуска и после каждого изменения образа, Compose-файла
или переменных нужны оба действия: сначала `Apply`, затем `Deploy`.

Используйте два отдельных Compose-файла из этого каталога:
`docker-compose.prod.yml` для production и `docker-compose.stage.yml` для
staging. Их нельзя заменять друг другом: они содержат разные имя Compose
проекта, host-порт, Traefik router/service names и домен.

Задайте в production `HOST_PORT=3000`, а в staging `HOST_PORT=3001`.
Внутри обоих контейнеров приложение всегда слушает `NODE_PORT=3000`; снаружи
их разделяют host-порты и Traefik. Используйте соответственно
`.env.prod.example` и `.env.stage.example` как шаблоны Environment.

В каждом Dokploy Compose-приложении должен быть собственный каталог
`files/server-local-data`. PostgreSQL подключается к внешнему серверу, поэтому
для staging требуются отдельная база и отдельные credentials; одного другого
имени базы недостаточно, если у staging есть доступ к production PostgreSQL.

Порядок создания приложения в UI Dokploy:

1. Создайте отдельный Project или Environment `staging`, затем сервис типа
   **Docker Compose**. Не добавляйте staging к уже существующему production
   Compose-сервису.
2. Выберите тот же Git-репозиторий. Для стабильного стенда укажите отдельную
   ветку `staging` либо конкретную защищенную ветку; не включайте AutoDeploy,
   пока не определен процесс выпуска.
3. В поле **Compose Path** укажите
   `deploy/dokploy/docker-compose.stage.yml` и сохраните настройки кнопкой
   **Apply**.
4. На вкладке **Environment** внесите значения staging из `.env.example`:
   отдельные `PG_DATABASE_NAME`, `PG_DATABASE_USER`,
   `PG_DATABASE_PASSWORD`, `ENCRYPTION_KEY`, `SERVER_URL` и конкретный `TAG`.
   Сохраните их кнопкой **Apply**. Dokploy запишет значения в `.env` рядом с
   Compose-файлом и подставит переменные вида `${VARIABLE}` при Deploy.
5. Перед первым запуском убедитесь, что persistent storage staging создан и
   доступен deployment host. Он не должен совпадать с каталогами production.
6. Откройте вкладку **Deployments**, нажмите **Deploy** и дождитесь статуса
   successful. Первый запуск создает PostgreSQL, а `server` применяет миграции;
   `worker` запускается после healthcheck `server`.
7. На вкладке **Logs** проверьте `server`, `worker`, `db` и `redis`; затем
   откройте `https://crm-stage.lan/healthz` и сам интерфейс CRM.

Если Deploy завершился ошибкой, не создавайте новые volumes и не повторяйте
инициализацию наугад. Сначала сохраните логи сервиса и проверьте путь
Compose-файла, уникальность Traefik labels, доступность volumes и значения
переменных.

## Деплой Twenty-приложения: `plan` и `apply`

`yarn twenty apply` — это не Deploy в Dokploy. Команда собирает и синхронизирует
Twenty-приложение с активным Twenty remote: обновляет метаданные, объекты и
поля, подключает UI-компоненты и активирует logic functions. Контейнеры Twenty
при этом не пересоздаются.

Один раз на рабочем компьютере добавьте оба remote. Учетные данные remote
сохраняются локально в `~/.twenty/config.json`, а не в Git:

```bash
cd packages/twenty-apps/internal/katfit-studio
yarn install --immutable
yarn twenty remote:add --url http://crm-stage.lan --as stage
yarn twenty remote:add --url http://crm.lan --as production
yarn twenty remote:list
```

`yarn install --immutable` нужен только при первой настройке рабочей копии или
после изменения зависимостей. Не выполняйте `remote:add` повторно, если remote
уже есть в `remote:list`.

Для каждого изменения приложения используйте следующий порядок. Сохраните SHA
commit из stage: production должен получить ту же версию.

1. Проверьте код и примените его к stage:

   ```bash
   cd packages/twenty-apps/internal/katfit-studio
   git status --short
   git rev-parse HEAD
   yarn typecheck
   yarn lint
   yarn test:unit
   yarn twenty dev:typecheck
   yarn twenty remote:use stage
   yarn twenty plan
   yarn twenty apply
   ```

   `git status --short` перед релизом не должен показывать непреднамеренных
   изменений. Запишите SHA, выведенный `git rev-parse HEAD`.

   `plan` ничего не изменяет: проверьте в нем additions, changes и особенно
   deletions. Если приложение еще ни разу не устанавливалось на stage, сразу
   выполните первый `apply`: до него `plan` не сможет получить состояние remote.

2. Протестируйте изменения в `crm-stage.lan`. Если менялись сущности или
   поля, отдельно проверьте сценарии с уже существующими данными.
3. Перед production `apply` выберите в Databasus свежий успешный backup set.
   Проверьте, что SHA не изменился с момента stage, и переключитесь на
   production remote:

   ```bash
   cd packages/twenty-apps/internal/katfit-studio
   git status --short
   git rev-parse HEAD
   yarn twenty remote:use production
   yarn twenty remote:list
   yarn twenty plan
   yarn twenty apply
   ```

   Не вносите новые изменения в рабочую директорию между stage и production:
   production должен получить тот же commit, который был проверен на stage.
   `plan` для production проверяется отдельно, потому что production metadata
   может отличаться от stage.

4. После `apply` проверьте production-сценарии и logs logic functions. Если
   план содержит удаление metadata entities, остановитесь и отдельно подтвердите
   влияние на данные и способ отката.

   Для просмотра логов конкретной функции:

   ```bash
   yarn twenty dev:function:logs -n studio-leads
   yarn twenty dev:function:logs -n studio-lead-actions
   yarn twenty dev:function:logs -n studio-lead-status
   ```

Dokploy нужен только для жизненного цикла самого Twenty-сервера: начальная
установка, смена `TAG`, Compose-параметров, ports, volumes и server-level
environment. Для обычной поставки изменений в Twenty-приложение достаточно
`plan`/`apply`; production Compose не нужно перенастраивать и перезапускать.

## Обновление staging

Сначала проверяйте новую версию приложения на staging, затем обновляйте
production. В обоих контурах указывайте конкретный `TAG`, а не `latest`.

Порядок обновления:

1. Убедитесь, что staging использует отдельные хранилища и что исходящие
   действия отключены.
2. Измените `TAG` в Environment staging и выполните Deploy в Dokploy.
3. Дождитесь успешного healthcheck `/healthz`.
4. Проверьте вход в CRM, создание тестовой записи, фоновые задачи и критичные
   сценарии интеграций с тестовыми credentials.
5. Зафиксируйте проверенную версию и только после этого примените тот же `TAG`
   в production.

Откат приложения — возврат `TAG` к предыдущей проверенной версии и Deploy. Не
откатывайте PostgreSQL volume вручную: при необходимости используйте
проверенный бэкап или ZFS snapshot, согласованный с версией приложения.

## Что бэкапируется

Один консистентный набор бэкапа включает:

- custom-format dump PostgreSQL;
- содержимое `files/server-local-data`, поскольку при `STORAGE_TYPE=local` там
  находятся загруженные файлы;
- защищенную копию Dokploy Environment с `ENCRYPTION_KEY`,
  `FALLBACK_ENCRYPTION_KEY` и параметрами подключения;
- метаданные набора: дата, версия образа (`TAG`), имя контура и контрольные
  суммы.

ZFS snapshots `tank/media/twenty` полезны для быстрого локального отката, но
не заменяют выгрузку за пределы Proxmox-хоста. Бэкапы нужно отправлять в
отдельное зашифрованное хранилище (например, S3-совместимое через `restic`).

Рекомендуемая политика: ежедневно создавать логический dump, хранить 14
ежедневных, 8 еженедельных и 12 ежемесячных копий. Это дает RPO до 24 часов.
Если допустима потеря не более нескольких минут, нужно отдельно настроить
архивацию WAL и point-in-time recovery.

### Databasus

Штатный бэкап PostgreSQL создается через [Databasus](http://databasus.lan/).
В нем должны быть заведены отдельные задания для production и staging с
понятными именами, расписанием, политикой хранения и отдельными credentials.
Для восстановления production или обновления staging выбирайте конкретный
успешный backup set из Databasus, фиксируя его дату и версию приложения.

Databasus отвечает за dump PostgreSQL. Он не заменяет бэкап
`files/server-local-data`, Dokploy Environment и `ENCRYPTION_KEY`: эти части
нужно сохранять и проверять совместно с выбранным дампом базы.

## Создание бэкапа PostgreSQL

Создание регулярных PostgreSQL-бэкапов выполняется в Databasus. Ручную команду
ниже запускают только как аварийную или диагностическую процедуру на deployment
host в каталоге Compose-приложения. Значения переменных не выводите в логи и не
сохраняйте в Git.

```bash
docker compose exec -T db pg_dump \
  -U "$PG_DATABASE_USER" \
  -d "$PG_DATABASE_NAME" \
  --format=custom \
  --no-owner \
  > /secure-backups/twenty/prod-YYYY-MM-DD-HHMM.dump
```

После успешного задания Databasus сохраните в том же наборе данных снимок или
архив соответствующего каталога `server-local-data`. Не считайте dump БД
полным восстановлением, если файлы не сохранены вместе с ним.

Проверьте результат до выгрузки во внешнее хранилище:

```bash
pg_restore --list /secure-backups/twenty/prod-YYYY-MM-DD-HHMM.dump > /dev/null
```

## Обновление staging данными production

По умолчанию в staging используются синтетические данные. Копирование
production разрешено только когда это необходимо для диагностики и после
оценки персональных данных.

Безопасный процесс:

1. Выберите успешный production backup set в Databasus и создайте снимок
   `server-local-data` с близким временем создания.
2. Восстановите dump во временную изолированную PostgreSQL базу, не в staging.
3. Удалите либо замаскируйте персональные данные, токены, пароли, OAuth
   подключения, API keys и секреты интеграций.
4. Отключите отправку email, webhooks, cron-задачи, платежные и внешние
   интеграции. В staging используйте тестовый SMTP-приемник или вообще не
   задавайте SMTP credentials.
5. Создайте dump очищенной временной базы и восстановите его в staging.
6. Переносите файлы только если они действительно нужны для проверки; иначе
   используйте пустое staging local storage.
7. Запустите staging, проверьте `/healthz`, вход и отсутствие исходящих
   действий.

Никогда не выполняйте очистку данных непосредственно в production или в его
единственном бэкапе. До завершения проверки не удаляйте предыдущий staging
backup set.

## Восстановление

Восстановление выполняется только из полного набора: PostgreSQL dump и
согласованная с ним копия `server-local-data`.

1. Зафиксируйте инцидент, остановите `server` и `worker`, чтобы прекратить
   записи.
2. Создайте аварийный dump текущей базы и снимок текущих файлов, даже если
   состояние кажется поврежденным.
3. Проверьте, что выбранный dump читается командой `pg_restore --list`.
4. Восстановите dump в нужную базу. Для пустой или заранее очищенной базы:

   ```bash
   docker compose exec -T db pg_restore \
     -U "$PG_DATABASE_USER" \
     -d "$PG_DATABASE_NAME" \
     --clean --if-exists --no-owner \
     < /secure-backups/twenty/prod-YYYY-MM-DD-HHMM.dump
   ```

   Если база повреждена или содержит активные соединения, сначала изолируйте
   ее и подготовьте пустую базу. Не используйте `--clean` без подтверждения
   имени целевой базы и контура.
5. Восстановите `server-local-data` из того же набора. Права и владельца
   файлов проверьте до запуска контейнера.
6. Запустите сервисы, дождитесь `/healthz`, проверьте вход, несколько записей
   и открытие вложений.
7. Зафиксируйте использованный набор, время восстановления и фактические RPO
   и RTO.

## Регулярная проверка

Не реже раза в месяц восстановите последний production backup set в отдельный
временный контур. Проверка считается успешной, только если приложение
запускается, пользователь входит в CRM и доступны несколько файлов из local
storage. Удаление временного контура допускается лишь после фиксации результата
проверки.
