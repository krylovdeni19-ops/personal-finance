function rawLoans() {
  return rows('Кредиты').filter(row => row[0]).map(row => ({
    id:row[0],name:row[1],lender:row[2],kind:row[3],issued:iso(row[4]),principal:row[5],rate:row[6],
    months:row[7],paymentType:row[8],day:row[9],payment:row[10],status:row[11],keywords:row[12],
    limit:row[13],cardDebt:row[14],grace:row[15],minimum:row[16]
  }));
}
function dueDate(issued, month, day) {
  const [y,m] = issued.split('-').map(Number);
  const last = new Date(Date.UTC(y,m+month-1,0)).getUTCDate();
  return new Date(Date.UTC(y,m+month-2,Math.min(day,last))).toISOString().slice(0,10);
}
function annuity(principal, rate, months) {
  return money(rate ? principal*rate/(1-Math.pow(1+rate,-months)) : principal/months);
}
function loanEvents(id) {
  return rows('Досрочные погашения').filter(row => row[1] === id).map(row => ({
    id:row[0],date:iso(row[2]),amount:row[3],type:row[4],mode:row[5],transactionId:row[6]
  }));
}
function modelLoan(loan, extras) {
  const rate = loan.rate/1200;
  const differentiated = loan.paymentType === 'Дифференцированный';
  const events = extras.slice().sort((a,b) => a.date.localeCompare(b.date));
  let balance = loan.principal;
  let base = differentiated ? money(balance/loan.months) : annuity(balance,rate,loan.months);
  const result = [];
  function addExtra(event, number) {
    const extra = event.type === 'Полное' ? balance : Math.min(event.amount,balance);
    balance = money(balance-extra);
    if (event.mode === 'Уменьшить платёж' && balance > 0) {
      const remaining = Math.max(1,loan.months-number);
      base = differentiated ? money(balance/remaining) : annuity(balance,rate,remaining);
    }
    result.push({id:loan.id+'-e-'+event.id,date:event.date,number,event,base,amount:extra,principal:0,interest:0,extra,balance});
  }
  for (let n=1;n<=loan.months && balance>0;n++) {
    const date = dueDate(loan.issued,n+1,loan.day);
    while (events.length && events[0].date < date && balance>0) addExtra(events.shift(),n-1);
    if (balance<=0) break;
    const interest = money(balance*rate);
    const principal = n===loan.months ? balance : money(Math.min(balance,Math.max(0,differentiated ? base : base-interest)));
    balance = money(balance-principal);
    result.push({id:loan.id+'-'+n,date,number:n,base,amount:money(principal+interest),principal,interest,extra:0,balance});
    while (events.length && events[0].date === date && balance>0) addExtra(events.shift(),n);
  }
  return result;
}
function schedule(id) {
  return rows('График платежей').filter(row => row[0] && (!id || row[1] === id)).map(row => ({
    id:row[0],loanId:row[1],number:row[2],date:iso(row[3]),amount:row[4],principal:row[5],interest:row[6],extra:row[7],
    balance:row[8],paid:row[9],status:row[10],kind:row[11]
  }));
}
function saveLoan(data) {
  const all=rows('Кредиты');
  const index=all.findIndex(row => row[0] === (data.id || mutationId));
  if (data.id && index<0) fail('NOT_FOUND','Кредит не найден.');
  const id=all[index]?.[0] || mutationId || Utilities.getUuid();
  const card=data.kind==='Кредитная карта';
  const name=shortText(data.name,120);
  const lender=shortText(data.lender,120);
  const issued=dateValue(data.issued);
  const principal=card ? 0 : money(data.principal);
  const months=card ? 0 : Number(data.months);
  const day=Number(data.day || 1);
  const rate=Number(data.rate || 0);
  const type=data.paymentType==='Дифференцированный' ? data.paymentType : 'Аннуитетный';
  const limit=card ? money(data.limit || 0) : 0;
  const cardDebt=card ? money(data.cardDebt || 0) : 0;
  const grace=card ? Number(data.grace || 0) : 0;
  const minimum=card ? money(data.minimum || 0) : 0;
  if (!name || !lender || !Number.isFinite(rate) || rate<0 || rate>1000 || !Number.isInteger(day) || day<1 || day>31 ||
      (card ? [limit,cardDebt,grace,minimum].some(x => !Number.isFinite(x) || x<0) : !Number.isInteger(months) || months<1 || months>600 || !Number.isFinite(principal) || principal<=0)) {
    fail('INVALID_LOAN','Проверьте сумму, ставку, срок и день платежа.');
  }
  if (index >= 0 && (card !== (all[index][3] === 'Кредитная карта')) && (loanEvents(id).length || rows('Привязки').some(row=>row[1]===id))) fail('LOAN_HAS_HISTORY','Вид кредита с операциями изменить нельзя.');
  const loan={id,issued:iso(issued),principal,rate,months,day,paymentType:type};
  const payment=card ? minimum : modelLoan(loan,[])[0].amount;
  writeRow('Кредиты',index,[id,safeText(name),safeText(lender),card?'Кредитная карта':'Кредит',issued,principal,rate,months,type,day,payment,data.status==='Закрыт'?'Закрыт':'Активный',safeText(shortText(data.keywords,500)),limit,cardDebt,grace,minimum]);
  rebuildSchedule();
  append('Привязки',findMatches(rows('Транзакции')));
  return {id,payment};
}
function rebuildSchedule() {
  const tab=sheet('График платежей');
  const previous=tab.getLastRow()-1;
  const output=[];
  for (const loan of rawLoans().filter(item=>item.kind==='Кредит')) {
    if (!loan.issued || !Number.isInteger(loan.months) || loan.months<1 || loan.months>600 || !Number.isFinite(loan.principal) || loan.principal<=0 || !Number.isFinite(loan.rate) || loan.day<1 || loan.day>31) continue;
    const plan=modelLoan(loan,loanEvents(loan.id));
    let prior=String(loan.principal);
    let base=String(loan.paymentType==='Дифференцированный' ? money(loan.principal/loan.months) : annuity(loan.principal,loan.rate/1200,loan.months));
    for (const item of plan) {
      const n=output.length+2;
      const kind=item.event ? 'Досрочно' : 'Платёж';
      const rate=loan.rate/1200;
      const left=Math.max(1,loan.months-item.number);
      const principal=item.event ? '=0' : item.number===loan.months ? '='+prior :
        '=ROUND(MIN('+prior+',MAX(0,'+base+(loan.paymentType==='Аннуитетный'?'-G'+n:'')+')),2)';
      const due=item.event ? dateValue(item.date) : '=DATE('+loan.issued.slice(0,4)+','+(Number(loan.issued.slice(5,7))+item.number)+',MIN('+loan.day+',DAY(EOMONTH(DATE('+loan.issued.slice(0,4)+','+(Number(loan.issued.slice(5,7))+item.number)+',1),0))))';
      const early=item.event ? '=MIN('+prior+','+(item.event.type==='Полное'?prior:item.event.amount)+')' : '=0';
      output.push([item.id,loan.id,item.number,due,'=ROUND(SUM(F'+n+':H'+n+'),2)',principal,
        item.event ? '=0' : '=ROUND('+prior+'*'+rate+',2)',early,'=ROUND(MAX(0,'+prior+'-F'+n+'-H'+n+'),2)',
        '=SUMIF(\'Привязки\'!C:C,A'+n+',\'Привязки\'!D:D)+SUMIF(\'Привязки\'!C:C,A'+n+',\'Привязки\'!E:E)',
        '=IF(J'+n+'>0,IF(ABS(J'+n+'-E'+n+')<=0.01,"Оплачен","Оплачен с отклонением"),IF(AND(L'+n+'="Досрочно",D'+n+'<=TODAY()),"Оплачен",IF(D'+n+'<TODAY(),"Просрочен","Ожидается")))',
        kind,item.event?.mode || '']);
      prior='I'+n;
      if (item.event?.mode==='Уменьшить платёж') {
        base=loan.paymentType==='Дифференцированный' ? 'ROUND('+prior+'/'+left+',2)' : 'ROUND(-PMT('+rate+','+left+','+prior+'),2)';
      }
    }
  }
  if (output.length) {
    ensureRows(tab,output.length+1);
    tab.getRange(2,1,output.length,13).setValues(output);
    tab.getRange(2,4,output.length,1).setNumberFormat('dd.mm.yyyy');
  }
  if (previous>output.length) tab.getRange(2+output.length,1,previous-output.length,13).clearContent();
  SpreadsheetApp.flush();
  const entries = rows('Привязки');
  const valid=new Map(schedule().map(item=>[item.id,item]));
  const tx = new Map(rows('Транзакции').map(row=>[row[0],row]));
  const adjusted=entries.filter(row=>!row[2] || valid.has(row[2])).map(row=>{
    const payment=valid.get(row[2]);
    const operation=tx.get(row[0]);
    return payment && operation ? linkValues(operation,payment,row[5]) : row;
  });
  if (adjusted.length) sheet('Привязки').getRange(2,1,adjusted.length,6).setValues(adjusted);
  if (adjusted.length<entries.length) sheet('Привязки').getRange(adjusted.length+2,1,entries.length-adjusted.length,6).clearContent();
}

