// PRE-14 · Task 4: entrada del worker de respaldo hampton-backups (backups/wrangler.toml). Solo la clase del Workflow
// semanal; la lógica está en server/backup-workflow.js, que se prueba en Node sin el runtime de Cloudflare.
// Sin URL (workers_dev y preview_urls apagados, sin rutas): el handler fetch solo existe porque un Worker necesita uno.
import {WorkflowEntrypoint} from 'cloudflare:workers';
import {runWeeklyBackup} from '../server/backup-workflow.js';

export class WeeklyBackupWorkflow extends WorkflowEntrypoint {
  run(event, step) { return runWeeklyBackup(this.env, event.payload, step); }
}

export default { fetch: () => new Response(null, {status: 404}) };
