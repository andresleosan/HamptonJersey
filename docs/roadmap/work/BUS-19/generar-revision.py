#!/usr/bin/env python3
"""Prepara una revisión documental; no crea políticas ejecutables ni lee la base histórica."""
import collections
import csv
import hashlib
import io
import json
from pathlib import Path
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
B23 = ROOT / 'docs/roadmap/work/BUS-23'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_csv(path):
    with path.open(encoding='utf-8', newline='') as stream:
        reader = csv.DictReader(stream)
        return reader.fieldnames, list(reader)


def write_new_or_identical(path, text):
    if path.parent.resolve() != HERE:
        raise RuntimeError('Salida fuera de BUS-19')
    if path.exists():
        if path.read_text(encoding='utf-8') != text:
            raise RuntimeError('No se sobreescribe un archivo diferente: ' + path.name)
        return
    path.write_text(text, encoding='utf-8', newline='')


def is_host(host, domain):
    return host == domain or host.endswith('.' + domain)


acceptance_path = B23 / 'registro-aceptacion-BUS-23.json'
acceptance = json.loads(acceptance_path.read_text(encoding='utf-8'))
if acceptance['status'] != 'accepted_locally' or acceptance['event_kind'] != 'research_accepted':
    raise RuntimeError('Falta aceptación local de BUS-23')
for item in [acceptance['proposal']] + acceptance['evidence']:
    if sha(ROOT / item['path']) != item['sha256']:
        raise RuntimeError('Cambió evidencia aceptada: ' + item['path'])

handoff_path = B23 / 'property-directory-inventory-handoff.csv'
_, handoff = read_csv(handoff_path)
if len(handoff) != 237 or len({(x['source_id'], x['channel_url']) for x in handoff}) != 237:
    raise RuntimeError('El relevo no contiene 237 claves fuente/ruta únicas')
if len({x['source_id'] for x in handoff}) != 141:
    raise RuntimeError('El relevo no contiene los 141 IDs esperados')

