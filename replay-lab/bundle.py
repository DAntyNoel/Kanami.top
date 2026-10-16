"""Build or verify the data-free replay toolkit distribution ZIP using the standard library."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
import zipfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PREFIX = 'strinova-replay-toolkit/'
FILES = (
    '.gitignore', 'parse_replay.py', 'decode_replay.py', 'combat.py', 'rounds.py',
    'unreal_names.json', 'serve.py', 'run.py', 'start.ps1', 'bundle.py',
    'README.md', 'DISTRIBUTION.md', 'STATUS.md', 'PROTOCOL_NOTES.md', 'THIRD_PARTY_LICENSE.txt',
    'verify_replay.py', 'verify_shape.py', 'verify_combat.py', 'verify_rounds.py', 'verify-viewer.mjs',
    'package.json', 'package-lock.json', 'input/README.txt',
    'web/index.html', 'web/app.js', 'web/style.css',
    'web/maps/ocarnus.webp', 'web/maps/NOTICE.txt', 'web/maps/GPL-3.0.txt',
    'web/characters/manifest.json', 'web/characters/sources.json', 'web/characters/NOTICE.txt',
    'distribution/start.cmd',
)
SHARED = ('res/scripts/header.js', 'games/shared/game-header.css', 'res/images/favicon.png', 'res/images/lovekanami.jpg')


def checksum(data):
    return hashlib.sha256(data).hexdigest()


def package_files():
    files = {f'replay-lab/{name}': HERE / name for name in FILES}
    files.update({name: ROOT / name for name in SHARED})
    files['README.md'] = HERE / 'DISTRIBUTION.md'
    files['start.cmd'] = HERE / 'distribution/start.cmd'
    for role in json.loads((HERE / 'web/characters/manifest.json').read_text(encoding='utf-8')):
        role_id = role.get('id')
        if type(role_id) is not int or role_id <= 0 or role.get('portrait') != f'characters/icons/{role_id}.png':
            raise ValueError('invalid character portrait manifest')
        name = f'web/characters/icons/{role_id}.png'
        files[f'replay-lab/{name}'] = HERE / name
    return files


def verify(path):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError('duplicate ZIP member')
        manifest_name = PREFIX + 'PACKAGE-MANIFEST.json'
        manifest = json.loads(archive.read(manifest_name))
        expected = {PREFIX + name for name in manifest['files']} | {manifest_name}
        if set(names) != expected:
            raise ValueError('archive members do not match the manifest')
        for name, record in manifest['files'].items():
            parts = PurePosixPath(name)
            if parts.is_absolute() or '..' in parts.parts or '\\' in name or ':' in name:
                raise ValueError('unsafe ZIP member path')
            data = archive.read(PREFIX + name)
            if checksum(data) != record['sha256'] or len(data) != record['bytes']:
                raise ValueError(f'checksum mismatch: {name}')
        if archive.testzip() is not None:
            raise ValueError('ZIP CRC check failed')
    return manifest


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--out', type=Path, default=HERE / 'output/strinova-replay-toolkit.zip')
    cli.add_argument('--verify', type=Path, help='verify an existing ZIP without extracting it')
    cli.add_argument('--force', action='store_true', help='replace an existing distribution ZIP')
    args = cli.parse_args()
    if args.verify:
        manifest = verify(args.verify)
        print(f"Verified {len(manifest['files'])} files: {args.verify.resolve()}")
        return
    files = package_files()
    payloads = {name: path.read_bytes() for name, path in sorted(files.items())}
    try:
        revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, stderr=subprocess.DEVNULL, text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        revision = None
    manifest = dict(format='strinova-replay-toolkit-v1', source_revision=revision,
                    python='3.10+', includes_match_data=False,
                    files={name: dict(bytes=len(data), sha256=checksum(data)) for name, data in payloads.items()})
    payloads['PACKAGE-MANIFEST.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    output = args.out.resolve()
    if output.suffix.lower() != '.zip':
        cli.error('--out must end in .zip')
    output.parent.mkdir(parents=True, exist_ok=True)
    # Fixed ordering/timestamps make the same revision reproducible after extraction.
    with output.open('wb' if args.force else 'xb') as destination:
        with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name, data in sorted(payloads.items()):
                info = zipfile.ZipInfo(PREFIX + name, date_time=(2020, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, data)
    verify(output)
    digest = checksum(output.read_bytes())
    output.with_suffix('.zip.sha256').write_text(f'{digest}  {output.name}\n', encoding='ascii')
    print(json.dumps(dict(zip=str(output), bytes=output.stat().st_size, sha256=digest,
                          files=len(files), includes_match_data=False), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
