# LeadAction API — `POST /s/studio/lead-actions`

Доменный API действий по лиду для Telegram ops-бота и будущего ассистента-секретаря.
Правила стадий живут здесь; клиенты (кнопки / reply / NL) только вызывают `action`.

Auth: Bearer API key (как WF-01). Path в app: `/studio/lead-actions` → публично `POST /s/studio/lead-actions`.

## Request

```json
{
  "landingLeadId": "42",
  "personId": null,
  "opportunityId": null,
  "action": "contacted",
  "note": "Канал: Telegram. Написала в Telegram — думает.",
  "lostReason": null,
  "nextActionAt": "2026-09-30T18:00:00.000Z",
  "channel": "TELEGRAM",
  "actorLabel": "Анна (Telegram)",
  "clientEventId": "tg:123:456:contacted"
}
```

| Поле | Обязательно | Описание |
| --- | --- | --- |
| `landingLeadId` | один из id | `Person.landingLeadId` (= landing `leads.id`) |
| `personId` | один из id | UUID Person |
| `opportunityId` | нет | если не задан — открытая Opportunity по Person |
| `action` | да | см. таблицу ниже |
| `note` | для `note`; иначе опц. | текст заметки (без медсведений) |
| `lostReason` | для `lost` | `NO_RESPONSE` \| `NO_SUITABLE_TIME` \| `PRICE` \| `LOCATION` \| `FORMAT_MISMATCH` \| `CHANGED_MIND` \| `DUPLICATE` \| `OTHER` |
| `nextActionAt` | нет | ISO datetime для Task / `Person.nextActionAt` |
| `channel` | нет | `CALL` \| `SMS` \| `MAX` \| `TELEGRAM` \| `WHATSAPP` → `Person.lastContactChannel` |
| `actorLabel` | нет | кто выполнил (попадёт в Note) |
| `clientEventId` | нет | идемпотентность; повтор с тем же id → 200 без повторной мутации |

Нужен хотя бы один из: `landingLeadId`, `personId`.

## Actions → CRM

| action | Person | Opportunity | Note | Task |
| --- | --- | --- | --- | --- |
| `note` | опц. `lastContactChannel` | — | да | опц. follow-up если `nextActionAt` |
| `no_answer` | `nextActionAt` + канал | стадию **не** двигать | да | «Написать снова» (+2ч или `nextActionAt`) |
| `contacted` | `CONTACTED`, `firstContactedAt`, канал | `CONTACTED`, `contactedAt`, `firstResponseMinutes` | да | закрыть «Написать клиенту»; если note про «думает» → Task «Вернуться к думающим» (+2д / `nextActionAt`) |
| `intro_offered` | `CONTACTED` если ещё раньше | `INTRO_OFFERED` | да | «Согласовать слот intro» |
| `intro_booked` | `INTRO_BOOKED` | `INTRO_BOOKED` | да (+ текст слота) | напоминание; **Booking не создаём** |
| `intro_attended` | `INTRO_ATTENDED` | `INTRO_ATTENDED` | да | «Предложить пакет» |
| `no_show` | — | остаётся `INTRO_BOOKED` | да | «Написать после no-show» |
| `first_purchase` | `ACTIVE_CLIENT` | `FIRST_PURCHASE` | да | закрыть lead-задачи |
| `lost` | — | `LOST` + `studioLostReason` | да | закрыть открытые lead-задачи |

`Person.lastContactChannel` — чем студия последний раз писала/звонила. Не путать с `preferredChannel` (предпочтение клиента).

Терминальные стадии Opportunity (`FIRST_PURCHASE`, `LOST`) назад не двигаются (кроме идемпотентного повтора того же action).

## Response 200

```json
{
  "personId": "…",
  "opportunityId": "…",
  "clientStage": "CONTACTED",
  "lifecycleStatus": "CONTACTED",
  "noteId": "…",
  "taskId": "…",
  "duplicateEvent": false,
  "deepLinkPath": "/objects/people/…"
}
```

## Errors

| Status | Когда |
| --- | --- |
| 400 | нет id / неизвестный action / `lost` без `lostReason` / `note` без текста |
| 404 | Person / Opportunity не найдены |
| 409 | запрещённый переход стадии |
| 500 | сбой Core API |

## Клиенты

1. `telegram-lead-notifier` — inline buttons + reply.
2. Секретарь (шаблоны / NL) — те же `action`.
3. Будущие automation — тот же контракт.

В Note желательно указывать **канал** (`Канал: Telegram. …`) — бот пишет это автоматически с кнопок первого касания.

Read-only снимок стадии и истории Notes для переотправки карточки: [lead-status.md](lead-status.md) (`POST /s/studio/lead-status`).
