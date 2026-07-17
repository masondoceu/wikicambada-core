from __future__ import annotations

import base64
import json
import re
import shutil
import tomllib
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
SITE_CONFIG = ROOT / 'src/config/site.json'
INSTALLATION = ROOT / 'src/config/installation.json'
PRESETS = ROOT / 'src/setup/presets/presets.json'
BRANDING = ROOT / 'src/media/branding'


def read_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return deepcopy(fallback)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    result = deepcopy(base)
    for key, value in (override or {}).items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = deepcopy(value)
    return result


def presets() -> dict[str, Any]:
    return read_json(PRESETS, {})


def current_config() -> dict[str, Any]:
    return read_json(SITE_CONFIG, {})


def current_installation() -> dict[str, Any]:
    return read_json(INSTALLATION, {})


def generic_config(language: str = 'pt-BR') -> dict[str, Any]:
    english = language == 'en'
    name = 'My Wiki' if english else 'Minha Wiki'
    tagline = 'A wiki powered by WikiCambada Core' if english else 'Uma wiki executada pelo WikiCambada Core'
    about_slug = 'about' if english else 'sobre'
    guide_slug = 'editing-guide' if english else 'como-editar'
    return {
        'schemaVersion': 1,
        'site': {
            'name': name,
            'shortName': name,
            'tagline': tagline,
            'description': tagline,
            'language': language,
            'interfaceLanguage': language,
            'homeSlug': 'main-page' if english else 'pagina-principal',
            'baseUrl': '',
            'supportEmail': '',
            'aboutSlug': about_slug,
            'editGuideSlug': guide_slug,
            'defaultCategory': ''
        },
        'branding': {
            'logo': '/src/media/images/core/cat-guard.png',
            'logoMobile': '/src/media/images/core/cat-guard.png',
            'favicon': '/src/media/images/core/cat-guard.png',
            'coreIcon': '/src/media/images/core/cat-guard.png',
            'coreWordmark': '/src/media/images/core/wikicambada-core-white.png',
            'poweredByBadge': '/src/media/images/poweredby-wikicambada-core.png',
            'randomIconManifest': '',
            'randomIcons': False
        },
        'appearance': {
            'accentColor': '#3366cc',
            'defaultTheme': 'auto',
            'fonts': {
                'interface': 'system-ui, sans-serif',
                'content': 'Georgia, serif',
                'monospace': 'ui-monospace, monospace'
            }
        },
        'features': {},
        'navigation': {
            'main': [
                {'label': 'Main page' if english else 'Página principal', 'href': '/', 'kind': 'home'},
                {'label': 'Special pages' if english else 'Páginas especiais', 'href': '/wiki/especial', 'kind': 'page', 'feature': 'specialPages.index'},
                {'label': 'Random page' if english else 'Página aleatória', 'href': '/wiki/especial/pagina-aleatoria', 'kind': 'random', 'feature': 'randomPage'}
            ],
            'community': [
                {'label': 'About' if english else 'Sobre', 'href': f'/wiki/{about_slug}', 'kind': 'page'},
                {'label': 'How to edit' if english else 'Como editar', 'href': f'/wiki/{guide_slug}', 'kind': 'page'}
            ],
            'external': []
        },
        'access': {'mode': 'cloudflare-access', 'superAdminEmail': '', 'strict': True},
        'cloudflare': {'projectName': 'my-wiki', 'databaseName': 'my-wiki-db', 'bucketName': 'my-wiki-uploads'}
    }


def safe_slug(value: str, fallback: str = 'wiki') -> str:
    clean = re.sub(r'[^a-z0-9-]+', '-', value.strip().lower()).strip('-')
    return clean or fallback


def decode_asset(asset: dict[str, Any] | None, default_name: str) -> str | None:
    if not asset or not asset.get('data'):
        return None
    mime = str(asset.get('type') or '').lower()
    extension = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/webp': '.webp',
        'image/svg+xml': '.svg',
        'image/x-icon': '.ico',
        'image/vnd.microsoft.icon': '.ico'
    }.get(mime, Path(str(asset.get('name') or '')).suffix.lower() or '.bin')
    encoded = str(asset['data']).split(',', 1)[-1]
    content = base64.b64decode(encoded)
    BRANDING.mkdir(parents=True, exist_ok=True)
    target = BRANDING / f'{default_name}{extension}'
    target.write_bytes(content)
    return f'/src/media/branding/{target.name}'


