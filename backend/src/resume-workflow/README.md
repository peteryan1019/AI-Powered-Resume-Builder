# Resume workflow

This folder is the service boundary for asynchronous resume generation.

- `queue.ts`: BullMQ producer contract. Queue payloads contain only stable IDs.
- `worker.ts`: independently deployable BullMQ consumer.
- `graph.ts`: LangGraph state machine and human-feedback interrupt.
- `redis.ts`: transient build metadata, review projections, and Redis Streams.
- `contracts.ts`: versioned data shared by the API, graph, and worker.

One `buildId` identifies the logical build and is also LangGraph's `thread_id`.
The initial and resume BullMQ jobs are separate execution attempts. A worker is
not occupied while the graph is waiting for the user's coach decisions.

Redis is the transient system of record. Checkpoints, review projections, input
snapshots, and the capped progress stream use a three-day TTL. The browser never
connects to Redis: it reads the authenticated SSE endpoint, which replays the
Redis Stream from the last event ID.

PostgreSQL is used only for durable effects. `Resume.buildId` and
`ProfileInstance.sourceBuildKey` are unique idempotency keys so a queue or HTTP
retry cannot duplicate a final resume or a user-approved new project.
