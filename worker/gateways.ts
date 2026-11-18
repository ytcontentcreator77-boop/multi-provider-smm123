import type { Env } from "./env";
import { alertAdmins } from "./alerts";

type Gateway = "khalti" | "esewa" | "paytm";
type Topup = { id:number; user_id:number; amount:number; pay_amount:number; currency:string; credit_amount:number; gateway:string; gateway_ref:string|null; status:string };
const enc = new TextEncoder();
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s:string) => Uint8Array.from(atob(s), c=>c.charCodeAt(0));
const hex = (b:Uint8Array) => [...b].map(x=>x.toString(16).padStart(2,"0")).join("");
const equal = (a:string,b:string) => { if(a.length!==b.length) return false; let d=0; for(let i=0;i<a.length;i++) d|=a.charCodeAt(i)^b.charCodeAt(i); return d===0; };
async function sha256(s:string){ return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(s)))); }
async function hmac(s:string,key:string){ const k=await crypto.subtle.importKey("raw",enc.encode(key),{name:"HMAC",hash:"SHA-256"},false,["sign"]); return b64(new Uint8Array(await crypto.subtle.sign("HMAC",k,enc.encode(s)))); }
async function paytmEncrypt(text:string,key:string){
  const k=enc.encode(key); if(k.length!==16) throw new Error("PAYTM_MERCHANT_KEY_MUST_BE_16_BYTES");
  const cryptoKey=await crypto.subtle.importKey("raw",k,{name:"AES-CBC"},false,["encrypt"]);
  const iv=enc.encode("@@@@&&&&####$$$$");
  return b64(new Uint8Array(await crypto.subtle.encrypt({name:"AES-CBC",iv},cryptoKey,enc.encode(text))));
}
async function paytmDecrypt(cipher:string,key:string){
  const k=enc.encode(key); if(k.length!==16) throw new Error("PAYTM_MERCHANT_KEY_MUST_BE_16_BYTES");
  const cryptoKey=await crypto.subtle.importKey("raw",k,{name:"AES-CBC"},false,["decrypt"]);
  const iv=enc.encode("@@@@&&&&####$$$$");
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-CBC",iv},cryptoKey,unb64(cipher)));
}
async function paytmSignString(value:string,key:string){ const salt=Array.from(crypto.getRandomValues(new Uint8Array(4)),x=>"9876543210ZYXWVUTSRQPONMLKJIHGFEDCBAabcdefghijklmnopqrstuvwxyz!@#$&_"[x%"9876543210ZYXWVUTSRQPONMLKJIHGFEDCBAabcdefghijklmnopqrstuvwxyz!@#$&_".length]).join(""); return paytmEncrypt((await sha256(`${value}|${salt}`))+salt,key); }
async function paytmVerifyString(value:string,key:string,signature:string){ try { const plain=await paytmDecrypt(signature,key); const salt=plain.slice(-4); return equal(plain,(await sha256(`${value}|${salt}`))+salt); } catch { return false; } }
async function paytmSignBody(body:string,key:string){ return paytmSignString(body,key); }
async function jsonFetch(url:string,init:RequestInit){ const r=await fetch(url,{...init,signal:AbortSignal.timeout(20000)}); const j=await r.json().catch(()=>null); if(!r.ok||!j) throw new Error(`GATEWAY_HTTP_${r.status}`); return j as any; }

export function gatewayReady(env:Env,g:string){
  if(g==="khalti") return !!env.KHALTI_SECRET_KEY;
  if(g==="esewa") return !!env.ESEWA_PRODUCT_CODE && !!env.ESEWA_SECRET_KEY;
  if(g==="paytm") return !!env.PAYTM_MID && !!env.PAYTM_MERCHANT_KEY;
  return false;
}

