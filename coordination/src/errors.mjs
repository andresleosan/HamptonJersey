export class CoordinatorError extends Error {
  constructor(status, code, message, details) {
    super(message); this.status=status; this.code=code; this.details=details;
  }
}
export function fail(status, code, message, details) { throw new CoordinatorError(status,code,message,details); }
export function requireThat(condition, code, message, details) { if (!condition) fail(409,code,message,details); }
export function jsonError(error) {
  const known=error instanceof CoordinatorError;
  return {status:known?error.status:503,body:{error:{code:known?error.code:'SERVICE_UNAVAILABLE',message:known?error.message:'Coordination service unavailable.',...(known&&error.details?{details:error.details}:{})}}};
}
export function text(value, name, max=180) {
  if (typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f]/u.test(value)) fail(400,'INVALID_INPUT',`Invalid ${name}.`);
  return value;
}
export function identifier(value,name) {
  text(value,name,160);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(value)) fail(400,'INVALID_INPUT',`Invalid ${name}.`);
  return value;
}
export function gitSha(value) {
  if(typeof value!=='string'||!/^[a-f0-9]{40}$/i.test(value)) fail(400,'INVALID_SHA','A full Git SHA is required.');
  return value.toLowerCase();
}
export function allowFields(body,fields) {
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!fields.includes(key))) fail(400,'INVALID_INPUT','Unknown or malformed request fields.');
}
