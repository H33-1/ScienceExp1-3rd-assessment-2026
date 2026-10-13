import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const allowed=new Set(['index.html','styles.css','app.js']);
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;const name=pathname==='/'?'index.html':pathname.slice(1);if(!allowed.has(name)){res.writeHead(404);res.end('Not found');return;}res.setHeader('Content-Type',({'index.html':'text/html','styles.css':'text/css','app.js':'text/javascript'})[name]+'; charset=utf-8');res.end(fs.readFileSync(path.join(root,name)));});
server.listen(8765,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:8765'));
