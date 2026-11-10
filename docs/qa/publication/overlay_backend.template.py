"""Apply the bounded backend QA overlay to a disposable, known-source stage only."""
from hashlib import sha256
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parents[3]
EXPECTED = {
    'drive.js': '64d116e14f0b60fdde9277c1a52231c4b70c4aa90a7b9044cf921ef130327290',
    'email.js': '61843d3e87a7f479c92fbf61c6f46ee3abccb97708db1b699266dcc581678a18',
    'chat.js': '9d63406a7c1f3c9fe4383f45b6a9e8ab7a9183ac4ada53d84692ffd1995ea4ef',
    'turnstile.js': '7c453512591668cb7e4d2ce4b91c6e9a7c5eb5273746a9ff2a79832c47068c1b',
}

def replace_once(source, old, new):
    if source.count(old) != 1:
        raise ValueError('QA backend source marker is not unique')
    return source.replace(old, new, 1)

def apply_backend(workroot: Path) -> dict:
    workroot = Path(workroot).resolve()
    if workroot == SOURCE or (workroot / '.git').exists():
        raise ValueError('QA backend overlay requires a disposable stage, not a Git checkout')
    server = workroot / 'server'
    if server.is_symlink() or server.resolve().parent != workroot:
        raise ValueError('QA backend stage must not alias source files')
    originals = {}
    for name, expected in EXPECTED.items():
        path = server / name
        if path.is_symlink():
            raise ValueError('QA backend input must be a regular staged file')
        source = path.read_text(encoding='utf-8')
        if sha256(source.encode()).hexdigest() != expected:
            raise ValueError(f'Unexpected QA backend baseline: {name}')
        originals[name] = source
    if (server / 'qa-integrations.js').exists():
        raise ValueError('QA backend integration destination already exists')
    email = originals['email.js']
    for old, new in (
        ('"@@BASE_EMAIL_1@@"', '"hello@qa.example.test"'),
        ('"@@BASE_EMAIL_2@@"', '"replies@qa.example.test"'),
        ('"https://www.hamptonestatesjersey.com"', '"https://hamptonjersey-qa.pages.dev"'),
        ('"42 Bath Street, St Helier, Jersey JE2 4ST"', '"Synthetic QA address"'),
        ('"Contact: @@BASE_EMAIL_0@@"', '"Contact: team@qa.example.test"'),
    ):
        email = replace_once(email, old, new)
    chat = replace_once(originals['chat.js'],
        'new URL(request.url).hostname.endsWith(".pages.dev")',
        'new URL(request.url).hostname !== "hamptonjersey-qa.pages.dev"')
    outputs = {
        'email.js': email,
        'chat.js': chat,
        'drive.js': '''// Artifact-only synthetic Drive adapter; no Google credential or transport.\nimport {qaDrive} from './qa-integrations.js';\nexport const {folderIdFrom,isRecords,isEdited,driveFetch,folderInfo,insideRecords,walkFolder,photosIn,fileResponse,chooseEdited}=qaDrive;\n''',
        'turnstile.js': '''// Artifact-only provider simulation, guarded by the QA request middleware.\nexport async function verifyTurnstile(token, secret) {\n  return token === 'qa-simulated-antispam' && secret === 'qa-simulation-only';\n}\n''',
        'qa-integrations.js': (HERE / 'qa-integrations.mjs').read_text(encoding='utf-8-sig'),
    }
    for name, contents in outputs.items():
        (server / name).write_text(contents, encoding='utf-8', newline='\n')
    return {'status': 'prepared', 'files': {f'server/{name}': sha256(contents.encode()).hexdigest() for name, contents in outputs.items()},
            'simulations': ['drive', 'email', 'jobs', 'hermes'], 'network': 'none', 'source_baseline': '80ad03df7e095750f455aa4aa668573e9aac5db4'}
