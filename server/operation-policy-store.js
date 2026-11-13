import {fail} from './http.js';
import {operationModeProposal} from './operation-policy.js';

// No effective policy or writer is exposed until global authority and an
// ABA-resistant storage lifecycle are proved. These helpers inspect only
// caller-supplied bytes; a candidate is never a decision or authorization.
const MAX_ROW=4096;
const GENERATION=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const invalid=()=>({state:'invalid',allowed:false});

function decode(automationId,operation,raw){
  if(typeof automationId!=='string'||typeof operation!=='string'||typeof raw!=='string'||raw.length>MAX_ROW)return null;
  try{
    const data=JSON.parse(raw);
    if(!data||typeof data!=='object'||Array.isArray(data)||data.schema!==1||
      data.automation_id!==automationId||data.operation!==operation||
      !Number.isSafeInteger(data.revision)||data.revision<1||typeof data.generation!=='string'||!GENERATION.test(data.generation)||
      !data.params||typeof data.params!=='object'||Array.isArray(data.params)||Object.keys(data.params).length!==0)return null;
    const proposal=operationModeProposal(automationId,operation,data.mode);
    if(data.definition_version!==proposal.definition_version)return null;
    const canonical={schema:1,automation_id:automationId,operation,definition_version:proposal.definition_version,
      mode:data.mode,revision:data.revision,generation:data.generation,params:{}};
    // Exact canonical bytes also reject duplicate, missing and extra keys.
    return JSON.stringify(canonical)===raw?canonical:null;
  }catch{return null;}
}

export function inspectOperationPolicySnapshot(automationId,operation,raw){
  if(arguments.length!==3)return invalid();
  const data=decode(automationId,operation,raw);
  if(!data)return invalid();
  return {state:'candidate',allowed:false,automation_id:automationId,operation,mode:data.mode,
    revision:data.revision,generation:data.generation,definition_version:data.definition_version};
}

export function proposeOperationPolicyCAS(automationId,operation,mode,expectedRevision,expectedGeneration,raw){
  if(arguments.length!==6)return invalid();
  const data=decode(automationId,operation,raw);
  if(!data||typeof mode!=='string'||!Number.isSafeInteger(expectedRevision)||expectedRevision<1||
      typeof expectedGeneration!=='string'||!GENERATION.test(expectedGeneration))return invalid();
  try{operationModeProposal(automationId,operation,mode);}catch{return invalid();}
  if(data.revision!==expectedRevision||data.generation!==expectedGeneration)return {state:'stale',allowed:false};
  if(data.mode===mode)return {state:'no_change',allowed:false};
  if(data.revision===Number.MAX_SAFE_INTEGER)return invalid();
  return {state:'candidate',allowed:false,key:`aut10:operation:${automationId}:${operation}`,
    expected_value:raw,next_value:JSON.stringify({...data,mode,revision:data.revision+1})};
}

// Session, origin and a global policy-management capability do not exist here.
// Fail before examining caller arguments or accessing any storage.
export async function getOperationPolicy(){fail(503,'Operation policy persistence unavailable');}
export async function setOperationPolicy(){fail(503,'Operation policy persistence unavailable');}
