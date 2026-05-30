ТЗ:
Необходимо сделать userscript который представляет из себя базу данных ссылок/фраз. Это обычный текст где каждая новая строка - это ссылка на изображение/видео или текст.
С помощью этой базы данных у пользователя появляется возможность быстрого выбора фраз/картинок/видео, вместо того, чтобы вручную каждый раз копировать/вставлять.

Есть три типа записей:
- текст
- ссылки на изображения (png, jpg, gif, webp и т.д.)
- ссылки на видео (.mp4, .mov и т.д.)

Так же все должно делиться на категории. Например:
- текст
    приветствие 4 фразы:
    завершение: 5 фраз
- ссылки на изображения:
    котики: 15 ссылки
    собачки: 2 ссылки
- ссылки на видео:
    трейлеры: 1 ссылки
    демо: 2 ссылки

Сам userscript должен делиться на две части:
1. Удобный менеджмент типов и категорий (типов всегда 3. категории можно добавлять)
2. Встраивание ссылок в сайт

Для начала реализуем встраивание фраз в сайт. На сайте есть группа: "Send Message".

```html
<div class="cmd-group" data-cmd-devices="desktop android">
            <button class="cmd-item" type="button" data-acc="sendMessage">
              <span>Send Message</span><span class="chev">▾</span>
            </button>
            <div class="cmd-panel active" id="acc-sendMessage">
              <label class="cmd-label">Message</label>
              <input id="val-sendMessage" class="form-input" placeholder="Message to display">
              <div style="margin-top:10px;">
                <button class="btn btn-primary btn-block" type="button" data-send="sendMessage">Send</button>
              </div>
            </div>
            </div>
```

Под полем input нужно как раз добавить список фраз. И он должен быть над кнопкой Send.

```html
<input id="val-sendMessage" class="form-input" placeholder="Message to display">
```

Это должно быть похоже на группу Popup Image:
```html
<div class="cmd-group" data-cmd-devices="desktop android">
            <button class="cmd-item" type="button" data-acc="popupImage">
              <span>Popup Image</span><span class="chev">▾</span>
            </button>
        
        <div class="upload-gallery" id="gallery-popupImage">
            <div class="gallery-thumb-wrapper" data-upload-id="8936f385-9691-493e-8949-f1157c6fdd01">
            <img src="/api/uploads/8936f385-9691-493e-8949-f1157c6fdd01/image" class="gallery-thumb" title="SPOILER_8A12EFEF-0538-452D-B685-73C1D1FA8905.webp" alt="SPOILER_8A12EFEF-0538-452D-B685-73C1D1FA8905.webp">
            <button class="gallery-thumb-delete" title="Delete">×</button>
            </div>
        
            <div class="gallery-thumb-wrapper" data-upload-id="1b9386e0-4064-42ab-bc80-57bc45c115ec">
            <img src="/api/uploads/1b9386e0-4064-42ab-bc80-57bc45c115ec/image" class="gallery-thumb" title="IMG_3127.webp" alt="IMG_3127.webp">
            <button class="gallery-thumb-delete" title="Delete">×</button>
            </div>
      </div>
</div>
```

Только необходимо сделать именно список строк. Пока не нужно добавлять возможность удаления.

Кнопку вызова Базы данных размести здесь справа от h2 и p блока. Пока пусть будет прям DB название.
<div class="panel-head">
<h2>Commands</h2>
<p>Click a command to open options.</p>
</div>

Примерный html файл есть в test2.htm.

Пока разрешения ставь на доступ к локальным страницам в userscript.

Делай код так чтобы его можно было потом просто дописывать и доделывать. Это в приоритете. Так же логируй важные места, чтобы я мог тебе скинуть лог если что.

DRY, KISS, YAGNI.



Спрашивай, что ещё не ясно?








Теперь следующая задача.

1. Для Popup Image, Change Wallpaper сделать:
    - Выпадающий список с категориями, где пользователь выбирает категорию изображений
    - Контейнер с изображениями из категорий (как сделано сейчас)
    - Убрать кнопку удаления. Менеджмент картинок будет происходить в интерфейсе БД.

1.1. Если какие-то картинки уже есть, то для них необходимо сделать категорию "Default". И пусть там лежат. 

Тестовая ссылка на изображение котика (продублируй несколько раз для теста): https://upload.wikimedia.org/wikipedia/commons/5/53/Sheba1.JPG

2. Для Video Overlay сделать так же как и для Popup Image. Но тут видео. И в качестве превью пусть будет дефолтное превью видео пока что. Имей ввиду для видео нужно будет с нуля создать всю внутренность, потому что сейчас там нету контейера с превью изображениями видео.

Тестовая ссылка на видео: https://file-examples.com/wp-content/storage/2017/04/file_example_MP4_480_1_5MG.mp4






