// Drives the interface through a complete flight against the mock host and saves screenshots.
// Usage: node efb/dev/test-ui.js [output folder]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const OUT = process.argv[2] || path.join(__dirname, 'shots');
const PORT = 8641, BASE = 'http://localhost:' + PORT;
const results = [];
const check = (ok, name) => { results.push((ok ? 'PASS  ' : 'FAIL  ') + name); if (!ok) process.exitCode = 1; };
const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
const sim = a => post('/dev/sim/' + a);

async function sign(page) {
  const box = await page.locator('.sig-canvas').boundingBox();
  await page.mouse.move(box.x + 60, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 60 + i * 28, box.y + box.height * (0.6 + 0.25 * Math.sin(i)));
  await page.mouse.up();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn('node', [path.join(__dirname, 'mock-server.js'), PORT], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 700));
  const browser = await chromium.launch();
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1 });   // iPad landscape
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/pdf\.min\.js|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    const shot = name => page.screenshot({ path: path.join(OUT, name + '.png') });
    const tab = async id => { await page.click(`#rail a[href="#${id}"]`); await page.waitForTimeout(250); };

    await post('/api/patch', { doc: 'settings', ops: [{ op: 'set', path: ['simbriefUser'], value: 'demo' }, { op: 'set', path: ['picName'], value: 'L ROPER' }] });
    await page.goto(BASE);
    await page.waitForSelector('#rail a');
    await shot('01-start');
    check(await page.locator('text=Start a flight').count() === 1, 'start screen shown');

    await page.click('text=Load SimBrief plan');
    await page.waitForSelector('text=EGLL → EHAM');
    check(true, 'SimBrief plan loaded into a flight');
    await sim('connect');
    await page.waitForTimeout(300);
    await shot('02-flight');

    await tab('navlog');
    check(await page.locator('.tbl tbody tr').count() >= 9, 'NavLog lists the fixes');
    await page.click('button[aria-label="Hide TOC and TOD"]');
    await page.waitForTimeout(200);
    check(await page.locator('.tbl tbody tr:has-text("TOC")').count() === 0, 'TOC and TOD can be hidden');
    await page.click('button[aria-label="Hide TOC and TOD"]');

    await tab('loads');
    await page.click('text=Create booking figures');
    await page.waitForSelector('text=Close boarding and issue final load sheet');
    await page.click('text=Close boarding and issue final load sheet');
    await page.waitForSelector('text=Sign load sheet');
    const load = await page.evaluate(() => fetch('/api/state').then(r => r.json()).then(s => s.flight.load));
    check(load.final.pax <= load.seats, `final passengers ${load.final.pax} never exceed ${load.seats} seats`);
    check(load.final.jump === 0 || load.final.pax === load.seats, 'jumpseat staff only on a full flight');
    check(load.final.jump <= 5, 'at most 5 staff on jumpseats');
    await page.click('button:has-text("Sign load sheet")');
    await sign(page);
    await page.click('.modal-foot .btn.primary');
    await page.waitForSelector('.sig-img');
    check(true, 'load sheet signed on the signature pad');
    await shot('03-loads');

    await tab('occ');
    check(await page.locator('.msg').count() >= 2, 'company messages arrive automatically');
    await page.click('.msg .btn.primary >> nth=0');
    await page.click('.step .check >> nth=0');
    await page.click('text=Add delay');
    await page.fill('.modal input[type=number]', '12');
    await page.click('.modal-foot .btn.primary');
    await page.waitForSelector('text=Total 12 min');
    check(true, 'delay code recorded');
    await shot('04-occ');

    await tab('times');
    await page.click('.kv button.tap >> nth=6');            // TSAT
    for (const k of '1015') await page.click(`.key:text-is("${k}")`);
    await page.click('.keypad .btn.primary');
    await page.waitForTimeout(200);
    check((await page.evaluate(() => fetch('/api/state').then(r => r.json()).then(s => s.flight.times.tsat))) !== null, 'TSAT entered with the keypad');

    await sim('refuel'); await sim('out'); await sim('off');
    for (let i = 0; i < 4; i++) await sim('fix');
    await sim('fuelcheck');
    await tab('navlog');
    await page.waitForTimeout(300);
    check(await page.locator('tr.passed').count() === 4, 'passed fixes are logged automatically with time and fuel');
    check(await page.locator('td .good, td .bad').count() >= 4, 'fuel above or below plan is shown per fix');
    await shot('05-navlog');

    // manual FOB entry with the keypad on the next fix
    await page.click('tr.next td:nth-child(6) button');
    for (const k of '6100') await page.click(`.key:text-is("${k}")`);
    await page.click('.keypad .btn.primary');
    await page.waitForTimeout(200);
    check(await page.locator('tr.next td:nth-child(7) .good, tr.next td:nth-child(7) .bad').count() === 1, 'FOB typed on the keypad updates the comparison live');

    await sim('goaround');
    for (let i = 0; i < 6; i++) await sim('fix');
    await sim('on'); await sim('in');
    await tab('landing');
    await page.waitForTimeout(400);
    check(await page.locator('text=164 fpm').count() >= 1, 'landing rate shown');
    await shot('06-landing');

    await tab('times');
    await page.click('text=Send departure message');
    await page.waitForSelector('text=Departure message sent');
    await shot('07-times');

    await tab('gsx');
    check(await page.locator('text=Automatic').count() >= 1, 'automatic fuel receipt listed');
    await shot('08-gsx');

    // sign and close: blocked until the go-around reason is given
    await tab('flight');
    check(await page.locator('text=Go-around detected.').count() === 1, 'go-around banner shown');
    await page.click('button:has-text("Sign and close flight")');
    await page.waitForSelector('text=Go-around: reason required');
    await page.click('.modal-foot .btn.primary');
    check(await page.locator('text=Choose a reason for every go-around.').count() === 1, 'cannot continue without a go-around reason');
    await shot('09-goaround-reason');
    await page.selectOption('.modal select', 'Unstable approach');
    await page.click('.modal-foot .btn.primary');
    await page.waitForSelector('.sig-canvas');
    await sign(page);
    await page.click('.modal-foot .btn.primary');
    await page.waitForSelector('text=Flight signed and closed');
    check(true, 'flight signed and closed after the reason was entered');
    await shot('10-closed');
    check(await page.locator('.modal-foot button:has-text("Export PDF")').count() === 1, 'PDF export offered once closed');
    await page.click('.modal-foot button:has-text("Done")');
    await page.waitForTimeout(300);
    check(await page.locator('.tbl tbody tr:has-text("EHAM")').count() >= 1, 'closed flight appears in the logbook');
    await shot('11-flight-closed');

    await tab('report');
    await page.waitForTimeout(1500);
    await shot('12-report');

    // library: upload a chart image and draw on it
    const png = path.join(OUT, 'sample-chart.png');
    const chartPage = await ctx.newPage();
    await chartPage.setContent('<div style="width:900px;height:1200px;background:#fff;font:40px sans-serif;padding:40px">EHAM ILS 18R<br><svg width="800" height="900"><circle cx="400" cy="400" r="300" fill="none" stroke="#000" stroke-width="3"/><line x1="100" y1="800" x2="700" y2="100" stroke="#000" stroke-width="3"/></svg></div>');
    await chartPage.screenshot({ path: png });
    await chartPage.close();
    await tab('charts');
    await page.click('text=Add files');
    await page.fill('.modal input[type=text]', 'EHAM');
    await page.setInputFiles('.modal input[type=file]', png);
    await page.click('.modal-foot .btn.primary');
    await page.waitForSelector('.lib-item');
    check(await page.locator('.lib-group:has-text("This flight")').count() >= 1, 'charts of the flight airports are marked and sorted first');
    await page.click('.lib-item');
    await page.waitForSelector('.lib-page img');
    await page.click('.lib-bar button:has-text("Draw")');
    const pg = await page.locator('.lib-page').boundingBox();
    await page.mouse.move(pg.x + 80, pg.y + 120); await page.mouse.down();
    await page.mouse.move(pg.x + 300, pg.y + 260, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(300);
    const ink = await page.evaluate(() => fetch('/api/state').then(r => r.json()).then(s => Object.keys(s.library.ink || {}).length));
    check(ink === 1, 'drawing on a chart is saved to the shared library');
    await page.click('.lib-bar button:has-text("Night")');
    await page.waitForTimeout(300);
    await shot('13-charts');

    await tab('settings');
    await page.click('.settings nav button:has-text("Units")');
    await page.click('.seg button:has-text("LB")');
    await page.waitForTimeout(250);
    await shot('14-settings-units');
    await tab('navlog');
    check(await page.locator('th:has-text("FOB lb")').count() >= 1, 'switching to LB converts the NavLog');
    await shot('15-navlog-lb');
    await page.click('button[aria-label="Day or night mode"]');
    await page.waitForTimeout(300);
    await tab('flight');
    await shot('16-day-mode');

    // the printable journey log
    const report = await ctx.newPage();
    report.on('pageerror', e => errors.push('report pageerror: ' + e.message));
    const id = await page.evaluate(() => fetch('/api/state').then(r => r.json()).then(s => s.flight.id));
    await report.goto(`${BASE}/report.html?id=${id}`);
    await report.waitForFunction(() => window.reportReady === true);
    const text = await report.locator('#page').innerText();
    check(/Unstable approach/.test(text), 'journey log includes the go-around reason');
    check(/GSX RECEIPTS/i.test(text) && /signed and closed/.test(text), 'journey log ends with GSX receipts and carries the PIC signature');
    await report.pdf({ path: path.join(OUT, 'journey-log.pdf'), format: 'A4', printBackground: true });
    await report.screenshot({ path: path.join(OUT, '17-journey-log.png'), fullPage: true });

    // phone-width sanity check
    const small = await browser.newContext({ viewport: { width: 820, height: 1180 } });
    const sp = await small.newPage();
    await sp.goto(BASE + '/#navlog');
    await sp.waitForSelector('.tbl');
    await sp.screenshot({ path: path.join(OUT, '18-ipad-portrait.png') });
    check(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  } catch (e) {
    check(false, 'test run aborted: ' + e.message.split('\n')[0]);
    if (errors.length) results.push('      errors: ' + errors.slice(0, 5).join(' | '));
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(results.join('\n'));
})();
