import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { readChatVersion, issueChatReply, commitChatReply, purgeExpiredChatReplyOperations } from '../../server/chat-semantic.js';

const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const { unstable_splitSqlQuery } = require('wrangler');
const migrations = new URL('../../migrations/', import.meta.url);
const proposal = new URL('../../docs/roadmap/work/MSG-02/semantic-cas.proposed.sql', import.meta.url);

async function apply(DB, url) {
  const statements = unstable_splitSqlQuery(readFileSync(url,'utf8')).map(sql => DB.prepare(sql));
  if (statements.length) await DB.batch(statements);
}
async function chat(DB) {
  const key=crypto.randomUUID(), ts=new Date().toISOString();
  await DB.prepare(`INSERT INTO chats(key_hash,name,email,privacy_ack_at,created_at,last_at,waiting_since)
    VALUES(?,?,?,?,?,?,?)`).bind(key,'Synthetic visitor','visitor@example.test',ts,ts,ts,ts).run();
  return (await DB.prepare('SELECT id FROM chats WHERE key_hash=?').bind(key).first()).id;
}
async function issue(env,id,actor_ref=crypto.randomUUID()) {
  const version=await readChatVersion(env,id);
  const context={chat_id:id,generation:version.generation,expected_revision:version.revision,actor_ref};
  const result=await issueChatReply(env,context);
  return { context, ...result };
}

