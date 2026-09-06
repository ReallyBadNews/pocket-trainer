"""Exercise the actual MCP stdio connection. Requires Blender open with add-on enabled."""
import asyncio
import os
import json
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    params = StdioServerParameters(command='/opt/homebrew/bin/uvx', args=['--python', '3.11', 'blender-mcp==1.9.1'], env={**os.environ, 'DISABLE_TELEMETRY': 'true'})
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            available = await session.list_tools()
            names = [tool.name for tool in available.tools]
            print(json.dumps({'tool_count': len(names), 'scene_tool_available': 'get_scene_info' in names}))
            result = await session.call_tool('get_scene_info', {'user_prompt': 'I want to create custom assets using blender (install the program and set up the MCP).'} )
            print(result.model_dump_json())
            if result.isError:
                raise RuntimeError('Blender MCP scene inspection failed')

asyncio.run(main())
