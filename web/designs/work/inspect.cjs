const fs = require('node:fs');

const { chromium } = require('./playwright.cjs');
(async () => {
  const browser = await chromium.launch({headless:true, channel:'msedge'});
  const page = await browser.newPage({viewport:{width:1920,height:1080}});
  await page.goto('https://modernize-nextjs.adminmart.com/', {waitUntil:'networkidle'});
  await page.screenshot({path:'work/reference.png',fullPage:true});
  console.log(JSON.stringify(await page.evaluate(()=>({text:document.body.innerText, images:[...document.images].map(i=>({src:i.src,width:i.width,height:i.height})),font:getComputedStyle(document.body).fontFamily})),null,2));
  await browser.close();
})();
