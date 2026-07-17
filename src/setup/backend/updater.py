from __future__ import annotations

import base64
import hashlib
import json
import re
import shutil
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .project import ROOT, current_installation, read_json, verify_project, write_json

PRESERVE = [
    Path('src/config'),
    Path('src/media/branding'),
    Path('src/media/fonts'),
    Path('.dev.vars'),
    Path('wrangler.toml')
]
IGNORE = {'.git', '.wrangler', 'node_modules', '__pycache__', '.DS_Store'}
INSTALLATION_MANAGED = [*PRESERVE, Path('package.json')]


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')


def _hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _is_preserved(relative: str) -> bool:
    path = Path(relative)
    return any(path == preserved or preserved in path.parents for preserved in INSTALLATION_MANAGED)


def backup_project() -> Path:
    target = ROOT / '.wikicambada/backups' / _timestamp()
    target.mkdir(parents=True, exist_ok=True)
    for item in ROOT.iterdir():
        if item.name in IGNORE or item.name == '.wikicambada':
            continue
        destination = target / item.name
        if item.is_dir():
            shutil.copytree(item, destination, ignore=shutil.ignore_patterns(*IGNORE))
        else:
            shutil.copy2(item, destination)
    return target


def restore_backup(path: Path) -> None:
    for item in ROOT.iterdir():
        if item.name in IGNORE or item.name == '.wikicambada':
            continue
        if item.is_dir():
            shutil.rmtree(item)
        else:
            item.unlink()
    for item in path.iterdir():
        destination = ROOT / item.name
        if item.is_dir():
            shutil.copytree(item, destination)
        else:
            shutil.copy2(item, destination)


def _safe_extract(bundle: zipfile.ZipFile, target: Path) -> None:
    target = target.resolve()
    for member in bundle.infolist():
        destination = (target / member.filename).resolve()
        if destination != target and target not in destination.parents:
            raise ValueError('o ZIP contém um caminho inválido')
    bundle.extractall(target)


def _source_root(extracted: Path) -> Path:
    children = [child for child in extracted.iterdir() if child.name not in IGNORE]
    if len(children) == 1 and children[0].is_dir() and (children[0] / 'index.html').exists():
        return children[0]
    return extracted


def _version_tuple(value: Any) -> tuple[int, int, int]:
    match = re.search(r'(\d+)\.(\d+)\.(\d+)', str(value or ''))
    return tuple(int(part) for part in match.groups()) if match else (0, 0, 0)


def _validate_release(source: Path, release: dict[str, Any]) -> None:
    if not release:
        raise ValueError('o pacote não possui wikicambada-release.json')
    if release.get('product') != 'WikiCambada Core':
        raise ValueError('o manifesto não pertence ao WikiCambada Core')
    if not release.get('version'):
        raise ValueError('o manifesto da release não informa a versão')

    minimum = str(release.get('minimumUpgradeableVersion') or '')
    current = str(current_installation().get('coreVersion') or '')
    if minimum and current and _version_tuple(current) < _version_tuple(minimum):
        raise ValueError(f'esta atualização exige WikiCambada Core {minimum} ou superior')

    manifest_name = str(release.get('filesManifest') or '')
    if not manifest_name:
        raise ValueError('o manifesto da release não aponta o arquivo de hashes')
    manifest = read_json(source / manifest_name, {})
    files = manifest.get('files') if isinstance(manifest, dict) and 'files' in manifest else manifest
    if not isinstance(files, dict) or not files:
        raise ValueError('o manifesto de arquivos da atualização é inválido')
    errors = []
    for relative, expected in files.items():
        path = source / str(relative)
        if not path.is_file():
            errors.append(f'{relative}: ausente')
        elif _hash(path) != str(expected):
            errors.append(f'{relative}: hash diferente')
        if len(errors) >= 10:
            break
    if errors:
        raise ValueError('o pacote falhou na verificação de integridade: ' + '; '.join(errors))


def modified_core_files() -> list[str]:
    manifest = read_json(ROOT / 'wikicambada-files.json', {})
    files = manifest.get('files') if isinstance(manifest, dict) and 'files' in manifest else manifest
    if not isinstance(files, dict):
        return []
    modified = []
    for relative, expected in files.items():
        if _is_preserved(str(relative)):
            continue
        path = ROOT / str(relative)
        if not path.is_file() or _hash(path) != str(expected):
            modified.append(str(relative))
    return modified


def _update_wrangler_version(display_version: str) -> None:
    path = ROOT / 'wrangler.toml'
    if not path.exists():
        return
    source = path.read_text(encoding='utf-8')
    line = f'WIKI_CORE_VERSION = "{display_version.replace(chr(34), "")}"'
    if re.search(r'^WIKI_CORE_VERSION\s*=.*$', source, re.MULTILINE):
        source = re.sub(r'^WIKI_CORE_VERSION\s*=.*$', line, source, flags=re.MULTILINE)
    elif '[vars]' in source:
        source = source.replace('[vars]', f'[vars]\n{line}', 1)
    path.write_text(source, encoding='utf-8')


