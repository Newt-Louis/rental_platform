# THISO Leasing MCP Server Guide

## Giới thiệu

**MCP Server** cho phép AI clients (như ChatGPT, Claude, hoặc custom AI ở URL bạn) **truy vấn codebase realtime** mà không cần upload tài liệu tĩnh.

Khi code thay đổi, AI sẽ **tự động thấy dữ liệu mới nhất** mà không cần setup lại.

---

## Endpoint

```
POST https://api.thisoretail.store/api/ai-v2/mcp
```

### Status Check
```
GET https://api.thisoretail.store/api/ai-v2/mcp/status
GET https://api.thisoretail.store/api/ai-v2/mcp/docs
```

---

## Protocol: JSON-RPC 2.0

Tất cả requests phải theo format JSON-RPC 2.0:

```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "method": "method-name",
  "params": { /* optional parameters */ }
}
```

Response:
```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "result": { /* response data */ }
  // hoặc
  "error": { "code": -32603, "message": "error message" }
}
```

---

## Available Methods

### 1. Initialize

**Purpose:** Kiểm tra kết nối, lấy thông tin server

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "initialize",
  "params": {}
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "resources": { "listChanged": true },
      "tools": { "listChanged": true }
    },
    "serverInfo": {
      "name": "THISO Leasing MCP Server",
      "version": "1.0.0"
    }
  }
}
```

---

### 2. List Resources

**Purpose:** Danh sách các resources có thể đọc

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": "2",
  "method": "resources/list",
  "params": {}
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": "2",
  "result": {
    "resources": [
      {
        "uri": "codebase://structure",
        "name": "Project Structure",
        "description": "Folder and module structure"
      },
      {
        "uri": "codebase://modules",
        "name": "Available Modules",
        "description": "List of all NestJS modules"
      },
      {
        "uri": "codebase://schema",
        "name": "Database Schema",
        "description": "Prisma schema"
      },
      {
        "uri": "codebase://api-routes",
        "name": "API Routes",
        "description": "All endpoints"
      },
      {
        "uri": "codebase://business-flows",
        "name": "Business Flows",
        "description": "Key processes"
      },
      {
        "uri": "codebase://conventions",
        "name": "Code Conventions",
        "description": "Standards and patterns"
      }
    ]
  }
}
```

---

### 3. Read Resource

**Purpose:** Lấy nội dung chi tiết của một resource

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": "3",
  "method": "resources/read",
  "params": {
    "uri": "codebase://modules"
  }
}
```

**Available URIs:**
- `codebase://structure` — Folder structure
- `codebase://modules` — List of modules
- `codebase://schema` — Database schema
- `codebase://api-routes` — API endpoints
- `codebase://business-flows` — Business processes
- `codebase://conventions` — Code standards

**Response:** (Data về requested resource)

---

### 4. List Tools

**Purpose:** Danh sách các actions có thể thực hiện

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": "4",
  "method": "tools/list",
  "params": {}
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": "4",
  "result": {
    "tools": [
      {
        "name": "search_code",
        "description": "Search for code files, functions, or patterns",
        "inputSchema": { /* JSON Schema */ }
      },
      {
        "name": "get_file",
        "description": "Read a specific file"
      },
      {
        "name": "list_modules",
        "description": "Get list of all modules"
      },
      {
        "name": "get_module_info",
        "description": "Get detailed info about a module"
      }
    ]
  }
}
```

---

### 5. Call Tool

**Purpose:** Thực hiện một action

**Request (search_code):**
```json
{
  "jsonrpc": "2.0",
  "id": "5",
  "method": "tools/call",
  "params": {
    "name": "search_code",
    "arguments": {
      "query": "ConvertToProposal",
      "type": "file"
    }
  }
}
```

**Request (get_file):**
```json
{
  "jsonrpc": "2.0",
  "id": "5",
  "method": "tools/call",
  "params": {
    "name": "get_file",
    "arguments": {
      "path": "apps/backend/src/modules/ai/ai.controller.ts"
    }
  }
}
```

**Request (get_module_info):**
```json
{
  "jsonrpc": "2.0",
  "id": "5",
  "method": "tools/call",
  "params": {
    "name": "get_module_info",
    "arguments": {
      "moduleName": "proposals"
    }
  }
}
```

---

## Usage Examples

### Example 1: BA muốn hiểu cấu trúc dự án

```javascript
// 1. Initialize
fetch('https://api.thisoretail.store/api/ai-v2/mcp', {
  method: 'POST',
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: '1',
    method: 'initialize',
    params: {}
  })
});