export async function createGatewayCheckout(env:Env, request:Topup, origin:string, userName:string){
  const gateway=request.gateway as Gateway;
  if(!["khalti","esewa","paytm"].includes(gateway)||!gatewayReady(env,gateway)) throw new Error("GATEWAY_NOT_CONFIGURED");
  if(gateway==="khalti"){
    if(request.currency!=="NPR") throw new Error("GATEWAY_CURRENCY_MISMATCH");
    const base=(env.KHALTI_BASE_URL||"https://a.khalti.com/api/v2").replace(/\/$/,"");
    const data=await jsonFetch(`${base}/epayment/initiate/`,{method:"POST",headers:{Authorization:`Key ${env.KHALTI_SECRET_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({return_url:`${origin}/hooks/payments/khalti/return?requestId=${request.id}`,website_url:origin,amount:Math.round(request.pay_amount*100),purchase_order_id:String(request.id),purchase_order_name:`Wallet top-up #${request.id}`,customer_info:{name:userName.slice(0,80)}})});
    if(!data.pidx||!data.payment_url) throw new Error("KHALTI_INITIATE_FAILED");
    await env.DB.prepare("UPDATE topup_requests SET gateway_ref=?1 WHERE id=?2 AND status='pending'").bind(String(data.pidx),request.id).run();
    return {type:"redirect",url:String(data.payment_url)};
  }
  if(gateway==="esewa"){
    if(request.currency!=="NPR") throw new Error("GATEWAY_CURRENCY_MISMATCH");
    const uuid=`TOPUP-${request.id}-${crypto.randomUUID()}`;
    const product=env.ESEWA_PRODUCT_CODE!;
    const total=request.pay_amount.toFixed(2);
    const signed="total_amount,transaction_uuid,product_code";
    const signature=await hmac(`total_amount=${total},transaction_uuid=${uuid},product_code=${product}`,env.ESEWA_SECRET_KEY!);
    const test=env.ESEWA_ENV!=="live";
    const action=test?"https://rc-epay.esewa.com.np/api/epay/main/v2/form":"https://epay.esewa.com.np/api/epay/main/v2/form";
    await env.DB.prepare("UPDATE topup_requests SET gateway_ref=?1 WHERE id=?2 AND status='pending'").bind(uuid,request.id).run();
    return {type:"form",action,fields:{amount:total,tax_amount:"0",total_amount:total,transaction_uuid:uuid,product_code:product,product_service_charge:"0",product_delivery_charge:"0",success_url:`${origin}/hooks/payments/esewa/success?requestId=${request.id}`,failure_url:`${origin}/hooks/payments/esewa/failure?requestId=${request.id}`,signed_field_names:signed,signature}};
  }
  if(request.currency!=="INR") throw new Error("GATEWAY_CURRENCY_MISMATCH");
  const mid=env.PAYTM_MID!, merchantKey=env.PAYTM_MERCHANT_KEY!;
  const orderId=`TOPUP${request.id}${Date.now().toString(36)}`;
  const base=(env.PAYTM_BASE_URL||(env.PAYTM_ENV==="live"?"https://securegw.paytm.in":"https://securegw-stage.paytm.in")).replace(/\/$/,"");
  const body={requestType:"Payment",mid,websiteName:env.PAYTM_WEBSITE||(env.PAYTM_ENV==="live"?"DEFAULT":"WEBSTAGING"),orderId,callbackUrl:`${origin}/hooks/payments/paytm/return?requestId=${request.id}`,txnAmount:{value:request.pay_amount.toFixed(2),currency:"INR"},userInfo:{custId:String(request.user_id)}};
  const raw=JSON.stringify(body);
  const signature=await paytmSignBody(raw,merchantKey);
  const init=await jsonFetch(`${base}/theia/api/v1/initiateTransaction?mid=${encodeURIComponent(mid)}&orderId=${encodeURIComponent(orderId)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body,head:{signature}})});
  const txnToken=init?.body?.txnToken;
  if(!txnToken||init?.body?.resultInfo?.resultStatus!=="S") throw new Error("PAYTM_INITIATE_FAILED");
  await env.DB.prepare("UPDATE topup_requests SET gateway_ref=?1 WHERE id=?2 AND status='pending'").bind(orderId,request.id).run();
  return {type:"form",action:`${base}/theia/api/v1/showPaymentPage?mid=${encodeURIComponent(mid)}&orderId=${encodeURIComponent(orderId)}`,fields:{mid,orderId,txnToken}};
}

async function credit(env:Env,row:Topup,externalRef:string){
  const now=Math.floor(Date.now()/1000);
  const results=await env.DB.batch([
    env.DB.prepare("UPDATE topup_requests SET status='paid',gateway_external_ref=?1,paid_at=?2 WHERE id=?3 AND status='pending'").bind(externalRef,now,row.id),
    env.DB.prepare("UPDATE users SET balance=balance+?1 WHERE id=?2 AND changes()=1").bind(row.credit_amount,row.user_id),
    env.DB.prepare("INSERT INTO ledger(user_id,delta,kind,ref,note,created_at) SELECT ?1,?2,'topup_gateway',?3,?4,?5 WHERE changes()=1").bind(row.user_id,row.credit_amount,row.id,`Verified ${row.gateway} top-up ${row.amount} ${row.currency}`,now),
    env.DB.prepare("INSERT INTO payment_gateway_events(gateway,external_ref,request_id,event_type,received_at) SELECT gateway,gateway_external_ref,id,'paid',?1 FROM topup_requests WHERE id=?2 AND status='paid' AND changes()=1 ON CONFLICT DO NOTHING").bind(now,row.id),
  ]);
  return !!results[0]?.meta?.changes;
}
async function getTopup(env:Env,id:number){ return env.DB.prepare("SELECT id,user_id,amount,pay_amount,currency,credit_amount,gateway,gateway_ref,status FROM topup_requests WHERE id=?1").bind(id).first<Topup>(); }

export async function verifyGatewayReturn(env:Env,gateway:Gateway,id:number,request:Request):Promise<{ok:boolean;reason?:string;already?:boolean}>{
  const row=await getTopup(env,id); if(!row||row.gateway!==gateway) return {ok:false,reason:"NOT_FOUND"};
  if(row.status==="paid") return {ok:true,already:true};
  if(row.status!=="pending"||!row.gateway_ref) return {ok:false,reason:"NOT_PENDING"};
  if(gateway==="khalti"){
    const base=(env.KHALTI_BASE_URL||"https://a.khalti.com/api/v2").replace(/\/$/,"");
    const pidx=new URL(request.url).searchParams.get("pidx")||row.gateway_ref;
    if(pidx!==row.gateway_ref) return {ok:false,reason:"REFERENCE_MISMATCH"};
    const data=await jsonFetch(`${base}/epayment/lookup/`,{method:"POST",headers:{Authorization:`Key ${env.KHALTI_SECRET_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({pidx})});
    if(data.status!=="Completed") {
      if(["failed","expired","user canceled","cancelled","refunded"].includes(String(data.status).toLowerCase())) await markGatewayFailed(env,id,gateway);
      return {ok:false,reason:"NOT_PAID"};
    }
    if(Number(data.total_amount)!==Math.round(row.pay_amount*100)||!data.transaction_id) return {ok:false,reason:"AMOUNT_MISMATCH"};
    return {ok:await credit(env,row,String(data.transaction_id))};
  }
  if(gateway==="esewa"){
    const url=new URL(request.url); const encoded=url.searchParams.get("data");
    let callbackData:any=null;
    if(encoded){
      try{ callbackData=JSON.parse(new TextDecoder().decode(unb64(encoded))); }catch{return {ok:false,reason:"BAD_RESPONSE"};}
      const names=String(callbackData.signed_field_names||"").split(",").filter(Boolean);
      if(!names.length) return {ok:false,reason:"BAD_SIGNATURE"};
      const message=names.map((n:string)=>`${n}=${callbackData[n]}`).join(",");
      const expected=await hmac(message,env.ESEWA_SECRET_KEY||"");
      if(!equal(expected,String(callbackData.signature||""))) return {ok:false,reason:"BAD_SIGNATURE"};
      if(callbackData.status!=="COMPLETE") {
        if(["FAILED","CANCELED","CANCELLED"].includes(String(callbackData.status).toUpperCase())) await markGatewayFailed(env,id,gateway);
        return {ok:false,reason:"NOT_PAID"};
      }
      if(String(callbackData.transaction_uuid)!==row.gateway_ref||String(callbackData.product_code)!==env.ESEWA_PRODUCT_CODE||Number(String(callbackData.total_amount).replace(/,/g,""))!==Number(row.pay_amount.toFixed(2))) return {ok:false,reason:"AMOUNT_OR_REFERENCE_MISMATCH"};
    }
    const test=env.ESEWA_ENV!=="live";
    const statusUrl=test?"https://uat.esewa.com.np/api/epay/transaction/status/":"https://epay.esewa.com.np/api/epay/transaction/status/";
    const verify=await jsonFetch(`${statusUrl}?${new URLSearchParams({product_code:env.ESEWA_PRODUCT_CODE!,total_amount:row.pay_amount.toFixed(2),transaction_uuid:row.gateway_ref})}`,{method:"GET"});
    if(verify.status!=="COMPLETE"||String(verify.transaction_uuid)!==row.gateway_ref||Number(String(verify.total_amount).replace(/,/g,""))!==Number(row.pay_amount.toFixed(2))) return {ok:false,reason:"STATUS_NOT_CONFIRMED"};
    return {ok:await credit(env,row,String(verify.ref_id||callbackData?.transaction_code||row.gateway_ref))};
  }
  const mid=env.PAYTM_MID!, key=env.PAYTM_MERCHANT_KEY!;
  const base=(env.PAYTM_BASE_URL||(env.PAYTM_ENV==="live"?"https://securegw.paytm.in":"https://securegw-stage.paytm.in")).replace(/\/$/,"");
  const body={mid,orderId:row.gateway_ref}; const raw=JSON.stringify(body);
  const signature=await paytmSignBody(raw,key);
  const data=await jsonFetch(`${base}/v3/order/status`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body,head:{signature}})});
  const responseBody=data?.body; const responseSig=data?.head?.signature;
  if(!responseBody||!responseSig||!(await paytmVerifyString(JSON.stringify(responseBody),key,responseSig))) return {ok:false,reason:"BAD_SIGNATURE"};
  if(responseBody.resultInfo?.resultStatus==="TXN_FAILURE") { await markGatewayFailed(env,id,gateway); return {ok:false,reason:"PAYMENT_FAILED"}; }
  if(responseBody.resultInfo?.resultStatus!=="TXN_SUCCESS"||responseBody.orderId!==row.gateway_ref||Number(responseBody.txnAmount)!==Number(row.pay_amount.toFixed(2))||responseBody.mid!==mid) return {ok:false,reason:"NOT_PAID"};
  return {ok:await credit(env,row,String(responseBody.txnId||row.gateway_ref))};
}

