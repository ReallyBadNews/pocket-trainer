# Blender assets and MCP

Installed on Kenny Mini: Blender 5.2.1 LTS, uv 0.12.10, blender-mcp 1.9.1 (pinned). The Blender add-on is enabled in saved user preferences and listens on loopback port 9876 when Blender is open. Telemetry is disabled in the MCP server environment.

Codex server configuration was registered with:

```sh
codex mcp add blender --env DISABLE_TELEMETRY=true -- /opt/homebrew/bin/uvx --python 3.11 blender-mcp==1.9.1
```

Existing Codex sessions may need a new session to discover newly registered tools. The actual MCP stdio handshake, tool listing and `get_scene_info` call were verified with:

```sh
uv run --python 3.11 --with blender-mcp==1.9.1 python scripts/verify-blender-mcp.py
```

The editable source scenes are in `assets/blender/`. The Poké Ball scene includes a 48-frame opening/closing animation. The app uses transparent closed/open renders with a reduced-motion-aware discovery reveal. Pokémon character animation is deferred.

Regenerate assets with:

```sh
blender --background --python scripts/blender-assets.py
blender --background --python scripts/blender-icon.py
```

The reproducible source scripts create the models directly in Blender. No external generation service or paid asset account is required. To use interactive MCP tools, open Blender normally; the add-on intentionally does not serve commands in background render mode.

Reference: https://github.com/ahujasid/blender-mcp
