export function endpoint(value) {
  const url = new URL(value);
  if (url.origin!=='https://script.google.com' || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname) || url.search || url.hash || url.username || url.password) throw new Error('Укажите URL развёртывания Apps Script, оканчивающийся на /exec.');
  return url.href;
}
export async function call(settings,action,data={},change) {
  let response;
  try {
    response=await fetch(settings.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},
      body:JSON.stringify({token:settings.token,action,data,change}),credentials:'omit',cache:'no-store',
      signal:AbortSignal.timeout ? AbortSignal.timeout(35000) : undefined});
  } catch {
    throw Object.assign(new Error('Связь с Apps Script недоступна. Проверьте сеть и доступ «Все».'),{code:'NETWORK'});
  }
  let result;
  try { result=await response.json(); }
  catch { throw Object.assign(new Error('Apps Script не вернул JSON. Проверьте URL и права развёртывания.'),{code:'BAD_RESPONSE'}); }
  if (!result.ok) throw Object.assign(new Error(result.error?.message || 'Ошибка API.'),{code:result.error?.code});
  return result.data;
}
