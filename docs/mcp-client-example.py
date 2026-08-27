"""
THISO Leasing MCP Client Example

Ví dụ cách sử dụng MCP Server để query codebase realtime.
Có thể integrate vào Claude API hoặc custom AI.

Usage:
    python mcp-client-example.py
"""

import requests
import json
from typing import Any, Dict, Optional

class THISOCodebaseClient:
    """Client để query THISO Leasing codebase qua MCP Server"""

    def __init__(self, mcp_endpoint: str = "https://api.thisoretail.store/api/ai-v2/mcp"):
        self.endpoint = mcp_endpoint
        self.request_id = 0

    def _call(self, method: str, params: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Gửi MCP request tới server

        Args:
            method: MCP method name (initialize, resources/list, tools/call, etc)
            params: Parameters for the method

        Returns:
            Server response (result or error)
        """
        self.request_id += 1
        payload = {
            "jsonrpc": "2.0",
            "id": str(self.request_id),
            "method": method,
            "params": params or {}
        }

        try:
            response = requests.post(self.endpoint, json=payload, timeout=10)
            response.raise_for_status()
            data = response.json()

            if "error" in data:
                print(f"❌ Error: {data['error']['message']}")
                return {}

            return data.get("result", {})
        except requests.exceptions.RequestException as e:
            print(f"❌ Request failed: {e}")
            return {}

    def initialize(self) -> bool:
        """Initialize MCP connection and check server is running"""
        print("🔄 Initializing MCP connection...")
        result = self._call("initialize", {})
        if result:
            print(f"✅ Connected to {result.get('serverInfo', {}).get('name')}")
            return True
        return False

    def list_resources(self) -> list:
        """List available resources"""
        print("\n📚 Available Resources:")
        result = self._call("resources/list", {})
        resources = result.get("resources", [])
        for res in resources:
            print(f"  • {res['name']:<25} ({res['uri']})")
            print(f"    {res['description']}")
        return resources

    def read_resource(self, uri: str) -> str:
        """Read a specific resource"""
        print(f"\n📖 Reading: {uri}")
        result = self._call("resources/read", {"uri": uri})
        content = result.get("content", "")
        if isinstance(content, dict):
            return json.dumps(content, indent=2, ensure_ascii=False)
        return str(content)

    def list_tools(self) -> list:
        """List available tools"""
        print("\n🛠️  Available Tools:")
        result = self._call("tools/list", {})
        tools = result.get("tools", [])
        for tool in tools:
            print(f"  • {tool['name']}")
            print(f"    {tool['description']}")
        return tools

    def search_code(self, query: str, type_: str = None) -> list:
        """Search for code files, functions, patterns"""
        print(f"\n🔍 Searching for: '{query}'")
        result = self._call("tools/call", {
            "name": "search_code",
            "arguments": {
                "query": query,
                "type": type_
            }
        })
        matches = result.get("matches", [])
        print(f"📌 Found {len(matches)} matches:")
        for match in matches[:10]:  # Show first 10
            print(f"  • {match}")
        return matches

    def get_file(self, path: str) -> str:
        """Read a specific file from codebase"""
        print(f"\n📄 Reading file: {path}")
        result = self._call("tools/call", {
            "name": "get_file",
            "arguments": {"path": path}
        })
        content = result.get("result", "")
        lines = str(content).split('\n')
        print(f"📝 First 20 lines of {path}:")
        for i, line in enumerate(lines[:20], 1):
            print(f"{i:3d}: {line}")
        return content

    def list_modules(self) -> list:
        """List all backend modules"""
        print("\n📦 Backend Modules:")
        result = self._call("tools/call", {
            "name": "list_modules",
            "arguments": {}
        })
        modules = result.get("result", {}).get("modules", [])
        print(f"Total: {len(modules)} modules\n")
        for mod in modules:
            files = ", ".join(mod.get("files", [])[:3])  # Show first 3 files
            print(f"  📁 {mod['name']:<20} {files}...")
        return modules

    def get_module_info(self, module_name: str) -> Dict:
        """Get detailed info about a module"""
        print(f"\n🔎 Module Info: {module_name}")
        result = self._call("tools/call", {
            "name": "get_module_info",
            "arguments": {"moduleName": module_name}
        })
        module = result.get("result", {})
        print(f"Files: {module.get('files', [])}")
        if "routes" in module:
            print(f"Routes: {module.get('routes', [])}")
        return module


def main():
    """Demo usage"""
    print("=" * 60)
    print("THISO Leasing MCP Client Demo")
    print("=" * 60)

    client = THISOCodebaseClient()

    # 1. Initialize
    if not client.initialize():
        print("Failed to connect to MCP server")
        return

    # 2. List available resources
    client.list_resources()

    # 3. Read a resource - Project Structure
    structure = client.read_resource("codebase://structure")
    print(structure[:500] + "...")  # First 500 chars

    # 4. Read another resource - Modules
    modules = client.read_resource("codebase://modules")
    print(modules[:500] + "...")

    # 5. List available tools
    client.list_tools()

    # 6. Search for code
    client.search_code("ConvertToProposal", "file")

    # 7. List all modules
    client.list_modules()

    # 8. Get info about specific module
    client.get_module_info("proposals")

    print("\n" + "=" * 60)
    print("✅ Demo completed!")
    print("=" * 60)


if __name__ == "__main__":
    main()
