const fs=require('node:fs');
const {chromium}=require('C:/Users/UnseR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const page=await browser.newPage({viewport:{width:1600,height:1080}});
 for(const route of ['react-tables/orders-table','tables/basic','tables/collapsible','tables/enhanced','tables/fixed-header','tables/pagination','tables/search']){
  await page.goto('https://modernize-nextjs.adminmart.com/'+route,{waitUntil:'networkidle'});
  const name=route.split('/').pop();
  await page.screenshot({path:'work/ref-'+name+'.png',fullPage:true});
  const result=await page.evaluate(()=>({text:document.querySelector('main')?.innerText||document.body.innerText,images:[...document.querySelectorAll('main img')].map(i=>({src:i.src,width:i.width,height:i.height})),inputs:[...document.querySelectorAll('main input')].map(i=>({type:i.type,placeholder:i.placeholder})),buttons:[...document.querySelectorAll('main button')].map(b=>({text:b.innerText,label:b.getAttribute('aria-label'),title:b.title}))}));
  fs.writeFileSync('work/ref-'+name+'.json',JSON.stringify(result,null,2));console.log(name,JSON.stringify(result));
 }
 await browser.close();
})();
