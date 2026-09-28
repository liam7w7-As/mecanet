const fs = require('node:fs');
const path = require('node:path');
const base = 'https://modernize-nextjs.adminmart.com';
const files = {
  logo:'/images/logos/dark-logo.svg', flag:'/images/flag/icon-flag-en.svg',
  employee:'/images/svgs/icon-user-male.svg', clients:'/images/svgs/icon-briefcase.svg',
  projects:'/images/svgs/icon-mailbox.svg', events:'/images/svgs/icon-favorites.svg',
  payroll:'/images/svgs/icon-speech-bubble.svg', reports:'/images/svgs/icon-connect.svg',
  product:'/images/backgrounds/piggy.png',
  avatar1:'/images/profile/user-1.jpg', avatar2:'/images/profile/user-2.jpg',
  avatar3:'/images/profile/user-3.jpg', avatar4:'/images/profile/user-4.jpg',
  font:'/_next/static/media/fba5a26ea33df6a3.p.1bbdebe6.woff2',
  lucide:'https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js'
};
(async()=>{
  fs.mkdirSync('work/assets',{recursive:true});
  for (const [name, resource] of Object.entries(files)) {
    const url=resource.startsWith('http')?resource:base+resource;
    const response=await fetch(url);
    if(!response.ok)throw new Error(`${name}: ${response.status}`);
    fs.writeFileSync(path.join('work/assets',name),Buffer.from(await response.arrayBuffer()));
    console.log(name);
  }
})();
