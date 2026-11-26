import {parseFile} from './parsers/statements.mjs';
import {categorize,norm} from './categorization.mjs';

export async function parseStatement(file,snapshot) {
  const parsed=await parseFile(file);
  if (parsed.transactions.length>2000) throw new Error('Разделите выписку на файлы до 2000 операций.');
  return {...parsed,transactions:parsed.transactions.map(tx=>({...tx,directoryId:categorize(tx,snapshot.directory,snapshot.rules,snapshot.loans)}))};
}
export function importPayload(rows) {
  return {
    transactions:rows.map(({date,description,amount,type,bank,bankId,directoryId})=>({date,description,amount,type,bank,bankId,directoryId})),
    rules:rows.filter(row=>row.remember&&row.directoryId&&norm(row.pattern)).map(row=>({pattern:norm(row.pattern),directoryId:row.directoryId}))
  };
}

// Offline counts use the last synchronized IDs and schedule. The API rechecks at commit.
export async function cachedPreview(rows,snapshot) {
  const existing=new Set(snapshot.transactionIds || snapshot.transactions.map(row=>row.id));
  const taken=new Set(snapshot.linkedPayments || []);
  const directory=new Map(snapshot.directory.map(item=>[item.id,item]));
  const loans=new Map(snapshot.loans.filter(item=>item.status==='Активный').map(item=>[item.id,item]));
  const result={added:0,duplicates:0,uncategorized:0,matched:0,estimated:true};
  for (const row of rows) {
    const amount=row.type==='Списание'?-row.amount:row.amount;
    const payload=row.bankId?[row.bank||'',row.bankId]:[row.date,amount,row.description.trim().slice(0,1000).toLowerCase().replace(/\s+/g,' ')];
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
    const id=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
    if (existing.has(id)) {result.duplicates++;continue;}
    existing.add(id);
    result.added++;
    if (!row.directoryId) result.uncategorized++;
    const kind=directory.get(row.directoryId)?.kind;
    if (row.type!=='Списание' || !['payment','early'].includes(kind)) continue;
    let choices=(snapshot.schedule||[]).filter(payment=>loans.has(payment.loanId) && !taken.has(payment.id) &&
      (payment.kind==='Досрочно')===(kind==='early') &&
      Math.abs(Date.parse(row.date)-Date.parse(payment.date))<=3*86400000 && Math.abs(payment.amount-row.amount)<=0.01);
    const named=choices.filter(payment=>String(loans.get(payment.loanId).keywords||'').split('|')
      .map(word=>word.trim().toLowerCase()).some(word=>word&&row.description.toLowerCase().includes(word)));
    if (named.length) choices=named;
    if (choices.length===1) {taken.add(choices[0].id);result.matched++;}
  }
  return result;
}
