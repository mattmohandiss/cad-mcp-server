# 12 — Sources and Technical References

These references informed the architecture. Re-check them before implementation because Microsoft Copilot extensibility is changing quickly.

## Microsoft Copilot / MCP

### Build plugins from an MCP server for Microsoft 365 Copilot

Microsoft guide for integrating a service with Microsoft 365 Copilot by adding an MCP server to a declarative agent.

URL: https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/build-mcp-plugins

### Extend your agent with Model Context Protocol in Copilot Studio

Microsoft Copilot Studio can connect to MCP servers and use tools, resources, and prompts.

URL: https://learn.microsoft.com/en-us/microsoft-copilot-studio/agent-extend-action-mcp

### Microsoft 365 Copilot connectors overview

Explains synced connectors and federated connectors. Synced connectors index into Microsoft Graph. Federated connectors retrieve data in real time using MCP.

URL: https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/overview-copilot-connector

### Federated connectors overview

Federated connectors use MCP to fetch data in real time, access data using the user's identity/permissions, do not index into Microsoft 365, and are admin-governed.

URL: https://learn.microsoft.com/en-us/microsoft-365/copilot/connectors/federated-connectors-overview

### Debug MCP and API plugins locally

Important note: Microsoft 365 Copilot must reach the MCP/API server over the internet; localhost is only available from the developer machine.

URL: https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-debug-local

### Add MCP apps to declarative agents

MCP Apps can provide interactive UI widgets inside Microsoft 365 Copilot.

URL: https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-mcp-apps

### Plugins for Microsoft 365 Copilot

Plugins allow declarative agents to interact with MCP servers or REST APIs.

URL: https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/overview-plugins

## CAD / geometry

### OpenCascade STEP Processor

OpenCascade documentation for reading/writing STEP files.

URL: https://dev.opencascade.org/doc/occt-6.7.0/overview/html/user_guides__step.html

### OpenCascade technical overview

OCCT provides services for 3D modeling, CAD data exchange, visualization, and related CAD/CAM/CAE applications.

URL: https://dev.opencascade.org/doc/occt-6.7.0/overview/html/index.html

### SOLIDWORKS API Add-ins

SOLIDWORKS API documentation for creating add-ins.

URL: https://help.solidworks.com/2024/english/api/sldworksapiprogguide/Overview/Using_SwAddin_to_Create_a_SolidWorks_Addin.htm

### SOLIDWORKS API fundamentals

Official SOLIDWORKS API training/reference material.

URL: https://www.solidworks.com/solidworks_api_course

## Design note

Use these sources for platform constraints, not as product validation. Product validation should come from interviews with mechanical engineers and pilots with real CAD files.
