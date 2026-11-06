#!/usr/bin/env python3
"""Passive Codex lifecycle hook. Never returns approval decisions or reads transcripts."""
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
import time


def thread_metadata(thread, config_home=None):
    home = Path(config_home) if config_home else Path(os.environ.get('CODEX_HOME', Path.home() / '.codex'))
    # Codex's local metadata schema is not a public API; fail softly after upgrades.
    databases = sorted(home.glob('state_*.sqlite'), key=lambda p: int(p.stem[6:]) if p.stem[6:].isdigit() else -1, reverse=True)
    for path in databases[:1]:
        if path.is_symlink():
            continue
        try:
            with sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=.15) as db:
                row = db.execute('SELECT name, title, source, thread_source FROM threads WHERE id=?', (thread,)).fetchone()
                if row:
                    source = row[2] or ''
                    try:
                        source = json.loads(source)
                    except (TypeError, ValueError):
                        pass
                    internal = (isinstance(source, dict) and 'subagent' in source) or row[3] in ('guardian_review', 'subagent')
                    return {'title': row[0] or row[1] or '', 'internal': internal}
        except (sqlite3.Error, OSError, ValueError):
            pass
    return {}


def event_for(payload, now=None, metadata=None):
    if not isinstance(payload, dict):
        return None
    thread = payload.get('session_id', payload.get('thread-id', ''))
    if not isinstance(thread, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', thread):
        return None
    metadata = metadata or {}
    child_agent = payload.get('agent_id') and payload.get('agent_id') != thread
    if metadata.get('internal') or child_agent:
        return None
    hook = payload.get('hook_event_name', '')
    tool = payload.get('tool_name', '')
    if hook == 'Stop' or payload.get('type') == 'agent-turn-complete':
        if payload.get('stop_hook_active'):
            return None
        kind = 'completed'
    elif hook == 'PermissionRequest':
        kind = 'approval'
    elif hook == 'PreToolUse' and isinstance(tool, str) and re.search(r'request_user_input|AskUserQuestion', tool):
        kind = 'question'
    elif hook == 'UserPromptSubmit':
        kind = 'clear'
    else:
        return None
    turn = payload.get('turn_id', payload.get('turn-id', ''))
    if not isinstance(turn, str) or len(turn) > 100:
        turn = ''
    # Hash only lifecycle identifiers, never the tool command, response, or question text.
    seed = '|'.join((thread, turn, kind, '' if turn else str(int(now if now is not None else time.time()) // 5)))
    item = {'version': 1, 'id': hashlib.sha256(seed.encode()).hexdigest(),
            'thread': thread, 'kind': kind, 'at': now if now is not None else time.time()}
    if turn:
        item['turn'] = turn
    title = metadata.get('title', '')
    if isinstance(title, str):
        title = ' '.join(''.join(c if c.isprintable() else ' ' for c in title).split())[:120]
        if title:
            item['title'] = title
    return item


def deliver(payload, root=None, config_home=None):
    thread = payload.get('session_id', payload.get('thread-id', '')) if isinstance(payload, dict) else ''
    metadata = thread_metadata(thread, config_home) if isinstance(thread, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,100}', thread) else {}
    item = event_for(payload, metadata=metadata)
    if item is None:
        return False
    inbox = Path(root) if root else Path.home() / 'Library/Application Support/MoodSlime/CodexInbox'
    inbox.mkdir(mode=0o700, parents=True, exist_ok=True)
    if inbox.is_symlink():
        return False
    raw = json.dumps(item, separators=(',', ':')).encode()
    descriptor, temporary = tempfile.mkstemp(prefix='.event-', dir=inbox)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(raw)
        os.replace(temporary, inbox / (item['id'] + '.json'))
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    # No stale notification backlog or unbounded accumulation when the app is closed.
    files = sorted(inbox.glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True)
    for path in files[256:]:
        if not path.is_symlink():
            path.unlink(missing_ok=True)
    return True


def main():
    try:
        data = sys.stdin.buffer.read(262145)
        if len(data) <= 262144:
            deliver(json.loads(data))
    except (ValueError, OSError, TypeError):
        pass
    # Stop expects JSON; empty decisions leave the existing approval process untouched.
    print('{}')


if __name__ == '__main__':
    main()
