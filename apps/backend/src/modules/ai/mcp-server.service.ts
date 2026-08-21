import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: { code: number; message: string };
}

@Injectable()
export class MCPServerService {
  private readonly logger = new Logger(MCPServerService.name);
  private readonly projectRoot = process.cwd();

  constructor(private prisma: PrismaService) {}

  /**
   * Process MCP request from AI client
   */
  handleRequest(request: MCPRequest): MCPResponse {
    try {
      const { method, params, id } = request;

      switch (method) {
        case 'initialize':
          return this.initialize(id);

        case 'resources/list':
          return this.listResources(id);

        case 'resources/read':
          return this.readResource(id, params);

        case 'tools/list':
          return this.listTools(id);

        case 'tools/call':
          return this.callTool(id, params);

        default:
          return this.error(id, -32601, 'Method not found');
      }
    } catch (err) {
      return this.error(request.id, -32603, err.message);
    }
  }

  /**
   * Initialize MCP connection
   */
  private initialize(id: string | number): MCPResponse {
    return this.success(id, {
      protocolVersion: '2024-11-05',
      capabilities: {
        resources: { listChanged: true },
        tools: { listChanged: true },
        prompts: { listChanged: false },
      },
      serverInfo: {
        name: 'THISO Leasing MCP Server',
        version: '1.0.0',
      },
    });
  }

  /**
   * List available resources (code structure, schema, etc)
   */
  private listResources(id: string | number): MCPResponse {
    return this.success(id, {
      resources: [
        {
          uri: 'codebase://structure',
          name: 'Project Structure',
          description: 'Folder and module structure of THISO Leasing',
          mimeType: 'application/json',
        },
        {
          uri: 'codebase://modules',
          name: 'Available Modules',
          description: 'List of all NestJS modules and their endpoints',
          mimeType: 'application/json',
        },
        {
          uri: 'codebase://schema',
          name: 'Database Schema',
          description: 'Prisma schema with all models and relations',
          mimeType: 'application/json',
        },
        {
          uri: 'codebase://api-routes',
          name: 'API Routes',
          description: 'All available API endpoints',
          mimeType: 'application/json',
        },
        {
          uri: 'codebase://business-flows',
          name: 'Business Flows',
          description: 'Key business processes and flows',
          mimeType: 'application/json',
        },
        {
          uri: 'codebase://conventions',
          name: 'Code Conventions',
          description: 'Coding standards and architecture patterns',
          mimeType: 'application/json',
        },
      ],
    });
  }

  /**
   * Read specific resource
   */
  private readResource(
    id: string | number,
    params: { uri: string },
  ): MCPResponse {
    const { uri } = params;

    try {
      if (uri === 'codebase://structure') {
        return this.success(id, { content: this.getProjectStructure() });
      }
      if (uri === 'codebase://modules') {
        return this.success(id, { content: this.getModulesInfo() });
      }
      if (uri === 'codebase://schema') {
        return this.success(id, { content: this.getDatabaseSchema() });
      }
      if (uri === 'codebase://api-routes') {
        return this.success(id, { content: this.getApiRoutes() });
      }
      if (uri === 'codebase://business-flows') {
        return this.success(id, { content: this.getBusinessFlows() });
      }
      if (uri === 'codebase://conventions') {
        return this.success(id, { content: this.getConventions() });
      }

      return this.error(id, -32602, `Resource not found: ${uri}`);
    } catch (err) {
      return this.error(id, -32603, err.message);
    }
  }