export async function markGatewayFailed(env:Env,id:number,gateway:Gateway){
  await env.DB.batch([
    env.DB.prepare("UPDATE topup_requests SET status='failed',failure_reason='Provider reported payment failure' WHERE id=?1 AND gateway=?2 AND status='pending'").bind(id,gateway),
    env.DB.prepare("INSERT INTO payment_gateway_events(gateway,external_ref,request_id,event_type,received_at) SELECT gateway,COALESCE(gateway_ref,'request-'||id),id,'failed',?1 FROM topup_requests WHERE id=?2 AND status='failed' AND changes()=1 ON CONFLICT DO NOTHING").bind(Math.floor(Date.now()/1000),id),
  ]);
}


/** Scheduled reconciliation: only authoritative provider lookups can credit pending gateway requests. */
export async function reconcilePendingGatewayPayments(env:Env, now=Math.floor(Date.now()/1000)){
  const due=await env.DB.prepare("SELECT id,gateway FROM topup_requests WHERE status='pending' AND gateway IN ('khalti','esewa','paytm') AND created_at<?1 AND gateway_checked_at<?2 ORDER BY id LIMIT 5").bind(now-45,now-110).all<{id:number;gateway:Gateway}>();
  let paid=0;
  for(const row of due.results){
    await env.DB.prepare("UPDATE topup_requests SET gateway_checked_at=?1 WHERE id=?2 AND status='pending'").bind(now,row.id).run();
    try{
      const synthetic=new Request(`https://internal.invalid/hooks/payments/${row.gateway}/return?requestId=${row.id}`);
      const result=await verifyGatewayReturn(env,row.gateway,row.id,synthetic);
      if(result.ok) paid++;
    }catch(e){
      console.warn("gateway reconciliation failed",row.gateway,row.id,(e as Error).message);
      await alertAdmins(env,"payment",`Payment gateway <b>${row.gateway}</b> status reconciliation failed for top-up #${row.id}. Check merchant credentials and provider availability.`);
    }
  }
  return {checked:due.results.length,paid};
}


export async function expireOldGatewayTopups(env:Env, now=Math.floor(Date.now()/1000)){
  const results=await env.DB.batch([
    env.DB.prepare("UPDATE topup_requests SET status='failed',failure_reason='Payment session expired' WHERE status='pending' AND gateway IN ('khalti','esewa','paytm') AND created_at<?1").bind(now-24*3600),
    env.DB.prepare("INSERT INTO payment_gateway_events(gateway,external_ref,request_id,event_type,received_at) SELECT gateway,COALESCE(gateway_ref,'request-'||id),id,'expired',?1 FROM topup_requests WHERE status='failed' AND failure_reason='Payment session expired' AND created_at<?2 ON CONFLICT DO NOTHING").bind(now,now-24*3600),
  ]);
  return results[0]?.meta?.changes??0;
}
