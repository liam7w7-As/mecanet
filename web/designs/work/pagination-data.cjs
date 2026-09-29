const fs=require('node:fs');

const {chromium}=require('./playwright.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage();
 await page.goto('https://modernize-nextjs.adminmart.com/tables/pagination',{waitUntil:'networkidle'});
 console.log(await page.locator('select').evaluateAll(nodes=>nodes.map(n=>n.outerHTML)));
 const select=page.locator('select').last();await select.selectOption('-1');
 const rows=await page.locator('tbody tr').evaluateAll(rows=>rows.filter(row=>row.cells.length>2).map(row=>({cells:[...row.cells].map(c=>c.innerText),images:[...row.querySelectorAll('img')].map(i=>i.src)})));
 const data=JSON.parse(fs.readFileSync('work/table-data.json','utf8'));data.pagination=rows;fs.writeFileSync('work/table-data.json',JSON.stringify(data,null,2));console.log(JSON.stringify(rows));await browser.close();
})();