def generate_wrangler(config: dict[str, Any]) -> None:
    site = config.get('site', {})
    access = config.get('access', {})
    cloudflare = config.get('cloudflare', {})
    project = safe_slug(str(cloudflare.get('projectName') or site.get('shortName') or site.get('name') or 'wiki'))
    database = str(cloudflare.get('databaseName') or f'{project}-db').strip()
    bucket = str(cloudflare.get('bucketName') or f'{project}-uploads').strip()
    base_url = str(site.get('baseUrl') or '').strip()
    super_admin = str(access.get('superAdminEmail') or '').strip().lower()
    strict = 'true' if access.get('strict', True) else 'false'
    features_json = json.dumps(config.get('features') or {}, ensure_ascii=False, separators=(',', ':')).replace('\\', '\\\\').replace('"', '\\"')
    existing = (ROOT / 'wrangler.toml').read_text(encoding='utf-8') if (ROOT / 'wrangler.toml').exists() else ''

    def existing_value(pattern: str, fallback: str = '') -> str:
        match = re.search(pattern, existing, re.MULTILINE)
        return match.group(1) if match else fallback

    database_id = existing_value(r'^database_id\s*=\s*"([^"]*)"')
    preview_id = existing_value(r'^preview_database_id\s*=\s*"([^"]*)"', database_id)
    access_domain = existing_value(r'^ACCESS_TEAM_DOMAIN\s*=\s*"([^"]*)"')
    access_aud = existing_value(r'^ACCESS_AUD\s*=\s*"([^"]*)"')
    content = f'''name = "{project}"
compatibility_date = "2026-06-22"
pages_build_output_dir = "."

[vars]
ACCESS_TEAM_DOMAIN = "{access_domain}"
ACCESS_AUD = "{access_aud}"
ACCESS_STRICT = "{strict}"
PUBLIC_BASE_URL = "{base_url}"
WIKI_SITE_NAME = "{str(site.get('name') or 'WikiCambada Core').replace('"', '')}"
WIKI_SUPER_ADMIN_EMAIL = "{super_admin}"
WIKI_CORE_VERSION = "v1.1.0 Beta"
WIKI_FEATURES_JSON = "{features_json}"

[[d1_databases]]
binding = "DB"
database_name = "{database}"
database_id = "{database_id}"
preview_database_id = "{preview_id}"
migrations_dir = "src/data/migrations"
migrations_table = "d1_migrations"

[[r2_buckets]]
binding = "WIKI_BUCKET"
bucket_name = "{bucket}"
'''
    (ROOT / 'wrangler.toml').write_text(content, encoding='utf-8')


def generate_package(config: dict[str, Any]) -> None:
    package_path = ROOT / 'package.json'
    package = read_json(package_path, {})
    cloudflare = config.get('cloudflare', {})
    site = config.get('site', {})
    project = safe_slug(str(cloudflare.get('projectName') or site.get('shortName') or site.get('name') or 'wiki'))
    database = str(cloudflare.get('databaseName') or f'{project}-db').strip()
    package['name'] = project
    package['version'] = '1.1.0-beta'
    package['private'] = True
    scripts = package.setdefault('scripts', {})
    scripts['dev'] = 'wrangler pages dev .'
    scripts['deploy'] = f'wrangler pages deploy . --project-name {project}'
    scripts['db:migrations:apply:local'] = f'wrangler d1 migrations apply {database} --local'
    scripts['db:migrations:apply:remote'] = f'wrangler d1 migrations apply {database} --remote'
    scripts['setup'] = 'python3 setup.py'
    scripts['verify'] = 'python3 setup.py verify'
    package.setdefault('devDependencies', {})['wrangler'] = 'latest'
    write_json(package_path, package)


