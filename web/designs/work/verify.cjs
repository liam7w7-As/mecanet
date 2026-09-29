const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

const {chromium}=require('./playwright.cjs');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve('outputs/modernize.html')).href);
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:'work/desktop.png',fullPage:true});
  const desktop=await page.evaluate(()=>({font:document.fonts.check('14px "Plus Jakarta Sans"'),width:innerWidth,scrollWidth:document.documentElement.scrollWidth,images:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.alt),stats:document.querySelector('.stats').getBoundingClientRect().toJSON(),revenue:document.querySelector('.revenue').getBoundingClientRect().toJSON(),icons:document.querySelectorAll('[data-lucide]').length}));
  await page.locator('#theme-toggle').click();
  if(!await page.locator('body').evaluate(e=>e.classList.contains('dark')))throw Error('Dark mode failed');
  await page.locator('#theme-toggle').click();
  await page.locator('#revenue-month').selectOption('April 2025');
  if(await page.locator('#total-earnings').textContent()!=='$68,214.25')throw Error('Revenue month did not update');
  await page.locator('#report-trigger').click();
  if(!await page.locator('#report-dialog').isVisible())throw Error('Report did not open');
  const downloadPromise=page.waitForEvent('download');await page.locator('#report-dialog [data-export="csv"]').click();const download=await downloadPromise;await download.saveAs('work/report.csv');
  await page.locator('#report-dialog [data-close-dialog]').click();
  await page.locator('#revenue-month').selectOption('March 2025');
  await page.locator('#search-trigger').click();await page.locator('#search-input').fill('calendar');
  if(await page.locator('#search-results a').count()!==1)throw Error('Search failed');
  await page.locator('#search-dialog [data-close-dialog]').click();
  await page.locator('[aria-controls="nav-users"]').click();if(!await page.locator('#nav-users').isVisible())throw Error('Submenu failed');await page.locator('[aria-controls="nav-users"]').click();
  await page.locator('#settings-trigger').click();await page.locator('[data-width="full"]').click();await page.locator('[data-width="boxed"]').click();await page.locator('#settings-close').click();
  const responsive=[];
  for(const width of [1440,1024,768,390,320]){
    await page.setViewportSize({width,height:900});
    await page.screenshot({path:`work/viewport-${width}.png`,fullPage:true});
    responsive.push(await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('.card,.stat,.topbar,.team-top,.earning-row')].filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>e.className)})));
  }
  await page.setViewportSize({width:390,height:844});await page.locator('#menu-toggle').click();if(!await page.locator('body').evaluate(e=>e.classList.contains('sidebar-open')))throw Error('Mobile menu failed');await page.locator('#scrim').click({position:{x:350,y:300}});
  console.log(JSON.stringify({desktop,responsive,errors,verification:'Theme, month selection, report, CSV export, search, submenus, settings and mobile navigation passed.'},null,2));
  fs.writeFileSync('work/verification.json',JSON.stringify({desktop,responsive,errors},null,2));
  await browser.close();
})();
