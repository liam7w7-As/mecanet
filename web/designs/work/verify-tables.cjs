const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/UnseR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:1600,height:1080}}),errors=[];
 await page.emulateMedia({reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));
 const base=pathToFileURL(path.resolve('outputs/modernize.html')).href;
 const go=async route=>{await page.goto('about:blank');await page.goto(base+'#/'+route);await page.locator('#table-view h1').waitFor();await page.evaluate(()=>document.fonts.ready)};
 const count=()=>page.locator('#table-view tbody tr:not(.detail-row)').count();
 await go('orders');assert.equal(await count(),6);
 await page.locator('[data-toggle-search]').click();await page.locator('[data-query]').fill('Jane Smith');assert.equal(await count(),1);await page.locator('[data-query]').fill('');
 await page.locator('[data-toggle-filter]').click();await page.locator('[data-filter]').selectOption('Pending');assert.equal(await count(),2);await page.locator('[data-filter]').selectOption('All');
 await page.locator('[data-sort="amount"]').click();await page.locator('[data-sort="amount"]').click();assert.match(await page.locator('#table-view tbody tr').first().innerText(),/Dalton Paden/);
 await page.locator('[data-expand="ORD-001"]').click();assert.equal(await page.locator('#detail-ORD-001').isVisible(),true);
 await page.locator('[data-row-menu="ORD-001"]').click();await page.locator('[data-menu-action="edit"]').click();await page.locator('[name="customer"]').fill('Edited Customer');await page.locator('#order-edit-form [type="submit"]').click();assert.match(await page.locator('#table-view').innerText(),/Edited Customer/);await page.locator('[data-undo]').click();
 await page.locator('[data-select="ORD-001"]').check();await page.locator('[data-delete-selected]').click();assert.equal(await count(),5);await page.locator('[data-undo]').click();assert.equal(await count(),6);
 const downloaded=page.waitForEvent('download');await page.locator('[data-orders-export]').click();await (await downloaded).saveAs('work/orders.csv');assert.match(fs.readFileSync('work/orders.csv','utf8'),/John Doe/);
 await page.locator('[data-toggle-columns]').click();await page.locator('[data-column="address"]').uncheck();assert.equal(await page.locator('th [data-sort="address"]').count(),0);await page.locator('[data-column="address"]').check();
 await go('tables/basic');assert.equal(await page.locator('#table-view table').count(),5);await page.locator('[data-row-menu]').first().click();await page.locator('[data-menu-action="view"]').click();assert.equal(await page.locator('#record-dialog').isVisible(),true);await page.locator('[data-record-close]').click();
 await go('tables/collapsible');await page.locator('[data-expand]').first().click();assert.equal(await page.locator('#history-catalogue-0').isVisible(),true);await page.locator('[data-expand]').first().click();assert.equal(await page.locator('#history-catalogue-0').isVisible(),false);
 await go('tables/enhanced');assert.equal(await count(),5);await page.locator('[data-page="1"]').click();assert.match(await page.locator('.table-footer').innerText(),/6.*10 of 10/);await page.locator('[data-size]').selectOption('-1');assert.equal(await count(),10);await page.locator('[data-toggle-filter]').click();await page.locator('[data-filter]').selectOption('Active');assert.equal(await count(),4);await page.locator('[data-select-all]').check();assert.match(await page.locator('.selected-toolbar').innerText(),/4 selected/);await page.locator('[data-density]').check();assert.equal(await page.locator('table.dense').count(),1);
 await go('tables/fixed-header');const fixed=page.locator('.fixed-table-scroll');const before=await fixed.locator('th').first().boundingBox();await fixed.evaluate(e=>e.scrollTop=150);const after=await fixed.locator('th').first().boundingBox();assert.ok(Math.abs(before.y-after.y)<2);await page.locator('[data-delete]').first().click();assert.equal(await count(),3);await page.locator('[data-undo]').click();assert.equal(await count(),4);
 await go('tables/pagination');assert.equal(await count(),5);await page.locator('[data-page="1"]').click();assert.equal(await count(),4);assert.match(await page.locator('.table-footer').innerText(),/6.*9 of 9/);await page.locator('[data-size]').selectOption('-1');assert.equal(await count(),9);
 await go('tables/search');assert.equal(await count(),5);await page.locator('[data-page="1"]').click();assert.equal(await count(),5);await page.locator('[data-page="1"]').click();assert.equal(await count(),2);await page.locator('[data-query]').fill('Gaming');assert.equal(await count(),1);assert.match(await page.locator('#table-view tbody').innerText(),/Gaming Console/);await page.locator('[data-query]').fill('zz-no-match');assert.equal(await page.locator('.empty-row').isVisible(),true);await page.locator('[data-query]').fill('');await page.locator('[data-toggle-filter]').click();await page.locator('[data-filter]').selectOption('Out of Stock');assert.equal(await count(),2);
 const snapshots=[];
 for(const route of ['orders','tables/basic','tables/collapsible','tables/enhanced','tables/fixed-header','tables/pagination','tables/search']){
  await go(route);const name=route.replace('/','-');await page.screenshot({path:'work/new-'+name+'.png',fullPage:true});
  for(const width of [1600,768,390,320]){
   await page.setViewportSize({width,height:900});
   const snapshot=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,missingImages:[...document.querySelectorAll('#table-view img')].filter(i=>!i.complete||!i.naturalWidth).length}));snapshots.push({route,...snapshot});assert.equal(snapshot.scrollWidth,width);assert.equal(snapshot.missingImages,0);
   if(width===390)await page.screenshot({path:'work/mobile-'+name+'.png',fullPage:true});
  }
  await page.setViewportSize({width:1600,height:1080});
 }
 await go('orders');await page.locator('#theme-toggle').click();await page.screenshot({path:'work/orders-dark.png',fullPage:true});await page.locator('#theme-toggle').click();
 await page.locator('[data-local="tables/basic"]').click();await page.waitForURL('**#/tables/basic');await page.locator('[data-local="dashboard"]').click();await page.waitForURL('**#/dashboard');assert.equal(await page.locator('#dashboard-view').isVisible(),true);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'Passed all 7 views, sorting, filters, search, paging, selection, detail rows, edit, delete/undo, CSV export, density, column selection, fixed headers, internal navigation, desktop/mobile rendering.',screenshots:snapshots.length,errors},null,2));
 await browser.close();
})();
