import { randomUUID } from "crypto";
import { readJson, writeJson } from "./kv";

export type AIFlowJobStatus = "queued" | "processing" | "completed" | "failed";

export interface AIFlowJob {
  id: string;
  runId: string;
  articleId: string;
  articleUrl: string;
  articleTitle: string;
  styleId: string;
  styleLabel: string;
  prompt: string;
  pinTitle: string;
  description: string;
  altText: string;
  tags: string[];
  overlayText?: string;
  ctaText?: string;
  footerText?: string;
  status: AIFlowJobStatus;
  imageUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AIFlowRun {
  id: string;
  batchId?: string;
  name: string;
  total: number;
  completed: number;
  failed: number;
  createdAt: string;
}

const JOBS_KEY = "ai-flow-jobs";
const RUNS_KEY = "ai-flow-runs";

async function readJobs() { return readJson<AIFlowJob[]>(JOBS_KEY, []); }
async function writeJobs(jobs: AIFlowJob[]) { await writeJson(JOBS_KEY, jobs); }
async function readRuns() { return readJson<AIFlowRun[]>(RUNS_KEY, []); }
async function writeRuns(runs: AIFlowRun[]) { await writeJson(RUNS_KEY, runs); }

export async function createAIFlowRun(input: {
  name: string;
  batchId?: string;
  jobs: Omit<AIFlowJob, "id" | "runId" | "status" | "createdAt" | "updatedAt">[];
}) {
  const now = new Date().toISOString();
  const runId = randomUUID();
  const run: AIFlowRun = {
    id: runId,
    name: input.name,
    batchId: input.batchId,
    total: input.jobs.length,
    completed: 0,
    failed: 0,
    createdAt: now,
  };
  const jobs: AIFlowJob[] = input.jobs.map((job) => ({
    ...job,
    id: randomUUID(),
    runId,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  }));
  const [existingJobs, existingRuns] = await Promise.all([readJobs(), readRuns()]);
  await Promise.all([writeJobs([...existingJobs, ...jobs]), writeRuns([run, ...existingRuns])]);
  return { run, jobs };
}

export async function getAIFlowRuns() {
  return readRuns();
}

export async function getAIFlowRun(id: string) {
  const runs = await readRuns();
  return runs.find((run) => run.id === id);
}

export async function claimNextAIFlowJob() {
  const jobs = await readJobs();
  const job = jobs.find((item) => item.status === "queued");
  if (!job) return undefined;
  job.status = "processing";
  job.updatedAt = new Date().toISOString();
  await writeJobs(jobs);
  return job;
}

export async function getAIFlowJob(id: string) {
  const jobs = await readJobs();
  return jobs.find((job) => job.id === id);
}

export async function listAIFlowJobs(runId?: string) {
  const jobs = await readJobs();
  return runId ? jobs.filter((job) => job.runId === runId) : jobs;
}

export async function completeAIFlowJob(id: string, imageUrl: string) {
  const jobs = await readJobs();
  const job = jobs.find((item) => item.id === id);
  if (!job) return undefined;
  job.status = "completed";
  job.imageUrl = imageUrl;
  job.error = undefined;
  job.updatedAt = new Date().toISOString();
  await writeJobs(jobs);
  return job;
}

export async function failAIFlowJob(id: string, error: string) {
  const jobs = await readJobs();
  const job = jobs.find((item) => item.id === id);
  if (!job) return undefined;
  job.status = "failed";
  job.error = error.slice(0, 1000);
  job.updatedAt = new Date().toISOString();
  await writeJobs(jobs);
  return job;
}

export async function retryAIFlowJob(id: string) {
  const jobs = await readJobs();
  const job = jobs.find((item) => item.id === id);
  if (!job) return undefined;
  job.status = "queued";
  job.error = undefined;
  job.updatedAt = new Date().toISOString();
  await writeJobs(jobs);
  return job;
}

export async function refreshAIFlowRun(runId: string) {
  const [jobs, runs] = await Promise.all([readJobs(), readRuns()]);
  const run = runs.find((item) => item.id === runId);
  if (!run) return undefined;
  const mine = jobs.filter((job) => job.runId === runId);
  run.completed = mine.filter((job) => job.status === "completed").length;
  run.failed = mine.filter((job) => job.status === "failed").length;
  await writeRuns(runs);
  return run;
}
