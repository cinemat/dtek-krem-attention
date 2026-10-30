import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { extractAttention, extractHome } from '../scrape.mjs';

const FIXTURE = new URL('./fixture.html', import.meta.url).href;

test('extractAttention: абзаци поп-апу, без &nbsp; і порожніх рядків', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(FIXTURE);
    assert.equal(
      await page.evaluate(extractAttention),
      'За наказом НЕК Укренерго сьогодні 27.10 з 06:00 до 23:59 діють стабілізаційні відключення електроенергії.\n' +
        'Будь ласка, розумно споживайте електроенергію — це допоможе зменшити навантаження на мережу та уникнути екстрених відключень.\n' +
        'Дякуємо за ваше розуміння!',
    );
    await page.evaluate(() => document.getElementById('modal-attention').remove());
    assert.equal(await page.evaluate(extractAttention), null);
  } finally {
    await browser.close();
  }
});

test('extractHome: getHomeNum з CSRF сторінки → поля нашого будинку', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let sent;
    await page.route('https://dtek.test/ua/ajax', async (route) => {
      sent = { headers: route.request().headers(), body: new URLSearchParams(route.request().postData()) };
      await route.fulfill({
        json: {
          result: true,
          updateTimestamp: '14:40 30.10.2026',
          data: {
            '1': { sub_type: '', start_date: '', end_date: '' },
            '2': { sub_type: 'Аварійне відключення', start_date: '14:32 30.10.2026', end_date: '18:00 30.10.2026' },
          },
        },
      });
    });
    await page.route('https://dtek.test/ua/shutdowns', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<meta name="csrf-token" content="tok">' }),
    );
    await page.goto('https://dtek.test/ua/shutdowns');
    const addr = { city: 'с. Тест', street: 'вул. Тестова', house: '2' };
    assert.deepEqual(await page.evaluate(extractHome, addr), {
      sub_type: 'Аварійне відключення',
      start_date: '14:32 30.10.2026',
      end_date: '18:00 30.10.2026',
      updated: '14:40 30.10.2026',
    });
    assert.equal(sent.headers['x-csrf-token'], 'tok');
    assert.equal(sent.body.get('method'), 'getHomeNum');
    assert.equal(sent.body.get('data[0][value]'), 'с. Тест');
    assert.equal(sent.body.get('data[1][value]'), 'вул. Тестова');
    // Порожній будинок → поля null; невідомий будинок → null.
    assert.deepEqual(await page.evaluate(extractHome, { ...addr, house: '1' }), {
      sub_type: null, start_date: null, end_date: null, updated: '14:40 30.10.2026',
    });
    assert.equal(await page.evaluate(extractHome, { ...addr, house: '99' }), null);
  } finally {
    await browser.close();
  }
});
