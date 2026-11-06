#!/usr/bin/env python3
"""Add passive pet hooks without replacing existing hooks or changing trust/approval policy."""
import argparse
import datetime
import json
import os
from pathlib import Path
import shlex
import shutil
import tempfile


def merge_hooks(existing, command):
    result = json.loads(json.dumps(existing))
    hooks = result.setdefault('hooks', {})
    if not isinstance(hooks, dict):
        raise ValueError('Existing hooks field must be an object')
    definitions = [('Stop', None), ('PermissionRequest', '*'),
                   ('PreToolUse', '.*(request_user_input|AskUserQuestion).*'),
                   ('UserPromptSubmit', None)]
    added = []
    for event, matcher in definitions:
        groups = hooks.setdefault(event, [])
        if not isinstance(groups, list):
            raise ValueError('Existing event definitions must be arrays')
        if any(any(h.get('command') == command for h in group.get('hooks', [])) for group in groups):
            continue
        entry = {'hooks': [{'type': 'command', 'command': command, 'timeout': 3}]}
        if matcher is not None:
            entry['matcher'] = matcher
        groups.append(entry)
        added.append(event)
    return result, added


def install(config_home, runtime):
    config_home, runtime = Path(config_home), Path(runtime)
    config_home.mkdir(parents=True, exist_ok=True)
    runtime.mkdir(mode=0o700, parents=True, exist_ok=True)
    hooks_path = config_home / 'hooks.json'
    if hooks_path.is_symlink() or runtime.is_symlink():
        raise ValueError('Refusing symlinked configuration or runtime')
    original = hooks_path.read_bytes() if hooks_path.exists() else None
    existing = json.loads(original) if original else {}
    helper = runtime / 'codex_pet_hook.py'
    if helper.is_symlink():
        raise ValueError('Refusing symlinked helper')
    source = Path(__file__).with_name('codex_pet_hook.py')
    shutil.copyfile(source, helper)
    helper.chmod(0o700)
    command = '/usr/bin/python3 ' + shlex.quote(str(helper))
    merged, added = merge_hooks(existing, command)
    if not added:
        return {'added': [], 'trust': 'unchanged; check exact hook definitions in Codex'}
    if hooks_path.exists() and hooks_path.read_bytes() != original:
        raise ValueError('Configuration changed during install; retry after review')
    if original:
        stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
        backup = runtime / ('hooks-before-' + stamp + '.json')
        backup.write_bytes(original)
        backup.chmod(0o600)
    descriptor, temporary = tempfile.mkstemp(prefix='.hooks-', dir=config_home)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, 'w') as stream:
            json.dump(merged, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
        os.replace(temporary, hooks_path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return {'added': added, 'preservedExistingGroups': sum(len(v) for v in existing.get('hooks', {}).values()),
            'trust': 'User must review and trust newly configured definitions; no trust/policy settings changed'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config-home', type=Path, default=Path(os.environ.get('CODEX_HOME', Path.home() / '.codex')))
    parser.add_argument('--runtime', type=Path, default=Path.home() / 'Library/Application Support/MoodSlime/CodexBridge')
    arguments = parser.parse_args()
    print(json.dumps(install(arguments.config_home, arguments.runtime)))
