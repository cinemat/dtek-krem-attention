import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { extractAttention } from '../scrape.mjs';

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