Теперь следующая задача. Нам нужно добавить менеджер DB. При нажатии на кнопку DB. Вместо панели Results должен отобразиться редактор DB. При повторном нажатии скроется менеджер:
```html
<section class="panel panel--results">
<div class="panel-head panel-head--row">
  <div>
    <h2>Results</h2>
    <p>Responses, screenshots, webcam captures, and status updates.</p>
  </div>
  <div style="display: flex; align-items: center; gap: 0.75rem;">
    <button class="btn btn-sm btn-secondary" id="refresh-responses-btn" type="button" title="Refresh results">Refresh</button>
    <label class="toggle" title="Toggle auto-refresh">
      <input type="checkbox" id="auto-refresh-toggle" checked="">
      <span class="toggle-slider"></span>
    </label>
    <span class="text-muted" style="font-size: 0.8rem;">Auto</span>
  </div>
</div>
...
</section>
```

Как он должен работать. Это должен быть обычный текстовый редактор в стиле сайта. Сверху есть три чекбокса в строку (типы). При выборе типов нужно сразу менять их содержание на актуальное.

Слева разместить:
Далее список с категориями. Можно выбрать определенную категорию или перетащить (изменить порядок). Отдельные кнопки изменения порядка не добавляй
По умолчанию должна выбраться самая первая категория.

Справа разместить:
- Галочка авто-сохранения. Если она активна, то автоматически сохранять. 
- Кнопка сохранения.
- Кнопка переименовать категорию.
- Кнопка удалить категорию.

Ниже: 
- Главное текстовое поле со ссылками/текстом. Убрать word-wrap. Новая строчка - новая ссылка.  

Ещё ниже:
- Экспорт категории.
- Импорт категорий (они всегда импортиться как новые). Можно загружать несколько.
- Экспорт всех категорий. Категория экспортируется с именем категории

UI делай в интерфейс сайта. Чтобы была нативная интеграция. Посмотри цвета сайта, чтобы не было текстовое поле белым, а сайт тёмный.

В конце нужно выполнить важную операцию: соединить данные из категории с отображением на сайте!



Сделать рефактор ctrlem-db.user.js: упростить и структурировать userscript базы фраз/ссылок, чтобы данные, менеджер категорий и вставка выбранных текстов/медиа в сайт были разделены, предсказуемы и удобны для дальнейшего расширения.

Userscript `ctrlem-db.user.js` представляет из себя базу данных ссылок/фраз. Это обычный текст где каждая новая строка - это ссылка на изображение/видео или текст.
С помощью этой базы данных у пользователя появляется возможность быстрого выбора фраз/картинок/видео, вместо того, чтобы вручную каждый раз копировать/вставлять.

Тестовая страциа тут: `webpage\test2.htm`

Встрой переменную с дефолтным json, вместо захардкоженных данных. Улучши код. В целом ты уже понимаешь что к чему. Можно менять контракты и убирай всё legacy! Применяй расширяемую архитектуру, помни про DRY, KISS, YAGNI, SRP.

Необходимо внести правки:
1. При сохранении обновлять UI. Чтобы добавленные элементы добавились в UI. 
1.1. При перетаскивании категории тоже. Кстати перетаскивание нужно сделать понятнее, что она в целом есть (с точки зрения UI).
2. Категорию Default которая формируется изначально убрать в конец списка категорий (временная категория автоматически появляется если на сайте уже есть что-то).
2.1. Верни кнопочки удаления в default категорию
3. В секторе "Write For Me" под полем ввода текста тоже добавить список фраз из типа "текст".
4. Добавить ещё один тип "Links"
  4.1. Сделать так же списоком в секторе "Open Page" под полем ввода URL. Список ссылок.
5. В конце любой категории в текте должна быть одна пустая строка (при сохранении).
6. Нужно подумать как сделать превью видео. Сейчас это просто чёрные квадратики. Это выглядит плохо. Может быть есть способ как всё таки достать случайный кадр, или первый кадр из видео, не загружая его целиком?

Должно работать всё предсказуемо и надежно! Это будет очень полезный userscript для людей!

Дефолтный json:
```json
{
  "version": 1,
  "exportedAt": "2026-05-16T09:29:11.439Z",
  "types": {
    "links": [
      {
        "name": "test-category",
        "content": "https://www.wikipedia.org/\n"
      }
    ],
    "text": [
      {
        "name": "Hello",
        "content": "Hello!\nHi!\nMmm, hello!\n"
      },
      {
        "name": "Bye",
        "content": "Bye!\nGood bye.\n"
      }
    ],
    "image": [
      {
        "name": "Cats",
        "content": "https://upload.wikimedia.org/wikipedia/commons/5/53/Sheba1.JPG\nhttps://upload.wikimedia.org/wikipedia/commons/5/53/Sheba1.JPG\nhttps://upload.wikimedia.org/wikipedia/commons/5/53/Sheba1.JPG\nhttps://upload.wikimedia.org/wikipedia/commons/5/53/Sheba1.JPG"
      }
    ],
    "video": [
      {
        "name": "test-category",
        "content": "https://file-examples.com/storage/fe4541726b6a082a198442c/2017/04/file_example_MP4_480_1_5MG.mp4\n"
      }
    ]
  }
}
```