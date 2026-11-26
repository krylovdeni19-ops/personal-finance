function setupReports(db) {
  const ledger = sheet('Учёт');
  const t = "'Транзакции'!";
  const d = "'Справочник'!";
  const l = "'Привязки'!";
  const has = t + 'A2:A<>""';
  const kind = 'IFNA(VLOOKUP(' + t + 'E2:E&CHAR(9)&' + t + 'F2:F,{' + d + 'B2:B&CHAR(9)&' + d + 'C2:C,' + d + 'E2:E},2,FALSE),"regular")';
  const linked = col => 'IFNA(VLOOKUP(' + t + 'A2:A,' + l + 'A2:E,' + col + ',FALSE),0)';
  const amount = t+'D2:D';
  const debit = t+'G2:G="Списание"';
  ledger.getRange('A2').setFormula('=ARRAYFORMULA(IF(' + has + ',' + t + 'A2:A,""))');
  ledger.getRange('B2:D2').setFormulas([[ 'B','E','F' ].map(col => '=ARRAYFORMULA(IF(' + has + ',' + (col==='E' ? 'IF('+t+'E2:E="","Без категории",'+t+'E2:E)' : t + col + '2:' + col) + ',""))')]);
  ledger.getRange('E2:I2').setFormulas([[
    '=ARRAYFORMULA(IF('+has+','+kind+',""))',
    '=ARRAYFORMULA(IF('+has+',IF(('+t+'G2:G="Пополнение")*(E2:E="regular"),'+amount+',0),""))',
    '=ARRAYFORMULA(IF('+has+',IF('+debit+',IF(REGEXMATCH(E2:E,"^(regular|interest|fee)$"),'+amount+',IF(E2:E="payment",'+linked(5)+',0)),0),""))',
    '=ARRAYFORMULA(IF('+has+',IF('+debit+',IF(E2:E="early",'+amount+',IF(E2:E="payment",'+linked(4)+',0)),0),""))',
    '=ARRAYFORMULA(IF('+has+',IF(('+debit+')*REGEXMATCH(E2:E,"^(payment|early|interest|fee)$"),'+amount+',0),""))'
  ]]);
  ledger.getRange('B2:B').setNumberFormat('yyyy-mm-dd');
  sheet('Без привязки').getRange('A2').setFormula('=IFNA(FILTER(\'Транзакции\'!A2:G,REGEXMATCH(\'Учёт\'!E2:E,"^(payment|early|interest|fee)$"),COUNTIF(\'Привязки\'!A2:A,\'Транзакции\'!A2:A)=0),"")');
  const dash = setupSheet(db,'Дашборд',['Личные финансы','Выбор','Период','Значение','Расходы за год','Сумма','Доля','Доля расходов','Доходы за год','Сумма','Доля','Доля доходов']);
  const year = Number(iso(new Date()).slice(0,4));
  if (!dash.getRange('B2').getValue()) {
    dash.getRange('A2:B8').setValues([['Период','Месяц'],['Год',year],['Квартал',1],['Месяц',Number(iso(new Date()).slice(5,7))],['Неделя ISO',1],['Дата начала',dateValue(year+'-01-01')],['Дата конца',dateValue(year+'-12-31')]]);
    dash.getRange('B2').setDataValidation(listValidation(['Год','Квартал','Месяц','Неделя','Произвольный']));
    dash.getRange('B7:B8').setNumberFormat('dd.mm.yyyy');
  }
  dash.getRange('C2:C9').setValues([['Начало'],['Конец'],['Доходы'],['Расходы'],['Баланс'],['Норма сбережений'],['Кредитная нагрузка'],['Платежи по кредитам']]);
  dash.getRange('D2:D9').setFormulas([
    ['=SWITCH(B2,"Год",DATE(B3,1,1),"Квартал",DATE(B3,(B4-1)*3+1,1),"Неделя",DATE(B3,1,4)-WEEKDAY(DATE(B3,1,4),2)+1+(B6-1)*7,"Произвольный",B7,DATE(B3,B5,1))'],
    ['=SWITCH(B2,"Год",DATE(B3,12,31),"Квартал",EOMONTH(D2,2),"Неделя",D2+6,"Произвольный",B8,EOMONTH(D2,0))'],
    [rangeSum('F','$D$2','$D$3')],[rangeSum('G','$D$2','$D$3')],['=D4-D5'],['=IFERROR(D6/D4,0)'],['=IFERROR(D9/D4,0)'],[rangeSum('I','$D$2','$D$3')]
  ]);
  dash.getRange('D2:D3').setNumberFormat('dd.mm.yyyy');
  dash.getRange('D7:D8').setNumberFormat('0.0%');
  for (const [col,amountCol,shareCol,barCol,ledgerCol] of [['E','F','G','H','G'],['I','J','K','L','F']]) {
    const q = '=IFNA(QUERY(\'Учёт\'!B2:I,"select Col2,sum(Col'+(ledgerCol === 'G' ? 6 : 5)+') where Col1 >= date \'"&TEXT(DATE(B3,1,1),"yyyy-mm-dd")&"\' and Col1 <= date \'"&TEXT(DATE(B3,12,31),"yyyy-mm-dd")&"\' and Col'+(ledgerCol === 'G' ? 6 : 5)+'>0 group by Col2 order by sum(Col'+(ledgerCol === 'G' ? 6 : 5)+') desc label Col2 \'\',sum(Col'+(ledgerCol === 'G' ? 6 : 5)+') \'\'",0),"")';
    dash.getRange(col+'3').setFormula(q);
    dash.getRange(col+'2').setValue('Итого');
    dash.getRange(amountCol+'2').setFormula('=SUM('+amountCol+'3:'+amountCol+')');
    dash.getRange(shareCol+'3').setFormula('=ARRAYFORMULA(IF('+col+'3:'+col+'="","",IFERROR('+amountCol+'3:'+amountCol+'/'+amountCol+'2,0)))');
    dash.getRange(shareCol+'2:'+shareCol).setNumberFormat('0.0%');
    dash.getRange(barCol+'3:'+barCol+'202').setFormulas(Array.from({length:200},(_,i) => ['=IF('+shareCol+(i+3)+'="","",SPARKLINE('+shareCol+(i+3)+',{"charttype","bar";"max",1;"color1","#b68c48"}))']));
  }
  setupCreditDashboard(dash);

  const tab = setupSheet(db,'Бюджет',['Бюджет','Значение','План и факт','Категория','Подкатегория','План','Факт','Отклонение','Исполнение']);
  if (!tab.getRange('B2').getValue()) tab.getRange('A2:B4').setValues([['Год',year],['Квартал',1],['Месяц квартала',1]]);
  tab.getRange('B3').setDataValidation(listValidation(['1','2','3','4']));
  tab.getRange('B4').setDataValidation(listValidation(['1','2','3']));
  tab.getRange('A5:B8').setValues([['Начало месяца',''],['Конец месяца',''],['План',''],['Факт','']]);
  tab.getRange('B5:B8').setFormulas([['=DATE(B2,(B3-1)*3+B4,1)'],['=EOMONTH(B5,0)'],['=0'],[rangeSum('G','B5','B6')]]);
  tab.getRange('B5:B6').setNumberFormat('dd.mm.yyyy');
  tab.getRange('A12:P12').setValues([['Год','ID подкатегории','Категория','Подкатегория','Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']]).setBackground('#123e3a').setFontColor('#ffffff');
  // Keep the calculated summary to the right of the editable plan matrix.
  tab.getRange('Q1:W1').setValues([['Раздел','Категория','Подкатегория','План','Факт','Отклонение','Исполнение']]).setBackground('#123e3a').setFontColor('#ffffff');
  tab.getRange('Q2').setValue('За месяц');
  const dir = "'Справочник'!";
  const graph = "'График платежей'!";
  const accounts = "'Учёт'!";
  const plans = a => 'SUMIFS(INDEX(E13:P,0,MONTH(B5)),A13:A,B2,B13:B,'+a+')';
  const graphSum = col => 'SUMIFS('+graph+col+':'+col+','+graph+'D:D,">="&B5,'+graph+'D:D,"<="&B6)';
  const fact = col => 'SUMIFS('+accounts+col+':'+col+','+accounts+'B:B,">="&B5,'+accounts+'B:B,"<="&B6,'+accounts+'C:C,c,'+accounts+'D:D,s)';
  tab.getRange('R2').setFormula('=IFNA(FILTER('+dir+'B2:C,'+dir+'A2:A<>""),"")');
  tab.getRange('T2').setFormula('=MAP('+dir+'A2:A,'+dir+'E2:E,LAMBDA(id,k,IF(id="","",SWITCH(k,"payment",'+graphSum('F')+',"early",'+graphSum('H')+',"interest",'+graphSum('G')+',"fee",0,"loan-in",0,'+plans('id')+'))))');
  tab.getRange('U2').setFormula('=MAP(R2:R,S2:S,'+dir+'E2:E,LAMBDA(c,s,k,IF(c="","",IF(OR(k="payment",k="early"),'+fact('H')+','+fact('G')+'+IF(k="interest",SUMIFS('+accounts+'G:G,'+accounts+'B:B,">="&B5,'+accounts+'B:B,"<="&B6,'+accounts+'E:E,"payment"),0)))))');
  tab.getRange('V2:W2').setFormulas([['=ARRAYFORMULA(IF(R2:R="","",U2:U-T2:T))','=ARRAYFORMULA(IF(R2:R="","",IFERROR(U2:U/T2:T,"")))']]);
  tab.getRange('B7:B8').setFormulas([['=SUM(T2:T)'],['=SUM(U2:U)']]);
  tab.getRange('W2:W').setNumberFormat('0.0%');
  tab.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setBackground('#fff0df').setFontColor('#9c3f2d').setRanges([tab.getRange('V2:V')]).build()]);

}
function rangeSum(col,from,to) {
  return "=SUMIFS('Учёт'!"+col+":"+col+",'Учёт'!B:B,\">=\"&"+from+",'Учёт'!B:B,\"<=\"&"+to+")";
}
function reportPeriod(data) {
  const today = iso(new Date());
  const year = Number(data.year || today.slice(0,4));
  const month = Number(data.month || today.slice(5,7));
  if (!Number.isInteger(year) || year < 1900 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) fail('INVALID_PERIOD','Проверьте год и месяц.');
  const from = data.from ? iso(dateValue(data.from)) : year+'-'+String(month).padStart(2,'0')+'-01';
  const to = data.to ? iso(dateValue(data.to)) : new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
  if (from > to) fail('INVALID_PERIOD','Начало периода позже конца.');
  return {year,month,from,to};
}
function ledgerRows() {
  const n = sheet('Транзакции').getLastRow()-1;
  return n > 0 ? sheet('Учёт').getRange(2,1,n,9).getValues().filter(row => row[0]) : [];
}
function dashboard(data) {
  const period = reportPeriod(data);
  const income = Object.create(null);
  const expense = Object.create(null);
  const paymentDirectory=getDirectory().find(item => item.kind==='interest' && item.active);
  let earned=0, spent=0, creditPayments=0;
  for (const [,date,category,subcategory,kind,incoming,outgoing,,credit] of ledgerRows()) {
    const day = iso(date);
    if (day >= period.from && day <= period.to) { earned+=incoming; spent+=outgoing; creditPayments+=credit; }
    if (!day.startsWith(period.year+'-')) continue;
    for (const [value,target] of [[incoming,income],[outgoing,expense]]) {
      if (!value) continue;
      const key = category || 'Без категории';
      const entry = target[key] || (target[key] = {category:key,sum:0,children:[]});
      entry.sum += value;
      const sub = kind==='payment' ? paymentDirectory?.subcategory || 'Проценты' : subcategory || 'Без подкатегории';
      const child = entry.children.find(item => item.name === sub);
      if (child) child.sum += value;
      else entry.children.push({name:sub,sum:value});
    }
  }
  const groups = group => {
    const entries = Object.values(group).sort((a,b) => b.sum-a.sum);
    const total = entries.reduce((sum,row) => sum+row.sum,0);
    return {total:money(total),rows:entries.map(row => ({...row,sum:money(row.sum),share:row.sum/total}))};
  };
  return {period,earned:money(earned),spent:money(spent),balance:money(earned-spent),savingsRate:earned ? (earned-spent)/earned : 0,creditLoad:earned ? creditPayments/earned : 0,creditPayments:money(creditPayments),income:groups(income),expense:groups(expense),credit:creditSummary()};
}
function planRows() {
  const tab=sheet('Бюджет');
  return tab.getLastRow()<13 ? [] : tab.getRange(13,1,tab.getLastRow()-12,16).getValues();
}
function budget(data) {
  const {year,month} = reportPeriod(data);
  const start = year+'-'+String(month).padStart(2,'0')+'-';
  const actual = ledgerRows().filter(row => iso(row[1]).startsWith(start));
  const plans = planRows();
  const graph = schedule().filter(row => row.date.startsWith(start));
  const directory=getDirectory();
  const result = directory.map(item => {
    const auto = ['payment','early','interest','fee','loan-in'].includes(item.kind);
    const metric = item.kind === 'payment' ? 'principal' : item.kind === 'early' ? 'extra' : item.kind === 'interest' ? 'interest' : '';
    const stored = plans.find(row => row[0] === year && row[1] === item.id);
    const planned = auto ? graph.reduce((sum,row) => sum+(row[metric] || 0),0) : Number(stored?.[3+month]) || 0;
    let fact = actual.filter(row => row[2] === item.category && row[3] === item.subcategory)
      .reduce((sum,row) => sum + (item.kind === 'payment' || item.kind === 'early' ? row[7] : row[6]),0);
    if (item.kind === 'interest' && item.active && !directory.some(other=>other.kind==='interest'&&other.active&&other.id<item.id)) {
      fact += actual.filter(row=>row[4]==='payment').reduce((sum,row)=>sum+row[6],0);
    }
    return {...item,auto,planned:money(planned),fact:money(fact),difference:money(fact-planned),ratio:planned ? fact/planned : null};
  }).filter(item => item.active || item.fact || item.planned);
  return {year,month,rows:result};
}
function savePlan(data) {
  const {year,month} = reportPeriod(data);
  const item = getDirectory().find(row => row.id === data.directoryId && row.active);
  const value = money(data.amount);
  if (!item || !Number.isFinite(value) || value < 0 || ['payment','early','interest','fee','loan-in'].includes(item.kind)) fail('INVALID_PLAN','Проверьте подкатегорию и сумму плана.');
  const all = planRows();
  const index = all.findIndex(row => row[0] === year && row[1] === item.id);
  const row = index >= 0 ? all[index] : [year,item.id,item.category,item.subcategory,...Array(12).fill('')];
  row[3+month] = value;
  const target = index >= 0 ? index+13 : all.length+13;
  const tab = sheet('Бюджет');
  ensureRows(tab,target);
  tab.getRange(target,1,1,16).setValues([row]);
  return {amount:value};
}
