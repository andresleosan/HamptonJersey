// ADM-18: the applicant's page exists only with ADM18_APPLICATION_READY. Switched off, /rental-application answers as
// before the page existed: the site's own page (index.html), like any other unknown address.
export const onRequest = ({ request, env, next }) =>
  env.ADM18_APPLICATION_READY === "1" ? next() : env.ASSETS.fetch(new URL("/", request.url));
