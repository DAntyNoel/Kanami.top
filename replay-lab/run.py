"""Parse a replay, serve a playback bundle, or export a standalone static site."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
PIPELINE = ('parse_replay.py', 'decode_replay.py', 'combat.py', 'rounds.py', 'unreal_names.json')


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def command(script, *args):
    subprocess.run([sys.executable, '-X', 'utf8', str(HERE / script), *map(str, args)], check=True)


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('source', nargs='?', type=Path, help='.replay or decoded playback.json; defaults to input/')
    cli.add_argument('--out', type=Path, help='decoded output directory (default: output/<replay stem>)')
    cli.add_argument('--port', type=int, default=8766)
    cli.add_argument('--bind', default='127.0.0.1', help='listen address; explicitly use 0.0.0.0 for network access')
    cli.add_argument('--rebuild', action='store_true')
    cli.add_argument('--export', type=Path, help='export to an empty static-site directory, then exit')
    args = cli.parse_args()
    if not 1 <= args.port <= 65535:
        cli.error('--port must be between 1 and 65535')
    source = args.source
    if source is None:
        candidates = sorted((HERE / 'input').glob('*.replay'))
        if (HERE / 'input/playback.json').is_file():
            candidates.append(HERE / 'input/playback.json')
        if len(candidates) != 1:
            cli.error('provide one .replay/playback.json path, or place exactly one file in replay-lab/input/')
        source = candidates[0]
    source = source.resolve()
    if not source.is_file():
        cli.error(f'input file not found: {source}')
    if source.suffix.lower() == '.replay':
        directory = (args.out or HERE / 'output' / source.stem).resolve()
        # Never let a parse operation overwrite its own input or program files.
        if directory == source.parent or directory == HERE or HERE.is_relative_to(directory):
            cli.error('--out must be a separate data directory')
        playback = directory / 'playback.json'
        stamp_path = directory / 'build-info.json'
        stamp = dict(source_sha256=sha256(source), pipeline={name: sha256(HERE / name) for name in PIPELINE})
        try:
            cached = json.loads(stamp_path.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            cached = None
        if args.rebuild or cached != stamp or not playback.is_file():
            # Invalidate the previous cache before starting, including on failed rebuilds.
            stamp_path.unlink(missing_ok=True)
            command('parse_replay.py', source, '--out', directory)
            errors = json.loads((directory / 'errors.json').read_text(encoding='utf-8'))
            if errors:
                raise ValueError('parser reported protocol errors; inspect errors.json before using this replay')
            command('decode_replay.py', directory)
            stamp_path.write_text(json.dumps(stamp, indent=2) + '\n', encoding='utf-8')
        else:
            print(f'Using cached playback: {playback}', flush=True)
    elif source.suffix.lower() == '.json':
        if args.rebuild or args.out:
            cli.error('--rebuild/--out require a .replay input')
        playback = source
    else:
        cli.error('input must be a .replay file or playback.json')
    options = ['--data', playback, '--port', args.port, '--bind', args.bind]
    if args.export:
        options.extend(['--export', args.export.resolve()])
    command('serve.py', *options)


if __name__ == '__main__':
    if sys.version_info < (3, 10):
        raise SystemExit('Python 3.10 or later is required.')
    try:
        main()
    except KeyboardInterrupt:
        raise SystemExit(130)
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f'Error: {error}', file=sys.stderr)
        raise SystemExit(1)
