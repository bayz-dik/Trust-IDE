import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
async function port(){
  const s=net.createServer();
  await new Promise(r=>s.listen(0,'127.0.0.1',r));
  const p=s.address().port;
  await new Promise(r=>s.close(r));
  return p;
}
test('Trust IDE HTTP smoke: auth, UI, files, validation',async t=>{
  const p=await port(),url='http://127.0.0.1:'+p;
  const child=spawn(process.execPath,['server/index.js'],{cwd:root,env:{...process.env,PORT:String(p)}});
  let printed='',token='';
  child.stdout.on('data',b=>{printed+=b.toString();const m=printed.match(/Trust IDE login token: ([a-f0-9]+)/);if(m)token=m[1]});
  let stderr='';
  child.stderr.on('data',b=>{stderr+=b.toString()});
  t.after(()=>child.kill('SIGTERM'));
  let ready=false;
  for(let i=0;i<100;i++){
    if(child.exitCode!==null)throw Error('Server died: '+stderr);
    if(token){try{const r=await fetch(url+'/health');if(r.ok){ready=true;break}}catch{}}
    await new Promise(r=>setTimeout(r,60));
  }
  assert.ok(ready,'Server should start and print a login token');
  const get=async p=>fetch(url+p);
  let res=await get('/');
  assert.equal(res.status,200);
  assert.match(await res.text(),/Trust IDE/);
  res=await fetch(url+'/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:'wrong'})});
  assert.equal(res.status,401);
  res=await fetch(url+'/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})});
  assert.equal(res.status,200);
  const cookie=res.headers.get('set-cookie').split(';')[0];
  const authorized=(p,opt={})=>fetch(url+p,{...opt,headers:{cookie,...opt.headers}});
  res=await authorized('/');
  assert.equal(res.status,200);
  assert.match(await res.text(),/AI-powered development workspace/);
  res=await authorized('/api/tree');
  assert.equal(res.status,200);
  const tree=await res.json();
  assert.ok(tree.entries.some(e=>e.path==='index.html'));
  res=await authorized('/api/file?path=index.html');
  const content=(await res.json()).content;
  assert.match(content,/Hello, Trust IDE/);
  res=await authorized('/api/new',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:'test-create.txt'})});
  assert.equal(res.status,201);
  t.after(()=>fs.rmSync(path.join(root,'workspace','test-create.txt'),{force:true}));
  res=await authorized('/api/file',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({path:'test-create.txt',content:'saved via mobile editor'})});
  assert.equal(res.status,200);
  res=await authorized('/api/file?path=test-create.txt');
  assert.equal((await res.json()).content,'saved via mobile editor');
  res=await authorized('/api/file?path=../README.md');
  assert.equal(res.status,400);
  res=await authorized('/api/status');
  const status=await res.json();
  assert.equal(typeof status.agents.codex.installed,'boolean');
  assert.equal(typeof status.agents.omp.installed,'boolean');
  res=await authorized('/api/build',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(res.status,400);
});