test('D1 local: revision, reply races, durable receipts and bounded expiry proposal', async t => {
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,
    script:"export default {fetch(){return new Response('fixture')}}",compatibilityDate:'2025-10-01',
    host:'127.0.0.1',port:0,d1Databases:{DB:'msg02-semantic-synthetic'}}));
  try {
    const DB=await mf.getD1Database('DB'), env={DB};
    for(const file of readdirSync(migrations).filter(name=>name.endsWith('.sql')).sort())
      await apply(DB,new URL(file,migrations));
    const oldChat=await chat(DB);
    const baseline=await chat(DB), count=256;
    const baselineInsert=DB.prepare("INSERT INTO chat_messages(chat_id,role,text,created_at) VALUES(?,'team',?,?)");
    for(let start=0;start<count;start+=64)
      await DB.batch(Array.from({length:64},()=>baselineInsert.bind(baseline,'Synthetic response',new Date().toISOString())));
    const baselineDelete=await DB.prepare('DELETE FROM chats WHERE id=?').bind(baseline).run();
    await apply(DB,proposal);
    assert.equal(await readChatVersion(env,oldChat),null, 'historical chats require a separate bounded backfill');
    const id=await chat(DB), v=await readChatVersion(env,id), actor_ref=crypto.randomUUID();
    const initial={chat_id:id,generation:v.generation,expected_revision:v.revision,actor_ref};
    const [one,two]=await Promise.all([issueChatReply(env,initial),issueChatReply(env,initial)]);
    await assert.rejects(DB.prepare('DELETE FROM chat_reply_operations WHERE operation_id=?').bind(one.operation_id).run());
    await assert.rejects(DB.prepare(`INSERT OR REPLACE INTO chat_reply_operations
      SELECT * FROM chat_reply_operations WHERE operation_id=?`).bind(one.operation_id).run());
    const reply={text:'Synthetic response',sent_by:'staff@example.test'};
    const results=await Promise.all([commitChatReply(env,{...initial,operation_id:one.operation_id},reply),
      commitChatReply(env,{...initial,operation_id:two.operation_id},reply)]);
    assert.deepEqual(results.map(x=>x.outcome).sort(),['committed','stale']);
    assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id=?').bind(id).first()).n,1);
    assert.equal((await DB.prepare('SELECT status FROM chats WHERE id=?').bind(id).first()).status,'answered');

    const retry=await issue(env,id), operation={...retry.context,operation_id:retry.operation_id};
    const simultaneous=await Promise.all([commitChatReply(env,operation,reply),commitChatReply(env,operation,reply)]);
    assert.deepEqual(simultaneous.map(x=>x.outcome).sort(),['committed','replayed']);
    assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id=?').bind(id).first()).n,2);
    const msg=(await DB.prepare('SELECT message_id FROM chat_reply_operations WHERE operation_id=?').bind(retry.operation_id).first()).message_id;
    await DB.prepare('UPDATE chat_messages SET text=? WHERE id=?').bind('Edited synthetic response',msg).run();
    assert.equal((await commitChatReply(env,operation,reply)).outcome,'committed_unverifiable');
    await DB.prepare('DELETE FROM chat_messages WHERE id=?').bind(msg).run();
    assert.equal((await commitChatReply(env,operation,reply)).outcome,'committed_unverifiable');

    const loss=await issue(env,id), lostOp={...loss.context,operation_id:loss.operation_id};
    const lostDb={prepare:sql=>DB.prepare(sql),async batch(statements){await DB.batch(statements);throw new Error('synthetic acknowledgement loss');}};
    assert.equal((await commitChatReply({DB:lostDb},lostOp,reply)).outcome,'replayed');
    assert.equal((await commitChatReply(env,lostOp,reply)).outcome,'replayed');

    const rollback=await issue(env,id), rollbackOp={...rollback.context,operation_id:rollback.operation_id};
    const before=(await DB.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id=?').bind(id).first()).n;
    await DB.prepare(`CREATE TRIGGER fixture_reject_receipt BEFORE UPDATE OF state ON chat_reply_operations
      WHEN NEW.state='committed' BEGIN SELECT RAISE(ABORT,'fixture rejection'); END`).run();
    assert.equal((await commitChatReply(env,rollbackOp,reply)).outcome,'unknown');
    assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id=?').bind(id).first()).n,before);
    await DB.prepare('DROP TRIGGER fixture_reject_receipt').run();

    const capped=await chat(DB), capVersion=await readChatVersion(env,capped);
    const capContext={chat_id:capped,generation:capVersion.generation,expected_revision:capVersion.revision,actor_ref:crypto.randomUUID()};
    const reservations=await Promise.all(Array.from({length:65},()=>issueChatReply(env,capContext)));
    assert.equal(reservations.filter(x=>x.outcome==='issued').length,64);
    assert.equal(reservations.filter(x=>x.outcome==='stale_or_capacity').length,1);
    const capPlan=await DB.prepare('EXPLAIN QUERY PLAN SELECT 1 FROM chat_reply_operations WHERE chat_id=? LIMIT 1 OFFSET 63').bind(capped).all();
    assert.match(capPlan.results.map(x=>x.detail).join(' '),/chat_reply_operations_chat/);
    const capRead=await DB.prepare('SELECT 1 FROM chat_reply_operations WHERE chat_id=? LIMIT 1 OFFSET 63').bind(capped).all();
    assert.ok(capRead.meta.rows_read<=64,`capacity query read ${capRead.meta.rows_read} rows`);
    await DB.prepare('DELETE FROM chats WHERE id=?').bind(capped).run();
    assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM chat_reply_operations WHERE state='cancelled' AND chat_id IS NULL").first()).n,64);
    assert.equal((await commitChatReply(env,{...capContext,operation_id:reservations[0].operation_id},reply)).outcome,'unavailable');

    const expired=DB.prepare(`INSERT INTO chat_reply_operations(operation_id,state,issued_at,expires_at)
      VALUES(?,'redacted',CAST(strftime('%s','now') AS INTEGER)-86400,CAST(strftime('%s','now') AS INTEGER))`);
    await DB.batch(Array.from({length:70},()=>expired.bind(crypto.randomUUID())));
    const expiryPlan=await DB.prepare(`EXPLAIN QUERY PLAN SELECT operation_id FROM chat_reply_operations
      WHERE expires_at<=CAST(strftime('%s','now') AS INTEGER) ORDER BY expires_at,operation_id LIMIT 64`).all();
    assert.match(expiryPlan.results.map(x=>x.detail).join(' '),/chat_reply_operations_expiry/);
    const expiryRead=await DB.prepare(`SELECT operation_id FROM chat_reply_operations
      WHERE expires_at<=CAST(strftime('%s','now') AS INTEGER) ORDER BY expires_at,operation_id LIMIT 64`).all();
    assert.ok(expiryRead.meta.rows_read<=64,`expiry query read ${expiryRead.meta.rows_read} rows`);
    await purgeExpiredChatReplyOperations(env);
    assert.equal((await DB.prepare(`SELECT COUNT(*) AS n FROM chat_reply_operations
      WHERE expires_at<=CAST(strftime('%s','now') AS INTEGER)`).first()).n,6);
    await purgeExpiredChatReplyOperations(env);

    const large=await chat(DB), insert=DB.prepare("INSERT INTO chat_messages(chat_id,role,text,created_at) VALUES(?,'team',?,?)");
    for(let start=0;start<count;start+=64)
      await DB.batch(Array.from({length:64},()=>insert.bind(large,'Synthetic response',new Date().toISOString())));
    const deleted=await DB.prepare('DELETE FROM chats WHERE id=?').bind(large).run();
    assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id=?').bind(large).first()).n,0);
    t.diagnostic(`Synthetic deletion of ${count} messages: before proposal rows_read=${baselineDelete.meta.rows_read}, rows_written=${baselineDelete.meta.rows_written}; with proposal rows_read=${deleted.meta.rows_read}, rows_written=${deleted.meta.rows_written}. Existing cascade is not bounded.`);
    assert.deepEqual((await DB.prepare('PRAGMA foreign_key_check').all()).results,[]);
  } finally {await mf.dispose();}
});