function listLoans() {
  const graph=schedule();
  const links=rows('Привязки');
  return rawLoans().map(loan=>{
    const payments=graph.filter(item=>item.loanId===loan.id && item.kind==='Платёж');
    const all=graph.filter(item=>item.loanId===loan.id);
    const outstanding=payments.filter(row=>row.status!=='Оплачен');
    const actual=links.filter(row=>row[1]===loan.id);
    const linkedIds=new Set(actual.map(row=>row[2]));
    const recorded=all.filter(row=>row.kind==='Досрочно' && row.date<=iso(new Date()) && !linkedIds.has(row.id));
    const principalPaid=money(actual.reduce((sum,row)=>sum+row[3],0)+recorded.reduce((sum,row)=>sum+row.extra,0));
    return {...loan,balance:loan.status==='Закрыт'?0:loan.kind==='Кредитная карта'?loan.cardDebt:money(Math.max(0,loan.principal-principalPaid)),
      principalPaid,interestPaid:money(actual.reduce((sum,row)=>sum+row[4],0)),overpayment:money(all.reduce((sum,row)=>sum+row.interest,0)),
      payoff:all[all.length-1]?.date || '',remaining:loan.status==='Закрыт'?0:outstanding.length,
      next:loan.status==='Закрыт'?null:outstanding[0] || null};
  });
}
function creditSummary() {
  const loans=listLoans();
  const active=new Set(loans.filter(x=>x.status==='Активный').map(x=>x.id));
  const month=iso(new Date()).slice(0,7);
  const graph=schedule();
  const next=loans.map(x=>x.next).filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date))[0] || null;
  return {loans,balance:money(loans.reduce((s,x)=>s+x.balance,0)),next,
    thisMonth:money(graph.filter(x=>active.has(x.loanId)&&x.date.startsWith(month)).reduce((s,x)=>s+x.amount,0)+loans.filter(x=>active.has(x.id)&&x.kind==='Кредитная карта').reduce((s,x)=>s+x.minimum,0)),
    principalPaid:money(loans.reduce((s,x)=>s+x.principalPaid,0)),interestPaid:money(loans.reduce((s,x)=>s+x.interestPaid,0)),
    overpayment:money(loans.reduce((s,x)=>s+x.overpayment,0)),payoff:loans.reduce((latest,x)=>x.payoff>latest?x.payoff:latest,'')};
}
function setupCreditDashboard(tab) {
  tab.getRange('A12:D12').setValues([['Кредиты','Значение','По кредитам','Ставка / остаток / платёж / статус']]).setBackground('#123e3a').setFontColor('#ffffff');
  tab.getRange('A13:A20').setValues([['Остаток долга'],['План на месяц'],['Следующий платёж'],['Оплачено основного долга'],['Оплачено процентов'],['Переплата по графику'],['Максимальная дата погашения'],['Кредитная нагрузка']]);
  tab.getRange('B13:B20').setFormulas([
    ['=SUMIF(\'Кредиты\'!L2:L,"Активный",\'Кредиты\'!F2:F)+SUMIF(\'Кредиты\'!L2:L,"Активный",\'Кредиты\'!O2:O)-SUMIF(\'Кредиты\'!L2:L,"Активный",ARRAYFORMULA(IFNA(SUMIF(\'Привязки\'!B2:B,\'Кредиты\'!A2:A,\'Привязки\'!D2:D),0)))'],
    ['=SUMIFS(\'График платежей\'!E:E,\'График платежей\'!D:D,">="&EOMONTH(TODAY(),-1)+1,\'График платежей\'!D:D,"<="&EOMONTH(TODAY(),0))+SUMIF(\'Кредиты\'!L:L,"Активный",\'Кредиты\'!Q:Q)'],
    ['=IFERROR(LET(d,MIN(FILTER(\'График платежей\'!D2:D,\'График платежей\'!D2:D<>"",\'График платежей\'!K2:K<>"Оплачен")),TEXT(d,"dd.mm.yyyy")&" · "&TEXT(SUMIFS(\'График платежей\'!E:E,\'График платежей\'!D:D,d,\'График платежей\'!K:K,"<>Оплачен"),"0.00")&" ₽"),"")'],
    ['=SUM(\'Привязки\'!D2:D)'],['=SUM(\'Привязки\'!E2:E)'],['=SUM(\'График платежей\'!G2:G)'],
    ['=IF(COUNT(\'График платежей\'!D2:D),MAX(\'График платежей\'!D2:D),"")'],['=D8']
  ]);
  tab.getRange('B13').setFormula('=SUM(MAP(\'Кредиты\'!A2:A,\'Кредиты\'!F2:F,\'Кредиты\'!O2:O,\'Кредиты\'!L2:L,LAMBDA(id,p,c,s,IF(AND(id<>"",s="Активный"),MAX(0,p+c-SUMIF(\'Привязки\'!B:B,id,\'Привязки\'!D:D)-SUMIFS(\'График платежей\'!H:H,\'График платежей\'!B:B,id,\'График платежей\'!D:D,"<="&TODAY(),\'График платежей\'!J:J,0)),0))))');
  tab.getRange('B19').setNumberFormat('dd.mm.yyyy');
  tab.getRange('B20').setNumberFormat('0.0%');
  tab.getRange('C13').setFormula('=IFNA(FILTER(\'Кредиты\'!B2:B,\'Кредиты\'!A2:A<>""),"")');
  tab.getRange('D13').setFormula('=MAP(\'Кредиты\'!A2:A,\'Кредиты\'!G2:G,\'Кредиты\'!F2:F,\'Кредиты\'!O2:O,\'Кредиты\'!K2:K,\'Кредиты\'!L2:L,LAMBDA(id,r,p,c,v,s,IF(id="","",r&"% · "&IF(s="Закрыт",0,MAX(0,p+c-SUMIF(\'Привязки\'!B:B,id,\'Привязки\'!D:D)-SUMIFS(\'График платежей\'!H:H,\'График платежей\'!B:B,id,\'График платежей\'!D:D,"<="&TODAY(),\'График платежей\'!J:J,0)))&" ₽ · "&v&" ₽ · "&COUNTIFS(\'График платежей\'!B:B,id,\'График платежей\'!L:L,"Платёж",\'График платежей\'!K:K,"<>Оплачен")&" пл. · "&s)))');
}
function proposedEvent(data) {
  const loan=rawLoans().find(x=>x.id===data.loanId && x.kind==='Кредит' && x.status==='Активный');
  if (!loan) fail('NOT_FOUND','Активный кредит не найден.');
  const date=iso(dateValue(data.date));
  const amount=money(data.amount);
  const type=data.type==='Полное'?'Полное':'Частичное';
  if (date<loan.issued || (type==='Частичное' && (!Number.isFinite(amount)||amount<=0))) fail('INVALID_PREPAYMENT','Проверьте дату и сумму погашения.');
  const events=loanEvents(loan.id);
  const event={id:mutationId || Utilities.getUuid(),date,amount:type==='Полное'?0:amount,type,
    mode:data.mode==='Уменьшить платёж'?data.mode:'Уменьшить срок',transactionId:shortText(data.transactionId,100)};
  const before=modelLoan(loan,events);
  const after=modelLoan(loan,[...events,event]);
  const added=after.find(row=>row.event?.id===event.id);
  if (!added || (type==='Частичное' && added.extra<amount)) fail('INVALID_PREPAYMENT','Погашение выходит за пределы действующего графика или остатка.');
  const total=entries=>entries.reduce((sum,row)=>sum+row.interest,0);
  return {loan,event,added,savings:money(total(before)-total(after)),payoff:after[after.length-1]?.date,
    nextPayment:after.find(row=>!row.event&&row.date>date)?.amount || 0,
    remaining:after.filter(row=>!row.event&&row.date>date).length};
}
function previewPrepayment(data) {
  const {added,savings,payoff,nextPayment,remaining}=proposedEvent(data);
  return {amount:added.extra,savings,payoff,nextPayment,remaining};
}
function recordPrepayment(data) {
  const existing=mutationId && loanEvents(data.loanId).find(item=>item.id===mutationId);
  if (existing) {
    rebuildSchedule();
    if (existing.transactionId) linkOperation({transactionId:existing.transactionId,loanId:data.loanId,paymentId:data.loanId+'-e-'+existing.id});
    return {id:existing.id};
  }
  const {loan,event,added}=proposedEvent(data);
  const tx=event.transactionId && rows('Транзакции').find(row=>row[0]===event.transactionId);
  if (event.transactionId && (!tx || tx[6]!=='Списание' || Math.abs(tx[3]-added.extra)>0.01 || rows('Привязки').some(row=>row[0]===tx[0]))) fail('INVALID_LINK','Операция должна быть свободным списанием на сумму погашения.');
  append('Досрочные погашения',[[event.id,loan.id,dateValue(event.date),event.amount,event.type,event.mode,event.transactionId]]);
  rebuildSchedule();
  if (tx) linkOperation({transactionId:tx[0],loanId:loan.id,paymentId:added.id});
  else append('Привязки',findMatches(rows('Транзакции')));
  return {id:event.id};
}
function linkValues(tx,payment,mode) {
  const interest=money(Math.min(tx[3],payment.interest));
  return [tx[0],payment.loanId,payment.id,money(tx[3]-interest),interest,mode];
}
function findMatches(batch) {
  if (!batch.length) return [];
  const dictionary=getDirectory();
  const paymentCodes=new Set(dictionary.filter(x=>x.kind==='payment'||x.kind==='early').map(x=>x.category+'\t'+x.subcategory));
  const linked=rows('Привязки');
  const taken=new Set(linked.map(row=>row[2]));
  const known=new Set(linked.map(row=>row[0]));
  const loans=rawLoans().filter(loan=>loan.status==='Активный');
  const candidates=schedule().filter(row=>loans.some(loan=>loan.id===row.loanId));
  const found=[];
  for (const tx of batch) {
    if (known.has(tx[0]) || tx[6]!=='Списание' || !paymentCodes.has(tx[4]+'\t'+tx[5])) continue;
    const when=Date.parse(iso(tx[1]));
    const desc=String(tx[2]).toLowerCase();
    const early=dictionary.some(x=>x.category===tx[4]&&x.subcategory===tx[5]&&x.kind==='early');
    let matches=candidates.filter(row=>!taken.has(row.id)&&(row.kind==='Досрочно')===early&&Math.abs(Date.parse(row.date)-when)<=3*86400000&&Math.abs(row.amount-tx[3])<=0.01);
    const byMerchant=matches.filter(row=>String(loans.find(loan=>loan.id===row.loanId).keywords).split('|').some(word=>word.trim()&&desc.includes(word.trim().toLowerCase())));
    if (byMerchant.length) matches=byMerchant;
    if (matches.length!==1) continue;
    found.push(linkValues(tx,matches[0],'Авто'));
    taken.add(matches[0].id);
  }
  return found;
}
function removeLinks(id) {
  const index=rows('Привязки').findIndex(row=>row[0]===id);
  if (index>=0) sheet('Привязки').deleteRow(index+2);
}
function linkOperation(data) {
  const txs=rows('Транзакции');
  const index=txs.findIndex(row=>row[0]===data.transactionId);
  const tx=txs[index];
  const loan=rawLoans().find(row=>row.id===data.loanId);
  if (!tx || !loan || tx[6]!=='Списание') fail('INVALID_LINK','Выберите кредит и расходную операцию.');
  const all=rows('Привязки');
  const prior=all.findIndex(row=>row[0]===tx[0]);
  const payment=data.paymentId && schedule(loan.id).find(row=>row.id===data.paymentId);
  const kind=payment?.kind==='Досрочно'?'early':payment?'payment':data.kind;
  if ((!payment && !['interest','fee','payment'].includes(kind)) || (data.paymentId && !payment) ||
      (payment && all.some(row=>row[2]===payment.id&&row[0]!==tx[0]))) fail('INVALID_LINK','Платёж недоступен или уже связан.');
  const item=getDirectory().find(row=>row.kind===kind && row.active);
  if (!item) fail('INVALID_CATEGORY','В справочнике отсутствует кредитная подкатегория.');
  writeRow('Привязки',prior,payment?linkValues(tx,payment,'Вручную'):[tx[0],loan.id,'',kind==='payment'?tx[3]:0,kind==='interest'?tx[3]:0,'Вручную']);
  sheet('Транзакции').getRange(index+2,5,1,2).setValues([[item.category,item.subcategory]]);
  return {id:tx[0]};
}

