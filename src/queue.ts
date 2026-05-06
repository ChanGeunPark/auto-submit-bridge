import { randomUUID } from "node:crypto";
import type { Job, JobEvent, Place } from "./types.js";
import { researchCafe } from "./runner.js";

interface QueueConfig {
  agent: "claude" | "codex";
  concurrency: number;
  timeoutMs: number;
}

type Subscriber = (event: JobEvent) => void;

export class JobQueue {
  private jobs = new Map<string, Job>();
  private subscribers = new Set<Subscriber>();
  private running = 0;

  constructor(private config: QueueConfig) {}

  list(): Job[] {
    return [...this.jobs.values()].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
  }

  enqueue(place: Place): Job {
    const job: Job = {
      id: randomUUID(),
      place,
      status: "queued",
      createdAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, job);
    this.emit({ type: "upsert", job });
    queueMicrotask(() => this.tick());
    return job;
  }

  remove(id: string): boolean {
    const existed = this.jobs.delete(id);
    if (existed) this.emit({ type: "remove", id });
    return existed;
  }

  markSubmitted(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    const updated: Job = {
      ...job,
      status: "submitted",
      completedAt: new Date().toISOString(),
    };
    this.jobs.set(id, updated);
    this.emit({ type: "upsert", job: updated });
    return true;
  }

  subscribe(subscriber: Subscriber): () => void {
    this.subscribers.add(subscriber);
    subscriber({ type: "snapshot", jobs: this.list() });
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  private emit(event: JobEvent): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(event);
      } catch (err) {
        console.error("[queue] subscriber error", err);
      }
    }
  }

  private tick(): void {
    while (this.running < this.config.concurrency) {
      const next = this.list().find((j) => j.status === "queued");
      if (!next) return;
      this.running += 1;
      this.run(next).finally(() => {
        this.running -= 1;
        queueMicrotask(() => this.tick());
      });
    }
  }

  private async run(job: Job): Promise<void> {
    const started: Job = {
      ...job,
      status: "researching",
      startedAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, started);
    this.emit({ type: "upsert", job: started });

    try {
      const { data, rawOutput } = await researchCafe(job.place, {
        agent: this.config.agent,
        timeoutMs: this.config.timeoutMs,
      });
      const ready: Job = {
        ...started,
        status: "ready",
        result: data,
        rawOutput,
        completedAt: new Date().toISOString(),
      };
      this.jobs.set(job.id, ready);
      this.emit({ type: "upsert", job: ready });
    } catch (err) {
      const failed: Job = {
        ...started,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        completedAt: new Date().toISOString(),
      };
      this.jobs.set(job.id, failed);
      this.emit({ type: "upsert", job: failed });
    }
  }
}
