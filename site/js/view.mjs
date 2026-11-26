const currency=new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2});
export const rub=value=>currency.format(Number(value)||0);
const percent=value=>new Intl.NumberFormat('ru-RU',{style:'percent',maximumFractionDigits:1}).format(value || 0);
export const esc=value=>String(value??'').replace(/[&<>"']/g, x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
export const options=(items,value)=>items.map(([id,label])=>`<option value="${esc(id)}" ${String(id)===String(value)?'selected':''}>${esc(label)}</option>`).join('');
export const input=(label,name,value='',type='text',attrs='')=>`<label class="field">${label}<input type="${type}" name="${name}" value="${esc(value)}" ${attrs}></label>`;
export const select=(label,name,items,value)=>`<label class="field">${label}<select name="${name}">${options(items,value)}</select></label>`;
export const card=(title,html)=>`<section class="section"><h2 class="section-title">${title}</h2>${html}</section>`;
export const title=text=>`<div class="heading"><h1>${text}</h1></div>`;
const day=value=>value ? esc(String(value).split('-').reverse().join('.')) : '—';
const num='min="0" step="0.01" inputmode="decimal"';
const empty=text=>`<p class="muted">${text}</p>`;
const formButton=(label,cls='')=>`<button class="${cls}">${label}</button>`;
const shortcut=(action, label, id='')=>`<button type="button" class="secondary" data-action="${action}" data-id="${esc(id)}">${label}</button>`;
const optionList=(items,selected)=>options([['','Без категории'],...items.filter(x=>x.active||x.id===selected).map(x=>[x.id,x.category+' / '+x.subcategory])],selected);
const table=(headers,rows)=>`<div class="scroll"><table><thead><tr>${headers.map(x=>'<th>'+x+'</th>').join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const kpi=(name,value,primary=false)=>`<div class="kpi${primary?' primary':''}"><small class="muted">${name}</small><strong>${value}</strong></div>`;
const pair=(label,value)=>`<div class="subline"><span>${label}</span><strong>${value}</strong></div>`;

export const pages=[['dashboard','Дашборд','M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z'],['transactions','Операции','M4 6h16M4 12h16M4 18h16M7 4v4m10 2v4m-6 2v4'],['budget','Бюджет','M4 20V5m0 15h16M9 16v-4m5 4V8m5 8V4'],['loans','Кредиты','M3 7h18v12H3zM3 11h18m-14 4h4'],['import','Загрузка','M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6']];
export function navigation(page) {
  return pages.map(([id,label,path])=>`<a href="#${id}" ${id===page?'aria-current="page"':''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"></path></svg><span>${label}</span></a>`).join('');
}
export function settingsView(settings,showInstall,queue=[]) {
  return `<div class="connect">${title('Подключение')}${card('Google Таблица',`<form id="connect" class="stack">
      ${input('URL веб-приложения Apps Script','url',settings?.url,'url','required placeholder="https://script.google.com/macros/s/…/exec"')}
      ${input('Токен из листа «Настройки»','token','','password',settings?'placeholder="Введите токен для переподключения"':'required')}
      <div class="actions">${formButton('Проверить и подключить')}${settings?shortcut('disconnect','Отключить'):''}</div>
    </form>${showInstall?'<p class="install">В Safari нажмите «Поделиться» → «На экран „Домой“».</p>':''}`)}
    ${settings ? card('Данные',`<div class="actions"><a class="button secondary" rel="noopener noreferrer" target="_blank" href="${esc(settings.sheetUrl)}">Открыть Google Таблицу</a>${shortcut('export-json','Экспорт JSON')}${shortcut('export-xlsx','Экспорт XLSX')}</div>${queue[0]?.error?'<p class="negative">'+esc(queue[0].error)+'</p>'+shortcut('discard-change','Удалить отклонённое изменение'):''}`) : ''}</div>`;
}
function groups(group) {
  if (!group?.rows.length) return empty('За выбранный год операций нет.');
  return group.rows.map(item=>`<details class="details"><summary><div class="category"><strong>${esc(item.category)}</strong><span>${rub(item.sum)}</span><small>${percent(item.share)}</small></div><progress value="${item.share}" max="1" aria-label="Доля категории"></progress></summary>${item.children.map(x=>pair(esc(x.name),rub(x.sum))).join('')}</details>`).join('')+pair('Итого',rub(group.total));
}
export function dashboardView(state) {
  const {period:p,snapshot:s}=state;
  const d=s?.dashboard;
  const credit=d?.credit;
  return title('Дашборд')+card('Период',`<form id="period"><div class="fields">
    ${select('Режим','mode',[['year','Год'],['quarter','Квартал'],['month','Месяц'],['week','Неделя'],['custom','Произвольный']],p.mode)}
    ${input('Год для сводок','year',p.year,'number','min="1900" max="2200" required')}
    ${p.mode==='quarter'?select('Квартал','quarter',[1,2,3,4].map(x=>[x,x]),p.quarter):''}
    ${p.mode==='month'?input('Месяц','month',p.month,'number','min="1" max="12" required'):''}
    ${p.mode==='week'?input('Неделя ISO','week',p.week,'number','min="1" max="53" required'):''}
    ${p.mode==='custom'?input('Начало','from',p.from,'date','required')+input('Конец','to',p.to,'date','required'):''}
    </div><div class="actions">${formButton('Применить')}</div></form>`)
    +(d?`<div class="kpis">${kpi('Баланс',rub(d.balance),true)}${kpi('Доходы',rub(d.earned))}${kpi('Расходы',rub(d.spent))}${kpi('Норма сбережений',percent(d.savingsRate))}</div>
      <div class="grid">${card('Расходы за год',groups(d.expense))}${card('Доходы за год',groups(d.income))}</div>
      ${card('Кредиты',`${pair('Остаток долга',rub(credit?.balance))}${pair('Платежи в этом месяце',rub(credit?.thisMonth))}
      ${pair('Ближайший платёж',credit?.next?day(credit.next.date)+' · '+rub(credit.next.amount):'—')}
      ${pair('Выплачено основного долга',rub(credit?.principalPaid))}${pair('Выплачено процентов',rub(credit?.interestPaid))}
      ${pair('Переплата по графику',rub(credit?.overpayment))}${pair('Дата полного погашения',day(credit?.payoff))}
      ${pair('Кредитная нагрузка за период',percent(d.creditLoad))}
      ${(credit?.loans||[]).map(loan=>pair(esc(loan.name),rub(loan.balance)+' · '+esc(loan.rate)+'% · '+rub(loan.payment)+' · '+esc(loan.remaining)+' пл. · '+esc(loan.status))).join('')}`)}`
    :card('Сводка',empty('Загрузите данные из Google Таблицы.')));
}
export function transactionsView(s) {
  if (!s?.transactions.length) return title('Транзакции')+card('Операции',empty('За выбранный период операций нет.'));
  return title('Транзакции')+card('Операции',table(['Дата','Описание','Сумма','Категория',''],s.transactions.map(tx=>{
    const id=s.directory.find(x=>x.category===tx.category&&x.subcategory===tx.subcategory)?.id||'';
    return `<tr class="${tx.category?'':'unclassified'}"><td>${day(tx.date)}</td><td class="description">${esc(tx.description)}</td>
      <td class="money">${tx.type==='Списание'?'−':'+'}${rub(tx.amount)}</td>
      <td><select data-tx="${esc(tx.id)}" aria-label="Категория операции">${optionList(s.directory,id)}</select></td>
      <td>${tx.type==='Списание' && s.loans.length?shortcut('link-tx','Привязать',tx.id):''}</td></tr>`;
  })));
}
export function budgetView(s,month) {
  return title('Бюджет')+card('План и факт',`<form id="budget-period"><div class="fields">${input('Месяц','period',month,'month','required')}</div><div class="actions">${formButton('Показать')}</div></form>`+
    (s?.budget?.rows?.length?table(['Подкатегория','План','Факт','Отклонение','Исполнение',''],s.budget.rows.filter(row=>row.kind!=='loan-in').map(row=>`<tr class="${row.difference>0?'over':''}">
    <td>${esc(row.subcategory)}<br><small>${esc(row.category)}</small></td>
    <td class="money">${row.auto?rub(row.planned):`<input type="number" aria-label="План для ${esc(row.subcategory)}" ${num} data-plan="${esc(row.id)}" value="${row.planned}">`}</td>
    <td class="money">${rub(row.fact)}</td><td class="money">${rub(row.difference)}</td><td>${row.ratio===null?'—':percent(row.ratio)}</td>
    <td>${row.auto?'<small>По графику</small>':shortcut('save-plan','Сохранить',row.id)}</td></tr>`)):empty('Данные бюджета ещё не загружены.')));
}
const kinds=[['regular','Обычная операция'],['own','Между своими счетами'],['savings','Накопления'],['loan-in','Выдача кредита'],['payment','Платёж по кредиту'],['early','Досрочное погашение'],['interest','Проценты'],['fee','Комиссии']];
function directoryView(s,edited,editedRule) {
  return `<details class="section" ${edited||editedRule?'open':''}><summary>Категории и правила</summary>
    <form id="directory-form" class="stack"><h3>${edited?'Изменить подкатегорию':'Добавить подкатегорию'}</h3>
    <input type="hidden" name="id" value="${esc(edited?.id)}"><div class="fields">
    ${input('Категория','category',edited?.category,'text','required maxlength="100"')}
    ${input('Подкатегория','subcategory',edited?.subcategory,'text','required maxlength="100"')}
    ${input('Ключевые слова через |','keywords',edited?.keywords)}${select('Вид учёта','kind',kinds,edited?.kind)}</div>
    <div class="actions">${formButton('Сохранить подкатегорию')}${edited?shortcut('delete-directory','Удалить',edited.id)+shortcut('edit-directory','Отмена'):''}</div></form>
    <div class="actions"><label class="field">Подкатегория для редактирования<select id="edit-directory">${optionList(s.directory,edited?.id)}</select></label></div>
    <form id="rule-form" class="stack"><h3>${editedRule?'Изменить правило':'Добавить правило'}</h3>
    <input type="hidden" name="id" value="${esc(editedRule?.id)}"><div class="fields">
    ${input('Фрагмент описания','pattern',editedRule?.pattern,'text','required maxlength="150"')}
    <label class="field">Подкатегория<select name="directoryId" required>${optionList(s.directory,editedRule?.directoryId)}</select></label>
    ${input('Приоритет','priority',editedRule?.priority??0,'number')}
    <label class="check"><input type="checkbox" name="active" ${editedRule?.active===false?'':'checked'}>Активно</label></div>
    <div class="actions">${formButton('Сохранить правило')}${editedRule?shortcut('edit-rule','Отмена'):''}</div></form>
    <div class="actions"><label class="field">Правило для редактирования<select id="edit-rule">${options([['','Выберите'],...s.rules.map(x=>[x.id,x.pattern])],editedRule?.id)}</select></label></div>
    </details>`;
}
export function importView(state) {
  const s=state.snapshot || {directory:[],rules:[]};
  const p=state.preview;
  return title('Загрузка выписки')+card('Файл выписки',`<div id="drop" class="drop"><label for="statement"><strong>Выберите файл или перетащите сюда</strong><br><small>CSV, XLSX, текстовый PDF Альфа-Банка · до 25 МБ</small></label><input id="statement" type="file" accept=".csv,.xlsx,.pdf,text/csv,application/pdf"></div>`)+
    (p?card('Предпросмотр',`
      <p>${p.summary?`Новые <strong>${p.summary.added}</strong> · дубликаты <strong>${p.summary.duplicates}</strong> · без категории <strong>${p.summary.uncategorized}</strong> · совпадения с графиком <strong>${p.summary.matched}</strong>${p.summary.estimated?' · По последним сохранённым данным':''}`:
        `Разобрано <strong>${p.rows.length}</strong> · без категории <strong>${p.rows.filter(x=>!x.directoryId).length}</strong>. Дубли и платежи проверятся при синхронизации.`}</p>
      ${p.rejected.length?`<p class="negative">Строки, которые не будут импортированы: ${esc(p.rejected.join(', '))}.</p>`:''}
      ${table(['Дата','Описание','Сумма','Категория','Запомнить правило'],p.rows.map((tx,i)=>`<tr class="${tx.directoryId?'':'unclassified'}"><td>${day(tx.date)}</td><td class="description">${esc(tx.description)}</td>
        <td class="money">${tx.type==='Списание'?'−':'+'}${rub(tx.amount)}</td><td><select data-preview="${i}" aria-label="Категория строки ${i+1}">${optionList(s.directory,tx.directoryId)}</select></td>
        <td>${tx.remember || tx.edited?`<label class="check"><input type="checkbox" data-remember="${i}" ${tx.remember?'checked':''}>Правило</label>
          <input aria-label="Фрагмент для правила" data-pattern="${i}" maxlength="150" value="${esc(tx.pattern)}">`:''}</td></tr>`))}
      <div class="actions"><button type="button" data-action="confirm-import">Подтвердить импорт</button>${shortcut('cancel-import','Отмена')}</div>`):'')+
    directoryView(s,s.directory.find(x=>x.id===state.editedDirectory),s.rules.find(x=>x.id===state.editedRule));
}
const loanFields=(loan,kind)=>`<input type="hidden" name="id" value="${esc(loan?.id)}"><div class="fields">
  ${input('Название','name',loan?.name,'text','required')}${input('Кредитор','lender',loan?.lender,'text','required')}
  ${select('Вид','kind',[['Кредит','Кредит'],['Кредитная карта','Кредитная карта']],kind)}
  ${input('Дата выдачи','issued',loan?.issued,'date','required')}
  ${input('Ставка годовых, %','rate',loan?.rate??0,'number',num)}
  ${input('День платежа','day',loan?.day??1,'number','min="1" max="31" required')}
  ${kind==='Кредитная карта'?
    input('Лимит','limit',loan?.limit,'number',num)+input('Текущий долг','cardDebt',loan?.cardDebt,'number',num)+
    input('Льготный период, дней','grace',loan?.grace,'number','min="0"')+input('Минимальный платёж','minimum',loan?.minimum,'number',num):
    input('Сумма','principal',loan?.principal,'number',num+' required')+input('Срок, мес.','months',loan?.months,'number','min="1" max="600" required')+
    select('Тип платежа','paymentType',[['Аннуитетный','Аннуитетный'],['Дифференцированный','Дифференцированный']],loan?.paymentType)}
  ${select('Статус','status',[['Активный','Активный'],['Закрыт','Закрыт']],loan?.status)}
  ${input('Ключевые слова через |','keywords',loan?.keywords)}
  </div>`;
const loanOptions=(loans)=>loans.map(x=>[x.id,x.name]);
export function loansView(state) {
  const loans=state.snapshot?.loans||[];
  const edited=loans.find(x=>x.id===state.editedLoan);
  const graph=state.schedule?.rows||[];
  return title('Кредиты')+
    (loans.length?`<div class="grid">${loans.map(loan=>card(esc(loan.name),`<p class="muted">${esc(loan.lender)} · ${esc(loan.status)}</p>
      ${pair('Остаток',rub(loan.balance))}${pair('Ставка',esc(loan.rate)+'%')}${pair(loan.kind==='Кредитная карта'?'Минимальный платёж':'Платёж',rub(loan.payment))}
      ${loan.kind==='Кредитная карта'?pair('Лимит',rub(loan.limit))+pair('Льготный период',esc(loan.grace)+' дн.'):
        `<progress value="${Math.min(loan.principalPaid,loan.principal)}" max="${loan.principal||1}" aria-label="Погашено"></progress>${pair('Погашено',rub(loan.principalPaid))}${pair('Следующий платёж',loan.next?day(loan.next.date)+' · '+rub(loan.next.amount):'—')}`}
      <div class="actions">${shortcut('edit-loan','Изменить',loan.id)}${loan.kind!=='Кредитная карта'?shortcut('schedule','График',loan.id):''}</div>`)).join('')}</div>`:card('Список кредитов',empty('Добавьте кредит или кредитную карту.')))+
    (state.schedule?card('График платежей',table(['Дата','Платёж','Основной долг','Проценты','Досрочно','Остаток','Статус'],graph.map(row=>`<tr>
      <td>${day(row.date)}</td><td class="money">${rub(row.amount)}</td><td class="money">${rub(row.principal)}</td><td class="money">${rub(row.interest)}</td>
      <td class="money">${rub(row.extra)}</td><td class="money">${rub(row.balance)}</td><td><span class="status-chip">${esc(row.status)}</span></td></tr>`))):'')+
    card(edited?'Изменить кредит':'Добавить кредит',`<form id="loan-form">${loanFields(state.loanDraft||edited,state.loanKind||edited?.kind||'Кредит')}
    <div class="actions">${formButton('Сохранить')}${edited?shortcut('edit-loan','Отмена'):''}</div></form>`)+
    (loans.some(x=>x.kind==='Кредит'&&x.status==='Активный')?card('Досрочное погашение',`
      <form id="early-form"><div class="fields">${select('Кредит','loanId',loanOptions(loans.filter(x=>x.kind==='Кредит'&&x.status==='Активный')),state.earlyData?.loanId)}
        ${input('Дата','date',state.earlyData?.date,'date','required')}${input('Сумма','amount',state.earlyData?.amount,'number',num)}
        ${select('Вид','type',[['Частичное','Частичное'],['Полное','Полное']],state.earlyData?.type)}
        ${select('Способ','mode',[['Уменьшить срок','Уменьшить срок'],['Уменьшить платёж','Уменьшить платёж']],state.earlyData?.mode)}
        </div><div class="actions">${formButton('Рассчитать')}</div></form>
      ${state.earlyResult?`<div class="stack">${pair('Сумма погашения',rub(state.earlyResult.amount))}${pair('Экономия процентов',rub(state.earlyResult.savings))}
        ${pair('Новая дата погашения',day(state.earlyResult.payoff))}${pair('Следующий платёж',rub(state.earlyResult.nextPayment))}${pair('Осталось платежей',esc(state.earlyResult.remaining))}
        <div class="actions"><button data-action="save-early">Записать погашение</button></div></div>`:''}`):'')+
    (state.linkTx?card('Ручная привязка',`<p>${esc(state.linkTx.description)} · ${rub(state.linkTx.amount)}</p>
      <form id="link-form"><div class="fields">${select('Кредит','loanId',loanOptions(loans),state.linkLoan)}
      ${select('Платёж из графика','paymentId',[['','Без строки графика'],...graph.map(x=>[x.id,x.date+' · '+rub(x.amount)+' · '+x.status])],'')}
      ${select('Вид без графика','kind',[['payment','Основной долг'],['interest','Проценты'],['fee','Комиссии']],'payment')}
      </div><div class="actions">${formButton('Привязать')}${shortcut('cancel-link','Отмена')}</div></form>`):'');
}
