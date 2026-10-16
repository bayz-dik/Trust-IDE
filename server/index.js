import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AgentCoordinator } from './agents.js';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work=path.join(root,'workspace');
fs.mkdirSync(work,{recursive:true});
const token=process.env.TRUST_IDE_TOKEN||crypto.randomBytes(24).toString('hex');
const events=[];let seq=0;
function log(msg){const message=String(msg).replace(/\x1b\[[0-9;]*m/g,'').slice(0,1600);events.push({seq:++seq,time:new Date().toISOString(),message});if(events.length>180)events.shift();console.log('[Trust IDE]',message.slice(0,150))}
const agents=new AgentCoordinator(work,log);
const serverPort=Number(process.env.PORT||3000);
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value))}
function html(res,body){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});res.end(body)}
async function readJSON(req){let s='';for await(const b of req){s+=b;if(s.length>400000)throw Error('Request payload too large')}let parsed;try{parsed=JSON.parse(s||'{}')}catch{throw Error('Invalid JSON')};return parsed}
function userPath(input,{create=false}={}){
  if(typeof input!=='string'||!input.trim()||input.length>350)throw Error('Invalid file path');
  if(input.includes('\0')||input.includes('\\')||path.isAbsolute(input))throw Error('Only relative paths are supported');
  const parts=input.split('/');
  if(parts.some(part=>!part||part==='.'||part==='..'||part==='.git'||part==='.trust'||part==='node_modules'))throw Error('Forbidden path segment');
  const file=path.resolve(work,input);
  if(!file.startsWith(work+path.sep))throw Error('Path escapes workspace');
  let parent=work;
  for(let i=0;i<parts.length;i++){
    parent=path.join(parent,parts[i]);
    try{const s=fs.lstatSync(parent);if(s.isSymbolicLink())throw Error('Symlink paths are not allowed');if(i!==parts.length-1&&!s.isDirectory())throw Error('Parent is not a directory')}
    catch(e){if(e.code==='ENOENT'){if(!create&&i<parts.length-1)throw Error('Missing directory')}else throw e}
  }
  return file;
}
function listing(){
  const result=[],exclude=new Set(['.git','node_modules','.gradle','.idea','.trust','build','.next','dist']);
  function walk(dir,depth=0){
    if(depth>7||result.length>480)return;
    for(const f of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>Number(b.isDirectory())-Number(a.isDirectory())||a.name.localeCompare(b.name))){
      if(exclude.has(f.name)||f.isSymbolicLink())continue;
      const target=path.join(dir,f.name);
      const rel=path.relative(work,target).split(path.sep).join('/');
      result.push({name:f.name,path:rel,dir:f.isDirectory(),depth});
      if(f.isDirectory())walk(target,depth+1);
    }
  }
  walk(work);return result;
}
function authorized(req){const cookie=req.headers.cookie||'';return cookie.split(';').some(part=>part.trim()==='trust='+token)}
function originSafe(req){if(!['POST','PUT','PATCH','DELETE'].includes(req.method))return true;const origin=req.headers.origin; if(!origin)return true;try{const o=new URL(origin);return o.host===req.headers.host}catch{return false}}
const loginHtml='<!doctype html><html lang="id"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b101c"><title>Trust IDE Login</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b101c;color:white;font:15px system-ui}main{width:min(90vw,400px);padding:30px;background:#121c2e;border:1px solid #283449;border-radius:20px}h1{margin-top:4px}p{color:#9eabc1;line-height:1.6}input,button{width:100%;padding:13px;margin-top:12px;box-sizing:border-box;border-radius:10px;font:inherit}input{background:#0b101c;border:1px solid #4b5973;color:white}button{background:#7d60d9;color:white;border:0}small{color:#e49da8}</style><main><h1>✦ Trust IDE</h1><p>Masukkan token yang terlihat di terminal Codespaces saat menjalankan <code>npm start</code>.</p><input type="password" id="key" placeholder="Server login token" autocomplete="off"><button id="go">Open Workspace</button><p><small id="error"></small></p><script>document.getElementById("go").onclick=async()=>{let r=await fetch("/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token:document.getElementById("key").value})});if(r.ok)location.href="/";else document.getElementById("error").textContent="Token tidak cocok."}</script></main></html>';
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/health'&&req.method==='GET')return json(res,200,{ok:true});
    if(!originSafe(req))return json(res,403,{error:'Cross-origin request rejected'});
    if(url.pathname==='/login'&&req.method==='POST'){
      const b=await readJSON(req);
      if(typeof b.token!=='string'||b.token!==token)return json(res,401,{error:'Wrong login token'});
      res.setHeader('Set-Cookie','trust='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400');
      return json(res,200,{ok:true});
    }
    if(!authorized(req)){if(url.pathname==='/'&&req.method==='GET')return html(res,loginHtml);return json(res,401,{error:'Login required'})}
    if(url.pathname==='/'&&req.method==='GET')return html(res,fs.readFileSync(path.join(root,'public','index.html'),'utf8'));
    if(url.pathname==='/api/status'&&req.method==='GET')return json(res,200,{busy:agents.running,active:agents.active?.mode||agents.active?.kind||null,agents:agents.availability(),events});
    if(url.pathname==='/api/tree'&&req.method==='GET')return json(res,200,{entries:listing()});
    if(url.pathname==='/api/file'&&req.method==='GET'){
      const file=userPath(url.searchParams.get('path'));
      if(!fs.statSync(file).isFile())throw Error('Not a file');
      if(fs.statSync(file).size>1_000_000)throw Error('File too large for web editor');
      return json(res,200,{content:fs.readFileSync(file,'utf8')});
    }
    if(url.pathname==='/api/file'&&req.method==='PUT'){
      const b=await readJSON(req),file=userPath(b.path);
      if(typeof b.content!=='string'||b.content.length>1_000_000)throw Error('File content too large');
      if(!fs.existsSync(file))throw Error('File not found: '+b.path);
      if(!fs.statSync(file).isFile())throw Error('Target is not a file');
      fs.writeFileSync(file,b.content,'utf8');
      log('Saved '+b.path);return json(res,200,{ok:true});
    }
    if(url.pathname==='/api/new'&&req.method==='POST'){
      const b=await readJSON(req),file=userPath(b.path,{create:true});
      if(fs.existsSync(file))throw Error('File already exists');
      fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'','utf8');
      log('Created '+b.path);return json(res,201,{ok:true});
    }
    if(url.pathname==='/api/run'&&req.method==='POST'){
      const b=await readJSON(req);
      if(typeof b.prompt!=='string'||!b.prompt.trim()||b.prompt.length>8000)throw Error('Enter an instruction (max 8000 chars)');
      if(agents.running)return json(res,409,{error:'Another job is running'});
      if(!['omp','codex','fusion'].includes(b.agent))throw Error('Choose OMP, Codex, or Fusion');
      const required=b.agent==='fusion'?['omp','codex']:[b.agent];
      const missing=required.filter(n=>!agents.installed(n));
      if(missing.length)throw Error(missing.join(' & ').toUpperCase()+' not installed in Codespaces');
      void agents.run(b.agent,b.prompt.trim());
      return json(res,202,{started:true,mode:b.agent});
    }
    if(url.pathname==='/api/build'&&req.method==='POST'){
      if(agents.running)return json(res,409,{error:'Another job is running'});
      if(!fs.existsSync(path.join(work,'gradlew')))throw Error('No Android Gradle project at workspace/gradlew');
      void agents.build();return json(res,202,{started:true});
    }
    if(url.pathname==='/api/stop'&&req.method==='POST')return json(res,200,{stopping:agents.stop()});
    return json(res,404,{error:'Not found'});
  }catch(e){return json(res,e.code==='ENOENT'?404:400,{error:e.message})}
});
server.listen(serverPort,'127.0.0.1',()=>{console.log('Trust IDE Mobile running on http://127.0.0.1:'+serverPort);console.log('Trust IDE login token: '+token);log('Server ready on port '+serverPort)});
