# Как claude.ai загружает треды — что проверить

Исследование делалось без входа в claude.ai, поэтому реальные эндпоинты **не подтверждены**.
Расширение спроектировано так, чтобы не зависеть от точных URL: оно анализирует любой JSON,
который загружает страница, и выучивает запрос резолва по образцу. Но эвристики опираются на
предположения ниже — их нужно проверить в DevTools.

## Предположения (все в `src/shared/claude-endpoints.ts`)

| # | Предположение | Где | Как проверить |
|---|---|---|---|
| 1 | Страница проекта — `/code/project/chan_…`, тред — `?thread=cmsg_…` | `PROJECT_PATH_RE`, `THREAD_QUERY_PARAM` | Адресная строка при открытии треда. |
| 2 | Запросы к данным идут на пути с `/api/`, `/edge-api/`, `/v1/` или `/v2/` и отдают `application/json` | `API_URL_RE` | Network → фильтр `Fetch/XHR`, открыть проект. |
| 3 | Список тредов приходит JSON-ом, где у треда есть id вида `cmsg_…` в поле `id`/`thread_id`/`root_id`/`ts`/`uuid` и заголовок в `title`/`name` | `FIELDS.id`, `FIELDS.title`, `THREAD_ID_RE` | Найти в Network ответ со списком тредов, посмотреть Preview. |
| 4 | Статус резолва — булево `resolved`/`is_resolved`, или `resolved_at`, или `state`/`status` = `resolved` | `FIELDS.resolved*`, `RESOLVED_STATES` | В том же ответе сравнить открытый и зарезолвленный тред. |
| 5 | Дата и превью последнего сообщения — `last_activity_at`/`updated_at`…, `last_message_preview`/`last_message.text`… | `FIELDS.updatedAt`, `FIELDS.snippet` | Там же. Если превью нет в списке — карточка будет без фрагмента. |
| 6 | Резолв — обычный HTTP-запрос (не WebSocket), в URL или теле которого есть `resolv`/`reopen`/`archiv` и id треда | `RESOLVE_MUTATION_RE` | Нажать «Resolve» на треде, найти POST/PATCH в Network. |
| 7 | Ссылки на треды в DOM — `<a href="…?thread=cmsg_…">` | `DOM.threadLink` | Elements → правый клик по треду в списке. |

## Быстрая проверка

1. Загрузить расширение, открыть проект, открыть DevTools → Console.
2. Должна появиться группа `[Claude Kanban] N thread(s) in project chan_…` и строки
   `JSON GET <url> → N thread(s)`. Если источник только DOM (`source: dom`) — значит пункт 2–3 не совпал:
   найдите в Network запрос со списком тредов и поправьте `API_URL_RE`/`FIELDS`.
3. Зарезолвить тред в интерфейсе Claude. В консоли должно появиться `mutation seen …` и
   `learned native "resolve" request`. Если нет — пункт 6 не совпал (или резолв идёт через WebSocket);
   пришлите мне URL/метод/тело запроса из Network.
4. На доске перетащить другой тред в «Зарезолвленные» и проверить, что в Claude он стал зарезолвленным.