// 2. List resources
fetch('https://api.thisoretail.store/api/ai-v2/mcp', {
  method: 'POST',
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: '2',
    method: 'resources/list',
    params: {}
  })
});

// 3. Read specific resource
fetch('https://api.thisoretail.store/api/ai-v2/mcp', {
  method: 'POST',
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: '3',
    method: 'resources/read',
    params: { uri: 'codebase://business-flows' }
  })
});
```

### Example 2: Tìm kiếm code

```javascript
fetch('https://api.thisoretail.store/api/ai-v2/mcp', {
  method: 'POST',
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: '5',
    method: 'tools/call',
    params: {
      name: 'search_code',
      arguments: {
        query: 'convertToProposal',
        type: 'function'
      }
    }
  })
});
```

### Example 3: Đọc file cụ thể

```javascript
fetch('https://api.thisoretail.store/api/ai-v2/mcp', {
  method: 'POST',
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: '6',
    method: 'tools/call',
    params: {
      name: 'get_file',
      arguments: {
        path: 'apps/backend/src/modules/proposals/proposals.controller.ts'
      }
    }
  })
});
```

---

## Lợi ích của MCP Server

### ✅ Realtime Updates
Không cần upload tài liệu mới khi code thay đổi — AI luôn thấy codebase mới nhất.

### ✅ Tiết kiệm setup
Không phải tạo tài liệu documentation tĩnh — data được generate on-demand.

### ✅ Linh hoạt
AI có thể search, đọc file, liệt kê module, v.v...

### ✅ Scalable
Khi dự án phát triển, MCP tự động trả về info mới nhất mà không cần update config.

---

## Integrate vào AI ở URL của bạn

### Nếu dùng Claude API:
```python
import anthropic

client = anthropic.Anthropic()

tools = [
    {
        "name": "query_mcp",
        "description": "Query THISO Leasing codebase via MCP",
        "input_schema": {
            "type": "object",
            "properties": {
                "method": {"type": "string"},
                "params": {"type": "object"}
            }
        }
    }
]

def query_mcp(method, params):
    import requests
    response = requests.post(
        "https://api.thisoretail.store/api/ai-v2/mcp",
        json={
            "jsonrpc": "2.0",
            "id": "1",
            "method": method,
            "params": params
        }
    )
    return response.json()

# Claude có thể call tool này
```

### Nếu dùng custom AI:
```javascript
// Trong UI ở URL bạn, khi user hỏi:
async function queryCodebase(question) {
  // 1. List resources
  const resources = await fetch('/api/ai-v2/mcp', {
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: '1',
      method: 'resources/list'
    })
  }).then(r => r.json());

  // 2. Gửi question + resources lên LLM của bạn
  // 3. LLM quyết định call tool nào (search_code, get_file, etc)
  // 4. Fetch data từ MCP
  // 5. Trả lời user
}
```

---

## Troubleshooting

### MCP Server không respond
1. Check status: `GET /api/ai-v2/mcp/status`
2. Verify endpoint: `https://api.thisoretail.store/api/ai-v2/mcp`
3. Check backend logs

### Resource/tool not found
- Use `resources/list` and `tools/list` để xem available options
- Verify URI format (e.g., `codebase://modules`)

### File not found error
- Paths are relative to project root
- Example: `apps/backend/src/modules/ai/ai.controller.ts`

---

## Next Steps

1. **Integrate MCP client vào AI của bạn** (Python, JavaScript, etc)
2. **Test methods** (initialize, list, read, tools)
3. **Setup realtime queries** để BA có thể hỏi về codebase
4. **Monitor logs** để track AI requests

---

## Support

For issues, check:
- `/api/ai-v2/mcp/docs` — Quick reference
- `/api/ai-v2/mcp/status` — Server status
- Backend logs: `docker compose logs -f backend`