evidence = {
    'src-rightmove-jersey': ('rightmove.co.uk', 'https://www.rightmove.co.uk/c/terms-of-use/',
        'Las cláusulas 5.2 y 5.5 restringen automatización y ciertas formas de acceso; no se acredita una excepción aplicable.',
        'evidencia-condiciones-2026-11-13.md#rightmove--src-rightmove-jersey', 'legal_page_retrieved'),
    'src-onthemarket-jersey': ('onthemarket.com', 'https://www.onthemarket.com/terms/',
        'Las cláusulas 3.3 y 2.2 distinguen agente/robots y restricciones de almacenamiento o reutilización; faltan revisión y permisos.',
        'evidencia-condiciones-2026-11-13.md#onthemarket--src-onthemarket-jersey', 'legal_page_retrieved'),
    'src-gaudin-co': ('gaudin.je', 'https://www.gaudin.je/terms',
        'Las condiciones consultadas describen la relación entre agencia y cliente; no acreditan una licencia para lectores.',
        'evidencia-condiciones-2026-11-13.md#gaudin--src-gaudin-co', 'legal_page_retrieved'),
    'src-jersey-insight-classifieds': ('jerseyinsight.com', 'https://www.jerseyinsight.com/terms-and-conditions',
        'Las condiciones consultadas tratan publicidad y listados; no acreditan automáticamente una licencia para lectores.',
        'evidencia-condiciones-2026-11-13.md#jersey-insight--src-jersey-insight-classifieds', 'legal_page_retrieved'),
    'src-jersey-evening-post-property': ('jerseyeveningpost.com', '',
        'La búsqueda no identificó condiciones de uso de JEP Property suficientes; no se supone ausencia de términos.',
        'evidencia-condiciones-2026-11-13.md#jersey-evening-post--src-jersey-evening-post-property', 'search_no_sufficient_result'),
    'src-broadlands': ('broadlandsjersey.com', 'https://www.broadlandsjersey.com/ai-terms-of-use/',
        'Se localizó una página AI Terms; el contrato aplicable al método previsto sigue sin determinar.',
        'evidencia-condiciones-2026-11-13.md#broadlands--src-broadlands', 'partial_text_search'),
    'src-propertyskipper-jersey': ('propertyskipper.com', 'https://www.propertyskipper.com/jersey/terms',
        'La página de condiciones no se pudo recuperar; no se supone permiso ni ausencia de términos.',
        'evidencia-condiciones-2026-11-13.md#propertyskipper--src-propertyskipper-jersey', 'legal_page_fetch_failed'),
}
proposals = {'src-dusted-jersey', 'src-jersey-property-app-raven', 'src-accommodation-centre-jersey'}
rows = []
for index, item in enumerate(handoff, 2):
    sid, url = item['source_id'], item['channel_url']
    host = (urlsplit(url).hostname or '').lower() if url else ''
    if url and urlsplit(url).scheme not in ('http', 'https'):
        raise RuntimeError('Canal no HTTP(S): ' + sid)
    legal = evidence.get(sid)
    if legal and not is_host(host, legal[0]):
        legal = None
    if sid == 'src-homely-je':
        state = 'excluded_by_project'
        action = 'Conservar la exclusión; no implementar o activar lectura de Homely.'
    elif sid in ('src-places-je', 'src-properties-je'):
        state = 'deferred_connector'
        action = ('Mantener el conector fuera de esta etapa. Antes de cualquier uso futuro, '
                  'revisar alcance y condiciones; conservar requisito de clave o permiso escrito según la fuente.')
    elif item['family'] == 'social':
        state = 'social_manual_out_of_scope'
        action = 'Mantener referencia o revisión manual futura; no acceder a Meta ni automatizar el canal en esta etapa.'
    elif legal and sid == 'src-rightmove-jersey':
        state = 'automation_restricted_review'
        action = ('No automatizar con las condiciones actuales; revisar el método concreto y cualquier '
                  'autorización aplicable sin asumir que un permiso general cubre otros usos.')
    elif legal and sid == 'src-onthemarket-jersey':
        state = 'automation_and_reuse_review'
        action = ('Revisar robots para el agente y ruta, y derechos de acceso, conservación y reutilización; '
                  'no habilitar el lector por esta observación.')
    elif item['source_role'] == 'referencia_historica':
        state = 'historical_reference'
        action = 'Conservar el antecedente; comprobar identidad, vigencia y condiciones antes de cualquier uso.'
    elif sid in proposals:
        state = 'identity_and_rights_review'
        action = ('Reconciliar alias y titularidad por una vía autorizada; revisar condiciones, robots y '
                  'método antes de integrar o utilizar la propuesta.')
    elif not url:
        state = 'channel_url_missing'
        action = 'Identificar el canal por una referencia permitida; no derivar una URL o permiso del nombre.'
    elif item['collection_policy'] == 'reference_only':
        state = 'reference_only'
        action = 'Usar como referencia documental; evaluar aparte cualquier método o reutilización.'
    elif item['collection_policy'] == 'authenticated_review' or item['policy_decision'] == 'revision_manual':
        state = 'manual_review_required'
        action = 'Mantener revisión manual pendiente; no emplear cuentas ni eludir restricciones.'
    elif item['policy_decision'] == 'revision_especifica':
        state = 'specific_restriction_review'
        action = ('Conservar la restricción específica heredada; revisar su vigencia, alcance y cualquier '
                  'autorización necesaria antes de automatizar o reutilizar contenido.')
    else:
        state = 'terms_and_method_review'
        action = ('Identificar condiciones vigentes, reglas de robots por agente y ruta, '
                  'derechos de almacenamiento y reutilización y método aplicable antes de cualquier lector.')
    key = hashlib.sha256((sid + '\0' + url).encode('utf-8')).hexdigest()[:16]
    rows.append({
        'review_ref': 'bus19-review-' + key,
        'source_id': sid,
        'source_name': item['source_name'],
        'channel_url': url,
        'observed_host': host,
        'family': item['family'],
        'source_role': item['source_role'],
        'review_state': state,
        'inherited_collection_policy': item['collection_policy'],
        'inherited_policy_decision': item['policy_decision'],
        'inherited_scope_limit': item['scope_limit'],
        'inherited_terms_reference': item['terms_reference'],
        'inherited_robots_observation': item['robots_observation'],
        'last_known_success_in_matrix': item['last_known_success_in_matrix'],
        'success_basis': item['success_basis'],
        'legal_reference': legal[1] if legal else '',
        'legal_observation': legal[2] if legal else '',
        'legal_evidence_method': legal[4] if legal else 'not_reviewed',
        'legal_attempted_on': '2026-11-13' if legal else '',
        'legal_evidence': legal[3] if legal else '',
        'next_action': action,
        'inherited_next_action': item['policy_next_action'],
        'inherited_retry_condition': item['policy_retry_condition'],
        'responsible_role': 'investigación',
        'handoff_reference': f'../BUS-23/property-directory-inventory-handoff.csv:{index}',
    })

