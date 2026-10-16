import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';

export class AgentCoordinator {
  constructor(work, emit) {
    this.work = work;
    this.emit = emit;
    this.running = false;
    this.active = null;
    this.proc = {};
    this.req = 0;
    this.sessionRoot = path.join(os.homedir(), '.trust-ide');
    fs.mkdirSync(this.sessionRoot, {recursive:true, mode:0o700});
    fs.mkdirSync(path.join(this.sessionRoot,'omp'), {recursive:true,mode:0o700});
    this.threadPath = path.join(this.sessionRoot, 'codex-thread.json');
    this.thread = null;
    try {this.thread = JSON.parse(fs.readFileSync(this.threadPath,'utf8')).id} catch {}
  }
  installed(name){try{return spawnSync('which',[name],{timeout:2500}).status===0}catch{return false}}
  availability(){return {omp:{installed:this.installed('omp')},codex:{installed:this.installed('codex')}}}
  _start(name,args,protocol){
    const child=spawn(name,args,{cwd:this.work,env:process.env,stdio:['pipe','pipe','pipe']});
    const state={child,protocol,pending:new Map(),waiting:null,turnId:null,thread:this.thread,initialized:false,lines:0,ready:false};
    child.on('error',e=>{this.emit('Agent '+name+' unavailable: '+e.message);this._fail(state,e)});
    child.on('exit',code=>{this.emit(name+' process exited (code '+code+')');this._fail(state,new Error(name+' exited: '+code));if(this.proc[protocol]===state)delete this.proc[protocol]});
    readline.createInterface({input:child.stdout}).on('line',line=>{
      let m;try{m=JSON.parse(line)}catch{this.emit(name+': '+line.slice(0,600));return}
      this._frame(state,m);
    });
    readline.createInterface({input:child.stderr}).on('line',line=>{
      // Avoid forwarding lines likely to contain authentication secrets.
      if(!/api[_ -]?key|access[_ -]?token|authorization:|bearer /i.test(line))this.emit(name+' stderr: '+line.slice(0,550));
    });
    this.proc[protocol]=state;
    return state;
  }
  _fail(s,err){for(const p of s.pending.values())p.reject(err);s.pending.clear();if(s.waiting){s.waiting.reject(err);s.waiting=null}}
  _frame(s,m){
    if(s.protocol==='omp'){
      if(m.type==='ready')s.ready=true;
      if(m.type==='response'&&m.id&&s.pending.has(String(m.id))){
        const p=s.pending.get(String(m.id));s.pending.delete(String(m.id));
        if(m.success===false)p.reject(new Error(m.error?.message||JSON.stringify(m.error)||'OMP request failed'));else p.resolve(m);
      }
      if(m.type==='message_update'&&m.assistantMessageEvent?.type==='text_delta'){
        this._delta(s,m.assistantMessageEvent.delta);
      }
      if(m.type==='prompt_result'&&s.waiting){
        const wait=s.waiting;s.waiting=null;
        if(m.status==='completed')wait.resolve(m);else wait.reject(new Error('OMP turn '+m.status));
      }
    }else{
      if(m.id!==undefined&&s.pending.has(String(m.id))){
        const p=s.pending.get(String(m.id));s.pending.delete(String(m.id));
        if(m.error)p.reject(new Error(m.error.message||JSON.stringify(m.error)));else p.resolve(m.result||{});
      }
      if(m.method==='item/agentMessage/delta'&&m.params?.delta)this._delta(s,m.params.delta);
      if(m.method==='turn/started'&&m.params?.turn?.id)s.turnId=m.params.turn.id;
      if(m.method==='turn/completed'&&s.waiting){
        const wait=s.waiting;s.waiting=null;
        if(m.params?.turn?.status==='completed')wait.resolve(m.params);else wait.reject(new Error('Codex turn '+(m.params?.turn?.status||'failed')));
      }
      // For an unhandled approval, do not silently auto-approve.
      if(m.method&&/requestApproval|elicitation/.test(m.method)){
        this.emit('Codex requested approval; refusing unattended approval.');
        this._send(s,{id:m.id,result:{decision:'decline',action:'decline'}});
      }
    }
  }
  _delta(s,d){
    if(!d)return;
    s.buffer=(s.buffer||'')+d;
    if(s.buffer.length>700){this.emit(s.protocol.toUpperCase()+': '+s.buffer.slice(0,700));s.buffer=s.buffer.slice(700)}
  }
  _flush(s){if(s.buffer){this.emit(s.protocol.toUpperCase()+': '+s.buffer.slice(0,700));s.buffer=''}}
  _send(s,obj){
    if(!s.child||s.child.exitCode!==null||s.child.stdin.destroyed)throw new Error(s.protocol+' process not running');
    s.child.stdin.write(JSON.stringify(obj)+'\n');
  }
  _request(s,payload,timeout=15000){
    const id=String(++this.req);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{s.pending.delete(id);reject(new Error(s.protocol+' request timed out'))},timeout);
      s.pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});
      try{this._send(s,{id,...payload})}catch(e){s.pending.delete(id);clearTimeout(timer);reject(e)}
    })
  }
  async _omp(){
    let s=this.proc.omp;if(s&&s.child.exitCode===null)return s;
    s=this._start('omp',['--mode','rpc','--session-dir',path.join(this.sessionRoot,'omp')],'omp');
    for(let i=0;i<70&&!s.ready;i++){if(s.child.exitCode!==null)throw Error('OMP stopped during startup');await new Promise(r=>setTimeout(r,100))}
    if(!s.ready)throw Error('OMP RPC startup timed out');
    await this._request(s,{type:'open_session',sessionDir:path.join(this.sessionRoot,'omp')});
    this.emit('OMP persistent RPC session ready');
    return s;
  }
  async _codex(){
    let s=this.proc.codex;if(s&&s.child.exitCode===null&&s.initialized)return s;
    s=this._start('codex',['app-server','--stdio'],'codex');
    await this._request(s,{method:'initialize',params:{clientInfo:{name:'trust_ide_mobile',title:'Trust IDE Mobile',version:'0.2.0'},capabilities:{experimentalApi:false}}},30000);
    this._send(s,{method:'initialized',params:{}});
    try{
      const result=s.thread?await this._request(s,{method:'thread/resume',params:{threadId:s.thread,excludeTurns:true,cwd:this.work,sandbox:'workspace-write',approvalPolicy:'never'}},30000):null;
      if(result){this.emit('Codex resumed persistent thread '+s.thread)}
      else throw Error('New thread required');
    }catch(e){
      const t=await this._request(s,{method:'thread/start',params:{cwd:this.work,sandbox:'workspace-write',approvalPolicy:'never'}},30000);
      s.thread=t.thread?.id;
      if(!s.thread)throw Error('Codex thread/start did not return a thread ID');
      fs.writeFileSync(this.threadPath,JSON.stringify({id:s.thread}),{mode:0o600});
      this.emit('Codex thread started '+s.thread);
    }
    s.initialized=true;return s;
  }
  async _turn(s,payload,completionMs=12*60*1000){
    if(s.waiting)throw Error('Agent already processing a turn');
    let timeout;
    const finished=new Promise((resolve,reject)=>{timeout=setTimeout(()=>{s.waiting=null;reject(Error('Agent turn timeout after 12 minutes'))},completionMs);s.waiting={resolve:v=>{clearTimeout(timeout);resolve(v)},reject:e=>{clearTimeout(timeout);reject(e)}}});
    try{
      if(s.protocol==='omp')await this._request(s,{type:'prompt',message:payload},30000);
      else await this._request(s,{method:'turn/start',params:{threadId:s.thread,input:[{type:'text',text:payload}]}},30000);
      await finished;
      this._flush(s);
    }catch(e){
      if(s.waiting){s.waiting=null;clearTimeout(timeout)}
      this._flush(s);
      throw e;
    }
  }
  async run(mode,prompt){
    if(this.running)throw Error('Another agent/build task is running');
    if(!['omp','codex','fusion'].includes(mode))throw Error('Unknown agent mode');
    for(const n of(mode==='fusion'?['omp','codex']:[mode]))if(!this.installed(n))throw Error(n.toUpperCase()+' CLI is not installed in Codespaces');
    this.running=true;this.active={mode,kind:'agent'};
    this.emit('Starting '+mode.toUpperCase()+' task');
    try{
      if(mode==='omp'||mode==='fusion'){const s=await this._omp();await this._turn(s,prompt);this.emit('OMP implementation completed')}
      if(mode==='codex'||mode==='fusion'){
        const s=await this._codex();
        const task=mode==='fusion'?'Review the workspace changes for this task, fix any clear issues, and run relevant checks where available. Original task: '+prompt:prompt;
        await this._turn(s,task);this.emit('Codex turn completed');
      }
      this.emit(mode.toUpperCase()+' job finished successfully');
    }catch(e){this.emit('ERROR: '+e.message)}
    finally{this.active=null;this.running=false}
  }
  async build(){
    if(this.running)throw Error('Another agent/build task is running');
    const gradle=path.join(this.work,'gradlew');
    if(!fs.existsSync(gradle))throw Error('Missing workspace/gradlew — add a complete Android Gradle project first');
    this.running=true;this.active={kind:'build'};
    try{
      this.emit('Running ./gradlew assembleDebug');
      const p=spawn('bash',['./gradlew','assembleDebug'],{cwd:this.work,env:process.env});
      this.active.proc=p;
      const stream=(src,prefix)=>readline.createInterface({input:src}).on('line',line=>this.emit(prefix+line.slice(0,750)));
      stream(p.stdout,'BUILD: ');stream(p.stderr,'BUILD stderr: ');
      const exit=await new Promise((resolve,reject)=>{p.once('error',reject);p.once('close',resolve)});
      this.emit(exit===0?'APK build succeeded. Check app/build/outputs/apk/debug':'APK build failed (exit '+exit+')');
    }catch(e){this.emit('BUILD ERROR: '+e.message)}
    finally{this.running=false;this.active=null}
  }
  stop(){
    if(!this.running)return false;
    const a=this.active;
    if(a?.kind==='build'){a.proc?.kill('SIGTERM');this.emit('Build stop requested');return true}
    const s=this.proc[a?.mode==='codex'?'codex':'omp'];
    if(!s)return false;
    if(s.protocol==='omp')this._send(s,{id:'cancel_'+(++this.req),type:'abort'});
    else if(s.turnId&&s.thread)this._send(s,{id:'cancel_'+(++this.req),method:'turn/interrupt',params:{threadId:s.thread,turnId:s.turnId}});
    else s.child.kill('SIGTERM');
    this.emit('Agent stop requested');return true;
  }
}
