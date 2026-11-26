export const norm = value => String(value ?? '').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
export function categorize(tx, directory, rules, loans) {
  const description=norm(tx.description);
  const options=directory.filter(item=>item.active);
  const findKind=kind=>options.find(item=>item.kind===kind)?.id || '';
  for (const rule of rules.filter(x=>x.active).sort((a,b)=>b.priority-a.priority||String(b.updated).localeCompare(a.updated))) {
    if (norm(rule.pattern) && description.includes(norm(rule.pattern)) && options.some(x=>x.id===rule.directoryId)) return rule.directoryId;
  }
  const candidates=options.flatMap(item=>String(item.keywords || '').split('|').map(norm).filter(Boolean).map(word=>({item,word})));
  const byText=candidates.sort((a,b)=>b.word.length-a.word.length).find(({word})=>description.includes(word));
  if (byText) return byText.item.id;
  if (tx.type==='Списание' && loans.some(loan=>loan.status==='Активный' && String(loan.keywords||'').split('|').map(norm).filter(Boolean).some(word=>description.includes(word)) && Math.abs(loan.payment-tx.amount)<=0.01)) return findKind('payment');
  if (/(?:перевод|сбп)\s+(?:(?:кому|для)\s+)?[А-ЯЁ][а-яё]{2,}(?:\s+[А-ЯЁ][а-яё.]{1,})+/.test(tx.description)) return options.find(x=>x.category==='Переводы людям')?.id || '';
  return '';
}
