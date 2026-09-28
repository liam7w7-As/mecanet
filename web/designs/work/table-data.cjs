const fs=require('node:fs');
const {chromium}=require('C:/Users/UnseR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage();
 const data={},manifest=JSON.parse(fs.readFileSync('work/table-assets.json','utf8'));
 for(const name of ['search','enhanced','pagination']){
  await page.goto('https://modernize-nextjs.adminmart.com/tables/'+name,{waitUntil:'networkidle'});
  data[name]=[];
  for(let p=0;p<3;p++){
   data[name].push(...await page.locator('tbody tr').evaluateAll(rows=>rows.map(row=>({cells:[...row.cells].map(c=>c.innerText),images:[...row.querySelectorAll('img')].map(i=>i.src)}))));
   const next=page.getByRole('button',{name:'Go to next page',exact:true});
   if(!await next.count()||await next.isDisabled())break;
   await next.click();
  }
 }
 for(const url of [...Object.values(data).flat().flatMap(r=>r.images),...[1,2,3,4,5].map(i=>'https://modernize-nextjs.adminmart.com/images/blog/blog-img'+i+'.jpg')]){
  const name=new URL(url).pathname.split('/').pop();if(manifest[name])continue;
  const response=await fetch(url);if(!response.ok)throw Error(url);fs.writeFileSync('work/assets/'+name,Buffer.from(await response.arrayBuffer()));manifest[name]={url,type:response.headers.get('content-type').split(';')[0]};
 }
 fs.writeFileSync('work/table-assets.json',JSON.stringify(manifest,null,2));fs.writeFileSync('work/table-data.json',JSON.stringify(data,null,2));console.log(JSON.stringify(data));await browser.close();
})();
