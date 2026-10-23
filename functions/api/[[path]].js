import { handleApi } from "../../server/api.js";

// waitUntil: work that may finish after the response is sent; called on the context, never detached from it.
export const onRequest = context =>
  handleApi(context.request, context.env, context.params.path ?? [], p => context.waitUntil(p));