function onEdit(e) {
  if (!e?.range || e.range.getRow()<2) return;
  const name=e.range.getSheet().getName();
  if (!['Кредиты','Досрочные погашения','Транзакции'].includes(name)) return;
  // A bound simple trigger cannot open a spreadsheet via openById. Use the edit context.
  activeEditBook=e.source;
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    if (name!=='Транзакции') {
      const tab=e.range.getSheet();
      const first=e.range.getRow()-2;
      const edited=rows(name).slice(first,first+e.range.getNumRows());
      if (name==='Кредиты') {
        edited.forEach((row,i)=>{
          const n=first+i+2;
          if (!row[1] || !row[2] || !iso(row[4]) || (row[3]!=='Кредитная карта' && !(row[5]>0 && row[7]>0))) return;
          if (!row[0]) tab.getRange(n,1).setValue(Utilities.getUuid());
          if (!row[3]) tab.getRange(n,4).setValue('Кредит');
          if (row[6]==='') tab.getRange(n,7).setValue(0);
          if (!row[8]) tab.getRange(n,9).setValue('Аннуитетный');
          if (!row[9]) tab.getRange(n,10).setValue(1);
          if (!row[11]) tab.getRange(n,12).setValue('Активный');
          tab.getRange(n,11).setFormula('=IF(D'+n+'="Кредитная карта",Q'+n+',IFERROR(IF(I'+n+'="Дифференцированный",ROUND(F'+n+'/H'+n+',2)+ROUND(F'+n+'*G'+n+'/1200,2),ROUND(-PMT(G'+n+'/1200,H'+n+',F'+n+'),2)),0))');
        });
      } else {
        edited.forEach((row,i)=>{
          if (!row[0] && row[1] && iso(row[2]) && (row[3]>0 || row[4]==='Полное')) tab.getRange(first+i+2,1).setValue(Utilities.getUuid());
        });
      }
      SpreadsheetApp.flush();
      rebuildSchedule();
      append('Привязки',findMatches(rows('Транзакции')));
    } else {
      const first=e.range.getRow()-2;
      const all=rows('Транзакции');
      const batch=all.slice(first,first+e.range.getNumRows());
      const known=new Set(all.map(row=>row[0]));
      batch.forEach((row,i)=>{
        if (row[0] || !row[1] || !row[2] || !(row[3]>0) || !['Списание','Пополнение'].includes(row[6])) return;
        const id=transactionId(iso(dateValue(row[1])),row[3],row[2],row[6]);
        if (known.has(id)) {
          e.range.getSheet().getRange(first+i+2,1).setNote('Дубликат операции. Проверьте строку.');
          return;
        }
        e.range.getSheet().getRange(first+i+2,1).setValue(id).clearNote();
        row[0]=id;
        known.add(id);
      });
      ensureRows(sheet('Учёт'),all.length+1);
      ensureRows(sheet('Без привязки'),all.length+1);
      const directory=getDirectory();
      for (const row of batch) if (row[0] && !directory.some(item=>item.category===row[4]&&item.subcategory===row[5]&&['payment','early','interest','fee'].includes(item.kind))) removeLinks(row[0]);
      append('Привязки',findMatches(batch.filter(row=>row[0])));
    }
  } finally { lock.releaseLock(); activeEditBook=null; }
}
