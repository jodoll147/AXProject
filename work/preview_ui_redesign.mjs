import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
const design = new URL('../outputs/조선_AX_화면_재설계.html', import.meta.url);
createServer((req,res)=>{
  if(req.method!=='GET'||req.url!=='/'){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(readFileSync(design));
}).listen(5303,'127.0.0.1',()=>console.log('UI redesign: http://127.0.0.1:5303/'));