  /**
   * List available tools (actions AI can perform)
   */
  private listTools(id: string | number): MCPResponse {
    return this.success(id, {
      tools: [
        {
          name: 'search_code',
          description: 'Search for code files, functions, or patterns in the codebase',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search term or regex pattern' },
              type: {
                type: 'string',
                enum: ['file', 'function', 'model', 'endpoint'],
                description: 'Type of thing to search for',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_file',
          description: 'Read a specific file from the codebase',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Relative path to the file',
              },
            },
            required: ['path'],
          },
        },
        {
          name: 'list_modules',
          description: 'Get list of all backend modules',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'get_module_info',
          description: 'Get detailed info about a specific module',
          inputSchema: {
            type: 'object',
            properties: {
              moduleName: { type: 'string', description: 'Name of the module' },
            },
            required: ['moduleName'],
          },
        },
      ],
    });
  }

  /**
   * Call a tool
   */
  private callTool(
    id: string | number,
    params: { name: string; arguments: any },
  ): MCPResponse {
    const { name, arguments: args } = params;

    try {
      switch (name) {
        case 'search_code':
          return this.success(id, { result: this.searchCode(args.query, args.type) });
        case 'get_file':
          return this.success(id, { result: this.getFile(args.path) });
        case 'list_modules':
          return this.success(id, { result: this.listModulesInfo() });
        case 'get_module_info':
          return this.success(id, { result: this.getModuleInfo(args.moduleName) });
        default:
          return this.error(id, -32601, `Tool not found: ${name}`);
      }
    } catch (err) {
      return this.error(id, -32603, err.message);
    }
  }

  // ───────────────────── Resource Generators ─────────────────────

  private getProjectStructure(): string {
    return JSON.stringify(
      {
        name: 'THISO Leasing Platform',
        description: 'Mall leasing management system',
        root: 'leasing-platform-thiso',
        structure: {
          'apps/': {
            'backend/': {
              'src/': {
                'modules/': 'Feature modules (crm, proposals, contracts, etc)',
                'common/': 'Shared guards, decorators, interceptors',
                'storage/': 'File storage service',
                'prisma/': 'Database service',
                'main.ts': 'Entry point',
              },
              'prisma/': {
                'schema.prisma': 'Database schema',
                'seed.ts': 'Seed data',
              },
            },
            'frontend/': {
              'src/': {
                'pages/': 'Page components (mirrors backend modules)',
                'components/': 'Reusable UI components',
                'api/': 'Axios API client wrappers',
                'store/': 'Zustand state management',
                'lib/': 'Utilities, i18n, permissions',
              },
            },
          },
          'packages/': {
            'shared/': 'Shared types and constants',
          },
          'docker-compose.yml': 'Production compose',
          'docker-compose.dev.yml': 'Development compose (hot-reload)',
          'Makefile': 'Common commands',
        },
      },
      null,
      2,
    );
  }

  private getModulesInfo(): string {
    const moduleNames = [
      'crm',
      'proposals',
      'approvals',
      'contracts',
      'billing',
      'spaces',
      'bookings',
      'fitout',
      'tickets',
      'patrol',
      'parking',
      'work-orders',
      'sales',
      'tenants',
      'users',
      'auth',
      'ai',
      'reports',
      'analytics',
      'audit-log',
      'announcements',
      'notifications',
      'categories',
      'sap',
      'inventory',
      'service-contracts',
      'slots',
      'branding',
      'dashboard',
    ];

    return JSON.stringify(
      {
        modules: moduleNames.map((name) => ({
          name,
          path: `apps/backend/src/modules/${name}`,
          description: `${name.charAt(0).toUpperCase() + name.slice(1).replace('-', ' ')} module`,
        })),
        total: moduleNames.length,
      },
      null,
      2,
    );
  }

  private getDatabaseSchema(): string {
    try {
      const schemaPath = path.join(
        this.projectRoot,
        'apps/backend/prisma/schema.prisma',
      );
      if (fs.existsSync(schemaPath)) {
        return fs.readFileSync(schemaPath, 'utf-8').substring(0, 10000); // First 10k chars
      }
    } catch (err) {
      this.logger.warn(`Could not read schema: ${err.message}`);
    }

    return JSON.stringify(
      {
        note: 'Database schema contains 100+ models',
        key_models: [
          'User',
          'Mall',
          'Unit',
          'Floor',
          'Zone',
          'Tenant',
          'Contract',
          'Proposal',
          'Booking',
          'Invoice',
          'Lead',
          'Ticket',
          'ApprovalWorkflow',
        ],
        structure: 'See apps/backend/prisma/schema.prisma for full schema',
      },
      null,
      2,
    );
  }

  private getApiRoutes(): string {
    return JSON.stringify(
      {
        description: 'Main API endpoints by module',
        baseUrl: '/api',
        endpoints: {
          auth: [
            'POST /auth/login',
            'POST /auth/register',
            'GET /auth/me',
            'POST /auth/refresh',
          ],
          dashboard: ['GET /dashboard', 'GET /dashboard/stats'],
          spaces: [
            'GET /spaces/units',
            'POST /spaces/units',
            'GET /spaces/units/:id',
            'PUT /spaces/units/:id',
            'DELETE /spaces/units/:id',
            'GET /spaces/floors',
            'POST /spaces/floors',
          ],
          crm: [
            'GET /crm/leads',
            'POST /crm/leads',
            'GET /crm/leads/:id',
            'PUT /crm/leads/:id',
          ],
          proposals: [
            'GET /proposals',
            'POST /proposals',
            'GET /proposals/:id',
            'PUT /proposals/:id',
            'POST /proposals/:id/submit',
          ],
          approvals: [
            'GET /approvals/pending',
            'POST /approvals/:id/approve',
            'POST /approvals/:id/reject',
          ],
          contracts: [
            'GET /contracts',
            'POST /contracts',
            'GET /contracts/:id',
            'PUT /contracts/:id',
          ],
          billing: [
            'GET /billing/invoices',
            'POST /billing/invoices',
            'GET /billing/invoices/:id',
            'POST /billing/invoices/:id/paid',
          ],
          bookings: [
            'GET /bookings',
            'POST /bookings',
            'GET /bookings/:id',
            'POST /bookings/:id/convert',
          ],
          ai: [
            'POST /ai/chat',
            'POST /ai/chat/stream',
            'GET /ai/suggestions',
            'POST /ai-v2/mcp (MCP server)',
          ],
        },
      },
      null,
      2,
    );
  }

  private getBusinessFlows(): string {
    return JSON.stringify(
      {
        main_flows: {
          leasing_lifecycle: [
            'Lead Creation (CRM) → Booking → Proposal → Approval → Contract → Billing',
          ],
          approval_workflow: [
            'Discount ≤5% → Leasing Manager',
            'Discount 5-10% → Mall Director',
            'Discount >10% or rent-free >60 days → CEO',
            'Finance + Legal always included',
          ],
          fitout_workflow: [
            'Design → PCCC → Permit → Construction → Inspection → Opening',
          ],
        },
        key_concepts: {
          mall_scoping: 'All entities (Unit, Contract, Proposal, etc) scoped by mallId',
          lead_exception: 'Lead has no mallId, exists outside mall scoping until conversion',
          multi_tenancy: 'UserMallAccess controls which malls a user can access',
        },
      },
      null,
      2,
    );
  }

  private getConventions(): string {
    return JSON.stringify(
      {
        backend: {
          framework: 'NestJS 10',
          database: 'Prisma ORM + PostgreSQL',
          auth: 'JWT + RBAC (Role-based Access Control)',
          guards: 'JwtAuthGuard → RolesGuard → MallAccessGuard',
          responses: '{ success: boolean, data: T }',
          pagination: '{ success, data: [], total, page }',
        },
        frontend: {
          framework: 'React 18 + Vite + TypeScript',
          ui: 'TailwindCSS + shadcn/ui',
          state: 'Zustand stores (auth, mall, spaces)',
          api: 'Axios wrappers in src/api/',
          i18n: 'Vietnamese primary language (src/lib/i18n.ts)',
        },
        naming: {
          files: 'camelCase (my-module.service.ts)',
          functions: 'camelCase (getUnits)',
          classes: 'PascalCase (AiService)',
          database: 'Models in PascalCase, fields in camelCase',
        },
        architecture: {
          mall_boundary: 'Every entity scoped by mallId (except Lead)',
          modules: 'One per business domain (crm, proposals, contracts)',
          shared: 'Cross-cutting concerns in common/ (guards, decorators, services)',
        },
      },
      null,
      2,
    );
  }

  // ───────────────────── Tool Implementations ─────────────────────

  private searchCode(query: string, type?: string): any {
    try {
      // Simple file search implementation
      const backendSrc = path.join(this.projectRoot, 'apps/backend/src');

      if (!fs.existsSync(backendSrc)) {
        return { error: 'Source directory not found' };
      }

      const results = [];
      const walkDir = (dir: string) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.startsWith('.') || results.length > 20) continue;
          const fullPath = path.join(dir, file);
          if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
          } else if (
            (fullPath.includes(query) ||
              fs.readFileSync(fullPath, 'utf-8').includes(query)) &&
            (fullPath.endsWith('.ts') || fullPath.endsWith('.js'))
          ) {
            results.push(fullPath.replace(this.projectRoot, ''));
          }
        }
      };

      walkDir(backendSrc);
      return { matches: results.slice(0, 20) };
    } catch (err) {
      return { error: err.message };
    }
  }

  private getFile(filePath: string): string {
    try {
      const fullPath = path.join(this.projectRoot, filePath);

      if (!fullPath.startsWith(this.projectRoot)) {
        throw new Error('Path traversal attempt');
      }

      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      return content.substring(0, 50000); // First 50k chars
    } catch (err) {
      return `Error: ${err.message}`;
    }
  }

  private listModulesInfo(): any {
    try {
      const modulesDir = path.join(
        this.projectRoot,
        'apps/backend/src/modules',
      );

      if (!fs.existsSync(modulesDir)) {
        return { error: 'Modules directory not found' };
      }

      const modules = fs
        .readdirSync(modulesDir)
        .filter(
          (f) => fs.statSync(path.join(modulesDir, f)).isDirectory() &&
            !f.startsWith('.'),
        )
        .map((name) => {
          const moduleDir = path.join(modulesDir, name);
          const files = fs.readdirSync(moduleDir);
          return {
            name,
            files: files.filter((f) => f.endsWith('.ts')),
            hasController: files.some((f) => f.includes('.controller')),
            hasService: files.some((f) => f.includes('.service')),
          };
        });

      return { modules, total: modules.length };
    } catch (err) {
      return { error: err.message };
    }
  }

  private getModuleInfo(moduleName: string): any {
    try {
      const moduleDir = path.join(
        this.projectRoot,
        `apps/backend/src/modules/${moduleName}`,
      );

      if (!fs.existsSync(moduleDir)) {
        return { error: `Module not found: ${moduleName}` };
      }

      const files = fs.readdirSync(moduleDir);
      const result: any = { name: moduleName, files };

      // Try to read controller for endpoints
      const controllerFile = files.find((f) => f.includes('.controller.ts'));
      if (controllerFile) {
        const controllerPath = path.join(moduleDir, controllerFile);
        const content = fs.readFileSync(controllerPath, 'utf-8');
        const routes = content.match(/@(Get|Post|Put|Delete|Patch)\(['"](.*?)['"]?\)/g) || [];
        result.routes = routes.slice(0, 20);
      }

      return result;
    } catch (err) {
      return { error: err.message };
    }
  }

  // ───────────────────── Helper Methods ─────────────────────

  private success(id: string | number, result: any): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      result,
    };
  }

  private error(
    id: string | number,
    code: number,
    message: string,
  ): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: { code, message },
    };
  }
}