def update_from_base64(data: str, filename: str = 'update.zip') -> dict[str, Any]:
    try:
        raw = base64.b64decode(data.split(',', 1)[-1], validate=True)
    except Exception as exc:
        raise ValueError('o conteúdo enviado não é um arquivo válido') from exc

    local_modifications = modified_core_files()
    with tempfile.TemporaryDirectory(prefix='wikicambada-update-') as temp_name:
        temp = Path(temp_name)
        archive = temp / Path(filename).name
        archive.write_bytes(raw)
        if not zipfile.is_zipfile(archive):
            raise ValueError('o arquivo enviado não é um ZIP válido')
        extracted = temp / 'extracted'
        extracted.mkdir()
        with zipfile.ZipFile(archive) as bundle:
            _safe_extract(bundle, extracted)
        source = _source_root(extracted)
        if not (source / 'index.html').exists() or not (source / 'package.json').exists():
            raise ValueError('o ZIP não parece conter o WikiCambada Core')
        release = read_json(source / 'wikicambada-release.json', {})
        _validate_release(source, release)
        source_package = read_json(source / 'package.json', {})
        local_package = read_json(ROOT / 'package.json', {})

        backup = backup_project()
        preserved = temp / 'preserved'
        preserved.mkdir()
        for relative in PRESERVE:
            original = ROOT / relative
            if not original.exists():
                continue
            destination = preserved / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            if original.is_dir():
                shutil.copytree(original, destination)
            else:
                shutil.copy2(original, destination)

        try:
            for item in source.iterdir():
                if item.name in IGNORE or item.name == '.wikicambada':
                    continue
                destination = ROOT / item.name
                if destination.exists():
                    if destination.is_dir():
                        shutil.rmtree(destination)
                    else:
                        destination.unlink()
                if item.is_dir():
                    shutil.copytree(item, destination, ignore=shutil.ignore_patterns(*IGNORE))
                else:
                    shutil.copy2(item, destination)

            for relative in PRESERVE:
                saved = preserved / relative
                if not saved.exists():
                    continue
                destination = ROOT / relative
                if destination.exists():
                    if destination.is_dir():
                        shutil.rmtree(destination)
                    else:
                        destination.unlink()
                destination.parent.mkdir(parents=True, exist_ok=True)
                if saved.is_dir():
                    shutil.copytree(saved, destination)
                else:
                    shutil.copy2(saved, destination)

            merged_package = dict(source_package)
            if local_package.get('name'):
                merged_package['name'] = local_package['name']
            merged_package['private'] = local_package.get('private', merged_package.get('private', True))
            merged_scripts = dict(source_package.get('scripts') or {})
            for key in ['deploy', 'db:migrations:apply:local', 'db:migrations:apply:remote']:
                if local_package.get('scripts', {}).get(key):
                    merged_scripts[key] = local_package['scripts'][key]
            merged_package['scripts'] = merged_scripts
            write_json(ROOT / 'package.json', merged_package)

            installation = current_installation()
            version = str(release.get('version') or read_json(ROOT / 'package.json', {}).get('version') or installation.get('coreVersion') or 'unknown')
            display_version = str(release.get('displayVersion') or version)
            installation['coreVersion'] = version
            if release.get('configSchema') is not None:
                installation['configSchema'] = release['configSchema']
            if release.get('databaseSchema') is not None:
                installation['databaseSchema'] = release['databaseSchema']
            installation['lastUpdatedAt'] = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
            write_json(ROOT / 'src/config/installation.json', installation)
            _update_wrangler_version(display_version)
            write_json(ROOT / '.wikicambada/state.json', {
                'managedBy': 'WikiCambada Core setup',
                'coreVersion': version,
                'configSchema': installation.get('configSchema'),
                'databaseSchema': installation.get('databaseSchema'),
                'lastUpdatedAt': installation['lastUpdatedAt']
            })

            verification = verify_project()
            if not verification['ok']:
                raise RuntimeError('a verificação pós-atualização falhou')
            return {
                'ok': True,
                'version': version,
                'backup': str(backup),
                'verification': verification,
                'release': release,
                'modifiedFilesBeforeUpdate': local_modifications
            }
        except Exception:
            restore_backup(backup)
            raise


def release_manifest() -> dict[str, Any]:
    files = {}
    for path in sorted(ROOT.rglob('*')):
        if not path.is_file() or any(part in IGNORE for part in path.parts) or '.wikicambada' in path.parts:
            continue
        relative = path.relative_to(ROOT).as_posix()
        if relative == 'wikicambada-files.json':
            continue
        files[relative] = _hash(path)
    return files
