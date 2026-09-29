# LeadStatus API — `POST /s/studio/lead-status`

Read-only статус лида для переотправки карточки в Telegram ops-боте.
Без мутаций: Person + открытая Opportunity + Notes по Person.

Auth: Bearer API key (как WF-01 / lead-actions). Path в app: `/studio/lead-status` → публично `POST /s/studio/lead-status`.

## Request

```json
{
  "landingLeadId": "36",
  "personId": null
}
```

| Поле | Обязательно | Описание |
| --- | --- | --- |
| `landingLeadId` | один из id | `Person.landingLeadId` (= landing `leads.id`) |
| `personId` | один из id | UUID Person |

Нужен хотя бы один из: `landingLeadId`, `personId`. Если заданы оба — приоритет у `personId`.

## Response 200

```json
{
  "personId": "…",
  "opportunityId": "…",
  "clientStage": "CONTACTED",
  "lifecycleStatus": "CONTACTED",
  "lastContactChannel": "TELEGRAM",
  "studioLostReason": null,
  "deepLinkPath": "/objects/people/…",
  "notes": [
    {
      "id": "…",
      "at": "2026-09-29T12:00:00.000Z",
      "title": "TG-EVENT:…",
      "body": "Канал: Telegram. Написала в Telegram — думает.\n\n— Анна"
    }
  ]
}
```

| Поле | Описание |
| --- | --- |
| `personId` | UUID Person |
| `opportunityId` | открытая Opportunity (не `FIRST_PURCHASE` / `LOST`), иначе первая найденная / `null` |
| `clientStage` | `Opportunity.clientStage` |
| `lifecycleStatus` | `Person.lifecycleStatus` |
| `lastContactChannel` | `Person.lastContactChannel` (`CALL` \| `SMS` \| `MAX` \| `TELEGRAM` \| `WHATSAPP` \| `null`) |
| `studioLostReason` | `Opportunity.studioLostReason` (если стадия `LOST`) |
| `deepLinkPath` | путь в CRM UI к карточке Person |
| `notes` | до **50** последних Notes через `noteTargets` по Person |

### Порядок notes

Ответ отдаёт notes **ascending** (oldest → newest) по `at` (`Note.createdAt`).
API сначала берёт newest 50 по `NoteTarget.createdAt`, затем сортирует ascending.
Бот может использовать массив как есть для блока истории; при необходимости может пересортировать сам.

`body` — markdown из `Note.bodyV2.markdown` (как записан lead-actions / ручные Notes).

## Errors

| Status | Когда |
| --- | --- |
| 400 | нет `landingLeadId` и `personId` |
| 404 | Person не найден |
| 500 | сбой Core API |

## Клиенты

1. `telegram-lead-notifier` — команда `ID36` / `/resend` (источник правды для стадии и истории на карточке).
2. Любые automation, которым нужен снимок воронки без мутаций.

См. также: [lead-actions.md](lead-actions.md).