output = {
    'schema_version': 1,
    'task_id': 'BUS-19',
    'status': 'documentary_review_only_not_executable',
    'reviewed_on': '2026-11-13',
    'acceptance_source': {'path': str(acceptance_path.relative_to(ROOT)), 'sha256': sha(acceptance_path)},
    'handoff_source': {'path': str(handoff_path.relative_to(ROOT)), 'sha256': sha(handoff_path), 'rows': len(handoff)},
    'new_evidence': {'path': str((HERE / 'evidencia-condiciones-2026-11-13.md').relative_to(ROOT)),
                     'sha256': sha(HERE / 'evidencia-condiciones-2026-11-13.md')},
    'runtime_decisions_created': False,
    'reader_or_connector_activated': False,
    'rules': [
        'Las categorías son seguimiento documental; no son SourceAccessDecision ni autorizan acceso o reutilización.',
        'No se ha revisado robots efectivo por agente y ruta, ni se ha validado licencia de uso, retención o redistribución.',
        'La falta de acceso o URL nunca significa que la fuente no tenga anuncios.',
        'Se conservan las restricciones heredadas, incluidos Homely excluida y conectores Places/Properties fuera de esta etapa.',
        'Los alias de las tres propuestas y algunas URL históricas siguen pendientes de reconciliación autorizada.',
    ],
    'reviews': rows,
}
decisions_path = HERE / 'access-decisions.json'
queue_path = HERE / 'access-review-queue.csv'
write_new_or_identical(decisions_path, json.dumps(output, ensure_ascii=False, indent=2) + '\n')
stream = io.StringIO(newline='')
writer = csv.DictWriter(stream, fieldnames=list(rows[0]), lineterminator='\n')
writer.writeheader()
writer.writerows(rows)
write_new_or_identical(queue_path, stream.getvalue())
counts = collections.Counter(row['review_state'] for row in rows)
manifest = {
    'schema_version': 1, 'status': 'documentary_review_only_not_executable',
    'acceptance': output['acceptance_source'], 'handoff': output['handoff_source'],
    'legal_evidence': output['new_evidence'],
    'decisions': {'path': str(decisions_path.relative_to(ROOT)), 'sha256': sha(decisions_path), 'rows': len(rows)},
    'queue': {'path': str(queue_path.relative_to(ROOT)), 'sha256': sha(queue_path), 'rows': len(rows)},
    'review_state_counts': dict(sorted(counts.items())),
}
write_new_or_identical(HERE / 'manifest-revision.json', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'sources': len({r['source_id'] for r in rows}), 'channels': len(rows),
                  'review_states': dict(counts), 'runtime_decisions_created': False}, ensure_ascii=False))
