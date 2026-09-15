from pathlib import Path
import subprocess

source = subprocess.check_output([
    'git','show',
    '9c8dfa9b71e7fb2d10c2330859379938ae71d1cc:.github/workflows/add-management-access.yml'
], text=True)
marker = "          python - <<'PY'\n"
start = source.index(marker) + len(marker)
end = source.index("\n          PY", start)
lines = source[start:end].splitlines()
script = '\n'.join(line[10:] if line.startswith('          ') else line for line in lines) + '\n'
patch = Path('/tmp/management_patch.py')
patch.write_text(script, encoding='utf-8')
subprocess.check_call(['python', str(patch)])
