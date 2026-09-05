import { TemplateDef } from "./templates";
import { readJson, writeJson } from "./kv";

const KEY = "custom-templates";

async function readAll(): Promise<TemplateDef[]> {
  return readJson<TemplateDef[]>(KEY, []);
}

async function writeAll(templates: TemplateDef[]) {
  await writeJson(KEY, templates);
}

export async function getCustomTemplates(): Promise<TemplateDef[]> {
  return readAll();
}

export async function addCustomTemplate(template: TemplateDef): Promise<TemplateDef> {
  const templates = await readAll();
  templates.push(template);
  await writeAll(templates);
  return template;
}

export async function deleteCustomTemplate(id: string) {
  const templates = await readAll();
  await writeAll(templates.filter((t) => t.id !== id));
}

export async function getCustomTemplate(id: string): Promise<TemplateDef | undefined> {
  const templates = await readAll();
  return templates.find((t) => t.id === id);
}
