import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work=path.join(root,'workspace');fs.mkdirSync(work,{recursive:true});
const token=process.env.TRUST_IDE_TOKEN||crypto.randomBytes(24).toString('hex');
const escapePath=p=>{const f=path.resolve(work,p||'');if(f!==work&&!f.startsWith(work+path.sep))throw Error('Invalid path');return f};
let busy=false;const events=[];
const log=s=>{events.push(String(s).slice(-4000));if(events.length>200)events.shift()};
const json=(r,code,v)=>{r.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});r.end(JSON.stringify(v))};
async function body(q){let t='';for await(const ch of q){t+=ch;if(t.length>300000)throw Error('Request too long')}return JSON.parse(t||'{}')}
async function execute(command,args){if(busy)throw Error('Job already running');busy=true;log('Starting '+command);return new Promise(resolve=>{const p=spawn(command,args,{cwd:work,env:process.env});for(const s of[p.stdout,p.stderr])s.on('data',b=>log(b.toString()));p.on('error',e=>{log(e.message);busy=false;resolve(-1)});p.on('close',c=>{log('Exit: '+c);busy=false;resolve(c)})})}
const server=http.createServer(async(q,r)=>{try{const u=new URL(q.url,'http://localhost');if(u.pathname==='/health')return json(r,200,{ok:true});if(u.pathname==='/login'&&q.method==='POST'){const b=await body(q);if(b.token!==token)return json(r,401,{error:'Invalid token'});r.setHeader('Set-Cookie','trust='+token+'; HttpOnly; SameSite=Strict; Path=/');return json(r,200,{ok:true})}if(!((q.headers.cookie||'').split(';').some(c=>c.trim()==='trust='+token))) {if(u.pathname==='/'&&q.method==='GET'){r.writeHead(200,{'Content-Type':'text/html'});return r.end('<meta name="viewport" content="width=device-width,initial-scale=1"><title>Trust IDE</title><h2>Trust IDE Mobile</h2><input id="key" type="password" placeholder="Server login token"><button onclick="fetch(\'/login\',{method:\'POST\',headers:{\'content-type\':\'application/json\'},body:JSON.stringify({token:key.value})}).then(()=>location.reload())">Login</button>')}return json(r,401,{error:'Login required'})}
if(u.pathname==='/api/status')return json(r,200,{busy,events:events.slice(-40)});if(u.pathname==='/api/files')return json(r,200,{entries:fs.readdirSync(work,{withFileTypes:true}).map(x=>({name:x.name,dir:x.isDirectory()}))});if(u.pathname==='/api/file'&&q.method==='GET')return json(r,200,{content:fs.readFileSync(escapePath(u.searchParams.get('path')),'utf8')});if(u.pathname==='/api/file'&&q.method==='PUT'){const b=await body(q);fs.writeFileSync(escapePath(b.path),String(b.content));return json(r,200,{ok:true})}if(u.pathname==='/api/run'&&q.method==='POST'){const b=await body(q);if(!['omp','codex'].includes(b.agent))throw Error('Unknown agent');if(!b.prompt||typeof b.prompt!=='string')throw Error('Missing prompt');if(busy)return json(r,409,{error:'Busy'});void execute(b.agent,b.agent==='omp'?['--prompt',b.prompt]:['exec',b.prompt]);return json(r,202,{started:true})}
if(u.pathname==='/api/build'&&q.method==='POST'){if(busy)return json(r,409,{error:'Busy'});void execute('bash',['./gradlew','assembleDebug']);return json(r,202,{started:true})}
if(u.pathname==='/'&&q.method==='GET'){r.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"});return r.end(fs.readFileSync(path.join(root,'public/index.html')))}return json(r,404,{error:'Not found'});}catch(e){json(r,400,{error:e.message})}});
server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('Trust IDE port 3000. Login token:',token));
