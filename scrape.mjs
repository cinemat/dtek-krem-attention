// Відкриває сторінку ДТЕК КРЕМ у headless Chromium і передає текст поп-апу «Шановні клієнти!»
// (#modal-attention) у Worker light-checker, а також статус нашої адреси з тієї ж сторінки
// (`getHomeNum`, форма «Перевірка поточних відключень за адресою»). Рішення про сповіщення приймає Worker.
//
// Env: WORKER_URL, ATTENTION_TOKEN (секрети GitHub Actions). DRY_RUN=1 — лише надрукувати текст.
// ADDRESS_CITY, ADDRESS_STREET, ADDRESS_HOUSE — адреса як у підказках форми на сайті (секрети, бо репозиторій
// публічний); якщо не задано — адресу не перевіряємо.
// Запуск: node scrape.mjs [url]   (url — для перевірки на локальному файлі)

import { chromium } from 'playwright';

const PAGE_URL = process.argv[2] || 'https://www.dtek-krem.com.ua/ua/shutdowns';
const MAX_TRY = 3;

/** Виконується в браузері: текст поп-апу абзацами або null, якщо поп-апу нема. */
export function extractAttention() {
  const box = document.querySelector('#modal-attention .m-attention__text');
  if (!box) return null;
  const blocks = [...box.querySelectorAll('p, li, h1, h2, h3, h4')]
    .filter((el) => !el.parentElement.closest('p, li'))
    .map((el) => el.textContent.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const text = blocks.length ? blocks.join('\n') : box.textContent.replace(/\s+/g, ' ').trim();
  return text || null;
}

/**
 * Виконується в браузері: відключення за адресою з `POST /ua/ajax method=getHomeNum` (той самий запит робить
 * форма на сторінці). { sub_type, start_date, end_date, updated } або null, якщо даних немає.
 */
export async function extractHome({ city, street, house }) {
  const csrf = document.querySelector('meta[name=csrf-token]')?.content;
  if (!csrf) return null;
  const body = new URLSearchParams({
    method: 'getHomeNum',
    'data[0][name]': 'city',
    'data[0][value]': city,
    'data[1][name]': 'street',
    'data[1][value]': street,
  });
  const r = await fetch('/ua/ajax', {
    method: 'POST',
    headers: {
      'X-CSRF-Token': csrf,
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: body.toString(),
  });
  if (!r.ok) return null;
  const j = await r.json();
  const h = j?.result && j.data?.[house];
  if (!h) return null;
  return {
    sub_type: h.sub_type || null,
    start_date: h.start_date || null,
    end_date: h.end_date || null,
    updated: j.updateTimestamp || null,
  };
}

function addressFromEnv() {
  const { ADDRESS_CITY: city, ADDRESS_STREET: street, ADDRESS_HOUSE: house } = process.env;
  return city && street && house ? { city, street, house } : null;
}

/** Сторінка справжня, а не заглушка Incapsula: є дані графіка. */
function looksLoaded(html) {
  return html.includes('DisconSchedule.fact');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function scrape(url, address) {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      locale: 'uk-UA',
      timezoneId: 'Europe/Kyiv',
    });
    for (let attempt = 1; attempt <= MAX_TRY; attempt++) {
      const page = await ctx.newPage();
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 });
        await page.waitForTimeout(500);
        if (looksLoaded(await page.content())) {
          const text = await page.evaluate(extractAttention);
          let home = null;
          if (address) {
            // Збій запиту адреси не скасовує звіт про поп-ап: home = null — Worker стан адреси не чіпає.
            try {
              home = await page.evaluate(extractHome, address);
            } catch (e) {
              console.warn(`[WARN] адреса: ${e?.message || e}`);
            }
            if (!home) console.warn('[WARN] адреса: даних немає');
          }
          return { text, home };
        }
        console.warn(`[WARN] спроба ${attempt}: сторінка без даних (ймовірно, заглушка Incapsula)`);
      } catch (e) {
        console.warn(`[WARN] спроба ${attempt}: ${e?.message || e}`);
      } finally {
        await page.close();
      }
      if (attempt < MAX_TRY) await sleep(3000 * attempt);
    }
    return null;
  } finally {
    await browser.close();
  }
}

async function main() {
  const res = await scrape(PAGE_URL, addressFromEnv());
  if (!res) {
    // Не звітуємо: Worker сам попередить власника, якщо звітів нема понад 3 год.
    console.error('[ERROR] сторінку не завантажено');
    process.exit(1);
  }
  console.log(`[OK] поп-ап: ${res.text === null ? '— (нема)' : JSON.stringify(res.text)}`);
  console.log(`[OK] адреса: ${res.home === null ? '— (не перевірено)' : JSON.stringify(res.home)}`);
  if (process.env.DRY_RUN === '1') return;

  const { WORKER_URL, ATTENTION_TOKEN } = process.env;
  if (!WORKER_URL || !ATTENTION_TOKEN) throw new Error('WORKER_URL / ATTENTION_TOKEN не задано');
  const r = await fetch(new URL('/ingest/attention', WORKER_URL), {
    method: 'POST',
    headers: { authorization: `Bearer ${ATTENTION_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text: res.text, home: res.home }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await r.text();
  console.log(`[OK] Worker: HTTP ${r.status} ${body}`);
  if (!r.ok) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error('[ERROR]', e);
    process.exit(1);
  });
}
