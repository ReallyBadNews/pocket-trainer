import bpy
bpy.ops.preferences.addon_enable(module='blender_mcp')
bpy.ops.wm.save_userpref()
print('Blender MCP enabled and preferences saved.')
