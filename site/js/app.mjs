import {call,endpoint} from './api.mjs';
import {get,set,clear} from './storage.mjs';
import {parseStatement,importPayload,cachedPreview,applyCategories} from './import.mjs';
import {navigation,pages,settingsView,dashboardView,transactionsView,budgetView,importView,loansView} from './view.mjs';

const $=(selector,root=document)=>root.querySelector(selector);
const app=$('#app');
const now=new Date();
const monthString=(year,month)=>year+'-'+String(month).padStart(2,'0');
const dateOnly=date=>date.toISOString().slice(0,10);
const calendarDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const state={
  settings:null,snapshot:null,queue:[],syncing:false,preview:null,
  period:{mode:'month',year:Number(calendarDate.slice(0,4)),month:Number(calendarDate.slice(5,7)),quarter:Math.ceil(Number(calendarDate.slice(5,7))/3),week:1,from:calendarDate,to:calendarDate},
  budgetMonth:calendarDate.slice(0,7),page:'dashboard'
};
let timer;
let lastChange=0;
const uid=()=>crypto.randomUUID();
const values=form=>Object.fromEntries(new FormData(form));
const standalone=matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const safari=/iPhone|iPod/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);

function message(text,error=false) {
  const box=$('#notice');
  clearTimeout(timer);
  box.textContent=text;
  box.classList.toggle('error',error);
  box.hidden=false;
  timer=setTimeout(()=>box.hidden=true,8000);
}
function status() {
  const count=state.queue.length;
  $('#sync-status').textContent=state.syncing?'Обновление…':count?`В очереди: ${count}`:!navigator.onLine?'Офлайн':state.syncError?'Нет связи':state.snapshot?'Обновлено':'';
  $('#refresh').disabled=state.syncing || !state.settings;
}
function page() {
  if (!state.settings) return 'settings';
  const hash=location.hash.slice(1);
  return pages.some(([id])=>id===hash)||hash==='settings'?hash:'dashboard';
}
function render() {
  const panel=$('#category-rules',app);
  if (panel) state.directoryOpen=panel.open;
  state.page=page();
  const nav=$('#nav');
  nav.hidden=!state.settings;
  if (state.settings) nav.innerHTML=navigation(state.page);
  const views={
    dashboard:()=>dashboardView(state),
    transactions:()=>transactionsView(state.snapshot),
    budget:()=>budgetView(state.snapshot,state.budgetMonth),
    loans:()=>loansView(state),
    import:()=>importView(state),
    settings:()=>settingsView(state.settings,safari&&!standalone,state.queue)
  };
  app.innerHTML=views[state.page]();
  status();
}
function dates(p) {
  let first;
  let last;
  const y=Number(p.year);
  if (p.mode==='custom') return {year:y,month:Number(p.month),from:p.from,to:p.to};
  const m=p.mode==='year'?1:p.mode==='quarter'?(Number(p.quarter)-1)*3+1:Number(p.month);
  if (p.mode==='week') {
    const jan4=new Date(Date.UTC(y,0,4));
    first=new Date(+jan4-((jan4.getUTCDay()+6)%7)*86400000+(Number(p.week)-1)*7*86400000);
    last=new Date(+first+6*86400000);
  } else {
    first=new Date(Date.UTC(y,m-1,1));
    last=new Date(Date.UTC(y,p.mode==='year'?12:p.mode==='quarter'?m+2:m,0));
  }
  return {year:y,month:Number(p.month),from:dateOnly(first),to:dateOnly(last)};
}
function budgetPeriod() {
  const [year,month]=state.budgetMonth.split('-').map(Number);
  return {year,month};
}
async function sync(interactive=false) {
  if (!state.settings || state.syncing) return;
  if (!navigator.onLine) {
    if (interactive) message('Офлайн. Показаны последние сохранённые данные.');
    return;
  }
  state.syncing=true;
  state.syncError=false;
  status();
  let conflicts=0;
  let lastResult;
  let pulled=false;
  let ruleSaved=false;
  let rulesAction;
  try {
    while(state.queue.length) {
      const item=state.queue[0];
      rulesAction=/^(rules|directory)\./.test(item.action) ? item.action : null;
      try {
        lastResult=await call(state.settings,item.action,item.data,item.change);
      } catch (error) {
        if (['NETWORK','BUSY','UNAUTHORIZED','BAD_RESPONSE','SERVER_ERROR'].includes(error.code)) throw error;
        item.error=error.message;
        await set('queue',state.queue);
        throw Error(`Изменение в очереди отклонено. ${error.message} Его можно удалить в настройках.`);
      }
      if (lastResult?.conflict) conflicts++;
      if (rulesAction && lastResult?.applied !== false) {
        ruleSaved ||= rulesAction==='rules.save';
        state.rulesNotice=rulesAction==='rules.save'?'Правило сохранено.':rulesAction==='directory.delete'?'Подкатегория удалена.':'Подкатегория сохранена.';
        state.rulesError=false;
      }
      if (item.action==='import.commit' && !lastResult?.replayed) message(`Добавлено: ${lastResult.added}. Дубликатов: ${lastResult.duplicates}. Привязано: ${lastResult.matched}.`);
      state.queue.shift();
      await set('queue',state.queue);
    }
    const range=dates(state.period);
    const data=await call(state.settings,'sync.pull',{...range,budget:budgetPeriod()});
    state.snapshot=data;
    if (state.preview) {
      const before=state.preview.rows;
      const after=applyCategories(before,data);
      const changed=after.filter((row,i)=>row.directoryId!==before[i].directoryId).length;
      if (changed) {
        state.preview.rows=after;
        await updatePreview();
      }
      if (ruleSaved) state.rulesNotice+=' Строк с обновлённой категорией в предпросмотре: '+changed+'.';
    }
    pulled=true;
    state.syncedAt=Date.now();
    await set('snapshot',data);
    await set('syncedAt',state.syncedAt);
    if (conflicts) message(`Обнаружены конфликты: ${conflicts}. Показана последняя сохранённая правка.`);
    else if (interactive && !lastResult) message('Данные обновлены.');
  } catch (error) {
    state.syncError=true;
    if (rulesAction) {
      state.rulesNotice=error.message;
      state.rulesError=true;
    }
    message(error.message,true);
  } finally {
    state.syncing=false;
    render();
    if (pulled && state.queue.length) void sync();
  }
  return lastResult;
}
async function mutate(action,data,key) {
  const at=Math.max(Date.now(),lastChange+1);
  lastChange=at;
  state.queue.push({action,data,change:{id:uid(),at,base:state.syncedAt||0,key:key||uid()}});
  await set('queue',state.queue);
  if (!navigator.onLine) {
    if (/^(rules|directory)\./.test(action)) {
      state.rulesNotice='Изменение в очереди. Категории обновятся после подключения.';
      state.rulesError=false;
    }
    message('Изменение в очереди. Оно отправится при подключении.');
    status();
    return;
  }
  return sync();
}
async function updatePreview() {
  const preview=state.preview;
  if (!preview) return;
  const payload=importPayload(preview.rows);
  const attempt=(preview.attempt||0)+1;
  preview.attempt=attempt;
  const finish=summary=>{if (state.preview===preview && preview.attempt===attempt) preview.summary=summary;};
  preview.summary=null;
  if (!navigator.onLine) return finish(await cachedPreview(preview.rows,state.snapshot));
  try {
    const summary=await call(state.settings,'import.preview',payload);
    finish(summary);
  } catch(error) {
    finish(await cachedPreview(preview.rows,state.snapshot));
    message(error.message,true);
  }
}
async function loadFile(file) {
  if (!file) return;
  if (!state.snapshot) throw Error('Сначала обновите справочник из Google Таблицы.');
  message('Читаю выписку…');
  const result=await parseStatement(file,state.snapshot);
  state.preview={rows:result.transactions,rejected:result.rejected};
  await updatePreview();
  render();
}
async function loadSchedule(id) {
  const cached=state.snapshot?.schedule?.filter(row=>row.loanId===id) || [];
  state.schedule={id,rows:cached};
  if (navigator.onLine) state.schedule.rows=await call(state.settings,'loans.schedule',{id});
}
function download() {
  const snapshot=state.snapshot;
  if (!snapshot) throw Error('Сначала синхронизируйте данные.');
  return snapshot;
}
async function exportSnapshot(asXlsx) {
  const data=navigator.onLine?await call(state.settings,'backup.get'):download();
  const filename='personal-finance-'+calendarDate;
  if (asXlsx) {
    const wb=XLSX.utils.book_new();
    for (const [name,rows] of [['Транзакции',data.transactions],['Справочник',data.directory],['Правила',data.rules],['Бюджет',data.plans||data.budget?.rows],['Кредиты',data.loans],['График платежей',data.schedule],['Досрочные погашения',data.prepayments],['Привязки',data.links]]) {
      if (!rows) continue;
      XLSX.utils.book_append_sheet(wb,Array.isArray(rows[0])?XLSX.utils.aoa_to_sheet(rows):XLSX.utils.json_to_sheet(rows),name);
    }
    XLSX.writeFile(wb,filename+'.xlsx',{compression:true});
  } else {
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const link=document.createElement('a');
    link.href=url;
    link.download=filename+'.json';
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
}
const events={
  'confirm-import':async()=>{const payload=importPayload(state.preview.rows); state.preview=null; await mutate('import.commit',payload); render();},
  'cancel-import':()=>{state.preview=null; render();},
  'save-plan':async id=>{
    const field=app.querySelector(`[data-plan="${CSS.escape(id)}"]`);
    if (!field.reportValidity()||field.value==='') return;
    const period=budgetPeriod();
    await mutate('budget.savePlan',{...period,directoryId:id,amount:Number(field.value)},'budget:'+state.budgetMonth+':'+id);
  },
  'edit-directory':()=>{state.editedDirectory='';render();},
  'delete-directory':async id=>{
    if (!confirm('Удалить подкатегорию из списка выбора? История останется в транзакциях.')) return;
    state.editedDirectory='';
    await mutate('directory.delete',{id},'directory:'+id);
    render();
  },
  'edit-rule':()=>{state.editedRule='';render();},
  'edit-loan':id=>{state.editedLoan=id; state.loanKind=null; state.loanDraft=null; render(); $('#loan-form')?.scrollIntoView({block:'center'});},
  schedule:async id=>{await loadSchedule(id);render();},
  'save-early':async()=>{await mutate('loans.recordPrepayment',state.earlyData); state.earlyResult=null; state.earlyData=null; state.schedule=null; render();},
  'link-tx':async id=>{
    state.linkTx=state.snapshot.transactions.find(tx=>tx.id===id);
    state.linkLoan=state.snapshot.loans[0]?.id;
    if (state.linkLoan) await loadSchedule(state.linkLoan);
    location.hash='loans';
    render();
    $('#link-form')?.scrollIntoView({block:'center'});
  },
  'cancel-link':()=>{state.linkTx=null;state.schedule=null;render();},
  'export-json':()=>exportSnapshot(false),
  'export-xlsx':()=>exportSnapshot(true),
  'discard-change':async()=>{if (!state.queue[0]?.error || !confirm('Удалить отклонённое изменение из очереди?')) return;state.queue.shift();await set('queue',state.queue);await sync();render();},
  disconnect:async()=>{
    if (!confirm('Удалить подключение, локальный кэш и очередь изменений с этого устройства?')) return;
    await clear(); Object.assign(state,{settings:null,snapshot:null,queue:[],preview:null,earlyResult:null,earlyData:null,schedule:null,linkTx:null,syncedAt:0});render();
  }
};
const forms={
  connect:async data=>{
    const url=endpoint(data.url);
    const token=data.token.trim();
    if (!token) throw Error('Введите токен.');
    const settings={url,token};
    const check=await call(settings,'connection.check');
    const table=new URL(check.url);
    if (table.origin!=='https://docs.google.com') throw Error('API вернул неверный URL таблицы.');
    if (state.settings && state.settings.sheetUrl!==table.href) {
      if (state.queue.length) throw Error('Сначала синхронизируйте очередь текущей таблицы или отключите её в настройках.');
      await clear();state.snapshot=null;state.preview=null;state.schedule=null;state.linkTx=null;state.syncedAt=0;
    }
    state.settings={...settings,sheetUrl:table.href};
    await set('settings',state.settings);
    location.hash='dashboard';
    await sync();
    render();
  },
  period:async data=>{
    state.period={...state.period,...data};
    const range=dates(state.period);
    if (range.from>range.to) throw Error('Начало периода позже конца.');
    await set('period',state.period);
    await sync();render();
  },
  'budget-period':async data=>{state.budgetMonth=data.period;await set('budgetMonth',data.period);await sync();render();},
  'directory-form':async data=>{state.editedDirectory='';await mutate('directory.save',data,data.id?'directory:'+data.id:undefined);render();},
  'rule-form':async (data,form)=>{
    const pattern=data.pattern.trim();
    if (!pattern || !data.directoryId) throw Error('Введите фрагмент описания и выберите подкатегорию.');
    state.editedRule='';
    await mutate('rules.save',{...data,pattern,active:form.elements.namedItem('active').checked},'rule:'+(data.id||pattern.toLowerCase()));
    render();
  },
  'loan-form':async data=>{state.editedLoan='';state.loanKind=null;state.loanDraft=null;state.schedule=null;await mutate('loans.save',data,data.id?'loan:'+data.id:undefined);render();},
  'early-form':async data=>{state.earlyData=data;state.earlyResult=await call(state.settings,'loans.previewPrepayment',data);render();},
  'link-form':async data=>{const id=state.linkTx.id;await mutate('loans.linkTransaction',{...data,transactionId:id},'tx:'+id);state.linkTx=null;state.schedule=null;render();}
};
async function run(button,task) {
  if (button) button.disabled=true;
  try { await task(); }
  catch(error) { message(error.message,true); }
  finally { if (button) button.disabled=false; }
}
app.addEventListener('submit',event=>{
  event.preventDefault();
  const form=event.target;
  // A named form field can shadow form.id. Read the HTML attribute directly.
  const submit=forms[form.getAttribute('id')];
  if (submit) void run(event.submitter,()=>submit(values(form),form));
});
app.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');
  if (button && events[button.dataset.action]) void run(button,()=>events[button.dataset.action](button.dataset.id));
});
app.addEventListener('input',event=>{
  const {target}=event;
  if (target.dataset.pattern!==undefined && state.preview) state.preview.rows[Number(target.dataset.pattern)].pattern=target.value;
});
app.addEventListener('change',event=>void run(null,async()=>{
  const {target}=event;
  if (target.id==='statement') await loadFile(target.files[0]);
  if (target.form?.getAttribute('id')==='period' && target.name==='mode') {state.period={...state.period,...values(target.form)};render();}
  if (target.form?.getAttribute('id')==='loan-form' && target.name==='kind') {state.loanDraft=values(target.form);state.loanKind=target.value;render();}
  if (target.form?.getAttribute('id')==='link-form' && target.name==='loanId') {state.linkLoan=target.value;await loadSchedule(state.linkLoan);render();}
  if (target.id==='edit-directory' || target.id==='edit-rule') {state[target.id==='edit-directory'?'editedDirectory':'editedRule']=target.value;render();}
  if (target.dataset.preview!==undefined) {
    const row=state.preview.rows[Number(target.dataset.preview)];
    Object.assign(row,{directoryId:target.value,edited:true,remember:Boolean(target.value),pattern:row.description.split(' · ')[0].slice(0,150)});
    await updatePreview();render();
  }
  if (target.dataset.remember!==undefined) state.preview.rows[Number(target.dataset.remember)].remember=target.checked;
  if (target.dataset.tx) {
    const id=target.dataset.tx;
    const directoryId=target.value;
    const tx=state.snapshot.transactions.find(item=>item.id===id);
    const item=state.snapshot.directory.find(item=>item.id===directoryId);
    const rule=directoryId && confirm('Запомнить категорию как правило для этого описания?') ? {pattern:tx.description.split(' · ')[0].slice(0,150)} : undefined;
    Object.assign(tx,{category:item?.category||'',subcategory:item?.subcategory||''});
    await mutate('transactions.updateCategory',{id,directoryId,rule},'tx:'+id);
  }
}));
for(const type of ['dragover','dragleave','drop']) app.addEventListener(type,event=>{
  const drop=event.target.closest('#drop');
  if (!drop) return;
  event.preventDefault();
  drop.classList.toggle('over',type==='dragover');
  if(type==='drop') void run(null,()=>loadFile(event.dataTransfer.files[0]));
});
$('#refresh').addEventListener('click',()=>void sync(true));
$('#settings').addEventListener('click',()=>location.hash='settings');
window.addEventListener('hashchange',()=>{render();window.scrollTo(0,0);});
window.addEventListener('online',()=>void sync());
window.addEventListener('offline',status);
document.addEventListener('visibilitychange',()=>{if (!document.hidden&&state.queue.length) void sync();});
try {
  const [settings,snapshot,queue,period,budgetMonth,syncedAt]=await Promise.all(['settings','snapshot','queue','period','budgetMonth','syncedAt'].map(get));
  Object.assign(state,{settings,snapshot,queue:queue||[],period:period||state.period,budgetMonth:budgetMonth||state.budgetMonth,syncedAt});
  lastChange=Math.max(0,...state.queue.map(item=>item.change.at));
} catch(error) {message('Локальное хранилище недоступно. Проверьте настройки Safari.',true);}
render();
if (state.settings) void sync();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>message('Офлайн-оболочка пока недоступна.',true));