def save_configuration(payload: dict[str, Any]) -> dict[str, Any]:
    intent = str(payload.get('intent') or 'configure')
    incoming = payload.get('config') or {}
    language = str(incoming.get('site', {}).get('language') or 'pt-BR')
    base = generic_config(language) if intent == 'new' else current_config()
    preset_id = str(payload.get('preset') or 'custom')
    preset = presets().get(preset_id, {})
    if preset_id != 'custom' and preset.get('features'):
        base['features'] = deep_merge(base.get('features', {}), preset['features'])
    config = deep_merge(base, incoming)

    assets = payload.get('assets') or {}
    logo = decode_asset(assets.get('logo'), 'logo')
    logo_dark = decode_asset(assets.get('logoDark'), 'logo-dark')
    favicon = decode_asset(assets.get('favicon'), 'favicon')
    if logo:
        config.setdefault('branding', {})['logo'] = logo
        config['branding']['logoMobile'] = logo
        config['branding']['randomIcons'] = False
    if logo_dark:
        config.setdefault('branding', {})['logoDark'] = logo_dark
    if favicon:
        config.setdefault('branding', {})['favicon'] = favicon

    config['schemaVersion'] = 1
    write_json(SITE_CONFIG, config)
    generate_wrangler(config)
    generate_package(config)

    installation = current_installation()
    now = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    installation.update({
        'formatVersion': 1,
        'installationId': safe_slug(str(config.get('site', {}).get('shortName') or config.get('site', {}).get('name') or 'wiki')),
        'distribution': preset_id,
        'coreVersion': '1.1.0-beta',
        'configSchema': 1,
        'databaseSchema': 15,
        'updateChannel': str(payload.get('updateChannel') or installation.get('updateChannel') or 'stable'),
        'lastUpdatedAt': now
    })
    installation.setdefault('createdAt', now)
    write_json(INSTALLATION, installation)
    write_json(ROOT / '.wikicambada/state.json', {
        'managedBy': 'WikiCambada Core setup',
        'coreVersion': installation['coreVersion'],
        'configSchema': 1,
        'databaseSchema': 15,
        'lastConfiguredAt': now
    })
    return {'config': config, 'installation': installation}


def verify_project() -> dict[str, Any]:
    required = [
        'index.html', 'package.json', 'wrangler.toml', 'wikicambada-release.json', 'wikicambada-files.json',
        'functions/api/health.ts', 'src/config/site.json', 'src/config/installation.json',
        'src/scripts/app.js', 'src/setup/ui/index.html', 'src/data/migrations/0015_v1_1_0_global_settings.sql'
    ]
    checks: list[dict[str, Any]] = []
    for name in required:
        exists = (ROOT / name).exists()
        checks.append({'name': name, 'ok': exists, 'message': 'ok' if exists else 'ausente'})

    json_files = [
        'src/config/site.json', 'src/config/installation.json', 'package.json',
        'wikicambada-release.json', 'wikicambada-files.json'
    ]
    parsed: dict[str, Any] = {}
    for name in json_files:
        try:
            parsed[name] = json.loads((ROOT / name).read_text(encoding='utf-8'))
            checks.append({'name': f'{name}:json', 'ok': True, 'message': 'json válido'})
        except Exception as exc:
            checks.append({'name': f'{name}:json', 'ok': False, 'message': str(exc)})

    try:
        tomllib.loads((ROOT / 'wrangler.toml').read_text(encoding='utf-8'))
        checks.append({'name': 'wrangler.toml:toml', 'ok': True, 'message': 'toml válido'})
    except Exception as exc:
        checks.append({'name': 'wrangler.toml:toml', 'ok': False, 'message': str(exc)})

    release = parsed.get('wikicambada-release.json') or {}
    package = parsed.get('package.json') or {}
    installation = parsed.get('src/config/installation.json') or {}
    version_ok = str(release.get('version') or '') == str(package.get('version') or '') == str(installation.get('coreVersion') or '')
    checks.append({
        'name': 'versões do Core',
        'ok': version_ok,
        'message': str(release.get('version') or 'inconsistente') if version_ok else 'package, release e instalação não coincidem'
    })

    site = parsed.get('src/config/site.json') or {}
    for key in ['logo', 'logoMobile', 'favicon']:
        value = str(site.get('branding', {}).get(key) or '')
        if not value or not value.startswith('/') or value.startswith('//'):
            continue
        path = ROOT / value.lstrip('/')
        checks.append({
            'name': f'branding.{key}',
            'ok': path.is_file(),
            'message': value if path.is_file() else f'asset ausente: {value}'
        })

    return {'ok': all(item['ok'] for item in checks), 'checks': checks}

