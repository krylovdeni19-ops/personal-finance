import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {parseFile,parseDate} from '../site/js/parsers/statements.mjs';
import {categorize} from '../site/js/categorization.mjs';

const root=new URL('../',import.meta.url);
const require=createRequire(import.meta.url);
globalThis.Papa=require('../site/vendor/papaparse.min.js');
globalThis.XLSX=require('../site/vendor/xlsx.full.min.js');
const csv=await readFile(new URL('fixtures/alfa-demo.csv',root));
const file=(contents,name)=>new File([contents],name);
const {transactions,rejected}=await parseFile(file(csv,'alfa-demo.csv'));
assert.equal(transactions.length,25);
assert.deepEqual(rejected,[]);
assert.equal(transactions.find(tx=>tx.description.startsWith('Платёж по кредиту')).amount,36152.40);
assert.equal(transactions.find(tx=>tx.description.startsWith('Выдача кредита')).type,'Пополнение');
assert.equal(parseDate('31.02.2026'),'');
const xlsx=XLSX.utils.book_new();
XLSX.utils.book_append_sheet(xlsx,XLSX.utils.aoa_to_sheet(Papa.parse(csv.toString(),{delimiter:';'}).data),'Выписка');
assert.deepEqual((await parseFile(file(XLSX.write(xlsx,{bookType:'xlsx',type:'array'}),'demo.xlsx'))).transactions,transactions);

const sources=await Promise.all(['Api','Setup','Loans','Reports','Directory','Transactions'].map(name=>readFile(new URL('apps-script/'+name+'.gs',root),'utf8')));
const output=[];
const context=vm.createContext({
  assert,transactions,categorize,console,Date,
  Utilities:{getUuid:()=> 'test',formatDate:d=>d.toISOString().slice(0,10),parseDate:d=>new Date(d),
    Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,text)=>[...require('node:crypto').createHash('sha256').update(text).digest()]},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:value=>({setMimeType:()=>JSON.parse(value)})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
  SpreadsheetApp:{flush(){}},
  output
});
vm.runInContext(sources.join('\n')+`
  const loan={id:'loan',principal:1000000,rate:18,months:36,issued:'2026-10-31',day:15,paymentType:'Аннуитетный'};
  const base=modelLoan(loan,[]);
  assert.equal(base[0].amount,36152.40);
  assert.equal(base[0].date,'2026-11-15');
  assert.equal(base.length,36);
  assert.equal(base.at(-1).balance,0);
  assert.equal(dueDate('2026-01-31',2,31),'2026-02-28');
  const event={id:'one',date:'2026-11-18',amount:50000,type:'Частичное',mode:'Уменьшить срок'};
  const shortened=modelLoan(loan,[event]);
  assert.ok(shortened.filter(x=>!x.event).length<36);
  assert.equal(shortened[1].balance,base[0].balance-50000);
  assert.ok(shortened.reduce((n,x)=>n+x.interest,0)<base.reduce((n,x)=>n+x.interest,0));
  const cheaper=modelLoan(loan,[{...event,mode:'Уменьшить платёж'}]);
  assert.equal(cheaper.filter(x=>!x.event).length,36);
  assert.ok(cheaper[2].amount<36152.4);
  const full=modelLoan(loan,[{...event,type:'Полное'}]);
  assert.equal(full.length,2);
  assert.equal(full.at(-1).balance,0);
  const diff=modelLoan({...loan,paymentType:'Дифференцированный'},[]);
  assert.ok(diff[0].amount>diff[1].amount);
  assert.equal(diff.at(-1).balance,0);
  const directory=INITIAL.map(([category,subcategory,keywords,kind],i)=>({id:String(i),category,subcategory,keywords,kind:kind||'regular',active:true}));
  const txs=transactions.map(tx=>({...tx,directoryId:categorize(tx,directory,[],[])}));
  const stored={'Транзакции':[],'Привязки':[],'Правила':[],'Настройки':[['token','demo']],'Синхронизация':[]};
  rows=name=>stored[name];
  append=(name,items)=>stored[name].push(...items);
  getDirectory=()=>directory;
  rawLoans=()=>[{...loan,status:'Активный',keywords:'банк пример'}];
  schedule=()=>base.map(row=>({...row,loanId:loan.id,kind:'Платёж'}));
  const request=(action,data={},token='demo')=>doPost({postData:{contents:JSON.stringify({token,action,data})}});
  assert.equal(doGet().error.code,'UNAUTHORIZED');
  assert.equal(request('connection.check',{},'').error.code,'UNAUTHORIZED');
  const preview=request('import.preview',{transactions:txs}).data;
  assert.equal(preview.added,25);
  assert.equal(preview.matched,1);
  assert.equal(stored['Транзакции'].length,0);
  const commit=request('import.commit',{transactions:txs}).data;
  assert.equal(commit.added,25);
  assert.equal(stored['Привязки'][0][3],21152.4);
  assert.equal(stored['Привязки'][0][4],15000);
  assert.equal(request('import.commit',{transactions:txs}).data.duplicates,25);
  const food=directory.find(x=>x.subcategory==='Продукты');
  const rule={active:true,priority:10,directoryId:food.id,pattern:'точка 17'};
  assert.equal(categorize(txs.at(-1),directory,[rule],[]),food.id);
  output.push({payment:base[0].amount,imported:commit.added,duplicates:25,matched:commit.matched});
`,context);
console.log('Проверки CSV, XLSX, категоризации, защиты API, дедупликации и кредитов прошли.',output[0]);
