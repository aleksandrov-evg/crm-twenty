# Развёртывание Twenty через Dokploy

Этот каталог содержит Compose-конфигурацию для Dokploy. В Dokploy выберите Git-репозиторий, ветку `main` и путь `deploy/dokploy/docker-compose.yml`.

Compose предназначен для remote deployment server в Proxmox CT `109`. Домен `crm.lan` маршрутизируется через Traefik labels в YAML: Dokploy Domains не используется, потому что этот интерфейс ожидает публично резолвимую DNS A-запись, а `.lan` — внутренний домен. `ports` в YAML не добавляются.

Переменные из `.env.example` задаются в Dokploy → Compose → Environment. Реальный `.env`, пароль PostgreSQL и `ENCRYPTION_KEY` не коммитятся. Сгенерируйте пароль командой `openssl rand -hex 32`, а ключ — `openssl rand -base64 32`. Утрата `ENCRYPTION_KEY` делает сохранённые секреты CRM нечитаемыми.

Постоянные пути `../../../files/postgres` и `../../../files/server-local-data` должны быть подключены на remote server к HDD до первого Deploy. Так как Compose находится в `code/deploy/dokploy`, эти пути ведут за пределы Git clone: `/etc/dokploy/compose/<APP_NAME>/files`. Для CT `109` это ZFS dataset `tank/media/twenty`.
