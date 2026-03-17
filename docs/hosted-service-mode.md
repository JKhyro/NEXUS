# NEXUS Hosted Service Mode

## Purpose

NEXUS is desktop-first and local-first in the MVP, but it still needs a hosted-capable runtime path that does not fork the service contract or the product model.

Hosted mode exists so a future web deployment can talk to the same API surface the desktop client already uses.

## Runtime shapes

### local-managed

- default workstation mode
- binds to localhost by default
- serves the bundled client surface
- intended to be managed by the desktop shell

### hosted

- explicit host/bind/public-origin configuration
- may still serve the bundled client surface
- may also run in `api-only` form by disabling static serving
- keeps the same NEXUS API contract and storage model

## Config keys

```json
{
  "deploymentMode": "hosted",
  "host": "0.0.0.0",
  "port": 43100,
  "staticMode": "disabled",
  "publicOrigin": "https://nexus.example.invalid",
  "allowedOrigins": ["https://nexus.example.invalid"]
}
```

## Rules

- Hosted mode must not introduce a second backend model.
- Desktop and hosted runs must keep the same entities and endpoints.
- CORS is opt-in through explicit allowed origins.
- Static serving is configurable so the service can be used as an embedded full surface or as an API-only backend.
- LIBRARY-backed storage remains valid in either runtime shape.
