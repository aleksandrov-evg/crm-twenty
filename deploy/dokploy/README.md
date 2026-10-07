# Развёртывание Twenty через Dokploy

Этот каталог содержит Compose-конфигурацию для Dokploy. Для production в
Dokploy выберите Git-репозиторий, ветку `main` и путь
`deploy/dokploy/docker-compose.prod.yml`. Скопируйте значения из
`.env.prod.example` на вкладку Compose → Environment, сохраните кнопкой
**Apply**, затем запустите **Deploy**.

Compose предназначен для remote deployment server в Proxmox CT `109`. Домен `crm.lan` маршрутизируется через Traefik labels в YAML: Dokploy Domains не используется, потому что этот интерфейс ожидает публично резолвимую DNS A-запись, а `.lan` — внутренний домен. Порт `3000` также опубликован на хосте для прямого доступа и внешнего reverse proxy.

Переменные из `.env.prod.example` задаются в Dokploy → Compose → Environment.
Реальный `.env`, пароль PostgreSQL и `ENCRYPTION_KEY` не коммитятся.
Сгенерируйте пароль командой `openssl rand -hex 32`, а ключ —
`openssl rand -base64 32`. Утрата `ENCRYPTION_KEY` делает сохранённые секреты
CRM нечитаемыми.

Постоянный путь `../../../files/server-local-data` должен быть подключён на remote server к HDD до первого Deploy. Так как Compose находится в `code/deploy/dokploy`, путь ведёт за пределы Git clone: `/etc/dokploy/compose/<APP_NAME>/files/server-local-data`. Для CT `109` это ZFS dataset `tank/media/twenty`.

Правила работы с production, staging, бэкапами и восстановлением описаны в
[STAGING.md](./STAGING.md).
