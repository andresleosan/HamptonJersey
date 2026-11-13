// MSG-05: a read-only proposal from the current chat. This is deliberately limited to
// the visitor's contact details; a chat is not consent for a new search and its text
// is not a confirmed requirement. The shared semantic revision does not exist yet.
export async function applicantDraftFromChat(env, chatId) {
  if (!Number.isSafeInteger(chatId) || chatId < 1) return null;
  const contact = await env.DB.prepare("SELECT name, email, phone FROM chats WHERE id = ?").bind(chatId).first();
  if (!contact) return null;
  return { chat_id: chatId, chat_version: null, contact,
    fields: {}, provenance: { contact: "chat", fields: "none" }, save_available: false };
}
