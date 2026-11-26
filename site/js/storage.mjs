// Keep settings, snapshots and queued changes local to this repository's Pages path.
const name='personal-finance:' + new URL('../',import.meta.url).pathname;
const db = new Promise((resolve,reject) => {
  const request=indexedDB.open(name,1);
  request.onupgradeneeded=()=>request.result.createObjectStore('local');
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
});
async function action(mode,perform) {
  const database=await db;
  return new Promise((resolve,reject)=>{
    const tx=database.transaction('local',mode);
    const request=perform(tx.objectStore('local'));
    tx.oncomplete=()=>resolve(request.result);
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error);
  });
}
export const get=key=>action('readonly',store=>store.get(key));
export const set=(key,value)=>action('readwrite',store=>store.put(value,key));
export const clear=()=>action('readwrite',store=>store.clear());
