# dtek-krem-attention

Кожні 10 хв GitHub Actions відкриває https://www.dtek-krem.com.ua/ua/shutdowns у headless Chromium, читає текст поп-апу «Шановні клієнти!» (`#modal-attention .m-attention__text`) і статус однієї адреси (`getHomeNum`, як форма на сторінці) та надсилає їх в особистий Worker [light-checker](https://github.com/cinemat/light-checker) (`POST /ingest/attention`). Worker сповіщає в Telegram, коли поп-ап каже про відключення в Бучанському районі або коли ДТЕК фіксує відключення за адресою (поява, зміна, зникнення).

Сторінку відкриваємо з IP GitHub, а не з домашнього, бо її захищає Imperva Incapsula.

- Секрети репозиторію: `WORKER_URL`, `ATTENTION_TOKEN`, `ADDRESS_CITY`, `ADDRESS_STREET`; змінна `ADDRESS_HOUSE` (не секрет, бо секрет «2» маскує всі двійки в логах). Без адреси перевіряється лише поп-ап.
- Локально: `npm ci && npx playwright install chromium && npm test`; `DRY_RUN=1 node scrape.mjs` — надрукувати текст без надсилання.
- Джерело коду — тека `attention/` у приватному репозиторії light-checker; цей репозиторій — її копія.
