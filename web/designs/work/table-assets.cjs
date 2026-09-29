const fs=require('node:fs');

const {chromium}=require('./playwright.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:1600,height:1080}});
 const images=new Set();
 for(const route of ['tables/basic','tables/collapsible','tables/fixed-header','tables/search','react-tables/orders-table']){
  await page.goto('https://modernize-nextjs.adminmart.com/'+route,{waitUntil:'networkidle'});
  (await page.locator('img').evaluateAll(items=>items.map(i=>i.src))).forEach(url=>images.add(url));
  if(route==='tables/collapsible'){await page.locator('tbody tr').first().locator('button').first().click();console.log('EXPANDED',await page.locator('table').first().innerText());}
  if(route==='tables/search') {console.log('PRODUCTS',JSON.stringify(await page.locator('table img').evaluateAll(items=>items.map(i=>({src:i.src,alt:i.alt})))));}
 }
 const manifest={};
 for(const url of images){const clean=new URL(url).pathname;if(!/breadcrumb|profile\/user-|products\/|shop\//.test(clean))continue;const name=clean.split('/').pop();const response=await fetch(url);if(!response.ok)throw Error(url);fs.writeFileSync('work/assets/'+name,Buffer.from(await response.arrayBuffer()));manifest[name]={url,type:response.headers.get('content-type').split(';')[0]};}
 fs.writeFileSync('work/table-assets.json',JSON.stringify(manifest,null,2));console.log('IMAGES',JSON.stringify([...images]));await browser.close();
})();
