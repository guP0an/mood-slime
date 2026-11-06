import importlib.util
import json
from pathlib import Path
import stat
import sqlite3
import subprocess
import sys
import tempfile
import time

script = Path(__file__).resolve().parents[1] / 'scripts/codex_pet_hook.py'
spec = importlib.util.spec_from_file_location('pet_hook', script)
hook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook)

payload = {'session_id': 'synthetic-thread', 'turn_id': 'synthetic-turn',
           'hook_event_name': 'PermissionRequest', 'tool_input': {'command': 'SYNTHETIC_PRIVATE_DO_NOT_STORE'}}
assert hook.event_for(payload)['kind'] == 'approval'
assert 'SYNTHETIC_PRIVATE' not in json.dumps(hook.event_for(payload))
for event, kind in [('Stop', 'completed'), ('UserPromptSubmit', 'clear')]:
    assert hook.event_for({**payload, 'hook_event_name': event})['kind'] == kind
assert hook.event_for({**payload, 'hook_event_name': 'Stop', 'stop_hook_active': True}) is None
for tool in ['request_user_input_async', 'AskUserQuestion']:
    assert hook.event_for({**payload, 'hook_event_name': 'PreToolUse', 'tool_name': tool})['kind'] == 'question'
assert hook.event_for({**payload, 'hook_event_name': 'PreToolUse', 'tool_name': 'exec_command'}) is None
for event in ['PostModelRequest', 'PreModelRequest', 'PostToolUse', 'SubagentStop']:
    assert hook.event_for({**payload, 'hook_event_name': event}) is None
assert hook.event_for({**payload, 'hook_event_name': 'Stop'}, metadata={'internal': True}) is None
assert hook.event_for({**payload, 'hook_event_name': 'Stop', 'agent_id': 'child'}) is None
assert hook.event_for({**payload, 'hook_event_name': 'Stop', 'agent_id': 'synthetic-thread', 'agent_type': 'main'})['kind'] == 'completed'
assert hook.event_for({**payload, 'hook_event_name': 'Stop'}, now=100)['id'] == hook.event_for({**payload, 'hook_event_name': 'Stop'}, now=900)['id']
assert hook.event_for({**payload, 'turn_id': 'other-turn'}, now=100)['id'] != hook.event_for(payload, now=100)['id']
named = hook.event_for(payload, metadata={'title': '  设计桌面心情日历\n  标题  '})
assert named['title'] == '设计桌面心情日历 标题' and named['turn'] == 'synthetic-turn'
assert len(hook.event_for(payload, metadata={'title': '长标题' * 100})['title']) == 120
for invalid in [None, [], {}, {**payload, 'session_id': '../elsewhere'}, {**payload, 'session_id': 'a?b'}]:
    assert hook.event_for(invalid) is None
with tempfile.TemporaryDirectory(prefix='mood-codex-hook-') as folder:
    assert hook.deliver(payload, folder, config_home=folder)
    files = list(Path(folder).glob('*.json'))
    assert len(files) == 1
    assert set(json.loads(files[0].read_text())) == {'version', 'id', 'thread', 'turn', 'kind', 'at'}
    assert stat.S_IMODE(files[0].stat().st_mode) == 0o600
    if len(sys.argv) == 3 and sys.argv[1] == '--native-reader':
        subprocess.run([sys.argv[2], '--read-inbox', folder], check=True)
        assert not list(Path(folder).glob('*.json'))
with tempfile.TemporaryDirectory(prefix='mood-codex-metadata-') as folder:
    database = Path(folder) / 'state_5.sqlite'
    with sqlite3.connect(database) as db:
        db.execute('CREATE TABLE threads (id TEXT, name TEXT, title TEXT, source TEXT, thread_source TEXT)')
        db.execute('INSERT INTO threads VALUES (?,?,?,?,?)', ('synthetic-thread', '设计桌面心情日历', 'old title', 'vscode', 'user'))
        db.execute('INSERT INTO threads VALUES (?,?,?,?,?)', ('guardian-thread', None, 'Guardian review', '{"subagent":{"other":"guardian"}}', 'guardian_review'))
    original = database.read_bytes()
    metadata = hook.thread_metadata('synthetic-thread', folder)
    assert metadata == {'title': '设计桌面心情日历', 'internal': False}
    assert hook.deliver(payload, Path(folder) / 'inbox', config_home=folder)
    event = json.loads(next((Path(folder) / 'inbox').glob('*.json')).read_text())
    assert event['title'] == '设计桌面心情日历'
    assert not hook.deliver({**payload, 'session_id': 'guardian-thread'}, Path(folder) / 'inbox', config_home=folder)
    assert database.read_bytes() == original
    with sqlite3.connect(database) as db:
        db.execute('DROP TABLE threads')
    assert hook.thread_metadata('synthetic-thread', folder) == {}
for data in [b'not json', b'x' * 270000]:
    result = subprocess.run([sys.executable, str(script)], input=data, capture_output=True)
    assert result.returncode == 0 and json.loads(result.stdout) == {}
print('PASS: lifecycle mapping, question filters, no transcript/body stored, neutral approval output, invalid input, atomic private files')
print('PASS: ignore progress/model/internal sessions, stable turn dedup, read-only metadata title lookup, schema fallback')

installer_spec = importlib.util.spec_from_file_location('pet_install', script.with_name('install_codex_hooks.py'))
installer = importlib.util.module_from_spec(installer_spec)
installer_spec.loader.exec_module(installer)
old = {'description': 'synthetic', 'hooks': {'Stop': [{'hooks': [{'type': 'command', 'command': 'synthetic-existing'}]}]}}
merged, added = installer.merge_hooks(old, 'synthetic-pet-command')
assert merged['hooks']['Stop'][0] == old['hooks']['Stop'][0] and len(added) == 4
assert installer.merge_hooks(merged, 'synthetic-pet-command')[1] == []
with tempfile.TemporaryDirectory(prefix='mood-codex-installer-') as folder:
    config, runtime = Path(folder) / 'config', Path(folder) / 'runtime'
    config.mkdir()
    (config / 'hooks.json').write_text(json.dumps(old))
    result = installer.install(config, runtime)
    assert len(result['added']) == 4
    assert json.loads(next(runtime.glob('hooks-before-*.json')).read_text()) == old
    assert installer.install(config, runtime)['added'] == []
    assert not (config / 'config.toml').exists()
print('PASS: hook install preserves existing entries, is idempotent, keeps private backup and never writes trust/approval policy')
