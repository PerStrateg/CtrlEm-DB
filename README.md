# CtrlEm DB Shortcuts

Userscript для страниц команд CtrlEm. Исходный код лежит в `src/`, результат сборки - один устанавливаемый файл:

```txt
dist/ctrlem-db.user.js
```

## Установка

1. Собрать userscript:

   ```bash
   npm install
   npm run build
   ```

2. Открыть `dist/ctrlem-db.user.js` в браузере или импортировать его в Tampermonkey.

## Разработка

```bash
npm run typecheck
npm run build
```

## Локальное тестирование

Для проверки userscript без Tampermonkey используется сохранённая страница из `test-webpage/`.

```bash
npm run dev:test
```

Откроется `http://127.0.0.1:5173/dev.html`. Страница загружает `test-webpage/test2.htm` в iframe и вставляет в него `src/dev-userscript.ts`. Этот dev-вход добавляет минимальные заглушки `GM_*`, `showToast` и локальные ответы для `/api/uploads/...`, после чего запускает обычный `bootCtrlEmDb()`.

После загрузки на странице должна появиться кнопка **DB**. Production-сборка при этом остаётся прежней:

```bash
npm run build
```

## Структура проекта

```txt
src/main.ts                 маленькая точка входа
src/app.ts                  controller приложения и оркестрация
src/domain/                 типы данных, defaults, parsing, state logic
src/storage.ts              GM storage с fallback на localStorage
src/services/               интеграция со страницей/API CtrlEm и image cache
src/features/               input capture и auto-send
src/ui/                     DOM rendering и стили
dist/ctrlem-db.user.js      собранный userscript
```

UI-модули только отображают controls и вызывают переданные actions. Изменения state, storage, import/export, доступ к CtrlEm API и cache вынесены из UI-файлов.
