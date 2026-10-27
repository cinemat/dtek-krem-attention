# dtek-krem-attention

Кожні 10 хв GitHub Actions відкриває https://www.dtek-krem.com.ua/ua/shutdowns у headless Chromium, читає текст поп-апу «Шановні клієнти!» (`#modal-attention .m-attention__text`) і надсилає його в особистий Worker [light-checker](https://github.com/cinemat/light-checker) (`POST /ingest/attention`). Worker сповіщає в Telegram, коли в тексті з'являються або зникають екстрені чи аварійні відключення в Бучанському районі.

Сторінку відкриваємо з IP GitHub, а не з домашнього, бо її захищає Imperva Incapsula.

- Секрети репозиторію: `WORKER_URL`, `ATTENTION_TOKEN`.
- Локально: `npm ci && npx playwright install chromium && npm test`; `DRY_RUN=1 node scrape.mjs` — надрукувати текст без надсилання.
- Джерело коду — тека `attention/` у приватному репозиторії light-checker; цей репозиторій — її копія.
