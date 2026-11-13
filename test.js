const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function load() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
  dom.window.confirm = () => true;
  return dom.window;
}
function run(win, value) {
  win.document.getElementById('addressInput').value = value;
  win.calculateDipSwitches();
  const d = win.document;
  const sw = [...d.querySelectorAll('.switch')].map(el => ({
    no: +el.querySelector('.switch-number').textContent,
    weight: +el.querySelector('.switch-weight').textContent,
    on: el.querySelector('.switch-position').textContent === 'ON',
  }));
  return {
    sw,
    onNos: sw.filter(s => s.on).map(s => s.no),
    g1: d.getElementById('binary1to4').textContent,
    g2: d.getElementById('binary5to8').textContent,
    msb: d.getElementById('binaryFull').textContent,
    order: d.getElementById('binarySwitchOrder').textContent,
    formula: d.getElementById('sumFormula').textContent,
    error: d.getElementById('errorMessage').style.display,
    result: d.getElementById('resultSection').style.display,
  };
}

test('0~255: 畫面 ON 開關權重加總 = 輸入值，且標示 1/2/4/…/128', () => {
  const win = load();
  for (let a = 0; a <= 255; a++) {
    const r = run(win, a);
    assert.strictEqual(r.sw.length, 8);
    r.sw.forEach((s, i) => { assert.strictEqual(s.no, i + 1); assert.strictEqual(s.weight, 2 ** i); });
    assert.strictEqual(win.sumOn(r.sw.map(s => s.on)), a, `address ${a}`);
    assert.strictEqual(r.g1 + r.g2, r.order);
    assert.strictEqual(parseInt(r.msb, 2), a);
  }
});

test('手動案例', () => {
  const win = load();
  const cases = { 0: [], 1: [1], 3: [1, 2], 7: [1, 2, 3], 115: [1, 2, 5, 6, 7], 125: [1, 3, 4, 5, 6, 7], 128: [8], 255: [1, 2, 3, 4, 5, 6, 7, 8] };
  for (const [a, on] of Object.entries(cases)) assert.deepStrictEqual(run(win, a).onNos, on, `address ${a}`);
});

test('115 顯示與加總式', () => {
  const r = run(load(), 115);
  assert.strictEqual(r.msb, '01110011');
  assert.strictEqual(r.order, '11001110');
  assert.strictEqual(r.formula, '1 + 2 + 16 + 32 + 64 = 115');
});

test('手冊表格抽查', () => {
  const win = load();
  const m = { 12: ['0011', '0000'], 28: ['0011', '1000'], 115: ['1100', '1110'], 250: ['0101', '1111'] };
  for (const [a, [g1, g2]] of Object.entries(m)) {
    const r = run(win, a);
    assert.deepStrictEqual([r.g1, r.g2], [g1, g2], `address ${a}`);
  }
});

test('錯誤輸入顯示錯誤訊息', () => {
  const win = load();
  for (const v of ['-1', '256', '']) {
    const r = run(win, v);
    assert.strictEqual(r.error, 'block', `input "${v}"`);
    assert.strictEqual(r.result, 'none');
  }
});

test('歷史記錄：舊資料被捨棄、新資料以地址重算、點擊可重新載入', async () => {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', beforeParse(w) {
    w.localStorage.setItem('dipSwitchHistory', JSON.stringify([{ address: 1, lsb: 'x', msb: 'x' }]));
    w.localStorage.setItem('dipSwitchHistoryV2', JSON.stringify([{ address: 115, binary: 'bad', lsb: 'bad', msb: 'bad', timestamp: 't' }]));
  }});
  const w = dom.window;
  await new Promise(r => w.addEventListener('load', () => setTimeout(r, 0)));
  assert.strictEqual(w.localStorage.getItem('dipSwitchHistory'), null);
  const items = [...w.document.querySelectorAll('.history-item')];
  assert.ok(items.some(i => i.textContent.includes('SW1-4: 1100') && i.textContent.includes('SW5-8: 1110')));
  const target = items.find(i => i.textContent.includes('地址 115'));
  w.document.getElementById('addressInput').value = 0;
  target.click();
  assert.strictEqual(w.document.getElementById('addressNumber').textContent, '115');
});

