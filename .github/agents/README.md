# Rise Local Lead Maker - Personal Agent Team

This directory contains specialized agent configurations for GitHub Copilot's agent team feature. Each agent is an expert in a specific domain of the Rise Local Lead Maker project.

## Agent Team Overview

Your personal agent team consists of 7 specialized agents, each with deep knowledge of specific aspects of the codebase:

### 1. TypeScript/API Development Agent
**File**: `typescript-api-agent.md`  
**Expertise**: Express.js, TypeScript, API design, Zod validation  
**Use For**: API endpoints, type definitions, Express middleware, request handling

### 2. Database & Integration Agent
**File**: `database-integration-agent.md`  
**Expertise**: MySQL, Supabase wrapper, third-party APIs (Anthropic, Gemini, Google)  
**Use For**: Database queries, connection management, API integrations, multi-provider enrichment

### 3. Documentation Agent
**File**: `documentation-agent.md`  
**Expertise**: Technical writing, CLAUDE.md maintenance, API documentation  
**Use For**: Updating docs, writing comments, maintaining CLAUDE.md, deployment guides

### 4. Frontend/GUI Agent
**File**: `frontend-gui-agent.md`  
**Expertise**: Vanilla JavaScript, DOM manipulation, XSS prevention, API integration  
**Use For**: GUI changes, security, browser compatibility, frontend features

### 5. MCP Server Agent
**File**: `mcp-server-agent.md`  
**Expertise**: Model Context Protocol, tool design, Claude integration  
**Use For**: Adding/modifying MCP tools, Claude Desktop integration, session management

### 6. DevOps & Deployment Agent
**File**: `devops-deployment-agent.md`  
**Expertise**: Docker, systemd, cPanel deployment, monitoring, backups  
**Use For**: Deployment issues, Docker configs, health monitoring, operational scripts

### 7. Testing & Quality Agent
**File**: `testing-quality-agent.md`  
**Expertise**: Testing strategies, type checking, validation, security testing  
**Use For**: Testing new features, quality checks, security validation, bug fixes

## How to Use the Agent Team

### Via GitHub Copilot Chat
When asking questions or making changes, you can reference specific agents:

```
@typescript-api-agent Please add a new endpoint for lead export
@database-integration-agent How do I handle connection pooling?
@documentation-agent Update CLAUDE.md with the new API endpoint
@frontend-gui-agent Add a filter to the leads table
@mcp-server-agent Create a tool for batch lead qualification
@devops-deployment-agent How do I deploy this to production?
@testing-quality-agent What should I test for this new feature?
```

### For Complex Tasks
You can collaborate with multiple agents:

```
1. @typescript-api-agent - Implement the new feature
2. @testing-quality-agent - Review and test the implementation
3. @documentation-agent - Update documentation
4. @devops-deployment-agent - Plan deployment strategy
```

### When to Use Which Agent

**Starting a new feature?**
→ Start with the relevant technical agent (TypeScript/Frontend/MCP)

**Need to integrate with external services?**
→ Consult Database & Integration Agent

**Deploying changes?**
→ Check with DevOps & Deployment Agent

**Updating documentation?**
→ Let Documentation Agent handle it

**Testing your changes?**
→ Follow Testing & Quality Agent guidelines

**Working on the GUI?**
→ Frontend/GUI Agent knows all the patterns

**Adding Claude tools?**
→ MCP Server Agent is your expert

## Agent Collaboration Patterns

### New Feature Development
1. **TypeScript/API Agent** - Implement backend
2. **Frontend/GUI Agent** - Implement UI
3. **Testing/Quality Agent** - Validate functionality
4. **Documentation Agent** - Update docs

### Integration Work
1. **Database/Integration Agent** - Set up integration
2. **TypeScript/API Agent** - Create endpoints
3. **MCP Server Agent** - Expose via MCP tools
4. **DevOps Agent** - Configure environment

### Bug Fixes
1. **Testing/Quality Agent** - Reproduce and diagnose
2. **Relevant Technical Agent** - Fix the issue
3. **Testing/Quality Agent** - Verify fix
4. **Documentation Agent** - Document if needed

### Deployment
1. **DevOps Agent** - Plan deployment
2. **Testing/Quality Agent** - Pre-deployment checks
3. **DevOps Agent** - Execute deployment
4. **Documentation Agent** - Update deployment docs

## Quick Reference

### Project Structure
```
rise-local-lead-maker/
├── .github/agents/           ← You are here
├── rise-local-lead-creation/
│   └── api/                  ← TypeScript API
├── gui/                      ← Vanilla JS frontend
├── mcp-server/               ← Claude integration
├── scripts/                  ← Operational scripts
└── deploy/                   ← Deployment configs
```

### Key Commands
```bash
# API Development
cd rise-local-lead-creation/api
npm run dev          # Watch mode
npm run typecheck    # Type checking
npm run build        # Compile

# MCP Server
cd mcp-server
npm start

# Docker
docker compose up -d
docker compose logs -f api

# Production
systemctl restart rise-api
journalctl -u rise-api -f
```

### Important Files
- `CLAUDE.md` - Main developer documentation
- `.mcp.json` - MCP server configuration
- `compose.yaml` - Docker configuration
- `package.json` - API dependencies

## Agent Capabilities Matrix

| Task Type | Primary Agent | Supporting Agents |
|-----------|--------------|-------------------|
| API Endpoints | TypeScript/API | Database, Testing |
| Database Work | Database/Integration | TypeScript/API |
| GUI Features | Frontend/GUI | TypeScript/API, Testing |
| MCP Tools | MCP Server | TypeScript/API |
| Deployment | DevOps | Testing, Documentation |
| Documentation | Documentation | All agents |
| Testing | Testing/Quality | All agents |
| Integrations | Database/Integration | TypeScript/API, MCP |

## Best Practices

### 1. Start with the Right Agent
Choose the agent that best matches your primary task domain.

### 2. Consult Multiple Agents
For complex tasks, get input from multiple perspectives.

### 3. Follow Agent Guidelines
Each agent has specific patterns and constraints - follow them.

### 4. Cross-Validate
Have Testing/Quality Agent review changes made by other agents.

### 5. Document Changes
Always involve Documentation Agent for significant changes.

### 6. Test Before Deploying
Testing/Quality → DevOps flow for all production changes.

## Getting Help

Each agent file contains:
- **Expertise** - What the agent knows
- **Project Context** - Relevant information
- **Patterns** - How to do things correctly
- **Responsibilities** - What the agent handles
- **Constraints** - What to avoid

Read the agent files for detailed guidance on specific topics.

## Contributing to Agent Team

To add or modify agents:
1. Edit the relevant `.md` file in this directory
2. Maintain consistent structure across agents
3. Include practical examples and patterns
4. Keep information current with codebase
5. Test agent effectiveness with real tasks

## Notes

- These agents are **documentation-based configurations** for GitHub Copilot
- Each agent file provides context and guidelines for AI assistance
- Agents help maintain consistency and quality across the codebase
- The agent team grows with the project - add new agents as needed

---

**Last Updated**: December 2025  
**Agent Count**: 7  
**Total Expertise Coverage**: TypeScript, Database, Documentation, Frontend, MCP, DevOps, Testing
