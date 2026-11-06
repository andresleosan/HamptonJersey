// Local-only fixture host for email browser checks. No production credentials, persistent database or remote binding.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, resolve } from "node:path";
import { makeEnv, adminCookie } from "./server/helpers.mjs";
import { handleApi } from "../server/api.js";
import { emailPass } from "../server/email.js";
import { receiveEmail } from "../server/email-inbound.js";

export async function emailFixture(port=0) {
  const env=makeEnv(), errors=[], sent=[];
  env.EMAIL_SERVICE_READY="false";
  env.EMAIL={async send(m){sent.push(m);return {messageId:`local-${sent.length}`};}};
  const stamp=()=>new Date().toISOString();
  const tick=()=>{const ts=stamp().slice(0,10)+"T12:00:00.000Z";return emailPass(env,ts,()=>ts);};
  const receive=async (body="<script>window.emailAttack=true</script> Reply from the local fixture",subject="Reply <img src=x onerror=attack()>")=>{
    const bytes=new TextEncoder().encode(`From: team@example.test\r\nSubject: ${subject}\r\nContent-Type: text/plain\r\n\r\n${body}`);
    await receiveEmail({from:"team@example.test",to:"replies@app.hamptonestatesjersey.com",rawSize:bytes.length,
      raw:new ReadableStream({start(c){c.enqueue(bytes);c.close();}}),setReject(r){throw Error(r);}},env,stamp());
  };
  const site=resolve(fileURLToPath(new URL("../site/",import.meta.url)));
  let base;
  const server=createServer(async (req,res)=>{
    try {
      const url=new URL(req.url,base);
      if(url.pathname==="/__test/sign-in") {
        res.writeHead(302,{"set-cookie":`${await adminCookie()}; HttpOnly; Secure; SameSite=Strict; Path=/`,location:"/admin/#/automations"});res.end();return;
      }
      // For the interactive MCP walkthrough only; this server binds loopback and exists only in tests/.
      if(url.pathname==="/__test/ready") {env.EMAIL_SERVICE_READY="true";await tick();res.end("Local email binding ready");return;}
      if(url.pathname==="/__test/receive") {await receive();res.end("Local MIME message received");return;}
      if(url.pathname==="/__test/tick") {await tick();res.end("Local clock tick complete");return;}
      if(url.pathname.startsWith("/api/")) {
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        const pending=[];
        const response=await handleApi(new Request(url,{method:req.method,headers:req.headers,
          ...(["GET","HEAD"].includes(req.method)?{}:{body:Buffer.concat(chunks)})}),env,
          url.pathname.slice(5).split("/"),p=>pending.push(p));
        await Promise.all(pending);
        res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
      }
      const file=resolve(site,"."+(url.pathname==="/admin/"?"/admin/index.html":url.pathname));
      if(!file.startsWith(site+"/") || !existsSync(file)){res.writeHead(404);res.end("Not found");return;}
      const types={".html":"text/html",".js":"application/javascript",".css":"text/css",".svg":"image/svg+xml"};
      res.writeHead(200,{"content-type":types[extname(file)]||"application/octet-stream"});res.end(readFileSync(file));
    }catch(e){errors.push(String(e));res.writeHead(500);res.end("Local fixture failed");}
  });
  await new Promise(r=>server.listen(port,"127.0.0.1",r));base=`http://127.0.0.1:${server.address().port}`;
  return {base,env,errors,sent,tick,receive,close:()=>new Promise(r=>server.close(r))};
}
if(process.argv.includes("--serve")) {
  const fixture=await emailFixture(8790);
  console.log(`Local email fixture: ${fixture.base}/__test/sign-in`);
}
